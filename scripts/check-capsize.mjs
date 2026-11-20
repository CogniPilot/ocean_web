// Regression for the sampled sail water loads during a pitchpole and a beam-wind capsize.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
for(const [pitch,pitchRate,wind] of [[1.5,1,14],[0,0,-22]]){
  const boat=await loadInstance('Hobie16',{launchPitch:pitch,launchPitchRate:pitchRate,launchHeight:.2,
    manualHelm:1,windEast:0,windNorth:wind,ballastManual:1,ballastCmdY:-.84},read);
  const spans=boat.get('spans'), feet=boat.get('feet');
  let maxAngle=0,maxWetArea=0,maxReach=0;
  for(let i=0;i<3000;i++){
    boat.advance(.01);
    const [heel,trim,wet,rollRate,trimRate,leech]=boat.getMany(['heel','pitch','wettedArea','rollRate','pitchRate','leechSpeed']);
    assert.ok([heel,trim,...wet,rollRate,trimRate,...leech].every(Number.isFinite));
    assert.ok(Math.max(Math.abs(rollRate),Math.abs(trimRate))<20,'runaway angular velocity');
    const vertices=boat.get('sailVertex');
    for(let sail=0; sail<2; sail++){
      for(let vertex=0; vertex<24; vertex++){
        const offset=(sail*24+vertex)*3;
        const reach=Math.hypot(...vertices.slice(offset,offset+3));
        assert.ok(reach<Math.hypot(spans[sail],feet[sail])+1,'sail extended beyond its rig');
        maxReach=Math.max(maxReach,reach);
      }
    }
    maxAngle=Math.max(maxAngle,Math.abs(heel),Math.abs(trim));
    maxWetArea=Math.max(maxWetArea,...wet);
  }
  assert.ok(maxAngle>Math.PI/2 && maxWetArea>1,'rig passed horizontal and entered the water');
  console.log({pitch,pitchRate,wind,maxAngle,maxWetArea,maxReach,seconds:boat.time});
}
