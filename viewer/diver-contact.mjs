import {sharkCollision} from './shark-contact.mjs';
import {peerTriangles} from './diver-mesh-contact.mjs';
// Spherical probes articulate with the same bones and blade-sole landmarks as
// the dressed character. Coordinates in restPoint() are in its prone FLU frame.
export function diverProbes(T,bones){
  const parts=[],point=new T.Vector3();
  function anchored(b,local,r,kind){parts.push({b,local,r,kind});}
  function restPoint(name,xyz,r,kind){
    const b=bones.get(name);anchored(b,b.worldToLocal(new T.Vector3(...xyz)),r,kind);
  }
  function limb(start,end,fractions,r,kind){
    const b=bones.get(start),q=b.worldToLocal(bones.get(end).getWorldPosition(new T.Vector3()));
    for(const f of fractions)anchored(b,q.clone().multiplyScalar(f),r,kind);
  }
  // BCD, pelvis and mask including the regulator. Pack/cylinder moves with the chest.
  for(const x of [-.20,.01,.22])for(const y of [-.075,.075])
    restPoint(x<0?'pelvis':'spine_02',[x,y,.015],.141,'body');
  restPoint('Head',[.486,0,.076],.123,'head');restPoint('Head',[.558,0,.025],.057,'head');
  for(const x of [-.206,-.103,0,.105,.217])restPoint('spine_02',[x,0,.240],.093,'tank');
  restPoint('spine_02',[.300,-.018,.240],.041,'tank');
  for(const side of ['l','r']){
    limb('upperarm_'+side,'lowerarm_'+side,[.18,.52,.85],.068,'arm');
    limb('lowerarm_'+side,'hand_'+side,[.15,.50,.85],.055,'arm');
    const hand=bones.get('hand_'+side);
    anchored(hand,new T.Vector3(),.068,'hand');
    const distal=hand.worldToLocal(bones.get('lowerarm_'+side).getWorldPosition(new T.Vector3())).multiplyScalar(-.39);
    anchored(hand,distal,.060,'hand');
    limb('thigh_'+side,'calf_'+side,[.1,.40,.70,.94],.096,'leg');
    limb('calf_'+side,'foot_'+side,[.12,.40,.70,.94],.069,'leg');
    const foot=bones.get('foot_'+side),[heel,left,right]=foot.userData.standing.sole.map(p=>new T.Vector3().fromArray(p));
    anchored(foot,new T.Vector3(),.076,'boot');
    const center=left.clone().lerp(right,.5),across=right.clone().sub(left);
    for(const [fraction,offset,r] of [[.10,0,.064],[.24,0,.065],[.38,0,.065],[.52,.22,.061],
        [.68,.27,.061],[.83,.30,.060],[.96,.33,.046]]){
      const mid=heel.clone().lerp(center,fraction);
      for(const s of offset?[-offset,offset]:[0])anchored(foot,mid.clone().addScaledVector(across,s),r,'fin');
    }
  }
  const kinds=parts.map(p=>p.kind);
  return {kinds,points(out=new Float64Array(parts.length*4)){
    for(let i=0;i<parts.length;i++){
      const {b,local,r}=parts[i];point.copy(local).applyMatrix4(b.matrixWorld);point.toArray(out,4*i);out[4*i+3]=r;
    }
    return out;
  }};
}

