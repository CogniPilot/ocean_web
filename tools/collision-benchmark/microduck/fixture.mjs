// Emit actual gait poses and inertial centre of mass in recorded world coordinates.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const site = join(process.argv[2], 'site');
const recording = readFileSync(join(site, 'recordings/pretrained-walk.json'));
if (createHash('sha256').update(recording).digest('hex') !== '67ed0e68c0a605a74d96033c860752725cab8c4ba210e26f1398013b1e6c3693') throw Error('unexpected gait recording');
const {frames} = JSON.parse(recording);
const robot = readFileSync(join(site, 'robot.xml'), 'utf8');
const bodies = [...robot.matchAll(/<inertial pos="([^"]+)" mass="([^"]+)"/g)]
  .map(([, pos, mass]) => ({mass: Number(mass), centre: pos.split(/\s+/).map(Number)}));
if (bodies.length !== 15) throw Error('unexpected MJCF link order');
const indices = [0,1,2];
const dot = (a,b) => a.reduce((s,x,i) => s+x*b[i],0);
const rotated = (r,p) => indices.map(i => dot(r.slice(i*3,i*3+3),p));
const add = (a,b) => a.map((x,i) => x+b[i]);
// The capture exports 15 body frames. Use the matching unsplit MJCF head inertia.
const mass = bodies.reduce((s,b) => s+b.mass,0);
console.log(frames.length,mass);
for (const [index,frame] of frames.entries()) {
  if (frame.bodies.length!==15 || Math.abs(frame.time-index*.02)>1e-8) throw Error('unexpected recording cadence');
  const centre=[0,0,0];
  for (const [i,body] of bodies.entries()) {
    const {rotation,position} = frame.bodies[i];
    const point = add(position,rotated(rotation,body.centre));
    for (const j of indices) centre[j] += point[j]*body.mass/mass;
  }
  const row=[frame.time,...centre];
  for (const [footIndex,sign] of [[5,-1],[14,1]]) {
    const {position,rotation} = frame.bodies[footIndex];
    const sole=add(position,rotated(rotation,[0,-.0238146,-.0140852]));
    row.push(...sole.map((v,i)=>v-centre[i]));
    // Sole x and y are signed foot x and -z. Their cross product is foot +y.
    for (const k of indices) row.push(sign*rotation[3*k],-sign*rotation[3*k+2],rotation[3*k+1]);
  }
  console.log(row.join(' '));
}
