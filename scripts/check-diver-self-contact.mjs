// Test the public FMU, including motion of the independently posed suit skin.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import T from '../viewer/vendor/three.min.js';
import {diverContactRig} from '../viewer/scuba-diver.mjs';
import {divePacket} from '../viewer/npc-room.mjs';

const directory = process.argv[2] ? pathToFileURL(resolve(process.argv[2]) + '/') : new URL('../viewer/fmi3/', import.meta.url);
const {loadInstance} = await import(new URL('instance.mjs', directory));
const zeros = n => Array(n).fill(0);
const init = (options = {}) => loadInstance('ScubaDiver', {
  initialState: [0,0,-12, ...zeros(13)], waterLevel: 0, bedHeight: -90, policyMode: 1, ...options
}, async url => new Response(await readFile(url)));

const rest = await init();
rest.advance(.6);
assert.deepEqual(rest.get('selfContactStatus'), zeros(4), 'fitted equipment and joint sockets must not preload neutral pose');

function probeReader() {
  const {rig}=diverContactRig(T);
  const packet=new Float64Array(divePacket.length);
  let points;
  return {
    kinds: rig.probes.kinds,
    read(f) {
      const [s,a,q,qd,l,ld]=f.getMany(['state','activity','jointAngles','jointRates','lateralAngles','lateralRates']);
      packet.set(s,1); packet.set(a,17); packet.set(q,divePacket.joints); packet.set(qd,divePacket.rates);
      packet.set(l,divePacket.lateral); packet.set(ld,divePacket.lateralRates);
      rig.applyFrame(packet,0,()=>-90);
      points=rig.probes.points(points);
    },
    overlap(a,b) {
      let depth=0;
      for(const i of a) for(const j of b) {
        const m=4*i,n=4*j;
        depth=Math.max(depth,points[m+3]+points[n+3]-Math.hypot(points[m]-points[n],points[m+1]-points[n+1],points[m+2]-points[n+2]));
      }
      return depth;
    }
  };
}

async function hands(stiffness) {
  const f = await init({selfContactStiffness: stiffness, jointAction: [0,0,0,-.55,.25, 0,0,0,-.55,.25]});
  const skin=probeReader(), hand=[], core=[];
  skin.kinds.forEach((part,i) => {
    if (part === 'hand') hand.push(i);
    if (['body','tank','head'].includes(part)) core.push(i);
  });
  const left = hand.slice(0,2), right = hand.slice(2);
  let peak = 0, mutual = 0, torso = 0, compression = 0;
  for (let k = 0; k <= 100; k++) {
    skin.read(f);
    mutual=skin.overlap(left,right); torso=skin.overlap(hand,core);
    peak=Math.max(peak,mutual,torso); compression=Math.max(compression,f.get('selfContactStatus')[1]);
    if (k < 100) f.advance(.02);
  }
  return {peak,mutual,torso,compression};
}
const free = await hands(0), constrained = await hands(18000);
assert(free.mutual > .07 && free.torso > .06);
assert(constrained.mutual < .001 && constrained.torso < .02 && constrained.peak < .055);
assert(constrained.compression < .012);
console.log('Rendered hands (metres), inactive and active:', free, constrained);

const fixture = async (q,lateral,v=zeros(10),w=zeros(4),stiffness=18000) =>
  init({initialJoints:[...q,...v], initialLateral:[...lateral,...w], selfContactStiffness:stiffness});
const q = zeros(10), lateral = zeros(4);
q[3] = -.08;
async function checkGradient(q,lateral) {
  const reference=await fixture(q,lateral);
  const tau=[...reference.get('selfContactTorque'),...reference.get('selfContactLateralTorque')];
  async function energy(j,step) {
    const a=[...q], b=[...lateral];
    if(j<10) a[j]+=step; else b[j-10]+=step;
    return (await fixture(a,b)).get('selfContactStatus')[3];
  }
  let maxGradientError=0;
  for(let j=0;j<14;j++) {
    const h=1e-6;
    const dU=((await energy(j,h))-(await energy(j,-h)))/(2*h);
    maxGradientError=Math.max(maxGradientError,Math.abs(tau[j]+dU));
  }
  assert(maxGradientError<1e-4,'joint reaction must be the negative elastic energy gradient: '+maxGradientError);
  return {tau,maxGradientError};
}
const handGradient=await checkGradient(q,lateral);
const finGradient=await checkGradient(zeros(10),[-.065,.28,.065,-.07]);
assert(finGradient.tau[10]>100 && finGradient.tau[12]<-100);
assert(Math.abs(finGradient.tau[11])>1 && Math.abs(finGradient.tau[13])>.5);
const v = zeros(10), w = zeros(4);
v[0] = .14; v[3] = -.7; v[4] = .33; w[0] = .18;
const moving = await fixture(q,lateral,v,w), off = await fixture(q,lateral,v,w,0);
assert.deepEqual(moving.get('bodyWrench'),off.get('bodyWrench'), 'internal forces must not add any net wrench');
const torques = [...moving.get('selfContactTorque'),...moving.get('selfContactLateralTorque')];
const dampingWork = [...v,...w].reduce((sum,rate,j) => sum+rate*(torques[j]-handGradient.tau[j]),0);
assert(dampingWork < -.1);
console.log('Maximum virtual-work gradient error (N m), damping power (W):',Math.max(handGradient.maxGradientError,finGradient.maxGradientError),dampingWork);

for (const [name,jointAction,lateralAction] of [
  ['crossed fins', zeros(10), [-.75,.35,.75,.35]],
  ['folded legs', [.9,1,.7,0,0, .9,1,.7,0,0], zeros(4)]
]) {
  const f=await init({jointAction,lateralAction});
  let compression=0, peakForce=0, peakSweep=0, peakCant=0;
  const skin=probeReader();
  const legs=skin.kinds.flatMap((part,i)=>['leg','boot','fin'].includes(part)?[i]:[]);
  const left=legs.slice(0,legs.length/2), right=legs.slice(legs.length/2);
  let skinDepth=0;
  for(let k=0;k<100;k++){
    f.advance(.02);
    if(name==='crossed fins') {
      skin.read(f);
      skinDepth=Math.max(skinDepth,skin.overlap(left,right));
    }
    const [status,moment]=f.getMany(['selfContactStatus','selfContactLateralTorque']);
    compression=Math.max(compression,status[1]); peakForce=Math.max(peakForce,status[2]);
    peakSweep=Math.max(peakSweep,Math.abs(moment[0]),Math.abs(moment[2]));
    peakCant=Math.max(peakCant,Math.abs(moment[1]),Math.abs(moment[3]));
  }
  if(name==='crossed fins') {
    assert(compression>0 && compression<.022 && peakForce>30 && peakSweep>10);
    assert(skinDepth<.045,'fitted opposing lower-limb surfaces crossed');
    assert(peakCant>.2,'contact must act on the finite-width blade');
  } else {
    // Symmetric sagittal flexion stays within the stops on either side of the pelvis.
    assert.equal(peakForce,0,'separated folded legs should carry no contact reaction');
  }
  console.log(name, {compression,peakForce,peakSweep,peakCant,skinDepth});
}
