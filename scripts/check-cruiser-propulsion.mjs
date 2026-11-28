// Validate the Modelica propulsion component and the coupled cruiser in calm water.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const [runtime='build/pages/motorboat',component='build/propulsion-browser']=process.argv.slice(2);
const fileResponse=async url=>new Response(await readFile(url));
const componentURL=pathToFileURL(resolve(component,'instance.mjs'));
const {loadInstance}=await import(componentURL);

async function flow({rpm=0,ahead=0,sway=0,helm=0,depth=.7,stock}){
  const field=await loadInstance('CruiserPropulsion',{
    ...(stock && {rudderStock:stock}),shaftRevolutions:rpm/60,helm,propellerInflow:[ahead,sway,0],
    rudderInflow:[ahead,sway,0],upInBody:[0,0,1],propellerDepth:depth,rudderDepth:depth
  },fileResponse);
  for(let i=0;i<100;i++)field.advance(.02);
  const output={
    rpm,ahead,sway,helm,depth,advance:field.get('axialAdvance'),j:field.get('advanceCoefficient'),
    validJ:field.get('advanceCoefficientValid'),
    thrust:field.get('propellerThrust'),torque:field.get('shaftTorque'),power:field.get('shaftPower'),
    induction:field.get('diskInduction'),wash:field.get('slipstreamAtRudder'),washFraction:field.get('rudderWashFraction'),
    angle:field.get('rudderAngle'),propellerForce:field.get('propellerForce'),rudderForce:field.get('rudderForce'),
    propellerWetFraction:field.get('propellerWetFraction'),rudderWetFraction:field.get('rudderWetFraction')
  };
  assert(Object.values(output).flat().every(Number.isFinite));
  assert(Math.abs(output.power-2*Math.PI*rpm/60*output.torque)<1e-7);
  return output;
}
const bollard=await flow({rpm:1750,helm:1});
const offAxis=await flow({rpm:1750,helm:1,stock:[-3.50,.40,-.89]});
assert.equal(offAxis.washFraction,0,'A rudder outside the jet should feel no prop wash');
assert.equal(Math.abs(offAxis.rudderForce[1]),0);
const furtherAft=await flow({rpm:1750,helm:1,stock:[-3.80,0,-.89]});
assert(furtherAft.wash>bollard.wash && furtherAft.wash<2*bollard.induction,
  'Axial induction should grow toward the far-wake limit');
const starboard=await flow({rpm:1750,helm:-1});
const ahead=await flow({rpm:1750,ahead:6.8,helm:1});
const astern=await flow({rpm:-1100,ahead:-2.5,helm:1});
const drifting=await flow({ahead:5,helm:1});
const stopped=await flow({helm:1});
const dry=await flow({rpm:1750,depth:-.3,helm:1});
const halfImmersed=await flow({rpm:1750,depth:0,helm:1});
const crossFlow=await flow({ahead:5,sway:1});
assert(bollard.j===0&&bollard.validJ===1&&bollard.thrust>14000&&bollard.thrust<16000&&bollard.torque>850);
assert(bollard.wash>5&&bollard.washFraction>0&&bollard.washFraction<1&&bollard.rudderForce[1]<-1000);
for(const run of [bollard,ahead,halfImmersed]){
  const diskArea=Math.PI*.46**2/4*run.propellerWetFraction;
  const momentumFlux=2*1025*diskArea*(run.advance+run.induction)*run.induction;
  assert(Math.abs(momentumFlux-run.thrust)<1e-7,'Ahead disk momentum must reproduce the shaft thrust');
}
assert(starboard.rudderForce[1]>1000&&Math.abs(bollard.rudderForce[1]+starboard.rudderForce[1])<1e-8);
assert(ahead.j>.4&&ahead.j<.5&&ahead.thrust>0&&ahead.thrust<bollard.thrust&&ahead.torque<bollard.torque);
assert(astern.thrust<0&&astern.torque<0&&astern.power>0&&astern.wash===0&&astern.rudderForce[1]>0);
assert(drifting.thrust===0&&drifting.torque===0&&drifting.wash===0&&drifting.washFraction===0&&drifting.validJ===0);
assert(drifting.propellerForce[0]<0&&drifting.rudderForce[1]<0);
assert(stopped.rudderForce.every(force=>force===0)&&dry.thrust===0&&dry.rudderForce.every(force=>force===0));
assert(halfImmersed.propellerWetFraction===.5&&Math.abs(halfImmersed.thrust/bollard.thrust-.5)<1e-8);
assert(Math.abs(halfImmersed.rudderWetFraction-.5)<1e-8&&crossFlow.rudderForce[1]<0);
console.log(JSON.stringify({component:{bollard,starboard,ahead,astern,drifting,stopped,dry,halfImmersed,crossFlow}}));

