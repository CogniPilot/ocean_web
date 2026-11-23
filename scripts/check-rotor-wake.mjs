import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const initial={stationEast:-5,stationNorth:0,windENU:[0,0,0]};
const [drone,clear]=await Promise.all([loadInstance('Rdd2Survey',initial,read),loadInstance('Rdd2Survey',initial,read)]);
function advance(aircraft,ticks){
  for(let i=0;i<ticks;i++)aircraft.advance(.005);
}
advance(drone,400);
advance(clear,400);
const [east,north,up]=drone.get('position');
const rows=new Float64Array(48);
function wash({offset=0,height=1,speed=800,type=1,orientation=[1,0,0,0]}={}){
  rows.set([type,east,north+offset,up+height,...orientation,speed,speed,speed,speed]);
  drone.set('rotorWakeTraffic',rows);
  const [wind,wrench]=drone.getMany(['rotorWakeWind','rotorWakeWrench']);
  return {wind,wrench};
}
const centered=wash(),edge=wash({offset:.3}),oppositeEdge=wash({offset:-.3}),far=wash({height:5});
assert(centered.wind[2]<-4 && centered.wrench[2]<-2);
assert(Math.abs(centered.wrench[3])<.01);
assert(edge.wrench[3]<-.08 && oppositeEdge.wrench[3]>.08);
assert(far.wrench[2]>centered.wrench[2] && far.wrench[2]<-.5);
assert.deepEqual(wash({height:-1}).wind,[0,0,0]);
assert.deepEqual(wash({offset:5}).wind,[0,0,0]);
assert.deepEqual(wash({speed:0}).wind,[0,0,0]);
assert(wash({speed:400}).wind[2]>centered.wind[2]);
assert(wash({speed:0,type:2}).wind[2]<-4);
assert(wash({orientation:[Math.cos(.2),Math.sin(.2),0,0]}).wind[1]>0);
wash();
advance(drone,60);
advance(clear,60);
assert(drone.get('position')[2]<clear.get('position')[2]-.04,'Downwash must change flight dynamics');
drone.set('rotorWakeTraffic',new Float64Array(48));
assert.deepEqual(drone.get('rotorWakeWrench'),[0,0,0,0,0,0]);
console.log({centered,edge,far,altitudeLoss:clear.get('position')[2]-drone.get('position')[2]});
