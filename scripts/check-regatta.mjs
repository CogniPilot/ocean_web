// Exercise the shipped WebAssembly scorer with a rotated course and timed crossings.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fleetFinishes,lapTable,lapClock,rollingFeedingScore,controlledRace} from '../viewer/lap-board.mjs';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {fleetNumbers} from '../viewer/fleet-numbers.mjs';
import {raceTarget} from '../viewer/regatta.mjs';
import {sailingStart,startGate} from '../viewer/sailing-start.mjs';
const read=async url=>new Response(await readFile(url));
for(const angle of [Math.atan2(4,10),Math.PI/2,-2.5]){
  const race=await loadInstance('Regatta',{...startGate,windBearing:angle,utc:299},read);
  const position=label=>[race.get(label+'East'),race.get(label+'North')];
  const pin=position('pin'),committee=position('committee'),center=position('gate');
  const dx=committee[0]-pin[0],dy=committee[1]-pin[1],length=Math.hypot(dx,dy);
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6);
  near(length,startGate.lineLength);
  for(const cat of [true,false]){
    const start=sailingStart(cat,angle);
    const offset=[start.launchEast-center[0],start.launchNorth-center[1]];
    const down=offset[0]*Math.cos(angle)+offset[1]*Math.sin(angle);
    near(down,14);
    if(cat){
      const along=offset[0]*Math.cos(start.launchHeading)+offset[1]*Math.sin(start.launchHeading);
      near(along,-length/2);
      near(Math.cos(start.launchHeading-angle),0);
      const shifted=sailingStart(true,angle,angle+.7);
      near(shifted.launchEast,start.launchEast);
      near(shifted.launchNorth,start.launchNorth);
      near(Math.cos(shifted.launchHeading-angle-.7),0);
      continue;
    }
    const distance=-down/Math.cos(start.launchHeading-angle);
    assert(distance>0);
    const crossing=Math.hypot(offset[0]+distance*Math.cos(start.launchHeading),offset[1]+distance*Math.sin(start.launchHeading));
    assert(length/2-crossing>15);
  }
  near(dx*Math.cos(angle)+dy*Math.sin(angle),0);
  const east=race.get('markEast'),north=race.get('markNorth');
  const marks=east.map((v,i)=>[v,north[i]]);
  // Bearing and range follow the two moving endpoints of the actual gate.
  const [pinE,pinN,committeeE,committeeN]=race.get('startGateEnds');
  const gateCenter=[.5*(pinE+committeeE),.5*(pinN+committeeN)];
  for(const [stage,label,point] of [[0,'Start',gateCenter],[1,'Start',gateCenter],[2,'Mark 1',marks[0]],
    [3,'Mark 2',marks[1]],[4,'Finish',gateCenter]]){
    const target=raceTarget(race,stage,point[0]-3,point[1]-4);
    assert.equal(target.label,label);assert.equal(target.bearing,'037°T');near(target.range,5);
    near(target.angle,Math.atan2(4,3));
    assert.equal(raceTarget(race,stage,...point),null);
  }
  assert.equal(raceTarget(race,5,...center),null);
  const points=[center,...marks,center];
  for(let i=1;i<points.length;i++)near(Math.hypot(...points[i].map((v,j)=>v-points[i-1][j])),200);
  // Feed a fixed course for the scorer timing examples. The harbor model
  // otherwise moves the moorings independently of the synthetic UTC jumps.
  race.set('coursePoints',[...pin,...marks.flat(),...committee]);
  race.set('courseGateEnds',[...pin,...committee]);
  race.set('externalCourse',1);
  const move=(p,t)=>{
    race.set('east',p[0]);race.set('north',p[1]);race.set('utc',t);race.advance(.05);
    return race.get('stage');
  };
  const gate=(up,cross)=>[center[0]-up*Math.cos(angle)+cross*dx/length,center[1]-up*Math.sin(angle)+cross*dy/length];
  move(gate(-2,length/2+3),299);
  assert.equal(move(gate(-1,length/2+3),300),1);
  assert.equal(move(gate(1,length/2+3),301),1);
  assert.equal(move(gate(-1,0),302),1);
  assert.equal(move(gate(1,0),303),2);
  for(let mark=0;mark<2;mark++){
    const [arrival,apex,departure]=points.slice(mark,mark+3);
    const outside=Math.atan2(2*apex[1]-arrival[1]-departure[1],2*apex[0]-arrival[0]-departure[0]);
    const point=(side,distance)=>apex.map((coordinate,i)=>coordinate+distance*
      (i===0?Math.cos(outside+side):Math.sin(outside+side)));
    const time=320+mark*30,current=mark+2;
    const clearance=mark===0?4:7;
    assert.equal(move(point(-.3,24),time),current);
    assert.equal(move(point(.3,24),time+1),current,'A distant pass should not count');
    assert.equal(move(point(.3,clearance),time+2),current);
    assert.equal(move(point(-.3,clearance),time+3),current,'A starboard crossing should not count');
    assert.equal(move(point(.3,clearance),time+4),current+1,'A port rounding with clearance should count');
  }
  assert.equal(move(gate(1,0),389),4);
  assert.equal(move(gate(-1,0),391),5);
  near(race.get('finishUtc'),390);
  near(race.get('elapsed'),90);
  near(race.get('lapTime'),87.5);
  assert.equal(move(gate(-2,0),399),5);
  near(race.get('lapTime'),87.5);

  race.set('raceStart',707);
  assert.equal(move(gate(-2,0),407),0);
  near(race.get('countdown'),300);
  near(race.get('nextStart'),707);
  near(race.get('lapTime'),0);
  assert.equal(move(gate(2,0),500),0,'Crossings before the reset start cannot count');
  assert.equal(move(gate(-1,0),706.9),0);
  assert.equal(move(gate(3,0),707.1),1,'A crossing between samples before the gun is invalid');
  assert.equal(race.get('earlyStart'),1);
  assert.equal(move(gate(4,0),708),1);
  assert.equal(move(gate(-2,0),710),1);
  assert.equal(race.get('earlyStart'),0);
  assert.equal(move(gate(1,0),711),2,'A new crossing after clearing the line counts');
  near(race.get('nextStart'),1007);
}
console.log('Three wind bearings passed start, port roundings at 4 m and 7 m, finish and lap time.');
const hullRace=await loadInstance('Regatta',{...startGate,windBearing:0,utc:299,raceStart:300,
  hullStations:[-2.52,-1.9,-.9,.15,1.12,1.95,2.52],hullWidths:[.09,.156,.185,.184,.155,.093,.009],hullOffset:1.02,
  racerState:[1,Math.PI,0,0,.2,0,0,0,0,0,0]},read);
