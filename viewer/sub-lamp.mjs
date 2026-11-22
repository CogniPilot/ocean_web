// Integrate single scattering only along the part of each viewing ray lit by submerged fixtures.
// The main pass supplies the visible surface distance. A small lamp-depth map
// stops a bulkhead from lighting the water in the compartment behind it.
export function underwaterLamp(T,renderer,occluders,hullGlowLobes=[]){
  const color=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});
  color.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  const preview=color.clone();preview.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  const maxLamps=5,tileSize=128;
  const shadow=new T.WebGLRenderTarget(maxLamps*tileSize,tileSize);
  shadow.scissorTest=true;
  shadow.depthTexture=new T.DepthTexture(shadow.width,shadow.height,T.UnsignedIntType);
  const lightCamera=new T.PerspectiveCamera(60,1,.045,20);
  const pass=new T.Scene(),screen=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const target=new T.Vector3(),size=new T.Vector2();
  const cachedLamps=[],oldPoses=Array.from({length:maxLamps},()=>new T.Matrix4());
  const u={image:{value:color.texture},depth:{value:color.depthTexture},shadowDepth:{value:shadow.depthTexture},
    glowCount:{value:0},eyeToHull:{value:Array.from({length:5},()=>new T.Matrix4())},
    inverseProjection:{value:new T.Matrix4()},eyeToLamp:{value:oldPoses.map(()=>new T.Matrix4())},lampProjection:{value:oldPoses.map(()=>new T.Matrix4())},
    beam:{value:oldPoses.map(()=>new T.Vector4())},lampColor:{value:oldPoses.map(()=>new T.Color())},lampCount:{value:0},strength:{value:new Float32Array(maxLamps)},frame:{value:-1},steps:{value:12}};
  const material=new T.ShaderMaterial({uniforms:u,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`
      varying vec2 p;
      uniform sampler2D image,depth,shadowDepth;
      uniform mat4 inverseProjection,eyeToLamp[${maxLamps}],lampProjection[${maxLamps}];
      uniform vec4 beam[${maxLamps}];
      uniform vec3 lampColor[${maxLamps}];
      uniform float strength[${maxLamps}],frame;
      uniform int steps,lampCount,glowCount;uniform mat4 eyeToHull[5];
      // Clip a finite ray interval to a half-space f(t) >= 0.
      void clipPlane(float start,float rate,inout vec2 span){
        if(abs(rate)<1.e-6){if(start<0.)span.y=-1.;}
        else if(rate>0.)span.x=max(span.x,-start/rate);
        else span.y=min(span.y,-start/rate);
      }
      float glowAlongRay(vec3 eye,vec3 ray,vec2 span,vec3 centre,vec3 radius){
        vec3 start=(eye-centre)/radius,d=ray/radius;
        float variance=1./dot(d,d),middle=-dot(start,d)*variance,sigma=sqrt(variance);
        vec3 nearest=start+middle*d;
        float integral=smoothstep(-2.,2.,(span.y-middle)/sigma)-smoothstep(-2.,2.,(span.x-middle)/sigma);
        return 2.507*sigma*integral*exp(-.5*dot(nearest,nearest)-.105*clamp(middle,span.x,span.y));
      }
      void main(){
        vec3 rgb=texture2D(image,p).rgb;
        vec4 surface=inverseProjection*vec4(p*2.-1.,texture2D(depth,p).r*2.-1.,1.);
        vec3 endpoint=surface.xyz/surface.w;
        vec3 sight=normalize(endpoint);float visibleDistance=length(endpoint);
        for(int i=0;i<5;i++){
          if(i>=glowCount)break;
          vec3 ray=mat3(eyeToHull[i])*sight,eye=eyeToHull[i][3].xyz;
          vec2 span=vec2(0.,visibleDistance);clipPlane(.06-eye.z,-ray.z,span);
          if(span.y<=span.x)continue;
          float nearest=clamp(-dot(eye,ray),span.x,span.y);
          if(length(eye+nearest*ray)>8.5)continue;
          float glow=0.;
          ${hullGlowLobes.map(({center,radius,weight})=>`glow+=${weight}*glowAlongRay(eye,ray,span,vec3(${center.map(v=>v.toFixed(3)).join(',')}),vec3(${radius.join(',')}));`).join('')}
          // Hull-mounted cameras expose for the bright water immediately outside their ports.
          rgb+=vec3(.49,.235,.041)*glow*(frame>=0.?.15:1.);
        }
        for(int slot=0;slot<${maxLamps};slot++){
          if(slot>=lampCount)break;
          vec4 cone=beam[slot];
          float beamSlope=cone.x,beamRange=cone.y;
          vec3 ray=mat3(eyeToLamp[slot])*normalize(endpoint);
          vec3 origin=eyeToLamp[slot][3].xyz;
          vec2 span=vec2(0.,length(endpoint));
          clipPlane(-origin.z,-ray.z,span);
          clipPlane(beamRange+origin.z,ray.z,span);
          for(int i=0;i<2;i++){
            float side=i==0?-1.:1.;
            clipPlane(-beamSlope*origin.z+side*origin.x,-beamSlope*ray.z+side*ray.x,span);
            clipPlane(-beamSlope*origin.z+side*origin.y,-beamSlope*ray.z+side*ray.y,span);
          }
          if(span.y>span.x){
            float ds=(span.y-span.x)/float(steps);
            for(int i=0;i<16;i++){
              if(i>=steps)break;
              float t=span.x+(float(i)+.5)*ds;
              vec3 q=origin+t*ray;
              float r=max(.07,length(q));
              float angular=smoothstep(cone.z,cone.w,-q.z/r);
              vec4 projected=lampProjection[slot]*vec4(q,1.);
              vec3 shadow=projected.xyz/projected.w*.5+.5;
              vec2 uv=clamp(shadow.xy,.5/${tileSize}.,1.-.5/${tileSize}.);
              uv.x=(float(slot)+uv.x)/${maxLamps}.;
              float exposed=step(shadow.z-.00012,texture2D(shadowDepth,uv).r);
              float gain=ds*strength[slot]*angular*exposed*(1.-smoothstep(.65*beamRange,beamRange,r))/(.18+r*r);
              rgb+=gain*lampColor[slot]*exp(-vec3(.29,.16,.13)*(r+t));
            }
          }
        }
        if(frame>=0.){
          vec2 pixel=gl_FragCoord.xy+frame*vec2(31.,71.);
          float a=fract(52.9829189*fract(dot(pixel,vec2(.06711056,.00583715))));
          float b=fract(43.121*fract(dot(pixel.yx,vec2(.0923,.0173))));
          rgb=max(vec3(0.),rgb+(a+b-1.)*sqrt(vec3(.000003)+.0001*max(rgb,vec3(0.))));
        }
        gl_FragColor=vec4(rgb,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  pass.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
  return (scene,eye,quality,lights,frame=-1,thumbnail=false,glowingHulls=[])=>{
    u.frame.value=frame;
    u.lampCount.value=Math.min(maxLamps,lights.length);
    u.glowCount.value=glowingHulls.length;
    for(const [i,hull] of glowingHulls.entries())u.eyeToHull.value[i].copy(hull.matrixWorld).invert().multiply(eye.matrixWorld);
    if(frame<0 && !lights.length && !glowingHulls.length){renderer.render(scene,eye);return;}
    const destination=renderer.getRenderTarget();
    eye.updateMatrixWorld();
    for(let slot=0;slot<u.lampCount.value;slot++){
      const light=lights[slot],cone=u.beam.value[slot];
      const range=light.distance,angle=light.angle,slope=Math.tan(angle);
      const projectionChanged=cone.x!==slope||cone.y!==range;
      cone.set(slope,range,Math.cos(angle),Math.cos(angle*(1-light.penumbra)));
      lightCamera.fov=2*angle*180/Math.PI;lightCamera.far=range;lightCamera.updateProjectionMatrix();
      u.lampProjection.value[slot].copy(lightCamera.projectionMatrix);
      u.lampColor.value[slot].copy(light.color);
      light.getWorldPosition(lightCamera.position);light.target.getWorldPosition(target);
      lightCamera.lookAt(target);lightCamera.updateMatrixWorld();
      if(projectionChanged || light!==cachedLamps[slot] || !lightCamera.matrixWorld.equals(oldPoses[slot])){
        shadow.viewport.set(slot*tileSize,0,tileSize,tileSize);
        shadow.scissor.copy(shadow.viewport);
        renderer.setRenderTarget(shadow);renderer.render(occluders,lightCamera);
        renderer.setRenderTarget(destination);
        cachedLamps[slot]=light;oldPoses[slot].copy(lightCamera.matrixWorld);
      }
      u.strength.value[slot]=.0045*light.intensity*(light.userData.scatterGain??1);
      u.eyeToLamp.value[slot].multiplyMatrices(lightCamera.matrixWorldInverse,eye.matrixWorld);
    }
    cachedLamps.length=u.lampCount.value;
    renderer.getDrawingBufferSize(size);
    const source=thumbnail?preview:color;
    source.setSize(destination?.width??size.x,destination?.height??size.y);
    u.image.value=source.texture;u.depth.value=source.depthTexture;
    u.steps.value=quality==='low'?6:quality==='balanced'?10:16;
    u.inverseProjection.value.copy(eye.projectionMatrixInverse);
    renderer.setRenderTarget(source);renderer.render(scene,eye);
    renderer.setRenderTarget(destination);renderer.render(pass,screen);
  };
}