export function diverLoad(start,end,kinds,body,dt,sweep,standing,offset=0){
  const contact=[0,0,0,0],contactMomentArm=[0,0,0],contactRelativeVelocity=[0,0,0];
  let strongest=0,part,point;
  for(let i=0,k=0;i<kinds.length;i++,k+=4){
    const x=start[k],y=start[k+1],z=start[k+2],r=start[k+3];
    const dx=end[k]-x,dy=end[k+1]-y,dz=end[k+2]-z;
    // The FMU already resolves planted soles against sand with friction.
    // Lower limb probes still block reefs and plating while walking.
    const ownFloor=standing>.5&&(kinds[i]==='leg'||kinds[i]==='boot'||kinds[i]==='fin');
    const hit=sweep(x,y,z,x+dx,y+dy,z+dz,r,!ownFloor,offset,dt);
    if(!hit)continue;
    const {nx,ny,nz}=hit,other=hit.velocity;
    const rx=dx/dt-(other?.[0]??0),ry=dy/dt-(other?.[1]??0),rz=dz/dt-(other?.[2]??0);
    const normalTravel=dt*(rx*nx+ry*ny+rz*nz);
    const depth=(hit.penetration??0)+Math.max(0,-normalTravel)*(1-hit.fraction);
    const score=depth>0?Math.max(0,3600*depth-650*normalTravel/dt):0;
    if(score<=strongest)continue;
    strongest=score;part=kinds[i];point=i;
    contact.splice(0,4,nx,ny,nz,depth);
    contactMomentArm.splice(0,3,x-r*nx-body[1],y-r*ny-body[2],z-r*nz-body[3]);
    contactRelativeVelocity.splice(0,3,rx-body[4],ry-body[5],rz-body[6]);
  }
  return {contact,contactMomentArm,contactRelativeVelocity,part,point,score:strongest};
}