hullRace.set('coursePoints',[hullRace.get('pinEast'),hullRace.get('pinNorth'),
  ...hullRace.get('markEast').flatMap((east,i)=>[east,hullRace.get('markNorth')[i]]),
  hullRace.get('committeeEast'),hullRace.get('committeeNorth')]);
hullRace.set('externalCourse',1);
function moveHull(distance,utc){
  hullRace.set('east',hullRace.get('gateEast')+distance);
  hullRace.set('north',hullRace.get('gateNorth'));
  hullRace.set('utc',utc);hullRace.advance(.05);
}
moveHull(4,299.8);
moveHull(2,299.95);
moveHull(2,300.1);
assert.equal(hullRace.get('stage'),1);
assert.equal(hullRace.get('earlyStart'),1,'The bow can be over early while the boat center is clear');
moveHull(4,300.3);
assert.equal(hullRace.get('earlyStart'),0);
moveHull(2,300.4);
assert.equal(hullRace.get('stage'),2);

const finishes=fleetFinishes(),awards=[];
const award=(...winner)=>awards.push(winner);
finishes.propose(300,390.2,'npc-1','NPC 1',100);
finishes.propose(300,389.9,'peer','Captain Kai',450);
finishes.propose(300,299,'invalid','Invalid time',500);
finishes.settle(1100,1100,award);
assert.deepEqual(awards,[]);
finishes.settle(1200,1100,award);
assert.deepEqual(awards,[[300,389.9,'Captain Kai']]);
finishes.propose(300,391,'later','Captain Mira',1500);
finishes.settle(3000,1100,award);
assert.equal(awards.length,1);
const [record]=finishes.history();
const guest=fleetFinishes();
assert.equal(guest.accept(record.heat,record.at,'Unreviewed display name'),false);
assert.equal(guest.accept(record.heat,record.at,record.name),true);
assert.equal(guest.accept(record.heat,record.at,record.name),false);
assert.deepEqual(guest.get(300),finishes.get(300));

