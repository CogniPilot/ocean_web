// Fitted convex pieces in body metres. Use the same nested rotation about each anatomical joint as Wreck.skinFrames.
import {pieces,pivots} from './shark-contact-data.mjs';
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const apply=(r,p)=>r.map(row=>dot(row,p));
const transpose=m=>m[0].map((_,i)=>m.map(row=>row[i]));
const multiply=(a,b)=>{const columns=transpose(b);return a.map(row=>columns.map(col=>dot(row,col)));};
function basis(yaw,pitch,roll){
  const c=Math.cos(yaw),s=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
  return [[c*cp,c*sp*sr-s*cr,c*sp*cr+s*sr],[s*cp,s*sp*sr+c*cr,s*sp*cr-c*sr],[-sp,cp*sr,cp*cr]];
}
export function sharkCollision(actor){
  const angles=actor.joints??[0,0,0,0],velocity=[actor.ve??0,actor.vn??0,actor.vz??0];
  const frames=[{r:basis(actor.yaw??0,actor.pitch??0,actor.heel??0),o:[actor.x,actor.y,actor.z]}];
  pivots.forEach((p,i)=>{
    const parent=frames[i<3?i:0],delta=i>2?angles[3]:i?angles[i]-angles[i-1]:angles[0];
    const local=i<3?basis(delta,0,0):basis(0,-delta,0);
    const r=multiply(parent.r,local),o=add(parent.o,apply(parent.r,sub(p,apply(local,p))));
    frames.push({r,o});
  });
  const shape=pieces.map(piece=>{
    const {r,o}=frames[piece.joint],inverse=transpose(r),bb=piece.bounds;
    const half=bb.slice(0,3).map((v,i)=>(bb[3+i]-v)*.5);
    const center=add(o,apply(r,bb.slice(0,3).map((v,i)=>v+half[i])));
    const range=r.map(row=>dot(row.map(Math.abs),half));
    return {piece,r,o,inverse,lo:sub(center,range),hi:add(center,range)};
  });
  function nearby(box,t,dt,visit){
    for(const part of shape){
      const close=velocity.every((v,k)=>part.lo[k]+Math.min(t*v,(t+dt)*v)<=box[k+3]&&part.hi[k]+Math.max(t*v,(t+dt)*v)>=box[k]);
      if(close)visit(part);
    }
  }
  return {
    triangles(box,t,dt,visit){
      nearby(box,t,dt,({piece,r,o})=>{
        const offset=o.map((v,k)=>v+t*velocity[k]);
        const vertices=piece.vertices.map(p=>add(offset,apply(r,p)));
        for(const [a,b,c] of piece.faces)visit([vertices[a],vertices[b],vertices[c]],velocity);
      });
    },
    sweep(start,end,radius,t,dt){
      const box=[...start.map((v,i)=>Math.min(v,end[i])-radius),...start.map((v,i)=>Math.max(v,end[i])+radius)];
      let best;
      nearby(box,t,dt,({piece,r,o,inverse})=>{
        const p=apply(inverse,start.map((v,i)=>v-o[i]-t*velocity[i]));
        const direction=apply(inverse,end.map((v,i)=>v-start[i]-dt*velocity[i]));
        let entry=0,exit=1,gap=-Infinity,normal,enterNormal;
        for(const plane of piece.planes){
          const d=dot(plane,p)-plane[3]-radius,s=dot(plane,direction);
          if(d>gap){gap=d;normal=plane;}
          if(Math.abs(s)<1e-10){if(d>0)return;continue;}
          const f=-d/s;
          if(s<0&&f>entry){entry=f;enterNormal=plane;}
          if(s>0)exit=Math.min(exit,f);
          if(entry>exit)return;
        }
        const n=apply(r,enterNormal??normal),penetration=Math.max(0,-gap);
        if(!best||entry<best.fraction||entry===best.fraction&&penetration>best.penetration){
          best={fraction:entry,nx:n[0],ny:n[1],nz:n[2],penetration,velocity};
        }
      });
      return best;
    }
  };
}
export const sharkExtents=Array.from({length:3},(_,i)=>Math.max(...pieces.map(p=>Math.max(Math.abs(p.bounds[i]),Math.abs(p.bounds[i+3])))));
