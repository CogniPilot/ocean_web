import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {physicsView,sampleAirflow} from '../viewer/physics-view.mjs';

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
const probe=await loadInstance('AirflowProbe',{},read);
const geometry={
  traffic:rows,hubs:drone.get('aircraft.rotorGeometry.positionBodyFlu_m'),
  parameters:drone.getMany(['aircraft.thrustCoefficient_N_s2','aircraft.hoverRotorSpeed_rad_s','aircraft.omegaMax','propellerRadius'])
};
const grid=sampleAirflow(probe,[east,north,up],[0,0,0],{rotors:geometry});
const index=(x,y,z)=>3*((z*7+y)*7+x);
const center=index(3,3,5);
assert.deepEqual(grid.dimensions,[7,7,7]);
assert(Math.abs(grid.points[index(4,3,5)]-east-.18)<1e-9);
assert(Math.abs(grid.points[index(3,3,4)+2]-up+.125)<1e-9);
assert.deepEqual(grid.velocity.slice(center,center+3),centered.wind,'Airflow volume must agree with the aircraft center sample');
assert.equal(grid.velocity[index(3,3,6)+2],0,'No rotor wake above the source');
assert(grid.velocity[index(6,3,5)+2]>centered.wind[2]&&grid.velocity[index(3,6,5)+2]>centered.wind[2]);
const own=sampleAirflow(probe,[east,north,up],[0,0,0],{rotors:{
  ...geometry,traffic:new Float64Array(48),source:[1,east,north,up,1,0,0,0,800,800,800,800]
}});
assert(Math.abs(own.thrust-4*geometry.parameters[0]*800**2)<1e-8);
assert(own.velocity[index(3,3,3)+2]<-4);
assert.equal(own.velocity[index(3,3,6)+2],0);
const T=createRequire(import.meta.url)('../viewer/vendor/three.min.js');
const strokes=new Set(),noop=()=>{};
const ink={setTransform:noop,clearRect:noop,beginPath:noop,moveTo:noop,lineTo:noop,arc:noop,fill:noop,
  stroke(){strokes.add(this.strokeStyle);}};
const canvas={clientWidth:440,clientHeight:820,getContext:()=>ink},status={};
const camera=new T.PerspectiveCamera(55,canvas.clientWidth/canvas.clientHeight,.02,100);
camera.position.set(east+3,north+3,up+1);camera.lookAt(east,north,up-1);
globalThis.devicePixelRatio=1;
physicsView(T,canvas,status).draw(camera,{group:new T.Group(),airflow:{...own,anchor:own.position,previous:grid,blend:.8}},{});
assert(strokes.has('#ffc281'),'The 3D overlay must draw the downwash arrows');
assert(status.textContent.includes('3D rotor wake'));
advance(drone,60);
advance(clear,60);
assert(drone.get('position')[2]<clear.get('position')[2]-.04,'Downwash must change flight dynamics');
drone.set('rotorWakeTraffic',new Float64Array(48));
assert.deepEqual(drone.get('rotorWakeWrench'),[0,0,0,0,0,0]);
console.log({centered,edge,far,altitudeLoss:clear.get('position')[2]-drone.get('position')[2]});
