// Check full-batten segment collapse after easing the sheet under either crosswind.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

function segmentLength(points, node) {
  const i = 3 * node;
  return Math.hypot(points[i+3]-points[i], points[i+4]-points[i+1], points[i+5]-points[i+2]);
}

function assertNativeRows(boat){
  const legacy=boat.get('sailVertex');
  assert.equal(legacy.length,144,'The transmitted two-sail snapshot keeps its original shape');
  for (const [sail,numRows] of [[1,10],[2,6]]) {
    const prefix=`cloth[${sail}]`;
    const [rest,nodes,luff,leech,panelRows,span,foot,cut]=boat.getMany([
      prefix+'.mesh',prefix+'.vertex',prefix+'.rowLuff',prefix+'.rowLeech',prefix+'.telltalePanelRows',
      prefix+'.span',prefix+'.foot',prefix+'.cutAngle'
    ]);
    assert.equal(rest.length,12*numRows);
    assert.equal(nodes.length,rest.length);
    assert.equal(luff.length,numRows);
    assert.equal(leech.length,numRows);
    assert(panelRows.every((row)=>row>0&&row<numRows),'Telltales use a native panel with a row above it');
    for(let row=0;row<numRows;row++){
      assert(Math.abs(rest[12*row+2]-span*luff[row])<1e-9);
      assert(Math.abs(rest[12*row+11]-span*leech[row]-foot*Math.sin(cut)*(1-leech[row]))<1e-9);
      if(row>0&&row<numRows-1)assert(luff[row]>luff[row-1]&&leech[row]>luff[row],
        'Every full-length batten has its own upward-rising row');
    }
    for(const [legacyRow,nativeRow] of [[0,0],[5,numRows-1]]){
      const start=72*(sail-1)+12*legacyRow;
      for(let k=0;k<12;k++)assert(Math.abs(legacy[start+k]-nodes[12*nativeRow+k])<1e-8);
    }
    for(let col=0;col<4;col++){
      const section=luff.map((left,row)=>left*(1-col/3)+leech[row]*col/3);
      const hi=section.findIndex((height)=>height>.4),lo=hi-1;
      const t=(.4-section[lo])/(section[hi]-section[lo]);
      for(let k=0;k<3;k++){
        const expected=(1-t)*nodes[12*lo+3*col+k]+t*nodes[12*hi+3*col+k];
        assert(Math.abs(legacy[72*(sail-1)+24+3*col+k]-expected)<1e-8);
      }
    }
  }
}

for (const windNorth of [-8, 8]) {
  const boat = await loadInstance('Hobie16', {
    windEast: 5.5, windNorth, launchSpeed: 2.4, launchHeading: 0,
    // Two light crew on the trapeze keep the loaded cloth fixture above water.
    launchHeight: .2, mass: 255, ballastMass: 110, ballastManual: 1, ballastCmdY: -1.65*Math.sign(windNorth),
    deckManual: 1, manualHelm: 1
  }, async url => new Response(await readFile(url)));
  boat.set('trimInput', -1);
  for (let i=0; i<500; i++) boat.advance(.01);
  assertNativeRows(boat);
  const rest = boat.get('cloth[1].mesh');
  let maxShortening = 0;
  let maxWetArea = 0;
  boat.set('trimInput', 1);
  for (let i=0; i<500; i++) {
    boat.advance(.01);
    const [points,wetArea] = boat.getMany(['cloth[1].vertex','wettedArea']);
    maxWetArea = Math.max(maxWetArea,...wetArea);
    // Three chordwise elements in each native interior batten row.
    for (let row=1; row<rest.length/12-1; row++) {
      for (let col=0; col<3; col++) {
        const node = 4*row+col;
        maxShortening = Math.max(maxShortening, 1-segmentLength(points,node)/segmentLength(rest,node));
      }
    }
  }
  assert(maxWetArea < .01, 'Sail entered the water during the airborne batten check');
  assert(maxShortening < .12, 'battened chord collapsed after sheet release');
  console.log({windNorth, maxShortening});
}

// An established reach under load used to drive a sustained 9 Hz leech motion.
// Read the batten tips directly from the FMU, before camera interpolation.
for(const [heading,side] of [[-.12,1],[-3.02,-1]]){
  const boat=await loadInstance('Hobie16',{
    launchEast:-1000,launchNorth:-1000,launchHeading:heading,launchSpeed:5.3,
    windEast:0,windNorth:8.5,manualHelm:1,deckManual:1,mainCarInput:.9*side,
    jibCarInput:.8,trimInput:-1,downhaulInput:.65,outhaulInput:.8,mass:255,ballastMass:110
  },async url=>new Response(await readFile(url)));
  let sumSquared=0,samples=0,upperHook=0;
  for(let tick=0;tick<1100;tick++){
    const error=heading-boat.get('heading');
    boat.set('rudderInput',Math.max(-1,Math.min(1,2*Math.atan2(Math.sin(error),Math.cos(error))-.5*boat.get('yawRate'))));
    boat.advance(.01);
    if(tick<450||tick%5)continue;
    const [points,velocity,wet]=boat.getMany(['cloth[1].vertex','cloth[1].velocity','wettedArea']);
    assert(wet.every(area=>area<.01),'The loaded test rig must remain above water');
    for(let row=3;row<=8;row++){
      sumSquared+=velocity[12*row+10]**2;
      samples++;
    }
    const tangent=(a,b)=>Math.atan2(points[b+1]-points[a+1],points[a]-points[b]);
    const angle=tangent(102,105)-tangent(99,102);
    upperHook=Math.max(upperHook,Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle))));
  }
  const tipSpeed=Math.sqrt(sumSquared/samples);
  assert(tipSpeed<.45,'A loaded leech should settle on either tack');
  assert(upperHook<5*Math.PI/180,'The top batten should have a fair trailing curve');
  console.log({heading,tipSpeed,upperHookDegrees:upperHook*180/Math.PI});
}
