// Bake the actual display mesh into convex collision planes; run from the repository root.
const fs=require('node:fs'),vm=require('node:vm');
const T=require('../viewer/vendor/three.min.js');
const ctx={T,scene:new T.Scene()};
vm.runInNewContext(fs.readFileSync('viewer/visuals.js','utf8')+'\nbatchScenery=()=>{}; land=coast(T,scene,false);',ctx);
ctx.scene.updateMatrixWorld(true);
const rocks=[];
ctx.land.traverse(o=>{if(o.geometry?.type==='IcosahedronGeometry')rocks.push(o);});
if(!rocks.length)throw Error('No shoreline rocks found');
const planes=[],centers=[];
const rows=a=>'['+a.map(row=>row.map(x=>Number(x.toFixed(7))).join(',')).join(';\n')+']';
for(const rock of rocks){
  const center=rock.getWorldPosition(new T.Vector3()),v=rock.geometry.attributes.position;
  const inv=new T.Matrix3().setFromMatrix4(rock.matrixWorld).invert().transpose();
  centers.push([...center.toArray(),Math.max(...rock.scale.toArray()),...inv.elements]);
  if(planes.length)continue;
  for(let i=0;i<v.count;i+=3){
    const [a,b,c]=[i,i+1,i+2].map(j=>new T.Vector3().fromBufferAttribute(v,j));
    const n=b.sub(a).cross(c.sub(a)).normalize();
    planes.push([...n.toArray(),n.dot(a)]);
  }
}
const path='viewer/board/Shore.mo',source=fs.readFileSync(path,'utf8');
fs.writeFileSync(path,source.replace(/  \/\/ BEGIN BAKED[\s\S]*?  \/\/ END BAKED/,'  // BEGIN BAKED\n  constant Real rocks['+rocks.length+',13]='+rows(centers)+';\n  constant Real planes['+planes.length+',4]='+rows(planes)+';\n  // END BAKED'));
