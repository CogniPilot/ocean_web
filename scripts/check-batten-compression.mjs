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
