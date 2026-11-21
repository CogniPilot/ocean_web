// Check the shipped Blender mesh in metres. glTF is Y-up, with +X forward.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const glb=await readFile(new URL('../viewer/assets/hobie-hulls.glb',import.meta.url));
const jsonLength=glb.readUInt32LE(12);
const scene=JSON.parse(glb.toString('utf8',20,20+jsonLength));
const binary=glb.subarray(28+jsonLength);
function vertices(name){
  const mesh=scene.meshes.find(mesh=>mesh.name===name);
  assert.equal(mesh.primitives.length,1,name+' draw count');
  const accessor=scene.accessors[mesh.primitives[0].attributes.POSITION];
  const view=scene.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType,5126);
  const start=(view.byteOffset??0)+(accessor.byteOffset??0);
  return Array.from({length:accessor.count},(_,i)=>{
    const p=start+i*(view.byteStride??12);
    return [binary.readFloatLE(p),binary.readFloatLE(p+4),binary.readFloatLE(p+8)];
  });
}
const close=(a,b)=>Math.abs(a-b)<.00015;
const hulls=[...vertices('Port hull'),...vertices('Starboard hull')];
const floor=Math.min(...hulls.map(p=>p[1]));
const halfBeam=Math.max(...hulls.map(p=>Math.abs(p[2])));
assert(close(2*halfBeam,2.41));
for(const [end,height] of [[-2.52,.6096],[2.52,.5969]]){
  const deck=Math.max(...hulls.filter(p=>close(p[0],end)).map(p=>p[1]));
  assert(close(deck-floor,height),'deck height at '+end);
}
const frame=vertices('Hobie trampoline frame');
// Confirm the centre post reaches the tension rod and both arms reach the front beam.
for(const [lateral,height] of [[0,.112],[0,.391],[-.995,.363],[.995,.363]]){
  assert(frame.some(p=>Math.abs(p[0]-(.44-.035*Math.abs(lateral)/1.02))<.022&&close(p[1],height)&&close(p[2],lateral)));
}
// At the mast the beam sweeps forward and rises above the two corner castings.
assert(frame.some(p=>close(p[0],.44)&&close(p[1],.493)&&close(p[2],0)));
for(const [x,bottom] of [[1.96,-.25766],[.018,-.37],[-1.829,-.19662]]){
  assert(close(Math.min(...hulls.filter(p=>close(p[0],x)).map(p=>p[1])),bottom),'rocker at '+x);
}
for(const x of [-1.40,.405]){
  for(const z of [-1.02,1.02]){
    const corner=frame.filter(p=>Math.abs(p[0]-x)<.10&&Math.abs(p[2]-z)<.10);
    // The elliptical upright has vertices at its two fore/aft extrema.
    // Find the lower ring and verify its axis also passes through the top ring.
    const foot=corner.find(p=>close(p[0],x+.053)&&close(p[2],z)&&p[1]<.32);
    assert(foot,'upright seated above the hull centreline');
    assert(corner.some(p=>close(p[0],x-.053)&&close(p[1],foot[1])&&close(p[2],z)));
    for(const dx of [-.054,.054]){
      assert(corner.some(p=>close(p[0],x+dx)&&close(p[1],.387)&&close(p[2],z)),'upright top over socket');
    }
    assert(frame.some(p=>close(p[0],x)&&close(p[2],Math.sign(z)*1.075)),'crossbeam overhang');
  }
}
console.log('Verified Hobie hull profile, upright pylons, crowned beam and dolphin striker.');
