// Uniform lattice edges are continuous straight lines between boundary nodes.
function latticeGeometry(T, res, section) {
  const vertices=[];
  const line=(x,y,z,a,b,c)=>vertices.push(x,y,z,a,b,c);
  const planes=section?[0]:Array.from({length:4*res+1},(_,i)=>i/res-2);
  for(const z of planes){
    for(let j=0;j<=4*res;j++)line(-3,j/res-2,z,6,j/res-2,z);
    for(let i=0;i<=9*res;i++)line(i/res-3,-2,z,i/res-3,2,z);
  }
  if(!section)for(let i=0;i<=9*res;i++)for(let j=0;j<=4*res;j++)
    line(i/res-3,j/res-2,-2,i/res-3,j/res-2,2);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  return geometry;
}

async function foamGeometry(T,path){
  const response=await fetch(path);
  if(!response.ok)throw Error('OpenFOAM mesh · HTTP '+response.status);
  const data=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const [points,indices]=new Uint32Array(data,0,2);
  if(data.byteLength!==8+12*points+4*indices)throw Error('Incomplete OpenFOAM mesh');
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(data,8,points*3),3));
  geometry.setIndex(new T.BufferAttribute(new Uint32Array(data,8+12*points,indices),1));
  return geometry;
}

export function nativeMesh(T,scene,meta,transient){
  const group=new T.Group(),cache=new Map();
  scene.add(group);
  let generation=0;
  return {
    async select(mode){
      const request=++generation;
      group.visible=false;
      if(!mode)return;
      if(!cache.has(mode)){
        const directory=meta.meshAsset??(transient?'mesh-transient':'mesh-steady');
        const file='./assets/onrt/'+directory+'/'+mode+'.bin.gz';
        const geometry=meta.cellsPerDiameter ? Promise.resolve(latticeGeometry(T,meta.cellsPerDiameter,mode==='section')) :
          foamGeometry(T,file+new URL(import.meta.url).search);
        cache.set(mode,geometry.then(g=>new T.LineSegments(g,new T.LineBasicMaterial({
          color:0x9bd8e5,transparent:true,opacity:mode==='volume'?.17:.68,depthWrite:false
        }))).catch(error=>{cache.delete(mode);throw error;}));
      }
      const lines=await cache.get(mode);
      if(request!==generation)return;
      group.clear();group.add(lines);group.visible=true;
    },
    setAngle(radians){if(transient && !meta.cellsPerDiameter)group.rotation.x=radians;}
  };
}
