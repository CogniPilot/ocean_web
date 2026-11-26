// Both engines receive the same dry joint offsets, principal inertias, and armatures.
// This freezes the 14-hinge variant so future additions to the live animal are explicit.
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.argv[2];
const volume = 55.6 / 1025;
const neutral = .003;
const trunk = volume - neutral - .0056 - .0135;
const torsoCom = [(trunk*.135+.0056*.55+.0135*.05+neutral*.055)/volume, 0,
  (.0056*.03+.0135*.24+neutral*.13)/volume-.003];
const zero = [0,0,0];
const bodies = [{parent:0, name:'trunk', mass:55.6, com:torsoCom, diag:[1.6,3.9,4.2], offset:zero}];
for (const side of [1,-1]) {
  const j = bodies.length;
  const add = (name,parent,offset,axis,armature,mass,com,diag) =>
    bodies.push({name:name+(side===1?'_left':'_right'),parent,offset,axis,armature,mass,com,diag});
  add('sweep',1,[-.208800,side*.114305,.036000],[0,0,-1],.35,0,zero,zero);
  add('thigh',j+1,zero,[0,1,0],.65,7.5,[-.195,0,0],[.027,.129,.129]);
  add('shank',j+2,[-.4288,0,0],[0,1,0],.30,3.5,[-.205,0,0],[.009,.070,.070]);
  add('ankle',j+3,[-.458788,0,0],[0,1,0],.11,0,zero,zero);
  add('fin',j+4,zero,[-1,0,0],.09,1.55,[-.115,0,0],[.009,.049,.052]);
  add('upper_arm',1,[.25,side*.24,-.045],[0,0,-side],.15,2,[-.115,0,0],[.004,.015,.015]);
  add('forearm',j+6,[-.25,0,0],[0,side,0],.08,1.65,[-.125,0,0],[.004,.017,.017]);
}
const hinge = b => `<joint name="${b.name}" axis="${b.axis.join(' ')}" armature="${b.armature}"/>`;
function bodyXml(index, prior = []) {
  const b = bodies[index];
  const children = bodies.map((c,i) => c.parent === index+1 ? i : -1).filter(i=>i>=0);
  if (b.mass === 0) {
    // Two ordered, co-located hinges with one downstream mass. MuJoCo supports
    // compound joints directly; no artificial mass on an intermediate frame.
    if (children.length !== 1 || bodies[children[0]].offset.some(x=>x!==0)) throw Error('Unpaired carrier');
    return bodyXml(children[0],[b]);
  }
  const offset = prior[0]?.offset ?? b.offset;
  return `<body name="${b.name}" pos="${offset.join(' ')}">
    ${index===0 ? '<freejoint/>' : [...prior,b].map(hinge).join('')}
    <inertial pos="${b.com.join(' ')}" mass="${b.mass}" diaginertia="${b.diag.join(' ')}"/>
    ${children.map(i=>bodyXml(i)).join('')}
  </body>`;
}
writeFileSync(join(dir,'diver.xml'),`<mujoco><compiler angle="radian" alignfree="false"/>
<option gravity="0 0 0"><flag contact="disable"/></option><worldbody>${bodyXml(0)}</worldbody></mujoco>`);
function inertia({mass,com:[x,y,z],diag}) {
  const cross = [[0,-z,y],[z,0,-x],[-y,x,0]];
  return Array.from({length:36},(_,i) => {
    const r = Math.floor(i/6), c = i%6;
    if (r<3 && c<3) return (r===c ? diag[r] : 0) + mass*cross[r].reduce((v,s,k)=>v+s*cross[c][k],0);
    if (r<3) return mass*cross[r][c-3];
    if (c<3) return mass*cross[c][r-3];
    return r===c ? mass : 0;
  });
}
const h = (name,values) => `static const double ${name}[] = {${values.flat(Infinity).join(',')}};\n`;
const funcs = readFileSync(join(dir,'DryDiverDynamics/sources/rmc_functions.c'),'utf8');
const kernel = [...funcs.matchAll(/RMC_API int (rumoca_scalar_pure_\d+)\([^{}]+\) \{([\s\S]*?)\n\}/g)]
  .find(m=>/out\s*\+\s*400\b/.test(m[2]) && /out\s*\+\s*420\b/.test(m[2]) && m[2].includes('in[9]'));
if (!kernel) throw Error('Cannot identify generated CRBA/RNEA kernel with matrix, bias and acceleration outputs');
writeFileSync(join(dir,'fixture.h'), `#define TREE_FORWARD ${kernel[1].replace('scalar_', '')}\n` +
  `static const int64_t parent[] = {${bodies.map(b=>b.parent).join(',')}};\n` + h('offset',bodies.slice(1).map(b=>b.offset)) +
  h('axis',bodies.slice(1).map(b=>b.axis)) + h('armature',bodies.slice(1).map(b=>b.armature)) +
  h('mount',bodies.slice(1).map(()=>[1,0,0,0,1,0,0,0,1])) + h('inertia',bodies.map(inertia)));
