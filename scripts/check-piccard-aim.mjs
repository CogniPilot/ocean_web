import assert from 'node:assert/strict';
import {keyboardAxisKey, keyboardSticks} from '../viewer/keyboard-sticks.mjs';
import {submarinePilot, piccardAim} from '../viewer/submarine.mjs';

for(const layout of ['wasd','mode2']){
  const keyboard=keyboardSticks(),trim=piccardAim();
  const key=k=>keyboardAxisKey(k,layout,'sub');
  const axis=(p,n)=>keyboard.get(p)-keyboard.get(n);
  const press=k=>keyboard.press(key(k),0);
  const release=k=>keyboard.release(key(k),200);
  assert.equal(trim.update(0,axis,0,true),0);
  for(const k of ['ArrowUp','ArrowLeft','KeyW','KeyQ','KeyR'])press(k);
  keyboard.advance(200);
  trim.update(0,axis,100,true);
  const pitch=trim.update(0,axis,200,true);
  const {pilot,attitude}=submarinePilot(axis,0,pitch);
  assert(pilot.every(v=>v>0)&&attitude[0]===0&&attitude[1]<0);
  assert.equal(pilot[2],Math.PI/10*axis('KeyA','KeyD'),'Ramped yaw input is proportional to the 18 degree/s limit');
  release('ArrowUp');
  assert.equal(trim.update(0,axis,250,true),pitch);
  assert.equal(trim.update(0,axis,600,true),pitch);
  assert.equal(trim.update(1,axis,650,true),0);
  press('ArrowDown');assert(trim.update(1,axis,700,true)>0);
  assert.equal(trim.update(2,axis,750,true),1);
  release('ArrowDown');assert.equal(trim.update(2,axis,800,true),0);
  assert.equal(trim.update(0,axis,850,false),0);
  assert.equal(trim.update(0,axis,900,true),0);
  console.log(layout,'combined translation+yaw+pitch, hold, level, acro, helm loss passed');
}
