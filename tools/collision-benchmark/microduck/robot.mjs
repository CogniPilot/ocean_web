// Export the MJCF articulated tree, retaining the measured link inertias, mounts and axes.
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
const [site,out]=process.argv.slice(2);
const raw=readFileSync(join(site,'robot.xml'),'utf8').replace(/<!--[\s\S]*?-->/g,'');
const world=raw.match(/<worldbody>([\s\S]+?)<\/worldbody>/)[1];
const tags=[...world.matchAll(/<\/?body\b[^>]*>|<inertial\b[^>]+>|<freejoint\b[^>]+>|<joint\b[^>]+>|<site\b[^>]+>/g)];
const tree=tags.map(([s])=>{
  if(s.startsWith('<site') && !/<site[^>]*name="(left|right)_foot"/.test(s)) return '';
  return s.replace(/ (?:class|childclass|group)="[^"]+"/g,'').replace(/ range="[^"]+"/g,'');
}).join('\n');
writeFileSync(join(out,'duck.xml'),`<mujoco><compiler angle="radian" alignfree="false"/>
<option gravity="0 0 -9.80665"><flag contact="disable"/></option>
<default><joint armature=".001573222677933975"/></default><worldbody>
<geom name="plane" type="plane" size="1 1 .01"/><geom name="probe" type="sphere" size=".003"/>
${tree}</worldbody></mujoco>`);
const {frames}=JSON.parse(readFileSync(join(site,'recordings/pretrained-walk.json')));
const rows=frames.map(f=>{
  const q=f.bodies[0];
  const hinges=[1,2,3,4,5,6,7,8,9,11,12,13,14,15];
  return [...q.position,...q.rotation,...['jointPosition','jointVelocity','motorTorque'].flatMap(name=>hinges.map(i=>f.outputs[`${name}[${i}]`]))].join(' ');
});
writeFileSync(join(out,'controls.txt'),rows.join('\n')+'\n');
// Newton's native collision pipeline consumes physical sole spheres, one per corner.
if (process.env.NEWTON_MJCF) {
  const withFeet = tree.replace(/<site[^>]+name="(left|right)_foot"[^>]*\/>/g, (_, side) => {
    const sign = side === 'left' ? -1 : 1;
    return [-.035,.035].flatMap(x => [-.020,.020].map(y =>
      `<geom type="sphere" name="${side}_${x}_${y}" size=".003" pos="${sign*x} -.0238146 ${-.0140852-sign*y}"/>`
    )).join('\n');
  });
  // Put the free joint at the world origin so the recorded root poses are absolute.
  const atOrigin = withFeet.replace(/(<body name="trunk_base" pos=")[^"]+/, (_, prefix) => prefix + '0 0 0');
  writeFileSync(process.env.NEWTON_MJCF,`<mujoco><compiler angle="radian" alignfree="false"/>
<option gravity="0 0 -9.80665"/><default><joint armature=".001573222677933975"/></default>
<worldbody>${atOrigin}</worldbody></mujoco>`);
}
