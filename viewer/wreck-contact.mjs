// The worker selects nearby facets; Modelica resolves the wrench at each integrator stage.
import {caveSurface} from './abyss-cave.mjs';
import {wreckSites} from './red-sea-sites.mjs';
import {piccardParts,viewport} from './piccard-geometry.mjs';
import {scanPrimitive,scanTriangle,primitiveTriangle,bodyWitness} from './convex-scan.mjs';
import * as terrain from './bathymetry.js';

const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scaled=(a,s)=>[s*a[0],s*a[1],s*a[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const axes=[0,1,2];
function boxDistance(p,lo,hi){
  const x=Math.max(lo[0]-p[0],p[0]-hi[0],0);
  const y=Math.max(lo[1]-p[1],p[1]-hi[1],0);
  const z=Math.max(lo[2]-p[2],p[2]-hi[2],0);
  return x*x+y*y+z*z;
}
// Voronoi regions of a triangle. Keep the candidate on the stack until it wins.
function closest(p,t,out){
  const x=p[0]-t.a[0],y=p[1]-t.a[1],z=p[2]-t.a[2];
  const ab=t.ab,ac=t.ac;
  const d1=x*ab[0]+y*ab[1]+z*ab[2],d2=x*ac[0]+y*ac[1]+z*ac[2];
  const d3=d1-t.bb,d4=d2-t.bc,d5=d1-t.bc,d6=d2-t.cc;
  let u=0,v=0;
  const vertex=d1<=0&&d2<=0?t.a:d3>=0&&d4<=d3?t.b:d6>=0&&d5<=d6?t.c:null;
  if(vertex){
    out[0]=vertex[0];out[1]=vertex[1];out[2]=vertex[2];
    return;
  }
  if(d1>=0&&d3<=0&&d1*d4<=d3*d2)u=d1/t.bb;
  else if(d2>=0&&d6<=0&&d5*d2<=d1*d6)v=d2/t.cc;
  else if(d4>=d3&&d5>=d6&&d3*d6<=d5*d4){
    v=(d4-d3)/t.ee;u=1-v;
  }else{
    u=(t.cc*d1-t.bc*d2)/t.det;
    v=(t.bb*d2-t.bc*d1)/t.det;
  }
  for(let k=0;k<3;k++)out[k]=t.a[k]+u*ab[k]+v*ac[k];
}
// Pack the static tree in depth-first order. Neighbouring nodes and leaf bounds
// occupy contiguous memory on the paths shared by repeated distance queries.
function tree(faces){
  const bounds=[],right=[],end=[],ordered=[],faceBounds=[];
  function build(group){
    const node=right.length;
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const f of group)for(let i=0;i<3;i++){
      lo[i]=Math.min(lo[i],f.lo[i]);hi[i]=Math.max(hi[i],f.hi[i]);
    }
    bounds.push(...lo,...hi);right.push(0);end.push(0);
    if(group.length<=6){
      right[node]=~ordered.length;
      for(const f of group){ordered.push(f);faceBounds.push(...f.lo,...f.hi);}
      end[node]=ordered.length;
    }else{
      const ext=sub(hi,lo),axis=ext.indexOf(Math.max(...ext));
      group.sort((a,b)=>(a.lo[axis]+a.hi[axis])-(b.lo[axis]+b.hi[axis]));
      const mid=group.length>>1;
      build(group.slice(0,mid));
      right[node]=build(group.slice(mid));
    }
    return node;
  }
  build(faces);
  return {bounds:Float64Array.from(bounds),right:Int32Array.from(right),end:Int32Array.from(end),
    ordered,faceBounds:Float64Array.from(faceBounds)};
}
function distanceToBounds(p,bounds,index){
  const i=6*index;
  const x=Math.max(bounds[i]-p[0],p[0]-bounds[i+3],0);
  const y=Math.max(bounds[i+1]-p[1],p[1]-bounds[i+4],0);
  const z=Math.max(bounds[i+2]-p[2],p[2]-bounds[i+5],0);
  return x*x+y*y+z*z;
}
// A short range point query needs only the triangles in one padded bin.
function shortRangeBins(faces,bounds){
  if(faces.length<256)return;
  const extent=axes.map(k=>bounds[k+3]-bounds[k]);
  // A 40 cm bin covers a typical 16 cm clearance query in a single lookup.
  // Coarsen large sites and bound memory for sparse or long-triangle meshes.
  const width=Math.max(.4,Math.max(...extent)/96),radius=width/2;
  const padding=radius+width*1e-12;
  const dims=extent.map(v=>Math.max(1,Math.ceil(v/width)));
  const [nx,ny,nz]=dims;
  if(nx*ny*nz>12*faces.length)return;
  const offsets=new Uint32Array(nx*ny*nz+1),ranges=new Uint16Array(faces.length*6);
  const cell=(value,k)=>Math.min(dims[k]-1,Math.max(0,Math.floor((value-bounds[k])/width)));
  let count=0;
  for(let i=0;i<faces.length;i++){
    const at=6*i,face=faces[i];
    for(let k=0;k<3;k++){
      ranges[at+k]=cell(face.lo[k]-padding,k);
      ranges[at+k+3]=cell(face.hi[k]+padding,k);
    }
    count+=(ranges[at+3]-ranges[at]+1)*(ranges[at+4]-ranges[at+1]+1)*(ranges[at+5]-ranges[at+2]+1);
    if(count>48*faces.length)return;
  }
  function fill(cursor,indices){
    for(let i=0;i<faces.length;i++){
      const at=6*i;
      for(let z=ranges[at+2];z<=ranges[at+5];z++)for(let y=ranges[at+1];y<=ranges[at+4];y++){
        const row=nx*(y+ny*z);
        for(let x=ranges[at];x<=ranges[at+3];x++){
          const bin=row+x;
          if(indices)indices[cursor[bin]++]=i;else cursor[bin+1]++;
        }
      }
    }
  }
  fill(offsets);
  for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];
  const indices=new Uint32Array(count);
  fill(offsets.slice(),indices);
  return {radius,offsets,indices,bin:p=>cell(p[0],0)+nx*(cell(p[1],1)+ny*cell(p[2],2))};
}
export function collisionSurface({positions,indices}){
  if(!Array.isArray(positions)||positions.length%3||!positions.every(Number.isFinite)||
     !Array.isArray(indices)||indices.length%3)throw Error('Invalid wreck collision arrays');
  const faces=[];
  const vertex=i=>{
    if(!Number.isSafeInteger(i)||i<0||3*i+2>=positions.length)throw Error('Invalid wreck triangle index');
    return positions.slice(3*i,3*i+3);
  };
  for(let i=0;i<indices.length;i+=3){
    const a=vertex(indices[i]),b=vertex(indices[i+1]),c=vertex(indices[i+2]);
    const ab=sub(b,a),ac=sub(c,a),edge=sub(c,b),n=cross(ab,ac),det=dot(n,n);
    if(det<1e-18)continue;
    const lo=axes.map(k=>Math.min(a[k],b[k],c[k])),hi=axes.map(k=>Math.max(a[k],b[k],c[k]));
    faces.push({id:i/3,a,b,c,ab,ac,edge,n:scaled(n,1/Math.sqrt(det)),det,bb:dot(ab,ab),cc:dot(ac,ac),bc:dot(ab,ac),ee:dot(edge,edge),lo,hi});
  }
  if(!faces.length)throw Error('Wreck collision proxy has no usable triangles');
  const {bounds,right,end,ordered,faceBounds}=tree(faces);
  const bins=shortRangeBins(ordered,bounds);
  return {
    bounds:{lo:bounds.slice(0,3),hi:bounds.slice(3,6)},faceCount:indices.length/3,
    overlapping(lo,hi,callback){
      function overlaps(data,index){
        const i=6*index;
        return data[i]<=hi[0]&&data[i+3]>=lo[0]&&data[i+1]<=hi[1]&&data[i+4]>=lo[1]&&data[i+2]<=hi[2]&&data[i+5]>=lo[2];
      }
      function visit(node){
        if(!overlaps(bounds,node))return;
        if(right[node]>=0){visit(node+1);visit(right[node]);return;}
        for(let i=~right[node];i<end[node];i++)if(overlaps(faceBounds,i))callback(ordered[i]);
      }
      visit(0);
    },
    nearest(p,limit){
      let distance=limit*limit,hit;
      if(distanceToBounds(p,bounds,0)>distance)return;
      const candidate=[0,0,0],point=[0,0,0];
      function consider(i){
        if(distanceToBounds(p,faceBounds,i)>distance)return;
        const t=ordered[i];
        closest(p,t,candidate);
        const x=p[0]-candidate[0],y=p[1]-candidate[1],z=p[2]-candidate[2];
        const squared=x*x+y*y+z*z;
        if(squared>distance)return;
        distance=squared;hit=t;
        point[0]=candidate[0];point[1]=candidate[1];point[2]=candidate[2];
      }
      function visit(node){
        const b=right[node];
        if(b<0){
          for(let i=~b;i<end[node];i++)consider(i);
        }else{
          const a=node+1,da=distanceToBounds(p,bounds,a),db=distanceToBounds(p,bounds,b);
          if(da<db){
            if(da<=distance)visit(a);
            if(db<=distance)visit(b);
          }else{
            if(db<=distance)visit(b);
            if(da<=distance)visit(a);
          }
        }
      }
      if(bins&&Math.abs(limit)<=bins.radius){
        const bin=bins.bin(p);
        for(let j=bins.offsets[bin];j<bins.offsets[bin+1];j++)consider(bins.indices[j]);
      }else visit(0);
      if(hit){
        const length=Math.sqrt(distance);
        const normal=distance>1e-16?scaled(sub(p,point),1/length):hit.n;
        return {point,normal,distance:length};
      }
    }
  };
}
const shapes=piccardParts().parts.map(scanPrimitive);
const contactMargin=.045;
const low=axes.map(k=>Math.min(viewport.center[k]-viewport.radius,...shapes.map(s=>s.center[k]-s.half[k])));
const high=axes.map(k=>Math.max(viewport.center[k]+viewport.radius,...shapes.map(s=>s.center[k]+s.half[k])));
const envelopeCenter=scaled(add(low,high),.5),envelopeHalf=scaled(sub(high,low),.5);
const guardReach=Math.max(Math.hypot(...viewport.center)+viewport.radius,
  ...shapes.map(s=>Math.hypot(...s.center)+Math.hypot(...s.half)))+contactMargin;
