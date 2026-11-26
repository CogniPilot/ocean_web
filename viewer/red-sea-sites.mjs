import {showInLowWaterCapture} from './render-layers.mjs';

// Local harbor coordinates in metres. Both sites sit on the level outer seabed.
export const wreckSites = [
  {id:'yatush', name:'Yatush', east:-24, north:26, halfLength:8.8, halfBeam:2.6, height:4.9, burial:.12, approachEast:-14.7, approachNorth:11.7, approachUp:-9.8},
  {id:'satil', name:'Satil', east:56, north:-50, halfLength:22.4, halfBeam:3.8, height:12.7, burial:.6, approachEast:26.4, approachNorth:-61.5, approachTargetEast:35.1, approachUp:-8},
];

export function wreckApproach(site=wreckSites[0]){
  const east=site.approachEast??site.east;
  const heading=Math.atan2(site.north-site.approachNorth,(site.approachTargetEast??site.east)-east);
  return {position:[east,site.approachNorth,site.approachUp],velocity:[0,0,0],heading};
}

export function releaseWreck(root){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of [].concat(o.material))materials.add(m);}});
  for(const m of materials)for(const map of Object.values(m))if(map?.isTexture)textures.add(map);
  for(const resource of [...textures,...materials,...geometries])resource.dispose();
  for(const texture of textures)texture.source?.data?.close?.();
}

function addWreckSediment(scene,bed,sediment,T){
  if(!sediment?.albedo||!sediment.relief)return;
  const materials=new Set(),point=new T.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const position=mesh.geometry.getAttribute('position'),clearance=new Float32Array(position.count);
    for(let i=0;i<position.count;i++){
      point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      clearance[i]=point.z-bed.height(point.x,point.y);
    }
    mesh.geometry.setAttribute('bedClearance',new T.BufferAttribute(clearance,1));
    for(const material of [].concat(mesh.material))materials.add(material);
  });
  for(const material of materials){
    if(!material.isMeshStandardMaterial)continue;
    const prior=material.onBeforeCompile.bind(material),programKey=material.customProgramCacheKey();
    material.customProgramCacheKey=()=>programKey+'-wreck-sediment';
    material.onBeforeCompile=(shader,renderer)=>{
      prior(shader,renderer);
      shader.uniforms.wreckSedimentAlbedo={value:sediment.albedo};
      shader.uniforms.wreckSedimentRelief={value:sediment.relief};
      shader.uniforms.wreckSedimentTile={value:sediment.tileMeters};
      shader.vertexShader='attribute float bedClearance; varying float wreckBedClearance; varying vec3 wreckWorld;\n'+
        shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
          wreckWorld=(modelMatrix*vec4(transformed,1.)).xyz;
          wreckBedClearance=bedClearance;`);
      shader.fragmentShader=`varying float wreckBedClearance;
        varying vec3 wreckWorld;
        uniform sampler2D wreckSedimentAlbedo,wreckSedimentRelief;
        uniform float wreckSedimentTile;
      `+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        vec3 wreckFace=cross(dFdx(wreckWorld),dFdy(wreckWorld));
        float wreckUp=gl_FrontFacing?wreckFace.z*inversesqrt(max(dot(wreckFace,wreckFace),1e-20)):0.;
        float wreckDust=smoothstep(.55,.88,wreckUp)*(1.-smoothstep(.45,1.35,wreckBedClearance));
        vec2 wreckUv=wreckWorld.xy/wreckSedimentTile;
        vec2 wreckGrain=texture2D(wreckSedimentRelief,wreckUv).rg;
        vec3 wreckSand=texture2D(wreckSedimentAlbedo,wreckUv).rgb;
        float photographLight=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(diffuseColor.rgb,wreckSand*(.72+.5*sqrt(max(photographLight,0.))),.48*wreckDust);`)
        .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          roughnessFactor=mix(roughnessFactor,wreckGrain.g,.7*wreckDust);`)
        .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          vec3 wreckDx=dFdx(-vViewPosition),wreckDy=dFdy(-vViewPosition);
          vec3 wreckTx=cross(wreckDy,normal),wreckTy=cross(normal,wreckDx);
          float wreckArea=dot(wreckDx,wreckTx);
          float wreckHeight=.0035*wreckGrain.r;
          vec3 wreckSlope=wreckTx*dFdx(wreckHeight)+wreckTy*dFdy(wreckHeight);
          if(wreckDust>0.)normal=normalize(normal-sign(wreckArea)*wreckDust*wreckSlope/max(abs(wreckArea),1e-12));`);
    };
  }
}

