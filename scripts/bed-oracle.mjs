// Exhaustive Three.js triangle intersections, independent of the solver's grid traversal.
import {createRequire} from 'node:module';
import bed from '../viewer/bathymetry.js';
const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js');
const v=(x,y,z)=>new T.Vector3(x,y,z),ray=new T.Ray(),hit=v();
const triangles=[];
for(let y=bed.min;y<bed.max;y+=bed.step)for(let x=bed.min;x<bed.max;x+=bed.step){
  const vertex=(u,w)=>v(u,w,bed.node(u,w));
  const a=vertex(x,y),b=vertex(x+bed.step,y),c=vertex(x,y+bed.step),d=vertex(x+bed.step,y+bed.step);
  triangles.push([a,b,d],[a,d,c]);
}
export function bedEcho(origin,direction){
  ray.set(origin,direction);
  let range=Infinity;
  for(const [a,b,c] of triangles)if(ray.intersectTriangle(a,b,c,false,hit)){
    const t=hit.distanceTo(origin);if(t>=.08)range=Math.min(range,t);
  }
  const plane=(bed.datum-origin.z)/direction.z;
  if(plane>=.08){
    ray.at(plane,hit);
    if(hit.x<=bed.min||hit.x>=bed.max||hit.y<=bed.min||hit.y>=bed.max)range=Math.min(range,plane);
  }
  return range;
}
