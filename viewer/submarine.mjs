import {pilotSticks} from './keyboard-sticks.mjs';
import {vehicleShell} from './vehicle-assets.mjs';
import {imagingSonar} from './imaging-sonar.mjs';
import {sonarMap} from './sonar-map.mjs';

// Four 22.5-degree bottom-track beams in the order published by Wreck.Perception.
export function dopplerDisplay(T,scene){
  const group=new T.Group(),origin=new T.Vector3(),direction=new T.Vector3();
  group.name='Piccard DVL beams and returns';group.visible=false;scene.add(group);
  const lines=new Float32Array(24),geometry=new T.BufferGeometry();
  const positions=new T.BufferAttribute(lines,3).setUsage(T.DynamicDrawUsage);geometry.setAttribute('position',positions);
  const beams=new T.LineSegments(geometry,new T.LineBasicMaterial({color:0x63d5d6,transparent:true,opacity:.65}));
  beams.frustumCulled=false;beams.layers.set(3);group.add(beams);
  const spot=new T.SphereGeometry(.035,8,6),material=new T.MeshBasicMaterial({color:0xffcf75});
  const returns=Array.from({length:4},()=>{const hit=new T.Mesh(spot,material);hit.layers.set(3);group.add(hit);return hit;});
  const endpoints=returns.map(()=>new T.Vector3()),heads=[0,Math.PI,Math.PI/2,-Math.PI/2],tilt=Math.PI/8;
  let acquired;
  return {
    acquire(sensor,position,quaternion){
      if(!sensor||sensor===acquired)return;
      acquired=sensor;origin.set(0,0,-.15).applyQuaternion(quaternion).add(position);
      heads.forEach((bearing,i)=>{
        const range=sensor[4+i];
        direction.set(Math.sin(tilt)*Math.cos(bearing),Math.sin(tilt)*Math.sin(bearing),-Math.cos(tilt)).applyQuaternion(quaternion);
        const end=endpoints[i].copy(origin).addScaledVector(direction,range>0?range:.35);
        returns[i].visible=range>0;returns[i].position.copy(end);
      });
    },
    draw(visible,mesh){
      group.visible=Boolean(visible&&acquired);
      if(!group.visible)return;
      origin.set(0,0,-.15).applyQuaternion(mesh.quaternion).add(mesh.position);
      endpoints.forEach((end,i)=>{origin.toArray(lines,i*6);end.toArray(lines,i*6+3);});
      positions.needsUpdate=true;
    }
  };
}

export function submarinePilot(axis){
  const stick=pilotSticks(axis);
  return [stick.pitch,-stick.roll,stick.yaw,stick.throttle];
}

export function submarine(T,scene,world){
  const mesh=surveyVehicle(T,vehicleShell('survey-pressure-housing'));scene.add(mesh);mesh.position.set(-5,0,-10);
  const bubbles=bubbleWake(T,scene,mesh), map=sonarMap(T,scene);
  const doppler=dopplerDisplay(T,scene);
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
    doppler.acquire(data.dvl,toPosition,toAttitude);
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
    addEventListener('pagehide',()=>worker.terminate(),{once:true});
  }
  return {manual:true,active:false,mapVisible:false,mapGroup:map.group,get frame(){return frame;},get error(){return error;},mesh,
    drawDvl(orbit){doppler.draw(this.active&&orbit,mesh);},
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
      const pilot=this.active?submarinePilot(axis):[0,0,0,0];
      if(world){
        previous=time;
        world.set('subManual',Number(this.manual));world.set('subPilot',pilot);
        const survey=world.get('sub.surveyTelemetry'),estimate=world.get('estimate');
        const rows=map.group.visible?world.get('keyframes'):undefined;
        receive({time,position:world.get('sub.position'),q:world.get('sub.orientation'),rpm:world.get('sub.propellerRPM'),
          cavitation:world.get('sub.cavitation'),flow:world.get('sub.current'),estimate,ping:world.get('ping'),dvl:world.get('sensor'),
          mapRows:rows!==displayedMap?rows:undefined,
          waypoint:survey[0],waypointCount:survey[1],surveyDone:survey[2]>.5,thrust:survey.slice(3,10),buoyancy:survey.slice(10,13),contact:survey.slice(13,16)});
        if(rows)displayedMap=rows;
        return;
      }
      if(!worker)startWorker();
      const steps=Math.min(20,Math.floor((time-previous)*100+1e-6));
      previous+=steps*.01;
      worker.postMessage({active:this.active,manual:this.manual,pilot,wind,bearing,showSensorImage,steps});
    }};
}
