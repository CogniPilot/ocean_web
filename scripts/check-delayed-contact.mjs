// Two independent Modelica boats closing head-on, exchanging 10 Hz fleet snapshots.
// Deterministic delivery schedule makes the contact timing repeatable.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {PeerTimeline} from '../viewer/fleet-timeline.mjs';

const read=async url=>new Response(await readFile(url));
const fields=['east','north','heading','heave','ve','vn','yawRate'];
const trials=[
  {name:'reference',delays:[0],dropEvery:0},
  {name:'impaired, periodic only',periodicOnly:true,delays:[170,40,130,210,60],dropEvery:7},
  {name:'impaired',delays:[170,40,130,210,60],dropEvery:7}
];
const separation=[];
for(const {name,delays,dropEvery,periodicOnly} of trials){
  const boats=await Promise.all([0,1].map(i=>loadInstance('Hobie16',{
    launchEast:-1000+9*i,launchNorth:-1000,launchHeading:i*Math.PI,
    launchSpeed:2.4,launchHeight:.2,manualHelm:1
  },read)));
  const timelines=boats.map(()=>new PeerTimeline()),pending=[];
  const first=[null,null],peak=[0,0];
  let minSeparation=Infinity,reordered=0,dropped=0;
  for(let tick=0;tick<500;tick++){
    const now=tick*10;
    const states=boats.map(b=>b.getMany(fields));
    if(tick%10===0){
      for(let i=0;i<2;i++){
        const sequence=tick/10+i;
        if(dropEvery && sequence%dropEvery===3){dropped++;continue;}
        const data=new Float32Array(232),s=states[i];
        data.set(s.slice(0,4));data[207]=1;data.set(s.slice(4,7),212);
        data[215]=(now+10000*(i+1))/1000;
        pending.push({recipient:1-i,data,arrival:now+delays[sequence%delays.length]});
      }
    }
    const changed=[false,false];
    for(const packet of pending.filter(p=>p.arrival<=now)){
      if(!timelines[packet.recipient].receive(packet.data,packet.arrival))reordered++;
      else changed[packet.recipient]=true;
      pending.splice(pending.indexOf(packet),1);
    }
    minSeparation=Math.min(minSeparation,Math.hypot(states[1][0]-states[0][0],states[1][1]-states[0][1]));
    for(let i=0;i<2;i++){
      if(tick%5===0 || (!periodicOnly && changed[i])){
        const timeline=timelines[i],traffic=new Float64Array(36);
        timeline.writeTraffic(now,states[i][0],states[i][1],traffic,0);
        boats[i].set('traffic',traffic);
      }
      const opposing=(i===0?-1:1)*boats[i].get('peerForce')[0];
      if(opposing>1 && first[i]===null)first[i]=now;
      peak[i]=Math.max(peak[i],opposing);
      boats[i].advance(.01);
    }
  }
  console.log(name,{firstContactMs:first,peakOpposingN:peak,minCenterSeparationM:minSeparation,reordered,dropped});
  assert(first.every(t=>t!==null) && peak.every(f=>Number.isFinite(f)&&f>10));
  separation.push(minSeparation);
  if(dropEvery)assert(reordered>0 && dropped>0);
}
assert(Math.abs(separation[2]-separation[0]) < Math.abs(separation[1]-separation[0]),
  'Fresh packets should bring closest approach nearer to the zero-delay run');
