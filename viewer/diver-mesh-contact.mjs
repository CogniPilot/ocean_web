// Vertex coordinates are metres in each driving bone's local frame. The topology
// is reduced from the dressed GLB and shared by the host, peers and debug view.
import {diverSkin} from './scuba-triangles.mjs';
const {vertices,triangles,parts}=diverSkin;
const n=triangles.length/4, nv=vertices.length/4;
const labels=parts.map(name=>{const [link,kind]=name.split('/');return {link:+link,kind};});
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const xyz=(p,i)=>[p[3*i],p[3*i+1],p[3*i+2]];
const pad=.0015;
function bounds(){return [Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];}
function include(box,p){for(let i=0;i<3;i++){box[i]=Math.min(box[i],p[i]);box[i+3]=Math.max(box[i+3],p[i]);}}
function overlap(a,b){return a[0]<=b[3]+pad&&a[3]>=b[0]-pad&&a[1]<=b[4]+pad&&a[4]>=b[1]-pad&&a[2]<=b[5]+pad&&a[5]>=b[2]-pad;}
function corners(p,f){return [xyz(p,triangles[4*f]),xyz(p,triangles[4*f+1]),xyz(p,triangles[4*f+2])];}
function hierarchy(ids,p){
  const box=bounds();
  const centers=ids.map(f=>{
    const q=corners(p,f),c=scale(add(q[0],add(q[1],q[2])),1/3);include(box,c);return {f,c};
  });
  if(ids.length<=6)return {ids,box};
  const sizes=box.slice(0,3).map((v,i)=>box[i+3]-v),axis=sizes.indexOf(Math.max(...sizes));
  centers.sort((a,b)=>a.c[axis]-b.c[axis]);
  const list=centers.map(entry=>entry.f),mid=list.length>>1;
  return {left:hierarchy(list.slice(0,mid),p),right:hierarchy(list.slice(mid),p),box};
}
function refit(node,a,b){
  const box=node.box;
  if(node.ids){
    box[0]=box[1]=box[2]=Infinity;box[3]=box[4]=box[5]=-Infinity;
    for(const f of node.ids)for(let j=0;j<3;j++){
      const k=3*triangles[4*f+j];
      for(let d=0;d<3;d++){box[d]=Math.min(box[d],a[k+d],b[k+d]);box[d+3]=Math.max(box[d+3],a[k+d],b[k+d]);}
    }
  }else{
    const l=refit(node.left,a,b),r=refit(node.right,a,b);
    for(let d=0;d<3;d++){box[d]=Math.min(l[d],r[d]);box[d+3]=Math.max(l[d+3],r[d+3]);}
  }
  return box;
}
function query(node,box,cb){if(!overlap(node.box,box))return;if(node.ids){for(const id of node.ids)cb(id);}else{query(node.left,box,cb);query(node.right,box,cb);}}
function boxOf(a,b=a){const box=bounds();for(const p of a)include(box,p);for(const p of b)include(box,p);return box;}
function segmentTriangle(a,b,tri){
  const d=sub(b,a),u=sub(tri[1],tri[0]),v=sub(tri[2],tri[0]),h=cross(d,v),den=dot(u,h);
  if(Math.abs(den)<1e-14)return;
  const s=sub(a,tri[0]),x=dot(s,h)/den;
  if(x< -1e-8||x>1.00000001)return;
  const q=cross(s,u),y=dot(d,q)/den;
  if(y< -1e-8||x+y>1.00000001)return;
  const t=dot(v,q)/den;
  if(t>=-1e-8&&t<=1.00000001)return Math.max(0,Math.min(1,t));
}
function unitNormal(tri){
  const n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])),length=Math.hypot(...n);
  return length>1e-10?scale(n,1/length):null;
}
// Barycentric velocity at the actual witness matters at the tip of a rotating
// flipper. Fall back to the mean for a degenerate remeshed face.
function witnessVelocity(first,last,point,fraction,dt){
  const tri=first.map((p,k)=>lerp(p,last[k],fraction));
  const u=sub(tri[1],tri[0]),v=sub(tri[2],tri[0]),w=sub(point,tri[0]);
  const uu=dot(u,u),uv=dot(u,v),vv=dot(v,v),wu=dot(w,u),wv=dot(w,v);
  const det=uu*vv-uv*uv;
  const a=det>1e-18?(wu*vv-wv*uv)/det:1/3,b=det>1e-18?(wv*uu-wu*uv)/det:1/3;
  const weights=[Math.max(0,1-a-b),Math.max(0,a),Math.max(0,b)];
  const total=dt*(weights[0]+weights[1]+weights[2]);
  return [0,1,2].map(k=>weights.reduce((sum,weight,j)=>sum+weight*(last[j][k]-first[j][k]),0)/total);
}
function planeDistance(p,tri,n){return dot(sub(p,tri[0]),n);}
function inTriangle(p,tri,n){
  // Works in either winding if the supplied normal has been flipped.
  let plus=false,minus=false;
  for(let k=0;k<3;k++){
    const s=dot(cross(sub(tri[(k+1)%3],tri[k]),sub(p,tri[k])),n);
    plus||=s>1e-8;minus||=s< -1e-8;
  }
  return !(plus&&minus);
}
// Clip the incident polygon to the finite opposing face. Only the portion
// actually over this face contributes to penetration or coplanar contact.
function facePatch(tri,face,normal){
  let polygon=tri;
  for(let i=0;i<3&&polygon.length;i++){
    const origin=face[i],inside=cross(normal,sub(face[(i+1)%3],origin));
    const next=[];
    let a=polygon[polygon.length-1],da=dot(inside,sub(a,origin));
    for(const b of polygon){
      const db=dot(inside,sub(b,origin));
      if((da>=0)!==(db>=0))next.push(lerp(a,b,da/(da-db)));
      if(db>=0)next.push(b);
      a=b;da=db;
    }
    polygon=next;
  }
  return polygon;
}
// A linearly moving triangle against a stationary facet. Test its vertices,
// the other three vertices, swept edges, and existing triangle intersections.
// The parent samples two subintervals per host tick to track rotating bones.
export function movingTriangleContact(first,last,obstacle,reference,ground=false){
  const winding=unitNormal(obstacle);if(!winding)return;let normal=winding;
  if(ground?normal[2]<0:planeDistance(reference,obstacle,normal)<0)normal=scale(normal,-1);
  const start=first.map(p=>planeDistance(p,obstacle,normal)),end=last.map(p=>planeDistance(p,obstacle,normal));
  if(Math.min(...start,...end)>pad||(!ground&&Math.max(...start,...end)<-pad))return;
  let point=null,fraction=1;
  for(let j=0;j<3;j++){
    if(start[j]>end[j]&&start[j]>=0&&end[j]<=0){
      const t=start[j]/(start[j]-end[j]),q=lerp(first[j],last[j],t);
      if(t<=fraction&&inTriangle(q,obstacle,normal)){point=q;fraction=t;}
    }
    if(ground&&end[j]<=0&&inTriangle(last[j],obstacle,normal))point??=last[j];
    // Surface intersections, including the edges meeting a stationary thin plate.
    const k=(j+1)%3;
    let t=segmentTriangle(last[j],last[k],obstacle);
    if(t!==undefined)point??=lerp(last[j],last[k],t);
    t=segmentTriangle(obstacle[j],obstacle[k],last);
    if(t!==undefined)point??=lerp(obstacle[j],obstacle[k],t);
  }
  if(!point){
    // A small obstacle can pass through the middle of a broad blade without
    // ever crossing a vertex path. Test its vertices against the moving face.
    const n0=unitNormal(first),n1=unitNormal(last);
    if(n0&&n1)for(const q of obstacle){
      const a=planeDistance(q,first,n0),b=planeDistance(q,last,n1);
      if(a*b>0||Math.abs(a-b)<1e-10)continue;
      let lo=0,hi=1;
      for(let i=0;i<9;i++){
        const t=(lo+hi)*.5,tri=first.map((p,k)=>lerp(p,last[k],t)),nt=unitNormal(tri);
        if(!nt||planeDistance(q,tri,nt)*a>0)lo=t;else hi=t;
      }
      const tri=first.map((p,k)=>lerp(p,last[k],hi)),nt=unitNormal(tri);
      if(nt&&inTriangle(q,tri,nt)){point=q;fraction=hi;break;}
    }
  }
  if(!point)for(let j=0;j<3&&!point;j++){
    const k=(j+1)%3;
    for(let e=0;e<3&&!point;e++){
      const a=obstacle[e],b=obstacle[(e+1)%3];
      for(const side of [[first[j],first[k],last[k]],[first[j],last[k],last[j]]]){
        const s=segmentTriangle(a,b,side);
        if(s!==undefined){point=lerp(a,b,s);break;}
      }
    }
  }
  const coplanar=Math.max(...end.map(Math.abs))<=pad;
  if(!point&&!coplanar)return;
  const patch=facePatch(last,obstacle,winding);
  if(!point&&coplanar)point=patch[0];
  if(!point)return;
  // Keep a material point on the moving face. Its signed distance can be
  // recomputed throughout the host batch as the joint slows or reverses.
  const deepest=patch.reduce((p,q)=>planeDistance(q,obstacle,normal)<planeDistance(p,obstacle,normal)?q:p,patch[0]??point);
  const d=Math.max(pad,-planeDistance(deepest,obstacle,normal));
  return {point,normal,depth:d,fraction,deepest:patch.length?deepest:null};
}
export function diverTriangleSkin(bones){
  const links=diverSkin.bones.map(n=>bones.get(n));
  function points(out=new Float64Array(3*nv)){
    for(let i=0;i<nv;i++){
      const k=4*i,m=links[vertices[k]].matrixWorld.elements,x=vertices[k+1],y=vertices[k+2],z=vertices[k+3];
      for(let j=0;j<3;j++)out[3*i+j]=m[j]*x+m[4+j]*y+m[8+j]*z+m[12+j];
    }
    return out;
  }

  const byLabel=parts.map((_,p)=>Array.from({length:n},(_,i)=>i).filter(i=>triangles[i*4+3]===p));
  const rest=points(),trees=byLabel.map(ids=>hierarchy(ids,rest));
  // Articulated skin crosses joint seams in the bind pose. Exclude only pairs
  // of nearby fitted faces; other triangles of the same two links can collide.
  const restBounds=Array.from({length:n},(_,f)=>boxOf(corners(rest,f)).map((v,k)=>v+(k<3?-.009:.009)));
  const fitted=(f,g)=>overlap(restBounds[f],restBounds[g]);
  const center=box=>box.slice(0,3).map((x,k)=>(x+box[k+3])*.5);
  const union=b=>{const out=bounds();for(const box of b){include(out,box);include(out,box.slice(3));}return out;};
  function prepare(a,b){
    const boxes=trees.map(tree=>refit(tree,a,b));
    return {boxes,center:boxes.map(center),box:union(boxes)};
  }
  function snapshot(){return points();}
  let drawn;
  function wires(draw){
    drawn=points(drawn);
    for(let i=0;i<byLabel.length;i++){
      const coords=[];
      for(const f of byLabel[i]){
        const t=corners(drawn,f);
        for(let k=0;k<3;k++)coords.push(...t[k],...t[(k+1)%3]);
      }
      draw(labels[i].kind,coords);
    }
  }
  return {points,snapshot,wires,trees,prepare,fitted};
}
function selfPair(a,b){
  if(a.link===b.link)return false;
  const segment=l=>l===1?0:(l-2)%7+2;
  const i=segment(a.link),j=segment(b.link);
  if(a.link===1||b.link===1){
    const l=a.link===1?j:i;
    // Socket and strap contact is fitted at rest. Distal limbs are free.
    return l===4||l===6||l===8;
  }
  const sameSide=(a.link<9)===(b.link<9);
  if(sameSide&&(i<=6)===(j<=6))return false;
  return true;
}
const empty=()=>({contact:[0,0,0,0],contactMomentArm:[0,0,0],contactRelativeVelocity:[0,0,0],contactLink:1,score:0});
export function meshLoad(skin,start,end,row,dt,world,standing,offset){
  const {boxes,box,center}=skin.prepare(start,end),out=empty(),self=Array(9).fill(0);
  let selfScore=0;
  function consider(i,tri,velocity,ground,peer=0,opposingFace=-1){
    if(ground&&standing>.5&&['leg','boot','fin'].includes(labels[i].kind))return;
    const delta=scale(velocity,dt),moving=velocity.some(x=>x!==0),lastTri=moving?tri.map(p=>add(p,delta)):tri;
    const bounds=boxOf(tri,lastTri);
    if(ground)bounds[2]=-Infinity;
    query(skin.trees[i],bounds,f=>{
      if(peer&&skin.fitted(f,opposingFace))return;
      const first=corners(start,f),last=corners(end,f),relative=moving?last.map(p=>sub(p,delta)):last;
      const tbox=boxOf(first,last);if(!overlap(tbox,bounds))return;
      const hit=movingTriangleContact(first,relative,tri,center[i],ground);if(!hit)return;
      const speed=witnessVelocity(first,relative,hit.point,hit.fraction,dt);
      const score=3600*hit.depth-650*dot(speed,hit.normal);
      const p=add(hit.point,scale(delta,hit.fraction));
      const arm=sub(p,add(row.slice(1,4),scale(row.slice(4,7),hit.fraction*dt)));
      if(peer){
        if(score<=selfScore)return;
        selfScore=score;self.splice(0,9,labels[i].link,peer,...hit.normal,hit.depth,...arm);
      }else if(score>out.score){
        out.score=score;out.part=labels[i].kind;out.point=f;out.contact=[...hit.normal,hit.depth];
        out.contactLink=labels[i].link;out.contactMomentArm=arm;out.contactRelativeVelocity=sub(speed,row.slice(4,7));
        out.materialPoint=add(hit.deepest??add(hit.point,scale(speed,dt*(1-hit.fraction))),delta);
        out.planeAtStart=dot(hit.normal,sub(tri[0],scale(velocity,offset)));
        out.obstacleVelocity=velocity;
      }
    });
  }
  const zero=[0,0,0];
  world.triangles(box,offset,dt,(tri,velocity=zero,ground=false)=>{
    const tbox=boxOf(tri,velocity.some(x=>x!==0)?tri.map(p=>add(p,scale(velocity,dt))):tri);
    if(ground)tbox[2]=-Infinity;
    for(let i=0;i<boxes.length;i++)if(overlap(boxes[i],tbox))consider(i,tri,velocity,ground);
  });
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    if(!selfPair(labels[i],labels[j])||!overlap(boxes[i],boxes[j]))continue;
    query(skin.trees[j],boxes[i],f=>{
      const tri=corners(start,f),last=corners(end,f),velocity=scale(sub(last.reduce(add,zero),tri.reduce(add,zero)),1/(3*dt));
      consider(i,tri,velocity,false,labels[j].link,f);
    });
  }
  return {...out,meshCollision:1,meshSelfContact:self,selfScore};
}
export function peerTriangles(points,velocity,offset,visit){
  const delta=scale(velocity,offset);
  for(let i=0;i<n;i++)visit(corners(points,i).map(p=>add(p,delta)),velocity);
}
