import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
for(const name of ['Sailboat','Hobie16']){
  async function sample(speed,height,peer=false){
    const traffic=new Float64Array(36);if(peer)traffic.set([1,-8.2,-6.8,-2.1,0,0,0,height,Number(name==='Hobie16')]);
    const b=await loadInstance(name,{launchSpeed:speed,launchHeight:height,traffic},read);
    return {wet:b.get('wetFoil'),skin:b.get('skinArea'),drag:b.get('skinDrag'),foil:b.get('foilAxial'),contact:b.get('peerForce')};
  }
  const forward=await sample(2,0),astern=await sample(-2,0),flying=await sample(2,2),bump=await sample(0,0,true);
  console.log(name,JSON.stringify({forward,astern,flying,bump:bump.contact}));
  assert(forward.drag<0&&astern.drag>0&&forward.skin>0);
  assert(forward.foil[1]<0&&astern.foil[1]>0);
  if (name === 'Hobie16') {
    const crossing = await loadInstance(name, {launchSpeed: 2, launchHeight: 0, launchHeading: 0, orbitalNorth: 1}, read);
    const sideForce = crossing.get('foilSide');
    for (const index of [0, 2]) {
      assert(forward.wet[index] > 0 && Math.abs(sideForce[index]) > 1);
      assert(Math.abs(forward.foil[index]) < 1e-9 && Math.abs(astern.foil[index]) < 1e-9);
    }
    async function hydrostatics(pitch,waveRoll){
      const boat=await loadInstance('Hobie16',{launchSpeed:0,launchHeight:.08,launchPitch:pitch,waveRoll},read);
      const [sections,buoyancy,pitchMoment,rollMoment]=boat.getMany(['sectionVolume','buoyancy','hullPitch','hullRoll']);
      const volume=sections.reduce((sum,v)=>sum+v,0);
      assert(Math.abs(buoyancy-1025*9.80665*volume)<1e-8);
      return {fore:-pitchMoment.reduce((sum,v)=>sum+v,0)/buoyancy,side:rollMoment.reduce((sum,v)=>sum+v,0)/buoyancy};
    }
    const [aft,bow,port,starboard]=await Promise.all([hydrostatics(-.09,0),hydrostatics(.09,0),hydrostatics(0,.1),hydrostatics(0,-.1)]);
    assert(bow.fore>aft.fore+.5,'Buoyancy should shift fore and aft with trim');
    assert(port.side>0 && starboard.side<0 && Math.abs(port.side+starboard.side)<1e-8);
    console.log('Hobie centre of buoyancy', {aft:aft.fore,bow:bow.fore,port:port.side,starboard:starboard.side});
  } else {
    assert(forward.foil[0] < 0 && astern.foil[0] > 0);
  }
  assert(flying.foil.every(v=>v===0)&&flying.skin===0&&flying.drag===0);
  assert(Math.hypot(...bump.contact)>1);
}