const players=Array.from({length:100},(_,i)=>'player-'+i);
const numbers=fleetNumbers('regatta',players);
assert.deepEqual(numbers,fleetNumbers('regatta',players.slice().reverse()));
assert.equal(new Set(numbers.values()).size,100);
assert.equal(Math.min(...numbers.values()),0);
assert.equal(Math.max(...numbers.values()),99);
for(const [id,number] of fleetNumbers('regatta',[]))assert.equal(numbers.get(id),number);
const launch=await loadInstance('Regatta',{windBearing:-Math.PI},read);
const settle=seconds=>{for(let i=0;i<seconds*20;i++)launch.advance(.05);};
const pose=()=>Array.from(launch.get('launchPose'));
settle(2);
assert.ok(pose().every(v=>Math.abs(v)<1e-6),'balanced in still water');
launch.set('tide',.25);
settle(6);
assert.ok(Math.abs(pose()[0]-.25)<1e-3,'follows tide');
const e=launch.get('committeeEast'),n=launch.get('committeeNorth');
const waves=Float64Array.from({length:4096},(_,k)=>
  .15*Math.sin(2*Math.PI*(k%64-e)/64)+.12*Math.sin(2*Math.PI*(Math.floor(k/64)-n)/64));
launch.set('wakeTile',waves);
settle(6);
assert.ok(pose()[1]>.009 && pose()[2]>.012,'heels and pitches toward the local wake slope');
launch.set('wakeTile',new Float64Array(4096));
settle(6);
assert.ok(pose().slice(1).every(v=>Math.abs(v)<1e-3),'settles after the wake passes');
console.log('Committee launch passed still water, tide, oblique wake and settling checks.');

// Force the marks with a local travelling swell after still-water equilibrium.
const marks=await loadInstance('Regatta',{swellHeight:0},read);
marks.advance(.1);
assert(marks.get('markPose').every(v=>Math.abs(v)<1e-8));
marks.set('swellHeight',.30);
const lo=Array(9).fill(Infinity),hi=Array(9).fill(-Infinity);
let difference=0;
for(let step=0;step<220;step++){
  marks.advance(.05);
  const p=marks.get('markPose');
  if(step<80)continue;
  p.forEach((v,i)=>{lo[i]=Math.min(lo[i],v);hi[i]=Math.max(hi[i],v);});
  difference=Math.max(difference,Math.abs(p[0]-p[3]));
}
for(let i=0;i<9;i++){
 const travel=hi[i]-lo[i];
 assert(travel>(i%3===0?.35:.03) && travel<(i%3===0?.9:.5),JSON.stringify({i,travel}));
}
assert(difference>.1);
console.log({markRanges:hi.map((v,i)=>v-lo[i]),difference});

// Ranking uses the same tenth-second precision as the race clock. Replayed
// peer snapshots and simultaneous browser sessions must preserve each finish.
const items=new Map();
const storage={
  get length(){return items.size;},
  key:i=>Array.from(items.keys())[i],
  getItem:key=>items.get(key),
  setItem:(key,value)=>items.set(key,value),
  removeItem:key=>items.delete(key)
};
const table=()=>lapTable(storage,'room/regatta','Hobie16');
const first=table(),second=table();
const finish=i=>({id:i.toString(16).padStart(32,'0'),captain:'Captain Kai',tenths:700+i});
for(let i=0;i<12;i++)(i%2?first:second).add([finish(i)]);
const ranked=table();
assert.deepEqual(ranked.rows,Array.from({length:10},(_,i)=>finish(i)));
assert.equal(items.size,10);
assert.equal(ranked.add([finish(0)]),false);
assert.equal(ranked.add([{...finish(0),tenths:NaN}]),false);
assert.equal(ranked.add([{...finish(20),tenths:-1}]),false);
assert.equal(ranked.add(Array(11).fill(finish(20))),false);
assert.equal(lapTable(storage,'room/regatta','Sailboat').rows.length,0);
assert.equal(lapTable(storage,'room/private','Hobie16').rows.length,0);
assert.equal(lapTable(storage,'personal','Hobie16').rows.length,0);
assert.equal(lapClock(600),'1:00.0');
assert.equal(lapClock(599),'0:59.9');
console.log('Lap leaderboard passed ordering, persistence, top-ten limit, replay and room/hull isolation.');

