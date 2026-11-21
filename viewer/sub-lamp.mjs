// Integrate single scattering only along the part of each viewing ray lit by Piccard.
// The main pass supplies the visible surface distance. A small lamp-depth map
// stops a bulkhead from lighting the water in the compartment behind it.
export function underwaterLamp(T,renderer,lamp,occluders){
  const color=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});
  color.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  const preview=color.clone();preview.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  const shadow=new T.WebGLRenderTarget(128,128);
  shadow.depthTexture=new T.DepthTexture(128,128,T.UnsignedIntType);
  const lightCamera=new T.PerspectiveCamera(2*lamp.angle*180/Math.PI,1,.045,lamp.distance);
  const pass=new T.Scene(),screen=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const target=new T.Vector3(),oldPose=new T.Matrix4(),size=new T.Vector2();
  const u={image:{value:color.texture},depth:{value:color.depthTexture},shadowDepth:{value:shadow.depthTexture},
    inverseProjection:{value:new T.Matrix4()},eyeToLamp:{value:new T.Matrix4()},lampProjection:{value:lightCamera.projectionMatrix},
    beamSlope:{value:Math.tan(lamp.angle)},beamRange:{value:lamp.distance},edgeCos:{value:Math.cos(lamp.angle)},
    innerCos:{value:Math.cos(lamp.angle*(1-lamp.penumbra))},strength:{value:0},frame:{value:-1},steps:{value:12}};
  const material=new T.ShaderMaterial({uniforms:u,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`
      varying vec2 p;
      uniform sampler2D image,depth,shadowDepth;
      uniform mat4 inverseProjection,eyeToLamp,lampProjection;
      uniform float beamSlope,beamRange,edgeCos,innerCos,strength,frame;
      uniform int steps;
      // Clip a finite ray interval to a half-space f(t) >= 0.
      void clipPlane(float start,float rate,inout vec2 span){
        if(abs(rate)<1.e-6){if(start<0.)span.y=-1.;}
        else if(rate>0.)span.x=max(span.x,-start/rate);
        else span.y=min(span.y,-start/rate);
      }
      void main(){
        vec3 rgb=texture2D(image,p).rgb;
        vec4 surface=inverseProjection*vec4(p*2.-1.,texture2D(depth,p).r*2.-1.,1.);
        vec3 endpoint=surface.xyz/surface.w;
        vec3 ray=mat3(eyeToLamp)*normalize(endpoint);
        vec3 origin=eyeToLamp[3].xyz;
        vec2 span=vec2(0.,length(endpoint));
        clipPlane(-origin.z,-ray.z,span);
        clipPlane(beamRange+origin.z,ray.z,span);
        for(int i=0;i<2;i++){
          float side=i==0?-1.:1.;
          clipPlane(-beamSlope*origin.z+side*origin.x,-beamSlope*ray.z+side*ray.x,span);
          clipPlane(-beamSlope*origin.z+side*origin.y,-beamSlope*ray.z+side*ray.y,span);
        }
        if(strength>0. && span.y>span.x){
          float ds=(span.y-span.x)/float(steps);
          for(int i=0;i<16;i++){
            if(i>=steps)break;
            float t=span.x+(float(i)+.5)*ds;
            vec3 q=origin+t*ray;
            float r=max(.07,length(q));
            float angular=smoothstep(edgeCos,innerCos,-q.z/r);
            vec4 projected=lampProjection*vec4(q,1.);
            vec3 shadow=projected.xyz/projected.w*.5+.5;
            float exposed=step(shadow.z-.00012,texture2D(shadowDepth,shadow.xy).r);
            float gain=ds*strength*angular*exposed*(1.-smoothstep(.65*beamRange,beamRange,r))/(.18+r*r);
            rgb+=gain*vec3(.64,.90,1.)*exp(-vec3(.29,.16,.13)*(r+t));
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
  return (scene,eye,quality,frame=-1,thumbnail=false)=>{
    u.frame.value=frame;
    if(frame<0 && (lamp.intensity<=0||!lamp.visible)){renderer.render(scene,eye);return;}
    const destination=renderer.getRenderTarget();
    lamp.getWorldPosition(lightCamera.position);lamp.target.getWorldPosition(target);
    lightCamera.lookAt(target);lightCamera.updateMatrixWorld();
    if(lamp.visible && !lightCamera.matrixWorld.equals(oldPose)){
      renderer.setRenderTarget(shadow);
      renderer.render(occluders,lightCamera);
      oldPose.copy(lightCamera.matrixWorld);
    }
    renderer.getDrawingBufferSize(size);
    const source=thumbnail?preview:color;
    source.setSize(destination?.width??size.x,destination?.height??size.y);
    u.image.value=source.texture;u.depth.value=source.depthTexture;
    u.steps.value=quality==='low'?6:quality==='balanced'?10:16;
    u.strength.value=lamp.visible ? .0045*lamp.intensity : 0;
    eye.updateMatrixWorld();
    u.eyeToLamp.value.multiplyMatrices(lightCamera.matrixWorldInverse,eye.matrixWorld);
    u.inverseProjection.value.copy(eye.projectionMatrixInverse);
    renderer.setRenderTarget(source);renderer.render(scene,eye);
    renderer.setRenderTarget(destination);renderer.render(pass,screen);
  };
}