// A positive FMI radius marks active rows. Place its centre just inward so its
// support and moment arm coincide with the actual contact point.
const supportRadius=.00001;
function rotate(p,q){
  const [w,x,y,z]=q;
  const a=2*(y*p[2]-z*p[1]),b=2*(z*p[0]-x*p[2]),c=2*(x*p[1]-y*p[0]);
  return [p[0]+w*a+y*c-z*b,p[1]+w*b+z*a-x*c,p[2]+w*c+x*b-y*a];
}
// One-sided contacts keep thrust directed into a slope from carrying the sub
// through it. A sub restored inside the hill gets the same outward normals.
function shelfContacts(shelf,position,orientation,contacts){
  const plane=shelf?.plane(position[0],position[1]);
  if(!plane||position[2]>plane.height+3*guardReach)return;
  const inverse=[orientation[0],-orientation[1],-orientation[2],-orientation[3]];
  for(let i=-1;i<shapes.length;i++){
    const shape=shapes[i],localCenter=shape?.center??viewport.center;
    const center=add(position,rotate(localCenter,orientation));
    let face=shelf.plane(center[0],center[1]);if(!face)continue;
    const down=rotate(face.normal,inverse);
    const support=shape?bodyWitness(shape,down,shape.center):sub(viewport.center,scaled(down,viewport.radius));
    const witness=add(position,rotate(support,orientation));
    face=shelf.plane(witness[0],witness[1]);
    // The regular bed model already resolves the outer flat skirt.
    if(!face||face.height<=-13.69999)continue;
    const gap=(witness[2]-face.height)*face.normal[2];
    if(gap>contactMargin)continue;
    const guard=add(support,scaled(rotate(face.normal,inverse),supportRadius));
    contacts.push({key:-2-i,gap,normal:face.normal,point:[witness[0],witness[1],face.height],
      guard:[...guard,supportRadius]});
  }
}
export async function loadWreckContacts({sites=wreckSites,bed=terrain.default??globalThis.harborBed,fetchAsset=fetch}={}){
  const loaded=await Promise.all(sites.map(async site=>{
    const url=new URL('./assets/red-sea/'+site.id+'/collision.json',import.meta.url);
    url.search=new URL(import.meta.url).search;
    const response=await fetchAsset(url);
    if(!response.ok)throw Error('Could not load '+site.name+' collision surface ('+response.status+')');
    const mesh=collisionSurface(await response.json());
    const origin=[site.east,site.north,bed.height(site.east,site.north)-site.burial];
    return {origin,mesh};
  }));
  loaded.push({origin:[0,0,0],mesh:collisionSurface(caveSurface(bed))});
  let firstKey=0;
  for(const site of loaded){site.firstKey=firstKey;firstKey+=1+site.mesh.faceCount*shapes.length;}
  const previous=new Map();
  return function constraints(position,orientation){
    const contacts=[];
    shelfContacts(bed.shelf,position,orientation,contacts);
    for(const {origin,mesh,firstKey} of loaded){
      const local=sub(position,origin);
      if(boxDistance(local,mesh.bounds.lo,mesh.bounds.hi)>guardReach**2)continue;
      const inverse=[orientation[0],-orientation[1],-orientation[2],-orientation[3]];
      const body=p=>rotate(sub(p,local),inverse),world=p=>add(position,rotate(p,orientation));
      const sphere=add(local,rotate(viewport.center,orientation));
      const hit=mesh.nearest(sphere,viewport.radius+contactMargin);
      if(hit){
        const key=firstKey,prior=previous.get(key);
        if(prior&&hit.distance<viewport.radius*.65&&dot(prior,hit.normal)<-.65)hit.normal=scaled(hit.normal,-1);
        contacts.push({key,guard:[...viewport.center,viewport.radius],point:add(origin,hit.point),
          normal:hit.normal,gap:dot(sub(sphere,hit.point),hit.normal)-viewport.radius});
      }
      const center=add(local,rotate(envelopeCenter,orientation));
      const basis=axes.map(k=>rotate(axes.map(i=>Number(i===k)),orientation));
      const half=axes.map(k=>contactMargin+Math.abs(basis[0][k])*envelopeHalf[0]+Math.abs(basis[1][k])*envelopeHalf[1]+Math.abs(basis[2][k])*envelopeHalf[2]);
      mesh.overlapping(sub(center,half),add(center,half),face=>{
        const triangle=scanTriangle(body(face.a),body(face.b),body(face.c),rotate(face.n,inverse));
        for(let i=0;i<shapes.length;i++){
          const key=firstKey+1+face.id*shapes.length+i,prior=previous.get(key);
          const contact=primitiveTriangle(shapes[i],triangle,contactMargin,prior&&rotate(prior,inverse));
          if(!contact)continue;
          const {gap,normal,point}=contact;
          const guard=add(contact.body,scaled(normal,supportRadius));
          contacts.push({key,gap,normal:rotate(normal,orientation),point:world(point),guard:[...guard,supportRadius]});
        }
      });
    }
    previous.clear();
    contacts.sort((a,b)=>a.gap-b.gap);
    const selected=[];
    for(const c of contacts){
      previous.set(c.key,c.normal);
      // Use one resultant per support plane. Averaging witnesses prevents a
      // level skid or symmetric pair of motor pods from rocking on a tie.
      let group=selected.find(g=>dot(g.normal,c.normal)>.97);
      if(!group&&selected.length<8){
        group={normal:c.normal,gap:c.gap,point:[0,0,0],guard:[0,0,0,0],weight:0};
        selected.push(group);
      }
      if(!group)continue;
      const weight=Math.max(0,1-(c.gap-group.gap)/.02);
      for(const i of axes)group.point[i]+=weight*c.point[i];
      for(let i=0;i<4;i++)group.guard[i]+=weight*c.guard[i];
      group.weight+=weight;
    }
    if(!selected.length)return null;
    const rows=new Float64Array(80);
    selected.forEach((c,i)=>{
      const point=scaled(c.point,1/c.weight),guard=c.guard.map(n=>n/c.weight);
      // Keep the averaged moment arm but start contact at the first physical
      // surface. Averaging its depth with nearby recessed guards delays impact.
      const centre=add(position,rotate(guard,orientation));
      const averagedGap=dot(sub(centre,point),c.normal)-guard[3];
      const [w,x,y,z]=orientation;
      const localNormal=rotate(c.normal,[w,-x,-y,-z]);
      const support=add(guard,scaled(localNormal,c.gap-averagedGap));
      rows.set([...point,...c.normal,...support,guard[3]],10*i);
    });
    return rows;
  };
}

export function contactStepper(select,getPose,setContacts){
  let active=false;
  const clear=new Float64Array(80);
  return (pose)=>{
    const [position,orientation]=pose??getPose();
    const rows=select(position,orientation);
    if(rows||active)setContacts(rows??clear);
    active=Boolean(rows);
  };
}

// The FMU transfers frames on a mount or release edge in its next step. Select
// contact geometry at that destination before the step starts.
export function hoistTransferPose(){
  let previous=0;
  return (hoist,orientation)=>{
    const command=hoist?.[0]??0;
    const edge=(command<-.5&&previous>=-.5)||(command>1.5&&previous<=1.5);
    previous=command;
    if(!edge)return;
    const length=orientation?Math.hypot(...orientation):0;
    const q=length>.5?Array.from(orientation,x=>x/length):[Math.cos(hoist[7]/2),0,0,Math.sin(hoist[7]/2)];
    return [hoist.slice(1,4),q];
  };
}