export function harborWrecks(parent,bed,signal,T,sediment){
  const sites=wreckSites.map(site=>({...site,base:bed.height(site.east,site.north)-site.burial,
    showing:null,current:null,pending:null,desired:null,retryAt:0}));
  function clear(site){
    if(site.current){parent.remove(site.current);releaseWreck(site.current);}
    site.current=null;site.showing=null;
  }
  signal.addEventListener('abort',()=>{
    sites.forEach(site=>{
      clear(site);
      if(site.proxy){
        parent.remove(site.proxy);
        site.proxy.geometry.dispose();site.proxy.material.dispose();
      }
    });
  },{once:true});
  async function loadProxy(site){
    site.loadingProxy=true;
    try{
      const url=new URL('./assets/red-sea/'+site.id+'/collision.json',import.meta.url);
      url.search=new URL(import.meta.url).search;
      const response=await fetch(url,{signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const {positions,indices}=await response.json();
      if(signal.aborted)return;
      // The collision exporter stores local ENU metres, while the visual GLBs are Y-up.
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
      const wire=new T.WireframeGeometry(geometry);geometry.dispose();
      const proxy=new T.LineSegments(wire,new T.LineBasicMaterial({color:0xffb75b,depthTest:false,depthWrite:false}));
      proxy.name=site.name+' collision mesh';proxy.position.set(site.east,site.north,site.base);
      proxy.visible=site.showProxy;parent.add(proxy);site.proxy=proxy;
    }catch(error){
      site.proxyRetryAt=performance.now()+10000;
      if(!signal.aborted)console.warn('Could not load '+site.name+' collision mesh',error);
    }finally{site.loadingProxy=false;}
  }
  async function load(site,level){
    site.pending=level;
    try{
      const {GLTFLoader}=await import('./vendor/gltf-loader.mjs');
      if(signal.aborted||site.desired!==level)return;
      const url=new URL('./assets/red-sea/'+site.id+'/'+level+'.glb',import.meta.url);
      url.search=new URL(import.meta.url).search;
      const {scene}=await new GLTFLoader().loadAsync(url.href);
      if(signal.aborted||site.desired!==level){releaseWreck(scene);return;}
      scene.name=site.name+' wreck';scene.position.set(site.east,site.north,site.base);
      scene.rotation.x=Math.PI/2;
      if(level==='dive')addWreckSediment(scene,bed,sediment,T);
      // Low-quality refraction captures include only the inexpensive distant mesh.
      if(level==='far')scene.traverse(o=>{if(o.isMesh)showInLowWaterCapture(o);});
      clear(site);parent.add(scene);site.current=scene;site.showing=level;
    }catch(error){
      site.retryAt=performance.now()+10000;
      if(!signal.aborted)console.warn('Could not load '+site.name+' wreck',error);
    }finally{site.pending=null;}
  }
  return function update(eye,surface,showCollisions=false){
    for(const site of sites){
      const dx=Math.max(0,Math.abs(eye.x-site.east)-site.halfLength);
      const dy=Math.max(0,Math.abs(eye.y-site.north)-site.halfBeam);
      const dz=Math.max(0,site.base-eye.z,eye.z-site.base-site.height);
      const d2=dx*dx+dy*dy+dz*dz;
      const near=site.desired==='dive'?16:12,far=site.desired?54:45;
      const submerged=eye.z<surface-.35;
      site.desired=d2>far*far?null:submerged&&d2<near*near?'dive':'far';
      site.showProxy=Boolean(showCollisions&&site.desired);
      if(site.proxy)site.proxy.visible=site.showProxy;
      else if(site.showProxy&&!site.loadingProxy&&performance.now()>=(site.proxyRetryAt??0))void loadProxy(site);
      if(!site.desired){clear(site);continue;}
      // A diver who surfaces must never render the close mesh in an above-water capture.
      if(site.current)site.current.visible=submerged||site.showing==='far';
      if(site.desired!==site.showing&&!site.pending&&performance.now()>=site.retryAt)
        void load(site,site.desired);
    }
  };
}
