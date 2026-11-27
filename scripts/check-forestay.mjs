import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const boat = await loadInstance('Sailboat', {manualHelm:1, trimInput:1, windEast:8},
  async url => new Response(await readFile(url)));
let worst = 0, maxSwing = 0;
for (let i = 0; i < 800; i++) {
  if (i === 400) boat.set('trimInput', -1);
  boat.advance(.01);
  const r = boat.get('sheetRotation').slice(9), p = boat.get('sailVertex').slice(72);
  const tack = boat.get('footX')[1];
  function hullPoint(node) {
    const xyz = p.slice(3*node, 3*node+3);
    return [tack,0,.19].map((origin,j) => origin + xyz.reduce((v,x,k) => v+r[3*j+k]*x,0));
  }
  for (let row=0; row<6; row++) {
    const [x,y,z] = hullPoint(row*4);
    const stayX = 1.16 + (.12-1.16)*(z-.09)/(2.78-.09);
    worst = Math.max(worst, Math.hypot(y,x-stayX));
  }
  maxSwing = Math.max(maxSwing,Math.abs(hullPoint(3)[1]));
}
assert(worst < 1e-9 && maxSwing > .4, JSON.stringify({worst,maxSwing}));
console.log({worst,maxSwing});

// The catamaran's jib head follows its independent luff wire.
const cat = await loadInstance('Hobie16', {manualHelm:1, windNorth:8},
  async url => new Response(await readFile(url)));
const jibTack = [cat.get('footX')[1],0,cat.get('footZ')[1]];
let shortestStrop = Infinity;
for (let i=0; i<400; i++) {
  cat.advance(.01);
  const [vertices,rotations,paths,stations] = cat.getMany(['sailVertex','sheetRotation','stayPath','jibStation']);
  const head = vertices.slice(132,135);
  const rotation = rotations.slice(9);
  const station = stations[5];
  const worldHead = jibTack.map((origin,j) =>
    origin + head.reduce((v,x,k) => v+rotation[3*j+k]*x,0));
  const midway = paths.slice(21,24), tang = paths.slice(24,27);
  for (let axis=0; axis<3; axis++) {
    const expected = midway[axis]+(2*station-1)*(tang[axis]-midway[axis]);
    assert(Math.abs(expected-worldHead[axis])<1e-6, 'jib head drifted off the luff wire');
  }
  shortestStrop = Math.min(shortestStrop, Math.hypot(...tang.map((x,j)=>x-worldHead[j])));
}
assert(shortestStrop>.38 && shortestStrop<.55);
console.log({shortestStrop});

// The ball joint lets the mast rake aft until the forestay takes the load.
const headToWind = await loadInstance('Hobie16', {
  launchEast:-500, launchNorth:-500, launchHeading:0, launchSpeed:0, windEast:-5, manualHelm:1
}, async url => new Response(await readFile(url)));
const cordEye=headToWind.get('forestayCordAnchor');
function standingLoads(halyard, ticks) {
  headToWind.set('jibHalyardInput', halyard);
  for (let i=0; i<ticks; i++) headToWind.advance(.01);
  const [forestay,jib,rake,path,stays] = headToWind.getMany([
    'forestayTension','jibHalyardTension','mastRake','forestayPath','stayPath'
  ]);
  const sag = Math.hypot(...path.slice(3,6).map((v,i) => v-(path[i]+path[i+6])/2));
  const plate = path.slice(0,3).map((x,i) => x-stays[18+i]);
  const wire = path.slice(3,6).map((x,i) => x-path[i]);
  const length = Math.hypot(...plate);
  const alignment = plate.reduce((dot,x,i) => dot+x*wire[i],0)/(length*Math.hypot(...wire));
  assert(Math.abs(length-.20)<1e-8, 'The pivoting adjuster stays rigid');
  const bowPull=cordEye[0]-path[0];
  assert(bowPull>0, 'Cord tension must pull the moving pin toward the bow');
  return {forestay,jib,rake,sag,alignment,pinAhead:path[0]-stays[18]};
}
const sailingRig = standingLoads(.55, 300);
const easedHalyard = standingLoads(0, 600);
const hauledHalyard = standingLoads(.9, 400);
assert(sailingRig.jib > sailingRig.forestay && sailingRig.sag < .18);
assert(sailingRig.pinAhead>0 && sailingRig.alignment < Math.cos(Math.PI/6), 'The cord folds the adjuster forward under light load');
assert(easedHalyard.forestay > 25 && easedHalyard.forestay > easedHalyard.jib);
assert(easedHalyard.sag < .08 && easedHalyard.rake > sailingRig.rake);
assert(easedHalyard.alignment > .95 && easedHalyard.alignment>sailingRig.alignment,
  'The loaded stay straightens the plate against the forward shock cord');
