// The periodic flux texture is ray-traced offline. Reuse a shadow depth map
// for each sun angle for the underwater terrain.
export function wreckCaustics(T,renderer,water){
  const flux=new T.TextureLoader().load(new URL('./assets/caustic-flux.png',import.meta.url).href);
  flux.wrapS=flux.wrapT=T.RepeatWrapping;
  const shadow=new T.WebGLRenderTarget(512,512);
  shadow.depthTexture=new T.DepthTexture(512,512,T.UnsignedIntType);
  const shadowScene=new T.Scene();
  shadowScene.overrideMaterial=new T.MeshBasicMaterial({side:T.DoubleSide});
  const light=new T.OrthographicCamera(-29,29,15,-15,.05,85);
  const center=new T.Vector3(16,0,-10),lastRay=new T.Vector3();
  const u={wreckFlux:{value:flux},wreckDepth:{value:shadow.depthTexture},
    wreckProjection:{value:new T.Matrix4()},waterRay:{value:new T.Vector3()},sunStrength:{value:0},causticShift:{value:new T.Vector2()}};
  function lightSkin(material,tide){
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{wreckFlux:u.wreckFlux,waterRay:u.waterRay,sunStrength:u.sunStrength,causticShift:u.causticShift,seaLevel:tide});
      shader.vertexShader='varying vec3 skinWorld;\n'+shader.vertexShader.replace(
        '#include <worldpos_vertex>','#include <worldpos_vertex>\nskinWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader='varying vec3 skinWorld;uniform sampler2D wreckFlux;uniform vec3 waterRay;uniform vec2 causticShift;uniform float sunStrength,seaLevel;\n'+
        shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float depthWater=max(0.,seaLevel-skinWorld.z);
        float immerse=smoothstep(.02,.32,depthWater);
        diffuseColor.rgb*=exp(-min(depthWater,12.)*vec3(.10,.037,.018));
        if(sunStrength>.001){
        vec2 causticUV=(skinWorld.xy+waterRay.xy*((-13.7-skinWorld.z)/min(-.05,waterRay.z))-vec2(16.,0.))/64.+.5;
        vec2 margin=min(causticUV,1.-causticUV);
        float coverage=smoothstep(0.,.08,min(margin.x,margin.y));
        float flux=clamp(texture2D(wreckFlux,causticUV*(64./12.)+causticShift).r/.13-.90,-.55,2.3);
        diffuseColor.rgb*=1.+coverage*immerse*sunStrength*flux*vec3(.30,.46,.50);}`);
    };
    material.customProgramCacheKey=()=>'submerged-skin-flux';
  }
  return {uniforms:u,lightSkin,occluders:shadowScene,update(t,enabled=true){
    const sun=water.U.sunDir.value;
    u.sunStrength.value=enabled?Math.max(0,sun.z)*(1-.8*water.U.storm.value):0;
    if(u.sunStrength.value<=.001)return;
    u.causticShift.value.set((.043*t)%1,(.058*t)%1);
    const ray=u.waterRay.value.set(-sun.x/1.333,-sun.y/1.333,0);
    ray.z=-Math.sqrt(1-ray.lengthSq());
    if(lastRay.distanceToSquared(ray)>.000025){
      const old=renderer.getRenderTarget();
      light.position.copy(center).addScaledVector(ray,-40);
      light.up.set(1,0,0);light.lookAt(center);light.updateMatrixWorld();
      u.wreckProjection.value.multiplyMatrices(light.projectionMatrix,light.matrixWorldInverse);
      renderer.setRenderTarget(shadow);renderer.render(shadowScene,light);lastRay.copy(ray);
      renderer.setRenderTarget(old);
    }
  }};
}
