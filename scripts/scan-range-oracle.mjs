// Independent tree of AABBs for the scan cells used by calibrated range instruments.
import {readFile} from 'node:fs/promises';
import {wreckSites} from '../viewer/red-sea-sites.mjs';
import bed from '../viewer/bathymetry.js';

export async function scanRangeOracle(T){
  const size=.24,axes=['x','y','z'],ray=new T.Ray(),point=new T.Vector3();
  const centre=(box,axis)=>box.min[axis]+box.max[axis];
  function tree(boxes){
    const bounds=new T.Box3();
    for(const box of boxes)bounds.union(box);
    if(boxes.length<=12)return {bounds,boxes};
    const extent=bounds.getSize(new T.Vector3());
    const axis=axes.reduce((a,b)=>extent[a]>extent[b]?a:b);
    boxes.sort((a,b)=>centre(a,axis)-centre(b,axis));
    const mid=boxes.length>>1;
    return {bounds,children:[tree(boxes.slice(0,mid)),tree(boxes.slice(mid))]};
  }
  const sites=await Promise.all(wreckSites.map(async site=>{
    const shift=new T.Vector3(site.east,site.north,bed.height(site.east,site.north)-site.burial);
    const {positions,indices}=JSON.parse(await readFile(new URL('../viewer/assets/red-sea/'+site.id+'/collision.json',import.meta.url)));
    const points=Array.from({length:positions.length/3},(_,i)=>new T.Vector3().fromArray(positions,3*i).add(shift));
    const occupied=new Map(),triangle=new T.Triangle(),bounds=new T.Box3();
    for(let i=0;i<indices.length;i+=3){
      triangle.set(points[indices[i]],points[indices[i+1]],points[indices[i+2]]);
      bounds.setFromPoints([triangle.a,triangle.b,triangle.c]);
      const low=bounds.min.clone().divideScalar(size).floor(),high=bounds.max.clone().divideScalar(size).floor();
      for(let x=low.x;x<=high.x;x++)for(let y=low.y;y<=high.y;y++)for(let z=low.z;z<=high.z;z++){
        const key=x+','+y+','+z;
        if(occupied.has(key))continue;
        const box=new T.Box3(new T.Vector3(x,y,z).multiplyScalar(size),new T.Vector3(x+1,y+1,z+1).multiplyScalar(size));
        if(box.intersectsTriangle(triangle))occupied.set(key,box);
      }
    }
    return tree([...occupied.values()]);
  }));
  return (origin,direction,limit)=>{
    let range=limit;
    ray.origin.copy(origin).addScaledVector(direction,.08);
    ray.direction.copy(direction);
    function entry(box){
      if(box.containsPoint(ray.origin))return .08;
      return ray.intersectBox(box,point)?point.distanceTo(origin):Infinity;
    }
    function visit(node){
      if(entry(node.bounds)>range)return;
      if(node.boxes)for(const box of node.boxes)range=Math.min(range,entry(box));
      else for(const child of node.children)visit(child);
    }
    for(const site of sites)visit(site);
    return range;
  };
}
