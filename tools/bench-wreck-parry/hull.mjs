// Compare identical per-part overlap bits, with no speculative contact skin.
import assert from 'node:assert/strict';
import {piccardParts,viewport} from '../../viewer/piccard-geometry.mjs';
import {scanPrimitive,scanTriangle,primitiveTriangle} from '../../viewer/convex-scan.mjs';

const parts=piccardParts().parts.map(scanPrimitive);
const reach=Math.max(viewport.radius+Math.hypot(...viewport.center),
  ...parts.map(p=>Math.hypot(...p.center)+Math.hypot(...p.half)));

export function uploadHull(wasm){
  for(const part of parts){
    // Parry receives the actual polygon vertices so both engines see the same ducts.
    for(const vertex of part.ring??[])for(const side of [-1,1]){
      const local=vertex.slice();
      local[part.axis]=side*part.half[part.axis];
      wasm.hull_vertex(...local);
    }
    assert(wasm.hull_part(...part.center,...part.half));
  }
  assert(wasm.hull_part(...viewport.center,viewport.radius,0,0));
}

function rotate(p,w,x,y,z){
  const a=2*(y*p[2]-z*p[1]),b=2*(z*p[0]-x*p[2]),c=2*(x*p[1]-y*p[0]);
  return [p[0]+w*a+y*c-z*b,p[1]+w*b+z*a-x*c,p[2]+w*c+x*b-y*a];
}

function maskAt(mesh,[x,y,z,w,i,j,k]){
  const {lo,hi}=mesh.bounds;
  const dx=Math.max(lo[0]-x,x-hi[0],0),dy=Math.max(lo[1]-y,y-hi[1],0),dz=Math.max(lo[2]-z,z-hi[2],0);
  if(dx*dx+dy*dy+dz*dz>reach*reach)return 0;
  let mask=0;
  const offset=rotate(viewport.center,w,i,j,k);
  if(mesh.nearest([x+offset[0],y+offset[1],z+offset[2]],viewport.radius))mask|=1<<parts.length;
  function local(p){return rotate([p[0]-x,p[1]-y,p[2]-z],w,-i,-j,-k);}
  mesh.overlapping([x-reach,y-reach,z-reach],[x+reach,y+reach,z+reach],face=>{
    const tri=scanTriangle(local(face.a),local(face.b),local(face.c),rotate(face.n,w,-i,-j,-k));
    for(let n=0;n<parts.length;n++){
      if(!(mask&(1<<n)) && primitiveTriangle(parts[n],tri,0))mask|=1<<n;
    }
  });
  return mask;
}

export function compareHull(id,mesh,near,far,wasm,measure){
  // Tilt the sub about all three axes, sampling both separated and touching poses.
  const poses=points=>points.filter((_,i)=>i%4===0).map((p,n)=>{
    const a=.173*n,b=.317*n,t=.691*n;
    return [...p,Math.cos(t),Math.sin(t)*Math.cos(a)*Math.cos(b),
      Math.sin(t)*Math.sin(a)*Math.cos(b),Math.sin(t)*Math.sin(b)];
  });
  const ocean=p=>maskAt(mesh,p),parry=p=>wasm.touching_parts(...p);
  for(const [group,points] of [['near',near],['clear',far]]){
    const queries=poses(points);
    let touching=0,partHits=0;
    for(const [i,p] of queries.entries()){
      const mask=ocean(p),reference=parry(p);
      assert(reference>=0,'unsupported Parry pair');
      assert.equal(mask,reference,id+' '+group+' disagreement at pose '+i+' '+JSON.stringify(p));
      if(mask)touching++;
      for(let bits=mask;bits;bits&=bits-1)partHits++;
    }
    console.log(JSON.stringify({site:id,query:'overlapping hull parts',group,poses:queries.length,
      parts:parts.length+1,touching,partHits,oceanNs:measure(ocean,queries),parryWasmNs:measure(parry,queries)}));
  }
}
