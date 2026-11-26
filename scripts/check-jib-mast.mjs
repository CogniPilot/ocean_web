// Drive both crossings under the FMI solver. A separating plane for every
// vertex also separates the interiors of the jib triangles from the spar.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {sailTopology} from '../viewer/board/sail-battens.mjs';
const T=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const indices=sailTopology(6);
const points=Array.from({length:24},()=>new T.Vector3());
const mast=Array.from({length:8},()=>new T.Vector3());
const triangle=new T.Triangle(), ray=new T.Ray(),hit=new T.Vector3(),toward=new T.Vector3(),closest=new T.Vector3();
function distanceToSpar(p,q){
  const len=toward.subVectors(q,p).length();
  ray.set(p,toward.normalize());
  if(ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,hit)&&p.distanceTo(hit)<=len)return 0;
  let d=Math.min(p.distanceToSquared(triangle.closestPointToPoint(p,hit)),q.distanceToSquared(triangle.closestPointToPoint(q,hit)));
  for(const [a,b] of [[triangle.a,triangle.b],[triangle.b,triangle.c],[triangle.c,triangle.a]]){
    const sq=ray.distanceSqToSegment(a,b,hit,closest);
    if(p.distanceToSquared(hit)<=len*len)d=Math.min(d,sq);
  }
  return Math.sqrt(d);
}
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read = async url => new Response(await readFile(url));
for (const tack of [-1, 1]) {
  const boat = await loadInstance('Hobie16', {
    launchEast:-700, launchNorth:-700, launchSpeed:4.5, launchHeading:tack*.55,
    windEast:-9, windNorth:0, manualHelm:1, manualJibAssist:0
  }, read);
  const limits=[Infinity,-Infinity];
  let minClearance=Infinity, contacts=0;
  for(let i=0;i<1600;i++){
    const [heading,yaw]=boat.getMany(['heading','yawRate']);
    const error=(i<400?tack:-tack)*.8-heading;
    boat.set('rudderInput',Math.max(-1,Math.min(1,(1.35*Math.atan2(Math.sin(error),Math.cos(error))-.45*yaw)/.54)));
    boat.advance(.01);
    const [vertices,plane,r,pins,x,z,trim]=boat.getMany(['cloth[2].vertex','cloth[2].mastPlane','sheetRotation','jibSheetPins','footX','footZ','trim']);
    limits[0]=Math.min(limits[0],trim[1]); limits[1]=Math.max(limits[1],trim[1]);
    const stations=boat.get('mastStations');
    for(let n=0;n<8;n++)mast[n].fromArray(stations,3*n);
    const gaps=[];
    for(let j=0;j<vertices.length;j+=3){
      const gap=vertices[j]*plane[0]+vertices[j+1]*plane[1]+vertices[j+2]*plane[2]-plane[3];
      gaps.push(gap);
      const [a,b,c]=vertices.slice(j,j+3);
      points[j/3].set(x[1]+r[9]*a+r[10]*b+r[11]*c,r[12]*a+r[13]*b+r[14]*c,z[1]+r[15]*a+r[16]*b+r[17]*c);
      if(j%12&&Math.abs(gap)<.002)contacts++;
    }
    for(let k=0;k<indices.length;k+=3){
      const [a,b,c]=indices.slice(k,k+3);
      const bound=Math.min(gaps[a],gaps[b],gaps[c]);
      if(bound>=0)continue;
      triangle.set(points[a],points[b],points[c]);
      for(let j=0;j<7;j++)minClearance=Math.min(minClearance,distanceToSpar(mast[j],mast[j+1])-.065);
    }
    for(let axis=0;axis<3;axis++){
      const k=9+3*axis;
      const pin=[x[1],0,z[1]][axis]+r[k]*vertices[9]+r[k+1]*vertices[10]+r[k+2]*vertices[11];
      assert(Math.abs(pin-pins[axis])<1e-6,'Sheet block stays attached to the constrained clew');
    }
  }
  console.log({tack,limits,minClearance,contacts});
  assert(limits[0]<-.06&&limits[1]>.06&&contacts>0,'Cross the mast under load');
  assert(minClearance>-.003,'Clear the spar between cloth updates');
}
