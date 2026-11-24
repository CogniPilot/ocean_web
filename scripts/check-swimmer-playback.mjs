// A 10 Hz authority delivers packets in irregular bursts to a 30 Hz renderer.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
globalThis.THREE=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const {SwimmerTrack}=await import('../viewer/harbor-traffic.mjs');
const track=new SwimmerTrack(),travel=[];
const arrivals=[0,160,240,360,400,540,660,710,790,960];
let index=0,previous=0;
for(let now=0;now<8000;now+=1000/30){
  while(index<80&&now>=Math.floor(index/10)*1000+arrivals[index%10]){
    const frame=Array(319).fill(0);
    frame[0]=index/10;frame[17]=2*frame[0];track.receive(frame,0,now);
    // A roster refresh repeats the same solved time in a different array.
    track.receive(frame.slice(),0,now+1);
    index++;
  }
  const position=track.at(now)[17];
  if(now>1000)travel.push(position-previous);
  previous=position;
}
assert(Math.min(...travel)>.04&&Math.max(...travel)<.10);
console.log('Travel per render at 2 m/s',Math.min(...travel),Math.max(...travel));
