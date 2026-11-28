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

const lightingBounds={min:[-10,-1,-13.4],extent:[49,7,26.8],size:[112,28,64]};

// Bake irradiance and its weighted direction from every fixed wall fixture.
// The hall, moving bridge and ship can then share a single trilinear lookup.
function fixtureLighting(T,fixtures){
  const {min,extent,size}=lightingBounds,[nx,ny,nz]=size;
  const values=new Float32Array(4*nx*ny*nz);
  const coords=size.map((n,axis)=>Float32Array.from({length:n},(_,i)=>min[axis]+extent[axis]*(i+.5)/n));
  const [xs,ys,zs]=coords;
  const radius=6,peak=3;
  for(const {position,normal} of fixtures){
    const [x0,y0,z0]=position.toArray();
    for(let z=0;z<nz;z++){
      const dz=zs[z]-z0;
      if(Math.abs(dz)>=radius)continue;
      for(let y=0;y<ny;y++){
        const dy=ys[y]-y0,dyz=dy*dy+dz*dz;
        if(dyz>=radius*radius)continue;
        for(let x=0;x<nx;x++){
          const dx=xs[x]-x0,d2=dx*dx+dyz;
          if(d2>=radius*radius)continue;
          const inverseLength=1/Math.sqrt(Math.max(.025,d2));
          const forward=dx*normal.x+dz*normal.z,lateral=dx*normal.z-dz*normal.x;
          const dot=(forward+dy*normal.y)*inverseLength;
          const edge=Math.max(0,Math.min(1,(dot-.44)/.45));
          const cone=edge*edge*(3-2*edge);
          const spill=.30*Math.exp(-.75*lateral*lateral-.26*forward*forward)*Math.max(0,Math.min(1,-dy+.15));
          const irradiance=5*(cone+spill)*(1-d2/(radius*radius))**2/(1+.42*d2);
          const i=4*((z*ny+y)*nx+x),direction=-irradiance*inverseLength;
          values[i]+=direction*dx;values[i+1]+=direction*dy;values[i+2]+=direction*dz;
          values[i+3]+=irradiance;
        }
      }
    }
  }
  const packed=new Uint8Array(values.length);
  for(let i=0;i<values.length;i+=4){
    const strength=values[i+3];
    for(let k=0;k<3;k++)packed[i+k]=Math.round(128+127*values[i+k]/Math.max(strength,.001));
    packed[i+3]=Math.round(255*Math.min(1,strength/peak));
  }
  const texture=new T.Data3DTexture(packed,nx,ny,nz);
  texture.minFilter=texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
  return texture;
}

export async function loadBasinMaterials(T,renderer){
  // Tile lengths are in metres. Magnitudes describe each finish in the hall photos.
  const finishes={
    deck:['epoxy',1,.86,0,.35], concrete:['concrete',2.4,.93,0,.65], liner:['enamel',1.0,.56,0,.21],
    panel:['cladding',1.8,.53,.14,.50], paint:['enamel',.65,.44,.02,.18],
    steel:['metal',.72,.57,.87,.31], bronze:['metal',.16,.43,.83,.16],
    rubber:['rubber',.52,.94,0,.32], hull:['enamel',.18,.40,.01,.10],
    lamp:['enamel',.5,.37,.02,.10]
  };
  const loader=new T.TextureLoader(),maps=new Map(),cache=new Map(),wallLighting={value:null};
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
      shader.uniforms.wallLighting=wallLighting;
      shader.vertexShader='varying vec3 wallLightPosition;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 fixturePosition=vec4(transformed,1.);
        #ifdef USE_INSTANCING
        fixturePosition=instanceMatrix*fixturePosition;
        #endif
        wallLightPosition=(modelMatrix*fixturePosition).xyz;`);
      const xyz=values=>values.map(v=>v.toFixed(2)).join(',');
      shader.fragmentShader='uniform highp sampler3D wallLighting; varying vec3 wallLightPosition;\n'+
        shader.fragmentShader.replace('#include <lights_fragment_end>',`
          vec3 lightUv=(wallLightPosition-vec3(${xyz(lightingBounds.min)}))/vec3(${xyz(lightingBounds.extent)});
          vec4 wash=texture(wallLighting,lightUv);
          wash.a*=step(0.,lightUv.y)*step(lightUv.y,1.);
          vec3 toFixtures=(wash.rgb*255.-128.)/127.;
          float incidence=dot(inverseTransformDirection(normal,viewMatrix),toFixtures);
          reflectedLight.directDiffuse+=3.*wash.a*(.14+.86*max(0.,incidence))*BRDF_Lambert(diffuseColor.rgb);
          #include <lights_fragment_end>`);
    };
    m.customProgramCacheKey=()=>finish+'-'+shape;
    cache.set(key,m);return m;
  }
  return {material,maps,bakeWallLighting(fixtures){wallLighting.value=fixtureLighting(T,fixtures);}};
}
