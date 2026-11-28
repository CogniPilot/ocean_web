// Derive the convex rock contact tables from the authored shoreline GLB.
const {readFile,writeFile}=require('node:fs/promises');
const {join}=require('node:path');

async function bake(){
  const {readIslandAsset}=await import('../scripts/read-island-asset.mjs');
  const asset=await readIslandAsset();
  const T=globalThis.THREE;
  const rocks=asset.children.filter(node=>node.userData.shoreRock);
  if(!rocks.length)throw Error('No shoreline boulders in harbor-island.glb');
  const localToEnu=new T.Matrix4().makeRotationX(Math.PI/2);
  const enuToLocal=new T.Matrix4().makeRotationX(-Math.PI/2);
  const position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
  const centers=rocks.map(rock=>{
    const world=rock.matrixWorld.clone().multiply(enuToLocal);
    world.decompose(position,rotation,scale);
    const dual=new T.Matrix3().setFromMatrix4(world).invert().transpose();
    return [...position.toArray(),Math.max(scale.x,scale.y,scale.z),...dual.elements];
  });
  const geometry=rocks[0].geometry;
  const vertices=geometry.attributes.position,indices=geometry.index?.array;
  const point=i=>new T.Vector3().fromBufferAttribute(vertices,indices?.[i]??i).applyMatrix4(localToEnu);
  const planes=[];
  for(let i=0;i<(indices?.length??vertices.count);i+=3){
    const a=point(i),b=point(i+1),c=point(i+2);
    const n=b.sub(a).cross(c.sub(a)).normalize();
    planes.push([...n.toArray(),n.dot(a)]);
  }
  const rows=values=>'['+values.map(row=>row.map(value=>Number(value.toFixed(7))).join(',')).join(';\n')+']';
  const file=join(__dirname,'../viewer/board/Shore.mo');
  const source=await readFile(file,'utf8');
  const baked=source.replace(/  \/\/ BEGIN BAKED[\s\S]*?  \/\/ END BAKED/,
    '  // BEGIN BAKED\n  constant Real rocks['+centers.length+',13]='+rows(centers)+';\n'+
    '  constant Real planes['+planes.length+',4]='+rows(planes)+';\n  // END BAKED');
  if(baked!==source)await writeFile(file,baked);
}
bake().catch(error=>{console.error(error);process.exitCode=1;});