// Body-relative ellipsoid hulls, with separate floats for catamarans. The
// passive hulls can sweep through a diver between two room-host samples.
const actorHulls={
  sub:[[0,0,0,.365,.215,.19]],motorboat:[[0,0,-.14,3.8,1.4,.64]],
  sloop:[[0,0,-.25,5.25,1.63,.96]],hobie:[[0,-.95,-.02,2.52,.19,.24],[0,.95,-.02,2.52,.19,.24]],
  whale:[[-1.2,0,0,5,1.45,1.45]],
  manta:[[0,0,0,1.40,.72,.30],[-.36,0,0,.70,2.75,.15]],
  gull:[[0,0,0,.32,.14,.17]],drone:[[0,0,0,.36,.30,.13]]
};
function movingHit(h,x,y,z,ex,ey,ez,r,t,dt){
  const {axes,basis,center,velocity}=h;
  const origin=[x-center[0]-t*velocity[0],y-center[1]-t*velocity[1],z-center[2]-t*velocity[2]];
  const travel=[ex-x-dt*velocity[0],ey-y-dt*velocity[1],ez-z-dt*velocity[2]];
  const reach=Math.max(...axes)+r+Math.hypot(...travel);
  if(origin[0]**2+origin[1]**2+origin[2]**2>reach**2)return null;
  const local=basis.map(b=>b[0]*origin[0]+b[1]*origin[1]+b[2]*origin[2]);
  const ds=basis.map(b=>b[0]*travel[0]+b[1]*travel[1]+b[2]*travel[2]);
  const scale=Math.max(...axes);
  const a=axes.map(n=>Math.sqrt((1+r/scale)*n*n+r*(r+scale)));
  let A=0,B=0,C=-1;
  for(let k=0;k<3;k++){A+=(ds[k]/a[k])**2;B+=ds[k]*local[k]/a[k]**2;C+=(local[k]/a[k])**2;}
  const disc=B*B-A*C;
  const f=C<=0?0:(A>1e-14&&B<0&&disc>=0?C/(-B+Math.sqrt(disc)):Infinity);
  if(f>1)return null;
  const q=local.map((v,k)=>v+f*ds[k]);
  const grad=q.map((v,k)=>v/a[k]**2),n=basis[0].map((_,k)=>basis.reduce((sum,b,i)=>sum+b[k]*grad[i],0));
  let length=Math.hypot(...n);
  if(length<1e-9){n[2]=1;length=1;}
  const penetration=C<0?Math.min(...a)*(1-Math.sqrt(Math.max(0,C+1))):0;
  return {fraction:f,nx:n[0]/length,ny:n[1]/length,nz:n[2]/length,penetration,velocity};
}
export function diverObstacles(actors,id,row,dt,world,otherProbes){
  const hulls=[],peers=[],sharks=[];
  for(const a of actors){
    if(a.id===id||!Number.isFinite(a.x+a.y+a.z))continue;
    const v=[a.ve??0,a.vn??0,a.vu??a.vz??0];
    const reach=2+dt*(Math.hypot(...v)+Math.hypot(row[4],row[5],row[6]));
    const bounds=actorHulls[a.kind==='boat'?(a.hull===2?'sloop':a.hull===3?'motorboat':'hobie'):a.kind];
    const dist=Math.hypot(a.x-row[1],a.y-row[2],a.z-row[3]);
    if(a.kind==='shark'){
      if(dist<=reach+2.8)sharks.push(sharkCollision(a));
      continue;
    }
    if(a.kind==='diver'){
      if(dist>reach+2)continue;
      const spheres=otherProbes?.(a.id);
      if(spheres&&world.triangles){peers.push({points:spheres,velocity:v});continue;}
      if(spheres)for(let k=0;k<spheres.length;k+=4){
        const r=spheres[k+3];hulls.push({center:spheres.subarray(k,k+3),axes:[r,r,r],basis:[[1,0,0],[0,1,0],[0,0,1]],velocity:v});
      }
      continue;
    }
    if(!bounds||dist>reach+Math.max(...bounds.map(b=>Math.hypot(...b.slice(0,3))+Math.max(...b.slice(3)))))continue;
    const y=a.yaw??0,p=a.pitch??0,b=a.heel??0,cy=Math.cos(y),sy=Math.sin(y),cp=Math.cos(p),sp=Math.sin(p),cb=Math.cos(b),sb=Math.sin(b);
    const basis=[[cy*cp,sy*cp,-sp],[cy*sp*sb-sy*cb,sy*sp*sb+cy*cb,cp*sb],[cy*sp*cb+sy*sb,sy*sp*cb-cy*sb,cp*cb]];
    for(const part of bounds)hulls.push({velocity:v,basis,axes:part.slice(3),center:[a.x,a.y,a.z].map((v,j)=>v+basis.reduce((sum,b,k)=>sum+b[j]*part[k],0))});
  }
  if(!hulls.length&&!peers.length&&!sharks.length)return world;
  const sweep=(x,y,z,ex,ey,ez,r,ground,t,span)=>{
    let best=world(x,y,z,ex,ey,ez,r,ground);
    for(const shark of sharks){
      const hit=shark.sweep([x,y,z],[ex,ey,ez],r,t,span);
      if(hit&&(!best||hit.fraction<best.fraction||hit.fraction===best.fraction&&hit.penetration>best.penetration))best=hit;
    }
    for(const hull of hulls){
      const hit=movingHit(hull,x,y,z,ex,ey,ez,r,t,span);
      if(hit&&(!best||hit.fraction<best.fraction||(hit.fraction===best.fraction&&hit.penetration>best.penetration)))best=hit;
    }
    return best;
  };
  if(world.triangles)sweep.triangles=(box,t,span,visit)=>{
    world.triangles(box,t,span,visit);
    for(const shark of sharks)shark.triangles(box,t,span,visit);
    for(const {points,velocity} of peers)peerTriangles(points,velocity,t,visit);
    for(const hull of hulls){
      const {center,velocity,basis,axes}=hull;
      const verts=actorMesh.vertices.map(p=>center.map((c,k)=>c+t*velocity[k]+p.reduce((sum,value,i)=>sum+value*axes[i]*basis[i][k],0)));
      for(const [a,b,c] of actorMesh.faces)visit([verts[a],verts[b],verts[c]],velocity);
    }
  };
  return sweep;
}

const actorMesh=(()=>{
  const vertices=[[0,0,-1]],faces=[];
  for(let j=1;j<6;j++)for(let i=0;i<12;i++){
    const a=i*Math.PI/6,b=(j/6-.5)*Math.PI;
    vertices.push([Math.cos(a)*Math.cos(b),Math.sin(a)*Math.cos(b),Math.sin(b)]);
  }
  const top=vertices.push([0,0,1])-1;
  for(let i=0;i<12;i++){
    const k=(i+1)%12;faces.push([0,1+k,1+i],[top,49+i,49+k]);
    for(let j=0;j<4;j++){const q=1+12*j;faces.push([q+i,q+k,q+12+k],[q+i,q+12+k,q+12+i]);}
  }
  return {vertices,faces};
})();
