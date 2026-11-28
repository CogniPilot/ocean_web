// Fully immersed, neutral-volume floating tree from DiverTree.forwardDynamics.
// The harness supplies the wet site wrenches, dry weight and joint efforts.
import {writeFileSync} from 'node:fs';

const mass = 55.6;
const volume = mass / 1025;
const vest = .003, head = .0056, cylinder = .0135;
const trunk = volume - vest - head - cylinder;
const com = [(trunk*.135 + head*.55 + cylinder*.05 + vest*.055)/volume, 0,
  (head*.03 + cylinder*.24 + vest*.13)/volume - .003];
function inertial(dryMass, center, moments) {
  // DiverTree adds translational entrained water; its centre inertia stays dry.
  return `<inertial pos="${center.join(' ')}" mass="${dryMass*(1+17/88)}" diaginertia="${moments}"/>`;
}
function side(s) {
  const suffix = s > 0 ? 'left' : 'right';
  const joint = (name, axis, armature) =>
    `<joint name="${name}_${suffix}" axis="${axis}" armature="${armature}"/>`;
  return `
    <body name="thigh_${suffix}" pos="-.2088 ${s*.114305} .036">
      ${joint('sweep','0 0 -1',.35)} ${joint('hip','0 1 0',.65)} ${joint('twist','-1 0 0',.12)}
      ${inertial(7.5,[-.195,0,0],'.027 .129 .129')}
      <body name="shank_${suffix}" pos="-.4288 0 0">
        ${joint('knee','0 1 0',.30)} ${inertial(3.5,[-.205,0,0],'.009 .070 .070')}
        <body name="fin_${suffix}" pos="-.458788 0 0" quat=".7071067811865476 0 -.7071067811865476 0">
          ${joint('ankle','0 1 0',.11)} ${joint('cant','-1 0 0',.09)}
          ${inertial(1.55,[-.115,0,0],'.009 .049 .052')}
        </body>
      </body>
    </body>
    <body name="upper_arm_${suffix}" pos=".25 ${s*.24} -.045">
      ${joint('shoulder',`0 0 ${-s}`,.15)} ${inertial(2,[-.115,0,0],'.004 .015 .015')}
      <body name="forearm_${suffix}" pos="-.25 0 0">
        ${joint('elbow',`0 ${s} 0`,.08)} ${joint('pronation',`${-s} 0 0`,.025)}
        ${inertial(1.65,[-.125,0,0],'.004 .017 .017')}
      </body>
    </body>`;
}
writeFileSync(process.argv[2], `<mujoco model="SubmergedDiver">
  <compiler angle="radian" alignfree="false"/>
  <option timestep=".005" gravity="0 0 0"><flag contact="disable"/></option>
  <worldbody><body name="trunk" pos="0 0 -10"><freejoint/>
    ${inertial(mass,com,'1.6 3.9 4.2')}${side(1)}${side(-1)}
  </body></worldbody>
</mujoco>\n`);