const base=pathToFileURL(resolve(runtime)+'/');
const read=async name=>JSON.parse(await readFile(new URL(name,base)));
const index=await read((await read('manifest.json')).index);
assert.equal(index.modelName,'OceanMotorboat');
const outputNames=['engine[1]','engine[2]','engine[3]','engine[4]','starterRemaining','yawRate',
  'propellerWetFraction','propulsorLoads[1,2]','propulsorLoads[2,2]',
  'propulsorLoads[1,4]','propulsorLoads[2,4]','propulsorLoads[1,5]','propulsorLoads[2,5]'];
async function cruise(throttle){
  const fmu=await openFmuSession({index,base,fetch:fileFetch,
    parameters:{initialEast:-120,initialNorth:-80,initialHeading:Math.PI}});
  try{
    const set=values=>fmu.set_inputs(JSON.stringify(Object.entries(values)));
    const mounts=fmu.bind_outputs(JSON.stringify([1,2,3,4,5].map(i=>'driveGeometry['+i+']')));
    assert.deepEqual(Array.from(fmu.read_bound(mounts)),[.40,.58,-3.74,-.84,.37]);
    const get=fmu.bind_outputs(JSON.stringify(outputNames));
    const step=(count,dt)=>{for(let i=0;i<count;i++)fmu.step(dt);};
    const observe=()=>Array.from(fmu.read_bound(get));
    set({seaState:0,windSpeed:0,omitWake:1,throttleLever:throttle});
    step(8,.05);
    const starting=observe();
    assert(starting[4]>.52&&starting[4]<.67&&starting[2]===0,'The cold starter must hold thrust for one second');
    step(740,.05);
    const straight=observe();
    assert(straight.every(Number.isFinite));
    assert(straight[1]>0&&Math.sign(straight[0])===Math.sign(throttle)&&Math.sign(straight[2])===Math.sign(throttle));
    assert(straight[6]===1&&straight[7]>.5&&straight[8]<-.5);
    assert.equal(Math.sign(straight[9]),Math.sign(throttle));
    assert(Math.abs(straight[9]-straight[10])<.01&&Math.abs(straight[5])<.08);
    set({helmLever:1});
    step(40,.05);
    const turning=observe();
    assert(turning[3]<-.40&&Math.sign(turning[5])===Math.sign(throttle));
    assert.equal(Math.sign(turning[11]),-Math.sign(throttle));
    assert.equal(Math.sign(turning[12]),-Math.sign(throttle));
    set({helmLever:0,throttleLever:0});
    step(120,.05);
    const coasting=observe();
    assert(Math.abs(coasting[0])<3&&Math.abs(coasting[2])<30&&coasting[1]<straight[1]);
    set({throttleLever:throttle});
    step(1,.05);
    assert(observe()[4]===0,'Throttle applied within the idle window should keep the engine warm');
    set({throttleLever:0});
    step(202,.05);
    set({throttleLever:throttle});
    step(4,.05);
    const restarted=observe();
    assert(restarted[4]>.70&&restarted[2]===0,'The starter should be required after ten seconds of neutral');
    return {straight,turning,coasting,restarted};
  }finally{fmu.free();}
}
const goingAhead=await cruise(1);
const backing=await cruise(-1);
assert(goingAhead.straight[1]/.44704>=47&&goingAhead.straight[1]/.44704<=49.5);
assert(backing.straight[1]>1&&backing.straight[1]<5);
console.log(JSON.stringify({coupled:{fields:outputNames,goingAhead,backing}}));
