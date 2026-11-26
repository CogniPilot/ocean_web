// Finite triangle versus Piccard's body-axis-aligned FLU collision primitives.
const axes=[[1,0,0],[0,1,0],[0,0,1]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Circumscribed sides keep thin obstacles from passing between test points.
// Excess radius between the tangent planes is at most sec(pi/24)-1 (~0.86%).
export function scanPrimitive(part){
  if(part.kind==='plate')return {...part,directions:axes};
  const u=(part.axis+1)%3,v=(part.axis+2)%3,ring=[],directions=[axes[part.axis]];
  const r=part.half[u],step=Math.PI/12;
  for(let k=0;k<24;k++){
    const angle=k*step,p=[0,0,0],n=[0,0,0];
    p[u]=r*Math.cos(angle+step/2)/Math.cos(step/2);
    p[v]=r*Math.sin(angle+step/2)/Math.cos(step/2);
    ring.push(p);
    if(k<12){n[u]=Math.cos(angle);n[v]=Math.sin(angle);directions.push(n);}
  }
  // In the first octant the support vertex is at 7.5, 22.5 or 37.5 degrees.
  // Reflection in a radial axis or diagonal supplies each other octant.
  const octant=[0,1,2].map(i=>[ring[i][u],ring[i][v]]);
  return {...part,u,v,ring,directions,octant};
}

export function scanTriangle(a,b,c,n){
  const lo=a.map((x,k)=>Math.min(x,b[k],c[k])),hi=a.map((x,k)=>Math.max(x,b[k],c[k]));
  return {a,b,c,n,lo,hi,edges:[sub(b,a),sub(c,b),sub(a,c)]};
}

function closestSegment(a,b,p){
  const x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2],den=x*x+y*y+z*z;
  const t=den?clamp(((p[0]-a[0])*x+(p[1]-a[1])*y+(p[2]-a[2])*z)/den,0,1):0;
  return [a[0]+t*x,a[1]+t*y,a[2]+t*z];
}

const tan15=Math.tan(Math.PI/12),tan30=Math.tan(Math.PI/6);
function supportRadius(shape,n){
  const h=shape.half;
  if(!shape.ring)return h[0]*Math.abs(n[0])+h[1]*Math.abs(n[1])+h[2]*Math.abs(n[2]);
  const u=Math.abs(n[shape.u]),v=Math.abs(n[shape.v]),hi=Math.max(u,v),lo=Math.min(u,v);
  const vertex=shape.octant[lo<=hi*tan15?0:lo<=hi*tan30?1:2];
  return hi*vertex[0]+lo*vertex[1]+h[shape.axis]*Math.abs(n[shape.axis]);
}

// Select the support feature point closest to the given triangle witness.
// A small hook touching the end of a long skid should produce a moment there.
export function bodyWitness(s,n,target){
  const local=sub(target,s.center),p=[0,0,0];
  if(!s.ring){
    for(let i=0;i<3;i++)p[i]=Math.abs(n[i])>1e-7?-Math.sign(n[i])*s.half[i]:clamp(local[i],-s.half[i],s.half[i]);
  }else{
    const {axis,u,v,ring}=s;
    if(Math.abs(n[u])+Math.abs(n[v])<1e-7){
      // Cap contact. Project along a radius to the boundary of the polygon.
      let t=1;
      for(let k=1;target!==s.center && k<s.directions.length;k++){
        const d=s.directions[k],extent=Math.abs(local[u]*d[u]+local[v]*d[v]);
        if(extent>s.half[u])t=Math.min(t,s.half[u]/extent);
      }
      p[u]=t*local[u];p[v]=t*local[v];
    }else{
      let best=Infinity,first,last;
      const nu=n[u],nv=n[v];
      // Only adjacent polygon vertices can share a radial support edge.
      // Near a cap the absolute witness tolerance can include more vertices.
      let start=0,end=ring.length-1;
      if((Math.abs(nu)+Math.abs(nv))*s.half[u]>.000001){
        const index=(Math.floor(Math.atan2(-nv,-nu)*12/Math.PI)+24)%24;
        if(index>0 && index<23){start=index-1;end=index+1;}
      }
      for(let i=start;i<=end;i++){
        const vertex=ring[i],d=vertex[u]*nu+vertex[v]*nv;
        if(d<best-1e-9){best=d;first=last=vertex;}
        else if(Math.abs(d-best)<1e-9)last=vertex;
      }
      const q=first===last?first:closestSegment(first,last,local);
      p[u]=q[u];p[v]=q[v];
    }
    p[axis]=Math.abs(n[axis])>1e-7?-Math.sign(n[axis])*s.half[axis]:clamp(local[axis],-s.half[axis],s.half[axis]);
  }
  return p.map((x,i)=>x+s.center[i]);
}

