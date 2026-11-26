import {createPlayablePolicy} from './live-policy-actor.mjs';
import {getAppliedPolicy} from './live-training-tasks.mjs';
import {submarineTask} from './vehicle-training-tasks.mjs';
import {legacyFloodFraction,floodedMass,legacyFloodHeave} from './piccard-flood.mjs';
import {wreckApproach} from './red-sea-sites.mjs';
import {showInLowWaterCapture} from './render-layers.mjs';
import {vehicleShell} from './vehicle-assets.mjs';
import {imagingSonar} from './imaging-sonar.mjs';
import {sonarMap} from './sonar-map.mjs';

// Four 22.5-degree bottom-track beams in the order published by Wreck.Perception.
export function dopplerDisplay(T,vehicle){
  const group=new T.Group();
  group.name='Piccard DVL beams and returns';group.visible=false;
  group.position.set(0,0,-.075);
  vehicle.add(group);
  const lines=new Float32Array(24),geometry=new T.BufferGeometry();
  const positions=new T.BufferAttribute(lines,3).setUsage(T.DynamicDrawUsage);geometry.setAttribute('position',positions);
  const beams=new T.LineSegments(geometry,new T.LineBasicMaterial({color:0x63d5d6,transparent:true,opacity:.65}));
  beams.frustumCulled=false;beams.layers.set(3);group.add(beams);
  const spot=new T.SphereGeometry(.035,8,6),material=new T.MeshBasicMaterial({color:0xffcf75});
  const returns=Array.from({length:4},()=>{const hit=new T.Mesh(spot,material);hit.layers.set(3);group.add(hit);return hit;});
  const tilt=Math.PI/8;
  const directions=[0,Math.PI,Math.PI/2,-Math.PI/2].map(bearing=>
    new T.Vector3(Math.sin(tilt)*Math.cos(bearing),Math.sin(tilt)*Math.sin(bearing),-Math.cos(tilt)));
  const lengths=new Float64Array(4).fill(.35),targets=lengths.slice();
  let acquired,lastDraw;
  return {
    acquire(sensor){
      if(!sensor||sensor===acquired)return;
      acquired=sensor;
      for(let i=0;i<4;i++){
        const range=sensor[4+i],hit=range>0;
        targets[i]=hit?range:.35;
        returns[i].visible=hit;
      }
    },
    draw(visible,now=performance.now()){
      group.visible=Boolean(visible&&acquired);
      if(!group.visible){lastDraw=undefined;return;}
      // Blend measured slant ranges along the fixed body-frame directions.
      const fraction=lastDraw===undefined?1:1-Math.exp(-(now-lastDraw)/85);
      for(let i=0;i<4;i++){
        lengths[i]+=(targets[i]-lengths[i])*fraction;
        returns[i].position.copy(directions[i]).multiplyScalar(lengths[i]).toArray(lines,6*i+3);
      }
      positions.needsUpdate=true;lastDraw=now;
    }
  };
}

// The FPV camera is fixed to the hull. Positive FLU pitch points the bow down.
export function piccardAim(){
  let trim=0,previousMode,last;
  return {
    update(mode,axis,now,enabled){
      if(!enabled||mode!==previousMode){trim=0;last=now;}
      previousMode=enabled?mode:undefined;
      const dt=last===undefined?0:Math.max(0,Math.min(.1,(now-last)/1000));
      last=now;
      if(!enabled)return 0;
      const noseDown=axis('AimDown','AimUp');
      if(mode===2)return noseDown;
      trim=Math.max(-1,Math.min(1,trim+dt*.8*noseDown));
      return trim;
    }
  };
}

export function submarinePilot(axis,mode=0,pitchCommand=0,fastTravel=false){
  const position=mode===0||mode===3;
  const travel=(a,b,gain)=>fastTravel?gain*axis(a,b,1):axis(a,b);
  const surge=travel('ArrowUp','ArrowDown',1.2),port=travel('ArrowLeft','ArrowRight',2);
  // Full keyboard or touch deflection requests a ten-second half turn.
  const heave=travel('KeyW','KeyS',2),yaw=Math.PI/10*axis('KeyA','KeyD');
  return {pilot:[surge,position ? .35*port : 0,yaw,heave],
    attitude:[position?0:axis('ArrowRight','ArrowLeft'),pitchCommand]};
}

