import {piccardParts,viewport} from '../viewer/piccard-geometry.mjs';

// The box/box separating margin is a conservative lower bound on Euclidean
// clearance. Work in Piccard coordinates and reject distant wreck plates first.
export function piccardClearance(T,wreck,mounts,axes){
  const vec=coords=>new T.Vector3(...coords);
  const local=piccardParts(mounts,axes).parts.map(({center,half,basis})=>({
    center:vec(center),half,basis:basis.map(vec),radius:Math.hypot(...half)
  }));
  const plates=wreck.children.map(mesh=>({
    center:mesh.position,half:mesh.scale.toArray().map(x=>.5*x),
    basis:[[1,0,0],[0,1,0],[0,0,1]].map(v=>vec(v).applyQuaternion(mesh.quaternion))
  }));
  const delta=new T.Vector3(),center=new T.Vector3(),cross=new T.Vector3(),dome=vec(viewport.center);
  const basis=[new T.Vector3(),new T.Vector3(),new T.Vector3()];
  const origin=new T.Vector3();
  const inverse=new T.Quaternion();
  const radius=(half,axes,n)=>half.reduce((sum,h,i)=>sum+h*Math.abs(axes[i].dot(n)),0);
  function sphereGap(point,r){
    delta.copy(point).sub(center);
    const gap=basis.map((n,i)=>Math.abs(delta.dot(n))-extent[i]);
    return Math.hypot(...gap.map(q=>Math.max(0,q)))+Math.min(0,Math.max(...gap))-r;
  }
  let extent;
  return (position,attitude,limit=.5)=>{
    inverse.copy(attitude).invert();
    let best=limit;
    for(const plate of plates){
      center.copy(plate.center).sub(position).applyQuaternion(inverse);
      for(let i=0;i<3;i++)basis[i].copy(plate.basis[i]).applyQuaternion(inverse);
      extent=plate.half;
      if(sphereGap(origin,.8)>=best)continue;
      best=Math.min(best,sphereGap(dome,viewport.radius));
      for(const part of local){
        if(sphereGap(part.center,part.radius)>=best)continue;
        delta.copy(part.center).sub(center);
        const gapOn=n=>Math.abs(delta.dot(n))-radius(extent,basis,n)-radius(part.half,part.basis,n);
        let gap=-Infinity;
        for(const n of basis){gap=Math.max(gap,gapOn(n));if(gap>=best)break;}
        if(gap>=best)continue;
        for(const n of part.basis){gap=Math.max(gap,gapOn(n));if(gap>=best)break;}
        if(gap>=best)continue;
        for(const a of part.basis)for(const b of basis){
          cross.crossVectors(a,b);
          if(cross.lengthSq()>1e-16)gap=Math.max(gap,gapOn(cross.normalize()));
        }
        best=Math.min(best,gap);
      }
    }
    return best;
  };
}