assert(hauledHalyard.jib > 100 && hauledHalyard.forestay < 16 && hauledHalyard.rake < sailingRig.rake);
console.log({sailingRig,easedHalyard,hauledHalyard});

// The boom can swing with the spar against either of the mast-step stops.
for (const tack of [-1,1]) {
  const rig = await loadInstance('Hobie16', {
    launchEast:-500, launchNorth:-500, launchHeading:0, launchSpeed:1.5,
    windEast:-4.5, windNorth:tack*8, manualHelm:1
  }, async url => new Response(await readFile(url)));
  const stop = rig.get('mastRotationStop');
  let separation = 0;
  for (let i=0; i<430; i++) {
    rig.advance(.01);
    const [mast,trim] = rig.getMany(['mastRotation','trim']);
    assert(Math.abs(mast) < stop+.04, 'The spar stays within the compliance of the stops');
    separation = Math.max(separation, Math.abs(mast-trim[0]));
  }
  assert(separation > .18, 'The boom rotates independently of the spar');
  console.log({tack,separation,stop});
}

// The contact solver returns the reaction at each of the three stay points and
// the opposite load at cloth vertices. Compare the sampled loads on both tacks.
for(const tack of [-1,1]){
  let strongest=0;
  for(const halyard of [0,.9]){
    const rig=await loadInstance('Hobie16',{launchEast:-500,launchNorth:-500,launchHeading:0,
      launchSpeed:1.5,windEast:-4.5,windNorth:8*tack,manualHelm:1,jibHalyardInput:halyard,manualJibAssist:0},
      async url=>new Response(await readFile(url)));
    let separated=false;
    try{
      for(let tick=0;tick<340;tick++){
        if(tick===180)rig.set('jibTrimInput',.9);
        rig.advance(.01);
        const [cloth,wire,body,rotation]=rig.getMany(['cloth[2].contactLoad','cloth[2].forestayReaction','forestayLoadBody','sheetRotation']);
        const peak=Math.max(...wire.map(Math.abs));
        strongest=Math.max(strongest,peak);
        if(peak===0)separated=true;
        for(let axis=0;axis<3;axis++){
          let total=0;
          for(let i=axis;i<cloth.length;i+=3)total+=cloth[i];
          for(let i=axis;i<wire.length;i+=3)total+=wire[i];
          assert(Math.abs(total)<1e-9,'wire and cloth contact forces balance');
          for(let point=0;point<3;point++){
            const index=point*3,row=9+axis*3;
            const projected=rotation[row]*wire[index]+rotation[row+1]*wire[index+1]+rotation[row+2]*wire[index+2];
            assert(Math.abs(projected-body[index+axis])<1e-9,'standing rig receives the rotated reaction at the correct wire point');
          }
        }
      }
    }finally{rig.close();}
    assert(separated,'a clear wire exerts no contact force');
  }
  assert(strongest>.5,'the jib bears against the forestay on tack '+tack);
  console.log({tack,peakForestayContactN:strongest});
}
