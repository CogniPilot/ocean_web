import {animalSticks} from './keyboard-sticks.mjs';
import {vehicleShell} from './vehicle-assets.mjs';
import {imagingSonar} from './imaging-sonar.mjs';
import {sonarMap} from './sonar-map.mjs';

// Four 22.5-degree bottom-track beams in the order published by Wreck.Perception.
export function dopplerDisplay(T,vehicle){
  const group=new T.Group();
  group.name='Piccard DVL beams and returns';group.visible=false;
  group.position.set(0,0,-.15);
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

export function submarinePilot(axis,mode=0){
  const {pitch,roll,yaw,throttle}=animalSticks(axis);
  return {pilot:[mode===0?pitch:0,0,yaw,throttle],
    attitude:mode===0?[0,0]:[roll,pitch]};
}

export function submarine(T,scene,world,signal){
  const mesh=surveyVehicle(T,vehicleShell('survey-pressure-housing'));scene.add(mesh);mesh.position.set(-5,0,-10);
  const bubbles=bubbleWake(T,scene,mesh), map=sonarMap(T,scene);
  const doppler=dopplerDisplay(T,mesh);
  const drawPing=imagingSonar(document.getElementById('sonarFan'));
  let worker;
  let frame,displayedMap,busy=false,error,previous=0;
  const fromPosition=new T.Vector3(),toPosition=new T.Vector3();
  const fromAttitude=new T.Quaternion(),toAttitude=new T.Quaternion();
  let receivedAt=0,blendMs=1,fromTime=0,shownTime=0;
  function receive(data){
    busy=false;
    if(data.error){error=data.error;return;}
    if(data.mapRows)map.update(data.mapRows);
    const now=performance.now();
    fromPosition.copy(mesh.position);fromAttitude.copy(mesh.quaternion);fromTime=shownTime;
    toPosition.fromArray(data.position);
    const [w,x,y,z]=data.q;toAttitude.set(x,y,z,w);
    doppler.acquire(data.dvl);
    blendMs=frame?Math.max(16,Math.min(800,now-receivedAt)):1;
    // The plant publishes poses between camera acquisitions. Retain the last
    // sensor frame until the navigation clock supplies the next image.
    if(frame && !data.image){data.image=frame.image;data.features=frame.features;}
    data.dvl??=frame?.dvl;
    data.ping??=frame?.ping;
    data.estimate??=frame?.estimate;
    receivedAt=now;frame=data;
  };
  function startWorker(){
    worker=new Worker(new URL('./sub-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>receive(data);
    worker.onerror=e=>{error=e.message;busy=false;};
    (signal??window).addEventListener(signal?'abort':'pagehide',()=>worker.terminate(),{once:true});
  }
  return {manual:true,mode:0,active:false,mapVisible:false,mapGroup:map.group,get frame(){return frame;},get error(){return error;},mesh,
    drawDvl(show,now){doppler.draw(this.active&&show,now);},
    update(time,axis,wind,bearing,showSensorImage,showDvl){
      map.group.visible=this.active&&this.mapVisible;
      world?.setSurveyView(this.active,showSensorImage,map.group.visible,showDvl);
      if(frame){
        if(showSensorImage)drawPing(frame.ping);
        const blend=Math.min(1,(performance.now()-receivedAt)/blendMs);
        mesh.position.lerpVectors(fromPosition,toPosition,blend);
        mesh.quaternion.slerpQuaternions(fromAttitude,toAttitude,blend);
        const interpolatedTime=fromTime+(frame.time-fromTime)*blend;
        bubbles(interpolatedTime-shownTime,frame.rpm,frame.cavitation,frame.flow,innerHeight);
        shownTime=interpolatedTime;
      }
      // An unoccupied manual submarine in the split runtime has no commands.
      // Keep its local simulation clock parked, including across vehicle switches.
      if(!world && !this.active && this.manual){previous=time;return;}
      if(error||busy||time<previous+.049)return;
      busy=true;
      const {pilot,attitude}=submarinePilot(this.active?axis:()=>0,this.mode);
      if(world){
        previous=time;
        world.set('subManual',Number(this.manual));world.set('subPilot',pilot);
        if(world.hasSubMode){world.set('subMode',this.mode);world.set('subAttitudePilot',attitude);}
        const survey=world.get('sub.surveyTelemetry'),estimate=world.get('estimate');
        const rows=map.group.visible?world.get('keyframes'):undefined;
        receive({time,position:world.get('sub.position'),q:world.get('sub.orientation'),rpm:world.get('sub.propellerRPM'),
          cavitation:world.get('sub.cavitation'),flow:world.get('sub.current'),estimate,ping:world.get('ping'),dvl:world.get('sensor'),
          mapRows:rows!==displayedMap?rows:undefined,
          waypoint:survey[0],waypointCount:survey[1],surveyDone:survey[2]>.5,thrust:survey.slice(3,9),buoyancy:survey.slice(9,12),contact:survey.slice(12,15)});
        if(rows)displayedMap=rows;
        return;
      }
      if(!worker)startWorker();
      const steps=Math.min(20,Math.floor((time-previous)*100+1e-6));
      previous+=steps*.01;
      worker.postMessage({active:this.active,manual:this.manual,pilot,mode:this.mode,attitude,wind,bearing,showSensorImage,steps});
    }};
}