export function submarine(T,scene,world,signal,spawn=wreckApproach()){
  const mesh=surveyVehicle(T,vehicleShell('survey-pressure-housing'));scene.add(mesh);
  mesh.position.fromArray(spawn.position);mesh.rotation.z=spawn.heading;
  mesh.traverse(part=>{if(part.isMesh)showInLowWaterCapture(part);});
  const bubbles=bubbleWake(T,scene,mesh,showInLowWaterCapture), map=sonarMap(T,scene);
  const doppler=dopplerDisplay(T,mesh);
  const drawPing=imagingSonar(document.getElementById('sonarFan'));
  let worker,breached=false,legacyFraction=0,hasFloodPhysics=world?.hasSubFlood??false,isolatedBattery;
  const aim=piccardAim(),swimPolicy=createPlayablePolicy(submarineTask);
  let pitchCommand=0;
  let frame,displayedMap,busy=false,error,previous=0,submittedTime=0,completedTime=0;
  const fromPosition=new T.Vector3(),toPosition=new T.Vector3();
  const fromAttitude=new T.Quaternion(),toAttitude=new T.Quaternion();
  let receivedAt=0,blendMs=1,fromTime=0,shownTime=0,waitingForRelease=false;
  function receive(data){
    busy=false;
    if(data.error){error=data.error;return;}
    completedTime=Math.max(completedTime,submittedTime);
    if(data.flood){hasFloodPhysics=true;breached ||= data.flood[0]>.5;}
    if(breached){
      if(!hasFloodPhysics){
        data.flood=[1,legacyFraction,floodedMass(legacyFraction),0];
        data.rpm=Array(6).fill(0);
        data.thrust=Array(6).fill(0);
        data.cavitation=Array(6).fill(0);
        if(isolatedBattery)data.battery=isolatedBattery;
      }
      // Preserve the last fix used by the map and peer. Powered instruments
      // stop producing new measurements when the vehicle bus opens.
      data.estimate=frame?.estimate??data.estimate;
      data.image=undefined;data.features=undefined;data.dvl=undefined;data.ping=undefined;
      data.mapRows=undefined;
    }
    if(data.mapRows)map.update(data.mapRows);
    const now=performance.now();
    fromPosition.copy(mesh.position);fromAttitude.copy(mesh.quaternion);fromTime=shownTime;
    if(data.hoistCommand===-1)waitingForRelease=false;
    if(!waitingForRelease){
      toPosition.fromArray(data.position);
      const [w,x,y,z]=data.q;toAttitude.set(x,y,z,w);
    }
    doppler.acquire(data.dvl);
    blendMs=frame?Math.max(16,Math.min(800,now-receivedAt)):1;
    // The plant publishes poses between camera acquisitions. Retain the last
    // sensor frame until the navigation clock supplies the next image.
    if(!breached){
      if(frame && !data.image){data.image=frame.image;data.features=frame.features;}
      data.dvl??=frame?.dvl;
      data.ping??=frame?.ping;
    }
    data.estimate??=frame?.estimate;
    receivedAt=now;frame=data;
  };
  function startWorker(){
    worker=new Worker(new URL('./sub-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>receive(data);
    worker.onerror=e=>{error=e.message;busy=false;};
    (signal??window).addEventListener(signal?'abort':'pagehide',()=>worker.terminate(),{once:true});
  }
  return {peerCruisers:undefined,peerLiftStates:undefined,seatedOnLift:false,hoist:Array(8).fill(0),hoistUp:[0,0,1],hoistQuaternion:[0,0,0,0],hoistAngularVelocity:[0,0,0],manual:true,mode:0,active:false,mapVisible:false,mapGroup:map.group,get frame(){return frame;},get error(){return error;},mesh,
    get breached(){return breached;},
    get completedTime(){return completedTime;},
    get pitchCommand(){return pitchCommand;},
    get pitchLimit(){return world?.get('sub.pilotPitchLimit')??frame?.pitchLimit??Math.PI/4;},
    breach(){
      if(breached||this.seatedOnLift||this.hoist[0]>.5)return false;
      breached=true;
      if(frame?.battery){isolatedBattery=Array.from(frame.battery);isolatedBattery[2]=0;isolatedBattery[4]=0;}
      if(world?.hasSubFlood)world.set('subFlood',1);
      return true;
    },
    get releasePending(){return waitingForRelease;},
    writeHoist(){
      if(world?.hasSubHoist)world.set('subHoist',this.hoist);
      if(world?.hasSubHoistUp)world.set('subHoistUp',this.hoistUp);
      if(world?.hasHoistHandoff){
        world.set('subHoistQuaternion',this.hoistQuaternion);
        world.set('subHoistAngularVelocity',this.hoistAngularVelocity);
      }
    },
    releaseMount(){
      this.hoist[0]=-1;this.manual=true;this.seatedOnLift=false;
      waitingForRelease=!world||world.hasSubHoist;
      this.writeHoist();
      fromPosition.copy(mesh.position);toPosition.copy(mesh.position);
      fromAttitude.copy(mesh.quaternion);toAttitude.copy(mesh.quaternion);
    },
    drawDvl(show,now){doppler.draw(this.active&&!breached&&show,now);},
    update(time,axis,wind,bearing,showSonar,showDvl,surfaceAt,fastTravel=false){
      map.group.visible=this.active&&!breached&&this.mapVisible;
      showSonar=showSonar&&!breached;
      showDvl=showDvl&&!breached;
      // The RGB camera is rendered separately. Only mapping and survey guidance
      // consume the simulated optical frames and maintain the keyframe graph.
      // The boat owns motion while the sub is aboard. Measuring and viewing
      // remain independent of helm authority, including in the split runtime.
      const carried=this.seatedOnLift||this.hoist[0]>.5;
      const manual=breached||carried||this.manual;
      const driving=this.active&&this.manual&&!carried&&!breached;
      const mode=breached?2:this.mode;
      pitchCommand=aim.update(mode,axis,performance.now(),driving);
      this.writeHoist();
      const acquireSurvey=map.group.visible||!manual;
      world?.setSurveyView(acquireSurvey,showSonar,map.group.visible,showDvl);
      if(frame){
        if(showSonar)drawPing(frame.ping);
        const blend=Math.min(1,(performance.now()-receivedAt)/blendMs);
        mesh.position.lerpVectors(fromPosition,toPosition,blend);
        mesh.quaternion.slerpQuaternions(fromAttitude,toAttitude,blend);
        const interpolatedTime=fromTime+(frame.time-fromTime)*blend;
        bubbles(interpolatedTime-shownTime,frame.rpm,frame.cavitation,frame.flow,innerHeight,surfaceAt);
        shownTime=interpolatedTime;
      }
      // An unoccupied manual submarine in the split runtime has no commands.
      // Keep its local simulation clock parked, including across vehicle switches.
      if(!world && !this.active && this.manual){previous=time;completedTime=time;return;}
      if(error||busy||time<previous+.049)return;
      busy=true;
      let {pilot,attitude}=submarinePilot(driving?axis:()=>0,mode,pitchCommand,fastTravel);
      const checkpoint=driving&&mode===1?getAppliedPolicy('submarine'):null;
      const velocity=checkpoint&&(world?world.get('sub.velocity'):frame?.policyVelocity);
      const yawRate=checkpoint&&(world?world.get('sub.yawRate'):frame?.policyYawRate);
      if(velocity&&Number.isFinite(yawRate)){
        const controls={time:world?.time??frame.time,get:key=>key==='velocity'?velocity:yawRate,set:(_,value)=>{pilot=value;}};
        swimPolicy(controls,{surge:pilot[0],yaw:pilot[2],heave:pilot[3]},checkpoint);
      }else swimPolicy(null,null,null);
      if(breached&&!hasFloodPhysics){
        const depth=(surfaceAt?.(mesh.position.x,mesh.position.y)??0)-mesh.position.z;
        legacyFraction=legacyFloodFraction(legacyFraction,depth,time-previous);
        pilot[3]=legacyFloodHeave(floodedMass(legacyFraction));
      }
      if(world){
        previous=time;
        world.set('subManual',Number(manual));world.set('subPilot',pilot);
        if(world.hasSubMode){world.set('subMode',mode);world.set('subAttitudePilot',attitude);}
        const survey=world.get('sub.surveyTelemetry'),estimate=world.get('estimate');
        const rows=map.group.visible?world.get('keyframes'):undefined;
        receive({time,hoistCommand:world.appliedHoistCommand,position:world.get('sub.position'),q:world.get('sub.orientation'),rpm:world.get('sub.propellerRPM'),
          flood:world.get('subFloodState'),battery:world.get('sub.batteryTelemetry'),
          currentEnvironment:['tide','wind','bearing','tidalEast'].map(name=>world.get('sub.ocean.'+name)),
          cavitation:world.get('sub.cavitation'),flow:world.get('sub.current'),estimate,ping:world.get('ping'),dvl:world.get('sensor'),
          mapRows:rows!==displayedMap?rows:undefined,
          waypoint:survey[0],waypointCount:survey[1],surveyDone:survey[2]>.5,surveySite:survey[15]??0,thrust:survey.slice(3,9),buoyancy:survey.slice(9,12),contact:survey.slice(12,15),contactMoment:world.get('sub.contactMoment'),wetTorque:world.get('sub.wetTorque')});
        if(rows)displayedMap=rows;
        return;
      }
      if(!worker)startWorker();
      const steps=Math.min(20,Math.floor((time-previous)*100+1e-6));
      previous+=steps*.01;
      submittedTime=previous;
      worker.postMessage({spawn,policyObservation:Boolean(checkpoint),inspectLoads:this.inspectLoads,animalTraffic:this.animalTraffic,animalJoints:this.animalJoints,peerCruisers:this.peerCruisers,peerLiftStates:this.peerLiftStates,hoist:this.hoist,hoistUp:this.hoistUp,hoistQuaternion:this.hoistQuaternion,hoistAngularVelocity:this.hoistAngularVelocity,acquireSurvey,manual,pilot,mode,breached,attitude,wind,bearing,showSonar,steps});
    }};
}
