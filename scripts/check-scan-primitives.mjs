// Small scan facets must interact with the middle of plates, the barrel side
// and duct caps even when none of their corners coincide with a vehicle vertex.
import assert from 'node:assert/strict';
import {piccardParts} from '../viewer/piccard-geometry.mjs';
import {scanPrimitive,scanTriangle,primitiveTriangle} from '../viewer/convex-scan.mjs';

const shapes=piccardParts().parts.map(scanPrimitive);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const triangle=(a,b,c)=>{
  const v=cross(b.map((x,i)=>x-a[i]),c.map((x,i)=>x-a[i])),l=Math.hypot(...v);
  return scanTriangle(a,b,c,v.map(x=>x/l));
};
const shifted=(p,axis,x)=>p.map((val,i)=>i===axis?val+x:val);
function facet(s,axis,extra,u,v){
  const k=(axis+1)%3,j=(axis+2)%3,p=shifted(s.center,axis,s.half[axis]+extra);
  p[k]+=u;p[j]+=v;
  return triangle(shifted(p,k,-.00025),shifted(p,k,.00025),shifted(p,j,.00075));
}
for(const shape of shapes){
  const axis=shape.kind==='plate'?shape.half.indexOf(Math.min(...shape.half)):shape.axis;
  const u=(axis+1)%3,v=(axis+2)%3,offsetU=.38*shape.half[u],offsetV=.26*shape.half[v];
  const inside=primitiveTriangle(shape,facet(shape,axis,-.0001,offsetU,offsetV),0);
  assert(inside&&inside.gap<0,'Finite patch should touch '+shape.kind);
  assert.equal(primitiveTriangle(shape,facet(shape,axis,.004,offsetU,offsetV),.001),undefined);
  assert.equal(primitiveTriangle(shape,facet(shape,axis,-.0001,shape.half[u]+.014,offsetV),.001),undefined);
}
// A narrow, skew facet crosses a long box edge without putting any of the
// facet's three vertices inside the box. Translation towards the outside clears it.
const plate=shapes.find(s=>s.kind==='plate'),{center:p,half:h}=plate;
const oblique=d=>triangle([p[0]-.35,p[1]+h[1]+d-.02,p[2]-.04],
  [p[0]+.35,p[1]+h[1]+d+.02,p[2]+.04],[p[0]+.348,p[1]+h[1]+d+.019,p[2]+.04]);
assert(primitiveTriangle(plate,oblique(0),0));
assert.equal(primitiveTriangle(plate,oblique(.06),.001),undefined);

for(const cylinder of shapes.filter(s=>s.ring)){
  const {u,v,axis,center,half}=cylinder;
  for(let i=0;i<48;i++){
    const theta=i*Math.PI/24,c=Math.cos(theta),s=Math.sin(theta);
    function tangent(gap){
      const p=center.slice();p[u]+=(half[u]+gap)*c;p[v]+=(half[v]+gap)*s;
      const offset=(along,across)=>{const q=shifted(p,axis,along);q[u]-=s*across;q[v]+=c*across;return q;};
      return triangle(offset(-.0002,-.0002),offset(.0002,-.0002),offset(0,.0002));
    }
    assert(primitiveTriangle(cylinder,tangent(-.00005),0),'no holes between cylinder directions');
    assert.equal(primitiveTriangle(cylinder,tangent(.0015),.0001),undefined,'bounded faceting error');
  }
}
console.log('Checked 13 collision primitives, finite edge crossings and 336 cylinder tangencies.');

// The tip of this tilted facet crosses the plate plane outside its narrow edge.
// Projecting the support onto the face alone used to report a penetration.
const skid=scanPrimitive({kind:'plate',center:[0,0,0],half:[1,.01,.08]});
const tilted=triangle([-.375,-.175,-.3],[-1.25,-.125,.3],[-.25,.025,-4/15]);
assert.equal(primitiveTriangle(skid,tilted,0),undefined);
