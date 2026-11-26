// Compare the registered collision triangles, swim clearance and optional sensor FMU.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import bed from '../viewer/bathymetry.js';
import {abyssCave,caveSurface,caveWaterColumn} from '../viewer/abyss-cave.mjs';
import {loadWreckContacts} from '../viewer/wreck-contact.mjs';

const T=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const {positions,indices}=caveSurface(bed);
const shape=new T.BufferGeometry();
shape.setAttribute('position',new T.Float32BufferAttribute(positions,3));
shape.setIndex(indices);
const visible=new T.Mesh(shape,new T.MeshBasicMaterial({side:T.DoubleSide}));
const ray=new T.Raycaster();
const contacts=await loadWreckContacts({sites:[],bed});
let beam;
if(process.argv[2]){
  const directory=pathToFileURL(resolve(process.argv[2])+'/');
  const {loadInstance}=await import(new URL('instance.mjs',directory));
  beam=await loadInstance('BeamProbe',{limit:12},async url=>new Response(await readFile(url)));
}
function bedRange(p,d) {
  for(let t=.01;t<12;t+=.01){
    if(p[2]+t*d[2]<=bed.height(p[0]+t*d[0],p[1]+t*d[1]))return t;
  }
  return 12;
}
// The rear passage climbs a steep slope. A glancing beam can travel far
// along the nearest occupied voxel before it reaches the triangle. Compare
// the returned point to the closest actual rock in that case.
let worstRearRangeDelta=0,worstRearSurfaceDistance=0;
function distanceToRock(p) {
  const triangle=new T.Triangle(),nearest=new T.Vector3(),points=shape.attributes.position;
  let closest=Infinity;
  for(let i=0;i<indices.length;i+=3){
    triangle.a.fromBufferAttribute(points,indices[i]);
    triangle.b.fromBufferAttribute(points,indices[i+1]);
    triangle.c.fromBufferAttribute(points,indices[i+2]);
    closest=Math.min(closest,p.distanceTo(triangle.closestPointToPoint(p,nearest)));
  }
  return closest;
}
function trace(p,d,steepRoof=false) {
  ray.set(new T.Vector3(...p),new T.Vector3(...d));
  const hit=ray.intersectObject(visible)[0];
  assert(hit,'expected a cave rock hit');
  if(beam){
    const terrain=bedRange(p,d);
    beam.set('o',p);beam.set('d',d);
    const measured=beam.get('distance');
    if(steepRoof){
      const gap=distanceToRock(ray.ray.at(measured,new T.Vector3()));
      worstRearRangeDelta=Math.max(worstRearRangeDelta,Math.abs(measured-hit.distance));
      worstRearSurfaceDistance=Math.max(worstRearSurfaceDistance,gap);
      assert(measured<=hit.distance+.0001 && gap<=Math.sqrt(3)*.24+.0001,
        'rear roof echo must come from a cell touching the visible rock at '+p);
    }else assert(Math.abs(measured-Math.min(terrain,hit.distance))<.43,'voxel and mesh ranges disagree at '+p+' '+d+' ('+measured+' / '+hit.distance+')');
  }
  return hit.distance;
}
const [east,north,up]=abyssCave.lair;
const side=trace(abyssCave.lair,[0,1,0]);
const roof=trace(abyssCave.lair,[0,0,1]);
const back=bedRange(abyssCave.lair,[-1,0,0]); // A level westward ray meets the rising floor beneath the rear passage.
assert(back>1.0 && back<3.0);
if(beam){beam.set('o',abyssCave.lair);beam.set('d',[-1,0,0]);assert(Math.abs(beam.get('distance')-back)<.02);}
const mouthWidth=trace(abyssCave.entrance,[0,1,0])+trace(abyssCave.entrance,[0,-1,0]);
const roofZ=roof+up,floor=bed.height(east,north);
assert(roofZ-floor>2.6 && mouthWidth>2,'lair should admit the sub plus encounter clearance');
// Strike containment uses the same underside as the sub's optical/contact rays.
const ceiling=caveWaterColumn(bed);
let checkedColumns=0;
for(let x=-33.85;x< -29.55;x+=.19)for(let y=-31.70;y< -28.30;y+=.21){
  const z=bed.height(x,y)+.10,height=ceiling(x,y);
  if(height<=z)continue;
  ray.set(new T.Vector3(x,y,z),new T.Vector3(0,0,1));
  const hit=ray.intersectObject(visible)[0];
  assert(hit&&Math.abs(hit.point.z-height)<.0001,'ceiling differs from rendered rock');
  checkedColumns++;
}
assert(checkedColumns>200);
assert.equal(ceiling(east,north+5),-Infinity);
const q=[0,0,0,1];
for(let i=0;i<=110;i++){
  const u=i/110;
  const p=abyssCave.approach.map((x,k)=>x+(abyssCave.lair[k]-x)*u);
  assert(p[2]-bed.height(p[0],p[1])>.8,'clear of floor throughout entry');
  assert.equal(contacts(p,q),null,'cave surface must leave centreline clear');
}
assert(contacts([east,north+side-.04,up],q),'side wall must register collision');
assert(contacts([east,north,roofZ-.06],q),'roof must register collision');

// Follow the independently fixed waypoints from the lair, up the slope and
// around the bend. Clearance is measured against the rendered shell and bed.
const rearPath=[
  [east,north],[-33.22,-29.83],[-34.15,-29.66],[-34.90,-29.10],
  [-35.35,-28.20],[-35.42,-27.05],[-35.12,-25.90],[-34.47,-24.96],
];
let minRearHeadroom=Infinity;
for(let i=1;i<rearPath.length;i++){
  const a=rearPath[i-1],b=rearPath[i];
  for(let j=1;j<=12;j++){
    const t=j/12,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
    const ground=bed.height(x,y),p=[x,y,ground+1.05];
    const headroom=ceiling(x,y)-ground;
    minRearHeadroom=Math.min(minRearHeadroom,headroom);
    assert(headroom>2.0,'rear passage has insufficient swimming clearance at '+p);
    assert.equal(contacts(p,q),null,'rear passage center intersects the shell at '+p);
    if(j===12)assert(Math.abs(1.05+trace(p,[0,0,1],true)-headroom)<.0001,'rear roof registration');
  }
}
const [rx,ry]=abyssCave.armRoot;
const hidden=[rx,ry,bed.height(rx,ry)+1.05];
for(const origin of [abyssCave.approach,abyssCave.entrance,abyssCave.lair]){
  const line=hidden.map((x,k)=>x-origin[k]),length=Math.hypot(...line),direction=line.map(x=>x/length);
  ray.set(new T.Vector3(...origin),new T.Vector3(...direction));
  const rock=ray.intersectObject(visible)[0];
  assert(rock && rock.distance<length-1,'the rear of the bend should be hidden by the cave shell');
}

if(beam){
  beam.set('o',abyssCave.lair);beam.set('d',[0,0,-1]);
  assert(Math.abs(beam.get('distance')-(up-floor))<.02,'DVL floor range');
}
console.log({triangles:indices.length/3,mouthWidth,floor,roofZ,side,back,clearPath:111,checkedColumns,minRearHeadroom,worstRearRangeDelta,worstRearSurfaceDistance,sensorValidated:!!beam});
