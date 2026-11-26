import {caveSurface} from './abyss-cave.mjs';
import {wreckSites} from './red-sea-sites.mjs';
import {collisionSurface} from './wreck-contact.mjs';

// A fish sweeps its body radius through the same reduced scan as the sub.
// Distance to a triangle mesh is 1-Lipschitz, so a step no longer than the
// measured clearance cannot cross even a thin plate between simulation ticks.
export function fishObstacles(floor,bed,signal){
  const cave=caveSurface(bed);
  const scans=[{site:{east:0,north:0},z:0,mesh:collisionSurface(cave)}];
  for(const site of wreckSites){
    const url=new URL('./assets/red-sea/'+site.id+'/collision.json',import.meta.url);
    url.search=new URL(import.meta.url).search;
    fetch(url,{signal}).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(data=>{
      if(!signal.aborted)scans.push({site,z:bed.height(site.east,site.north)-site.burial,mesh:collisionSurface(data)});
    }).catch(error=>{if(!signal.aborted)console.warn(site.name+' fish collision',error);});
  }
  let reef;
  function sweep(x,y,z,endX,endY,endZ,r=.1,includeGround=true){
    const dx=endX-x,dy=endY-y,dz=endZ-z,length=Math.hypot(dx,dy,dz);
    let best=reef?.sweep(x,y,z,endX,endY,endZ,r)??null;
    function groundGap(t){return z+dz*t-r-floor(x+dx*t,y+dy*t);}
    const segments=Math.max(1,Math.ceil(length/.4));
    for(let i=0;includeGround&&i<=segments;i++){
      let hi=i/segments;
      const gap=groundGap(hi);
      if(gap>0)continue;
      let lo=Math.max(0,(i-1)/segments);
      for(let j=0;j<8;j++){const mid=(lo+hi)*.5;if(groundGap(mid)>0)lo=mid;else hi=mid;}
      const east=x+dx*lo,north=y+dy*lo,h=.08;
      const nx=(floor(east-h,north)-floor(east+h,north))/(2*h);
      const ny=(floor(east,north-h)-floor(east,north+h))/(2*h),norm=Math.hypot(nx,ny,1);
      const penetration=i===0?-gap/norm:0;
      if(!best||lo<best.fraction||lo===best.fraction&&penetration>best.penetration)
        best={fraction:lo,nx:nx/norm,ny:ny/norm,nz:1/norm,penetration};
      break;
    }
    for(const {site,z:base,mesh} of scans){
      const p=[x-site.east,y-site.north,z-base],d=[dx,dy,dz],{lo,hi}=mesh.bounds;
      if(p.some((v,i)=>Math.min(v,v+d[i])-r>hi[i]||Math.max(v,v+d[i])+r<lo[i]))continue;
      let t=0;
      const end=best?.fraction??1;
      for(let j=0;j<48&&t<=end;j++){
        const point=p.map((v,i)=>v+t*d[i]);
        const hit=mesh.nearest(point,r+(end-t)*length+.0002);
        if(!hit)break;
        const gap=hit.distance-r;
        if(gap<.0001){
          let [nx,ny,nz]=hit.normal;
          if(hit.distance<1e-8&&nx*dx+ny*dy+nz*dz>0){nx=-nx;ny=-ny;nz=-nz;}
          best={fraction:t,nx,ny,nz,penetration:Math.max(0,-gap)};break;
        }
        if(length<1e-9)break;
        t+=gap/length;
      }
    }
    return best;
  }
  // The diver's indexed skin queries the same wreck/cave BVHs as fish. Keep
  // the seabed and island shelf as separate exact triangulated height fields.
  sweep.triangles=(box,offset,dt,visit)=>{
    for(const {site,z,mesh} of scans){
      const origin=[site.east,site.north,z],lo=origin.map((v,k)=>box[k]-v),hi=origin.map((v,k)=>box[k+3]-v);
      mesh.overlapping(lo,hi,f=>visit([f.a,f.b,f.c].map(p=>p.map((v,k)=>v+origin[k]))));
    }
    function grid(x0,y0,dx,dy,height,xmin=-Infinity,xmax=Infinity,ymin=-Infinity,ymax=Infinity){
      const i0=Math.max(xmin,Math.floor((box[0]-x0)/dx)),i1=Math.min(xmax,Math.floor((box[3]-x0)/dx));
      const j0=Math.max(ymin,Math.floor((box[1]-y0)/dy)),j1=Math.min(ymax,Math.floor((box[4]-y0)/dy));
      for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){
        const x=x0+i*dx,y=y0+j*dy;
        const a=[x,y,height(x,y)],b=[x+dx,y,height(x+dx,y)],c=[x,y+dy,height(x,y+dy)],d=[x+dx,y+dy,height(x+dx,y+dy)];
        if(box[2]>Math.max(a[2],b[2],c[2],d[2])+.002)continue;
        visit([a,b,d],undefined,true);visit([a,d,c],undefined,true);
      }
    }
    grid(bed.min??0,bed.min??0,bed.step??2,bed.step??2,(x,y)=>bed.height(x,y));
    const shelf=bed.shelf;
    if(shelf){
      const [x,y]=shelf.center,dx=shelf.width/shelf.columns,dy=shelf.height/shelf.rows;
      grid(x-shelf.width/2,y-shelf.height/2,dx,dy,(east,north)=>shelf.vertex(east-x,north-y),0,shelf.columns-1,0,shelf.rows-1);
    }
    reef?.triangles?.(box,visit);
  };
  sweep.setReef=value=>{reef=value;};
  return sweep;
}
