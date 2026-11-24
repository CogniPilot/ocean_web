import assert from 'node:assert/strict';
import {createWakePlayback} from '../../viewer/onrt-playback.mjs';

const step=.04;
for (const hz of [30,60,120]){
  const playback=createWakePlayback(3*step);
  let next=1,lastTime=0,moving=0,stalls=0;
  for(let tick=0;tick<5*hz;tick++){
    const now=tick/hz;
    // Every third packet covers two solver steps. Delivery can miss a draw.
    const count=next%4===3?2:1;
    if((next+count-1)*step+.012*Math.sin(next)<=now){
      const batch=[];
      for(let i=0;i<count;i++,next++){
        const t=next*step;
        batch.push({state:{time:t,east:1.11*t},tile:Float64Array.of(2*t)});
      }
      playback.append(batch);
    }
    const sample=playback.sample(1/hz);
    if(!sample)continue;
    const {left,right,mix}=sample;
    assert.ok(mix>=0&&mix<=1);
    const at=(a,b)=>a+mix*(b-a);
    const t=at(left.state.time,right.state.time);
    assert.ok(t>=lastTime-1e-12);
    if(lastTime)assert.ok(t-lastTime<=1.10001/hz);
    assert.ok(Math.abs(at(left.tile[0],right.tile[0])/2-at(left.state.east,right.state.east)/1.11)<1e-12);
    if(now>.35){moving++;if(t===lastTime)stalls++;}
    lastTime=t;
  }
  assert.equal(stalls,0);
  console.log(hz+' Hz: '+moving+' consecutive moving frames with aligned fields');
}
