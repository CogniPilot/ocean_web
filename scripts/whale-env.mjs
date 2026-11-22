// Fixed-step, headless access to the same whale plant that advances on the harbor host.
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

export const stepSeconds=.01;
export const actionNames=['portFin','starboardFin','peduncle','flukeFeather','lateralScull'];
// Ground velocities are resolved along heading, up and to port. Angles use radians.
export const stateNames=[
  'east','north','height','forwardVelocity','upVelocity','pitch','pitchRate',
  'tailPitch','tailPitchRate','heading','yawRate','bank','bankRate','strokePhase',
  'portVelocity','flukeFeather','portFin','starboardFin'
];
const read=async url=>new Response(await readFile(url));
function vector(value,count,label){
  if(!value||value.length!==count||!Array.from(value).every(Number.isFinite))
    throw new RangeError(label+' needs '+count+' finite numbers');
  return Array.from(value);
}

export async function createWhaleEnvironment(options={}){
  let plant;
  function observe(){
    const [state,finLift,tailThrust,musclePower,contact]=plant.getMany([
      'swimmerState','whaleFinLift','tailForce','tailPower','whaleContact'
    ]);
    return {time:plant.time,state,finLift,tailThrust,musclePower,normalForce:contact[0],clearance:contact[1]};
  }
  // Fresh FMI instance clears all integrator and scheduled-event memory at time zero.
  async function reset({state,surface=0,current=[0,0]}=options){
    if(!Number.isFinite(surface))throw new RangeError('surface must be finite');
    const inputs={whaleDirect:1,localSurface:surface,currentVelocity:vector(current,2,'current')};
    if(state!==undefined)inputs.initialSwimmer=vector(state,stateNames.length,'state');
    plant=await loadInstance('HarborTraffic',inputs,read);
    return observe();
  }
  function step(action){
    const values=vector(action,actionNames.length,'action');
    if(values.some(v=>Math.abs(v)>1))throw new RangeError('actuators must be in [-1,1]');
    plant.set('whaleActuators',values);
    plant.advance(stepSeconds);
    return observe();
  }
  await reset(options);
  return {reset,step,observe};
}