const feeding=rollingFeedingScore();
assert.deepEqual(feeding.sample(598,7,true),{count:0,best:0,improved:false},'existing captures do not count on join');
assert.deepEqual(feeding.sample(599,8,true),{count:1,best:1,improved:true});
assert.deepEqual(feeding.sample(600,10,true),{count:3,best:3,improved:true},'the race signal does not reset feeding');
assert.deepEqual(feeding.sample(898,12,true),{count:5,best:5,improved:true});
assert.deepEqual(feeding.sample(899,12,true),{count:4,best:5,improved:false},'captures expire exactly five minutes later');
assert.deepEqual(feeding.sample(1198,12,true),{count:0,best:5,improved:false});
assert.equal(feeding.sample(1199,17,false),undefined);
assert.deepEqual(feeding.sample(1200,17,true),{count:0,best:0,improved:false},'practice captures are excluded');
assert.deepEqual(feeding.sample(1201,0,true),{count:0,best:0,improved:false},'authority counter reset starts fresh');
assert.deepEqual(feeding.sample(1202,2,true),{count:2,best:2,improved:true});
assert.deepEqual(feeding.sample(1201,3,true),{count:0,best:0,improved:false},'authority clock reset starts fresh');
const feedingTable=lapTable(storage,'room/regatta','whale-feeding');
const feedingEntry={id:finish(0).id,captain:finish(0).captain,count:4};
assert.equal(feedingTable.add([feedingEntry]),true);
assert.equal(feedingTable.add([{...feedingEntry,count:7}]),true);
assert.equal(feedingTable.add([feedingEntry]),false,'an older peer score cannot replace the best');
feedingTable.reload();
assert.deepEqual(feedingTable.rows,[{...feedingEntry,count:7}]);

const geometry=await loadInstance('Regatta',{...startGate,windBearing:0,utc:599},read);
const [pe,pn,mx,my,ce,cn]=geometry.getMany(['pinEast','pinNorth','markEast','markNorth','committeeEast','committeeNorth']);
const course=()=>[pe,pn,mx[0],my[0],mx[1],my[1],ce,cn],x=(pe+ce)/2,y=(pn+cn)/2;
let loaded;
const subject=controlledRace(inputs=>loaded=loadInstance('Regatta',{...startGate,windBearing:0,externalCourse:1,...inputs},read));
const sample=(id,dx,t)=>subject.sample(id,[x+dx,y],t,599+t,600,course);
assert.equal(sample('room-a/sub',4,0),undefined);await loaded;
assert.equal(sample('room-a/sub',1,.5).get('stage'),0);
assert.equal(sample('room-a/sub',1,1).get('stage'),1);
assert.equal(sample('room-a/sub',-1,1.1).get('stage'),2,'controlled sub crosses its gate');
const before=subject.generation;
assert.equal(sample('room-a/manta-2',-1,1.2),undefined);await loaded;
assert.ok(subject.generation>before);
assert.equal(sample('room-a/manta-2',-1,1.3).get('stage'),1,'animal does not inherit sub lap');
assert.equal(sample('room-a/manta-2',100,1.4),undefined);await loaded;
assert.equal(sample('room-a/manta-2',100,1.5).get('stage'),1,'teleport reseeds the committee');
assert.equal(sample('room-b/manta-2',-1,1.6),undefined);await loaded;
assert.equal(sample('room-b/manta-2',-1,1.7).get('stage'),1,'room switch starts a fresh attempt');
subject.reset();geometry.close();
console.log('Controlled trajectories, seat/room discontinuities and rolling five-minute feeding scores passed.');

const catchRow=(i,count)=>({id:i.toString(16).padStart(32,'0'),captain:'Captain Kai',count});
const hunts=lapTable(storage,'room/reef','manta-feeding');
for(let i=0;i<12;i++)hunts.add([catchRow(i,i)]);
assert.deepEqual(hunts.rows.map(row=>row.count),[11,10,9,8,7,6,5,4,3,2]);
assert.equal(hunts.add([catchRow(11,11)]),false,'replayed room scores are idempotent');
assert.equal(lapTable(storage,'room/other','manta-feeding').rows.length,0);
assert.equal(lapTable(storage,'personal','manta-feeding').rows.length,0);
assert.equal(lapTable(storage,'room/reef','shark-feeding').rows.length,0);
assert.equal(lapTable(storage,'room/reef','manta').rows.length,0);

const resolveRace=[];
const switching=controlledRace(()=>new Promise(resolve=>resolveRace.push(resolve)));
switching.sample('room-a/whale',[0,0],1,600,600,course);
switching.sample('room-b/whale',[1,0],2,601,600,course);
let staleClosed=false;
resolveRace[0]({close(){staleClosed=true;}});await Promise.resolve();
assert(staleClosed,'an old room completing its asynchronous load cannot attach to a new room');
switching.reset();resolveRace[1]({close(){}});await Promise.resolve();
