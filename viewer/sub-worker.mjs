import {loadHarborCurrent} from './harbor-current.mjs';
import {loadInstance} from './fmi3/instance.mjs?api=2';

// The acquisition clock and plant step both use simulation time. Sensor history
// belongs to this worker so a slow render never skips a navigation update.
let ready,transferPose,pendingContactPose,field;
const localFlow=new Float64Array(4),meanVelocity=localFlow.subarray(1);
const initialize=spawn=>Promise.all([
  loadInstance('Wreck_Plant',{manual:1,windSpeed:11,windDirection:.45,...(spawn?{spawnPosition:spawn.position,spawnVelocity:spawn.velocity,spawnHeading:spawn.heading}:{})}),
  loadInstance('Wreck_Navigation',{idleCamera:1,useSonar:0})
]).then(async ([plant,nav])=>{
  let updateScanContact;
  if(plant.has('scanConstraints')){
    const {loadWreckContacts,contactStepper,hoistTransferPose}=await import('./wreck-contact.mjs');
    transferPose=hoistTransferPose?.();
    updateScanContact=contactStepper(await loadWreckContacts(),
      ()=>plant.getMany(['position','orientation']),rows=>plant.set('scanConstraints',rows));
  }
  if(plant.has('mappedCurrent')){
    try{field=await loadHarborCurrent();}catch(error){console.warn('Using background water current',error);}
  }
  const pitchLimit=plant.has('pilotPitchLimit')?plant.get('pilotPitchLimit'):Math.PI/4;
  return [plant,nav,updateScanContact,pitchLimit];
});
let previousGyro=[0,0,0];
let tick=0, estimate, image, features, ping, dvl, sentPing;
let mapRows, mappedKeys=-1, closures=-1;
const blankImage=new Float64Array(864);
function acquire(plant,nav,acquireSurvey,showSonar){
  nav.set('stamp',tick*.01);
  if(nav.has('carrierFix')&&plant.has('carrierFix'))nav.set('carrierFix',plant.get('carrierFix'));
  const [position,orientation,velocity,yawRate,pressure,accel,gyro]=plant.getMany(
    ['position','orientation','velocity','yawRate','pressure','specificForce','gyroAngle']);
  const rates=gyro.map((value,i)=>(value-previousGyro[i])/.2);previousGyro=gyro;
  nav.set('truth',[...position,...orientation,...velocity,yawRate,pressure,...accel,...rates]);
  const names=['sensor','elev','estimate'];
  if(acquireSurvey)names.push('image','features','keyframes');
  if(showSonar)names.push('ping');
  const values=nav.getMany(names);
  const [sensor,ranges,pose]=values;
  estimate=pose;dvl=sensor;
  plant.set('sensor',sensor);plant.set('elevationRanges',ranges);
  if(plant.has('navigationUp')){
    plant.set('navigationUp',pose[2]);plant.set('navigationUpValid',1);
  }
  nav.set('prior',estimate);
  if(acquireSurvey){
    const [, , ,pixels,corners,history]=values;
    image=pixels;features=corners;
    nav.set('priorImage',pixels);nav.set('keyHistory',history);
    if(estimate[12]!==mappedKeys||estimate[13]!==closures){
      mappedKeys=estimate[12];closures=estimate[13];
      mapRows=Float32Array.from(history.slice(0,mappedKeys*180));
    }
  }else if(image){
    nav.set('priorImage',blankImage);image=undefined;features=undefined;
  }
  ping=showSonar?values.at(-1):undefined;
}
self.onmessage=async({data})=>{
  try{
    const [plant,nav,updateScanContact,pitchLimit]=await (ready??=initialize(data.spawn));
    if(data.peerLiftStates&&plant.has('peerLiftStates'))plant.set('peerLiftStates',data.peerLiftStates);
    if(data.animalTraffic&&plant.has('animalTraffic'))plant.set('animalTraffic',data.animalTraffic);
    if(data.animalJoints&&plant.has('animalJoints'))plant.set('animalJoints',data.animalJoints);
    if(data.peerCruisers&&plant.has('peerCruisers'))plant.set('peerCruisers',data.peerCruisers);
    if(plant.has('flood'))plant.set('flood',Number(data.breached));
    if(data.hoist)plant.set('hoist',data.hoist);
    if(data.hoistUp&&plant.has('hoistUp'))plant.set('hoistUp',data.hoistUp);
    if(data.hoistQuaternion&&plant.has('hoistQuaternion')){
      plant.set('hoistQuaternion',data.hoistQuaternion);
      plant.set('hoistAngularVelocity',data.hoistAngularVelocity);
      const pose=transferPose?.(data.hoist,data.hoistQuaternion);
      if(pose)pendingContactPose=pose;
    }
    plant.set('manual',Number(data.manual));plant.set('pilot',data.pilot);
    plant.set('manualMode',data.mode);plant.set('attitudePilot',data.attitude);
    const hasBallastTrim=plant.has('ballastTrim');
    if(hasBallastTrim)plant.set('ballastTrim',data.ballastTrim??-1);
    plant.set('windSpeed',data.wind);plant.set('windDirection',data.bearing);
    nav.set('idleCamera',Number(!data.acquireSurvey));nav.set('useSonar',Number(data.acquireSurvey||data.showSonar));
    const previousEstimate=estimate;
    for(let i=0;i<data.steps;i++){
      if(tick%20===0&&(!data.breached||!estimate))acquire(plant,nav,data.acquireSurvey,data.showSonar);
      if(field){
        localFlow[0]=Number(field.sample(plant.get('position'),meanVelocity));
        plant.set('mappedCurrent',localFlow);
      }
      if(updateScanContact)updateScanContact(pendingContactPose);
      pendingContactPose=undefined;
      plant.advance(.01);tick++;
    }
    const [survey,position,q,rpm,cavitation,flow,...currentEnvironment]=plant.getMany(
      ['surveyTelemetry','position','orientation','propellerRPM','cavitation','current','ocean.tide','ocean.wind','ocean.bearing','ocean.tidalEast']);
    self.postMessage({waypoint:survey[0],waypointCount:survey[1],surveyDone:survey[2]>.5,surveySite:survey[15]??0,
      thrust:survey.slice(3,9),buoyancy:survey.slice(9,12),contact:survey.slice(12,15),contactMoment:data.inspectLoads?plant.get('contactMoment'):undefined,wetTorque:data.inspectLoads?plant.get('wetTorque'):undefined,mapRows,
      ...(data.policyObservation?{policyVelocity:plant.get('velocity'),policyYawRate:plant.get('yawRate')}:{}),
      flood:plant.has('floodState')?plant.get('floodState'):undefined,
      battery:plant.has('batteryTelemetry')?plant.get('batteryTelemetry'):undefined,
      hasBallastTrim,tankLitres:hasBallastTrim?plant.get('tankLitres'):undefined,
      time:tick*.01,pitchLimit,position,q,rpm,cavitation,flow,currentEnvironment,hoistCommand:data.hoist?.[0],
      ...(previousEstimate!==estimate?{estimate,dvl}:{}),
      ...(data.showSonar && sentPing!==ping?{image,features,ping}:{})},mapRows?[mapRows.buffer]:[]);
    sentPing=data.showSonar?ping:undefined;
    mapRows=undefined;
  }catch(error){self.postMessage({error:error.message});}
};
