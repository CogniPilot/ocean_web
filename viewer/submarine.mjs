import {vehicleShell} from './vehicle-assets.mjs';
import {sonarMap} from './sonar-map.mjs';

export function submarine(T,scene,world){
  const mesh=surveyVehicle(T,vehicleShell('survey-pressure-housing'));scene.add(mesh);mesh.position.set(-5,0,-10);
  const bubbles=bubbleWake(T,scene,mesh), map=sonarMap(T,scene);
  const worker=world?null:new Worker(new URL('./sub-worker.mjs',import.meta.url),{type:'module'});
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
    blendMs=frame?Math.max(16,Math.min(800,now-receivedAt)):1;
    // The plant publishes poses between camera acquisitions. Retain the last
    // sensor frame until the navigation clock supplies the next image.
    if(frame && !data.image){data.image=frame.image;data.features=frame.features;}
    data.estimate??=frame?.estimate;
    receivedAt=now;frame=data;previous=data.time;
  };
  if(worker){
    worker.onmessage=({data})=>receive(data);
    worker.onerror=e=>{error=e.message;busy=false;};
    addEventListener('pagehide',()=>worker.terminate(),{once:true});
  }
  return {manual:true,active:false,mapVisible:false,get frame(){return frame;},get error(){return error;},mesh,
    update(time,axis,wind,bearing,showSensorImage){
      map.group.visible=this.active&&this.mapVisible;
      world?.setSurveyView(this.active,showSensorImage,map.group.visible);
      if(frame){
        const blend=Math.min(1,(performance.now()-receivedAt)/blendMs);
        mesh.position.lerpVectors(fromPosition,toPosition,blend);
        mesh.quaternion.slerpQuaternions(fromAttitude,toAttitude,blend);
        const interpolatedTime=fromTime+(frame.time-fromTime)*blend;
        bubbles(interpolatedTime-shownTime,frame.rpm,frame.cavitation,frame.flow,innerHeight);
        shownTime=interpolatedTime;
      }
      if(error||busy||time<previous+.049)return;
      busy=true;
      const pilot=this.active?[axis('KeyW','KeyS'),axis('KeyA','KeyD'),axis('KeyQ','KeyE'),axis('KeyR','KeyF')]:[0,0,0,0];
      if(world){
        world.set('subManual',Number(this.manual));world.set('subPilot',pilot);
        const survey=world.get('sub.surveyTelemetry'),estimate=world.get('estimate');
        const rows=map.group.visible?world.get('keyframes'):undefined;
        receive({time,position:world.get('sub.position'),q:world.get('sub.orientation'),rpm:world.get('sub.propellerRPM'),
          cavitation:world.get('sub.cavitation'),flow:world.get('sub.current'),estimate,image:world.get('image'),features:world.get('features'),
          mapRows:rows!==displayedMap?rows:undefined,
          waypoint:survey[0],waypointCount:survey[1],surveyDone:survey[2]>.5,thrust:survey.slice(3,10),buoyancy:survey.slice(10,13),contact:survey.slice(13,16)});
        if(rows)displayedMap=rows;
        return;
      }
      worker.postMessage({manual:this.manual,pilot,wind,bearing,showSensorImage,steps:Math.min(20,Math.floor((time-previous)*100+1e-6))});
    }};
}
