// Measure the actual animated mesh joints against the model's equilibrium
// waterline, and verify that a spectator receives the same presentation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {birdMesh,GullTrack} from '../viewer/gull.mjs';
const three=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
// Pose tests use the real Three.js geometry. Image decoding is covered in the browser.
const T={...three,TextureLoader:class {load(){return new three.Texture();}}};
const rest=[0,0,.043,0,0,0,0,0,.095,-.07,.2,0,0,0,.23,0,0,0,0,1,3,0,2,0,0];
const flying=[...rest];flying[2]=2;flying[4]=8;flying[14]=0;flying[19]=flying[22]=0;
const gull=birdMesh(T),position=o=>o.getWorldPosition(new T.Vector3());
const bill=gull.group.getObjectByName('Gull bill tip'),catchFish=gull.group.getObjectByName('Gull caught fish');
const panel=gull.group.getObjectByName('Gull folded wing');
gull.draw(flying,0);const tucked=position(gull.feet[0]).clone();
const approach=[...flying];approach[2]=.17;approach[5]=-.5;
gull.draw(approach,.1);assert(position(gull.feet[0]).z-approach[2]<tucked.z-flying[2]-.06);
gull.draw(rest,.2);const neutral=panel.rotation.x;let peak=0;
for(let i=0;i<90;i++){gull.draw(rest,.2+i/30);peak=Math.max(peak,Math.abs(panel.rotation.x-neutral));}
assert(peak>.045&&panel.rotation.x===0,'wings should settle on landing');
gull.draw(rest,9.41);const high=position(bill).z;
assert(high>.1&&gull.feet.every(f=>position(f).z<-.035),'breast up, webbing immersed');
gull.draw(rest,11.96);const low=position(bill).z;assert(low>-.03&&low<.005);
gull.draw(rest,12.5);assert(catchFish.visible&&position(bill).z>high+.04);
gull.draw(rest,13.6);assert.equal(catchFish.visible,false);
gull.draw(rest,21.36);assert.equal(catchFish.visible,false,'ordinary nip');
const swim=[...rest];swim[23]=swim[24]=1;swim[6]=Math.PI/2;
gull.draw(swim,22);const first=gull.feet.map(f=>position(f).x);
swim[6]+=Math.PI;gull.draw(swim,22.12);const second=gull.feet.map(f=>position(f).x);
assert((first[0]-second[0])*(first[1]-second[1])<-.0064,'alternating fore/aft kicks');
const launch=[...swim];launch[5]=.8;launch[7]=.9;launch[8]=.7;launch[2]=.11;launch[6]=0;
assert(gull.draw(launch,22.22)>.8,'foot push during takeoff');
assert(gull.feet.every(f=>position(f).z<.035),'both feet touch surface');
assert.equal(gull.draw(flying,22.45),0);
const track=new GullTrack(),remote=birdMesh(T);track.receive(rest,100);track.receive([...rest],200);
remote.draw(track.at(250,150),12.5);gull.reset();gull.draw(rest,12.5);
assert(position(remote.group.getObjectByName('Gull bill tip')).distanceTo(position(bill))<1e-8);
remote.draw(flying.slice(0,19),12.6);
assert(remote.feet.every(f=>Number.isFinite(position(f).z)),'legacy pose');
console.log({restingBill:high,nip:low,settleDegrees:peak*180/Math.PI,kickTravel:Math.abs(first[0]-second[0]),takeoffAndRemote:true});

// The production FMU drives both launch and opposite turning strokes.
const {resolve}=await import('node:path');
const {pathToFileURL}=await import('node:url');
const location=process.argv[2]?pathToFileURL(resolve(process.argv[2],'instance.mjs')).href:'../viewer/fmi3/instance.mjs';
const {loadInstance}=await import(location);
const {readFile}=await import('node:fs/promises');
const model=await loadInstance('HerringGull',{wind:[0,0],startState:[0,0,.043,0,0,0,0,0],startWaterMode:2},async url=>new Response(await readFile(url)));
const real=birdMesh(T,1);let peakPush=0,firstPushZ=Infinity,lastPushZ=0;
for(let i=0;i<950;i++){
  model.set('pilot',i<125?[1,0,.6,0]:[1,1,0,1]);model.advance(.01);
  const row=model.getMany(['x','wings','memory','surfaceMotion','joints','flowMemory','lateralSpeed','paddleState','webSpread','launchWakePower']).flat();
  const push=real.draw(row,i*.01,0);
  if(push>.18){
    peakPush=Math.max(peakPush,push);firstPushZ=Math.min(firstPushZ,row[2]);lastPushZ=Math.max(lastPushZ,row[2]);
    assert(i>=125&&row[2]<.30,'only kick while within reach of surface');
  }
}
assert(peakPush>.60&&model.get('x')[2]>4);
console.log({peakLaunchPush:peakPush,firstPushZ,lastPushZ,finalFlyingAltitude:model.get('x')[2]});
