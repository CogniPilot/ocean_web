// Refract a regular bundle of sunlight rays through the live wave field onto a
// reference depth. Flux per receiver area increases where the rays converge.
export function wreckCaustics(T,renderer,water,mobile){
  const size=mobile?512:1024;
  const flux=new T.WebGLRenderTarget(size,size,{depthBuffer:false});
  const photons=new T.Scene(),eye=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const material=new T.ShaderMaterial({
    uniforms:water.U,side:T.DoubleSide,transparent:true,blending:T.AdditiveBlending,
    depthTest:false,depthWrite:false,
    vertexShader:oceanHeightGLSL+oceanRippleGLSL+`
      uniform vec3 sunDir;uniform float tm,bearing,wind;varying vec2 launch,landing;
      void main(){
        launch=position.xy;
        float d=.35;
        vec4 animal=wildlifeWave(launch);
        vec2 grad=vec2(backgroundHeightAt(launch+vec2(d,0.))-backgroundHeightAt(launch-vec2(d,0.)),
                       backgroundHeightAt(launch+vec2(0.,d))-backgroundHeightAt(launch-vec2(0.,d)))/(2.*d);
        grad+=animal.zw;
        grad+=rippleSlope(launch,tm,vec2(cos(bearing),sin(bearing)),wind);
        vec3 ray=refract(-sunDir,normalize(vec3(-grad,1.)),1./1.333);
        landing=launch+ray.xy*((-13.7-backgroundHeightAt(launch)-animal.x)/min(ray.z,-.05));
        gl_Position=vec4((landing-vec2(16.,0.))/32.,0.,1.);
      }`,
    fragmentShader:`varying vec2 launch,landing;
      float area(vec2 p){vec2 x=dFdx(p),y=dFdy(p);return abs(x.x*y.y-x.y*y.x);}
      void main(){float density=area(launch)/max(.000001,area(landing));
        gl_FragColor=vec4(vec3(.13*min(density,6.)),1.);}`
  });
  const sheet=new T.PlaneGeometry(96,96,mobile?224:320,mobile?224:320);
  sheet.translate(16,0,0);
  const rays=new T.Mesh(sheet,material);rays.frustumCulled=false;photons.add(rays);
  const shadow=new T.WebGLRenderTarget(512,512);
  shadow.depthTexture=new T.DepthTexture(512,512,T.UnsignedIntType);
  const shadowScene=new T.Scene();
  shadowScene.overrideMaterial=new T.MeshBasicMaterial({side:T.DoubleSide});
  const light=new T.OrthographicCamera(-29,29,15,-15,.05,85);
  const center=new T.Vector3(16,0,-10),lastRay=new T.Vector3();
  const u={wreckFlux:{value:flux.texture},wreckDepth:{value:shadow.depthTexture},
    wreckProjection:{value:new T.Matrix4()},waterRay:{value:new T.Vector3()},sunStrength:{value:0}};
  let last=-Infinity;
  function lightSkin(material,tide){
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{wreckFlux:u.wreckFlux,waterRay:u.waterRay,sunStrength:u.sunStrength,seaLevel:tide});
      shader.vertexShader='varying vec3 skinWorld;\n'+shader.vertexShader.replace(
        '#include <worldpos_vertex>','#include <worldpos_vertex>\nskinWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader='varying vec3 skinWorld;uniform sampler2D wreckFlux;uniform vec3 waterRay;uniform float sunStrength,seaLevel;\n'+
        shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float depthWater=max(0.,seaLevel-skinWorld.z);
        float immerse=smoothstep(.02,.32,depthWater);
        diffuseColor.rgb*=exp(-min(depthWater,12.)*vec3(.10,.037,.018));
        vec2 causticUV=(skinWorld.xy+waterRay.xy*((-13.7-skinWorld.z)/min(-.05,waterRay.z))-vec2(16.,0.))/64.+.5;
        vec2 margin=min(causticUV,1.-causticUV);
        float coverage=smoothstep(0.,.08,min(margin.x,margin.y));
        float flux=clamp(texture2D(wreckFlux,clamp(causticUV,0.,1.)).r/.13-.90,-.55,2.3);
        diffuseColor.rgb*=1.+coverage*immerse*sunStrength*flux*vec3(.30,.46,.50);`);
    };
    material.customProgramCacheKey=()=>'submerged-skin-flux';
  }
  return {uniforms:u,lightSkin,occluders:shadowScene,setWreck(group){shadowScene.add(group.clone(true));},update(t,enabled=true){
    if(!enabled){u.sunStrength.value=0;return;}
    const sun=water.U.sunDir.value;
    u.sunStrength.value=Math.max(0,sun.z)*(1-.8*water.U.storm.value);
    if(sun.z<=0||t-last<(mobile?.15:.09))return;
    last=t;
    const ray=u.waterRay.value.set(-sun.x/1.333,-sun.y/1.333,0);
    ray.z=-Math.sqrt(1-ray.lengthSq());
    const old=renderer.getRenderTarget();
    if(lastRay.distanceToSquared(ray)>.000025){
      light.position.copy(center).addScaledVector(ray,-40);
      light.up.set(1,0,0);light.lookAt(center);light.updateMatrixWorld();
      u.wreckProjection.value.multiplyMatrices(light.projectionMatrix,light.matrixWorldInverse);
      renderer.setRenderTarget(shadow);renderer.render(shadowScene,light);lastRay.copy(ray);
    }
    renderer.setRenderTarget(flux);renderer.render(photons,eye);renderer.setRenderTarget(old);
  }};
}
