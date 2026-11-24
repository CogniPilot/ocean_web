// UVs for the triangulated ship and solid equipment use model-space metres.
// Select the projection per face, keeping both vertices of each seam independent.
export function metricSurface(T,source){
  const g=source.index?source.toNonIndexed():source;
  const pos=g.getAttribute('position'),uv=new Float32Array(2*pos.count);
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  for(let i=0;i<pos.count;i+=3){
    a.fromBufferAttribute(pos,i);b.fromBufferAttribute(pos,i+1);c.fromBufferAttribute(pos,i+2);
    b.sub(a).cross(c.sub(a));
    const x=Math.abs(b.x),y=Math.abs(b.y),z=Math.abs(b.z);
    for(let k=i;k<i+3;k++){
      if(y>=x&&y>=z){uv[2*k]=pos.getX(k);uv[2*k+1]=-Math.sign(b.y)*pos.getZ(k);}
      else if(z>=x){uv[2*k]=Math.sign(b.z)*pos.getX(k);uv[2*k+1]=pos.getY(k);}
      else{uv[2*k]=-Math.sign(b.x)*pos.getZ(k);uv[2*k+1]=pos.getY(k);}
    }
  }
  g.setAttribute('uv',new T.BufferAttribute(uv,2));
  return g;
}

export async function loadBasinMaterials(T,renderer){
  // Tile lengths are in metres. Magnitudes describe each finish in the hall photos.
  const finishes={
    concrete:['concrete',2.4,.93,0,.65], liner:['enamel',1.0,.56,0,.21],
    panel:['cladding',1.8,.53,.14,.50], paint:['enamel',.65,.44,.02,.18],
    steel:['metal',.72,.57,.87,.31], bronze:['metal',.16,.43,.83,.16],
    rubber:['rubber',.52,.94,0,.32], hull:['enamel',.18,.40,.01,.10],
    lamp:['enamel',.5,.37,.02,.10]
  };
  const loader=new T.TextureLoader(),maps=new Map(),cache=new Map();
  await Promise.all([...new Set(Object.values(finishes).map(f=>f[0]))].map(async key=>{
    const textures=await Promise.all(['diff','nor_gl','rough'].map(async type=>{
      const url=new URL('./assets/onrt/materials/'+key+'-'+type+'.webp',import.meta.url);
      const t=await loader.loadAsync(url.href);
      t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      if(type==='diff')t.colorSpace=T.SRGBColorSpace;
      return t;
    }));
    maps.set(key,textures);
  }));
  function material(finish,color,shape='metric'){
    const key=[finish,color,shape].join('/');
    if(cache.has(key))return cache.get(key);
    const [family,meters,roughness,metalness,bump]=finishes[finish];
    const [map,normalMap,roughnessMap]=maps.get(family);
    const opts={color,map,roughnessMap,normalMap,roughness,metalness,normalScale:new T.Vector2(bump,bump)};
    const coated=finish==='paint'||finish==='hull'||finish==='liner';
    const m=coated?new T.MeshPhysicalMaterial({...opts,clearcoat:.32,clearcoatRoughness:.32}):new T.MeshStandardMaterial(opts);
    if(finish==='lamp'){m.emissive.set(0xfff8e9);m.emissiveIntensity=6;}
    m.name=finish;
    // The instanced geometry has unit UVs. Scale by the real dimensions of
    // each face, including circumference for the tube walls, before sampling.
    m.onBeforeCompile=shader=>{
      let scale='vec2 tile=vec2(1.);';
      if(shape==='box'||shape==='tube'){
        const box='abs(normal.x)>.5 ? dims.zy : (abs(normal.y)>.5 ? dims.xz : dims.xy)';
        const tube='abs(normal.y)>.5 ? dims.xz : vec2(3.141593*dims.x,dims.y)';
        scale='vec3 dims=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz)); vec2 tile='+ (shape==='box'?box:tube)+';';
      }
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',
        '#include <uv_vertex>\n'+scale+'\ntile/='+meters.toFixed(4)+'; vMapUv*=tile; vNormalMapUv*=tile; vRoughnessMapUv*=tile;');
    };
    m.customProgramCacheKey=()=>finish+'-'+shape;
    cache.set(key,m);return m;
  }
  return {material,maps};
}