function obstacleWitness(tri,n,target){
  const {a,b,c}=tri,da=dot(a,n),db=dot(b,n),dc=dot(c,n),high=Math.max(da,db,dc);
  const va=high-da<1e-7,vb=high-db<1e-7,vc=high-dc<1e-7;
  if(!va)return vb&&vc?closestSegment(b,c,target):vb?b:c;
  if(!vb)return vc?closestSegment(a,c,target):a;
  if(!vc)return closestSegment(a,b,target);
  // On a triangle face, classify the closest point by vertex and edge
  // Voronoi regions before constructing a barycentric interior witness.
  const ab=tri.edges[0],ac=sub(c,a),ap=sub(target,a);
  const d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0 && d2<=0)return a;
  const bp=sub(target,b),d3=dot(ab,bp),d4=dot(ac,bp);
  if(d3>=0 && d4<=d3)return b;
  const bcArea=d1*d4-d3*d2;
  if(bcArea<=0 && d1>=0 && d3<=0)return closestSegment(a,b,target);
  const cp=sub(target,c),d5=dot(ab,cp),d6=dot(ac,cp);
  if(d6>=0 && d5<=d6)return c;
  const caArea=d5*d2-d1*d6;
  if(caArea<=0 && d2>=0 && d6<=0)return closestSegment(a,c,target);
  const abArea=d3*d6-d5*d4;
  if(abArea<=0 && d4>=d3 && d5>=d6)return closestSegment(b,c,target);
  const inv=1/(abArea+caArea+bcArea),u=caArea*inv,v=bcArea*inv;
  return [a[0]+u*ab[0]+v*ac[0],a[1]+u*ab[1]+v*ac[1],a[2]+u*ab[2]+v*ac[2]];
}

export function primitiveTriangle(s,tri,margin,previous){
  const {center,half}=s;
  for(let k=0;k<3;k++)if(tri.lo[k]>center[k]+half[k]+margin||tri.hi[k]<center[k]-half[k]-margin)return;
  return overlappingPrimitive(s,tri,margin,previous);
}

function overlappingPrimitive(s,tri,margin,previous){
  const {half,center}=s;
  let best=-Infinity,threshold=-Infinity,threshold2=Infinity,normal=[0,0,0];
  const margin2=margin*margin;
  function test(n,fixedRadius){
    const length2=dot(n,n);
    if(length2<1e-20)return true;
    const offset=dot(center,n),a=dot(tri.a,n)-offset,b=dot(tri.b,n)-offset,c=dot(tri.c,n)-offset;
    const r=fixedRadius??supportRadius(s,n),plus=-Math.max(a,b,c)-r,minus=Math.min(a,b,c)-r;
    const upper=Math.max(plus,minus);
    if(margin<0){
      if(upper>margin*Math.sqrt(length2))return false;
    }else if(upper>0 && upper*upper>margin2*length2)return false;
    // Even the better of the two signs cannot improve this manifold.
    // Most edge axes end here without normalizing or checking history.
    if(upper<0){
      if(threshold>=0 || upper*upper>=threshold2*length2)return true;
    }else if(threshold>=0 && upper*upper<=threshold2*length2)return true;
    const length=Math.sqrt(length2);
    let positive=plus>=minus;
    if(previous&&plus<0&&minus<0&&Math.abs(dot(previous,n))>.97*length)
      positive=dot(previous,n)>0;
    const gap=(positive?plus:minus)/length;
    if(gap>threshold){
      best=gap;threshold=gap+1e-9;threshold2=threshold*threshold;
      const scale=(positive?1:-1)/length;
      normal[0]=n[0]*scale;normal[1]=n[1]*scale;normal[2]=n[2]*scale;
    }
    return true;
  }
  // Cylinder edge directions equal its face-normal directions rotated by 90°,
  // the same set for this regular 24-gon. Both signs share one axis test.
  if(!test(tri.n))return;
  // For a separated support, its projection onto the finite face certifies
  // the gap. A support behind the plane can project onto the face even when
  // a thin or tilted body misses a triangle edge. Test all axes in that case.
  if(best>=0){
    const support=bodyWitness(s,normal,center),vertices=[tri.a,tri.b,tri.c];
    // Moving a witness along the triangle normal leaves its three signed
    // edge tests unchanged. Construct the projection only on a face hit.
    let inside=true;
    for(let i=0;i<3;i++){
      const e=tri.edges[i],v=vertices[i],n=tri.n;
      const x=support[0]-v[0],y=support[1]-v[1],z=support[2]-v[2];
      if((e[1]*z-e[2]*y)*n[0]+(e[2]*x-e[0]*z)*n[1]+(e[0]*y-e[1]*x)*n[2]<-1e-12){
        inside=false;break;
      }
    }
    if(inside){
      const delta=dot(sub(support,tri.a),normal);
      return {gap:best,normal,point:support.map((x,i)=>x-delta*normal[i]),body:support};
    }
  }
  for(let i=0;i<s.directions.length;i++){
    const r=s.ring?(i===0?half[s.axis]:half[s.u]):half[i];
    if(!test(s.directions[i],r))return;
  }
  const axis=[0,0,0];
  for(const e of tri.edges)for(let i=0;i<s.directions.length;i++){
    const d=s.directions[i];
    axis[0]=e[1]*d[2]-e[2]*d[1];axis[1]=e[2]*d[0]-e[0]*d[2];axis[2]=e[0]*d[1]-e[1]*d[0];
    // For a circumferential edge the radial part of e × d is parallel
    // to a polygon face normal. Its projection is the cylinder apothem.
    const r=s.ring && i>0?half[s.u]*Math.abs(e[s.axis])+half[s.axis]*Math.abs(axis[s.axis]):undefined;
    if(!test(axis,r))return;
  }
  const point=obstacleWitness(tri,normal,center),body=bodyWitness(s,normal,point);
  return {gap:best,normal,point,body};
}
