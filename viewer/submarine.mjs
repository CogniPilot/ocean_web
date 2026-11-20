import {vehicleShell} from './vehicle-assets.mjs';
import {sonarMap} from './sonar-map.mjs';
import {createRangeScan} from './range-scan.mjs';

export function submarine(T,scene,renderer,wreck){
  const mesh=surveyVehicle(T,vehicleShell('survey-pressure-housing'));scene.add(mesh);mesh.position.set(-5,0,-10);
  const bubbles=bubbleWake(T,scene,mesh), map=sonarMap(T,scene);
  const worker=new Worker(new URL('./sub-worker.mjs',import.meta.url),{type:'module'});
  let frame,busy=false,scan,beams,error,previous=0;
  const fromPosition=new T.Vector3(),toPosition=new T.Vector3();
  const fromAttitude=new T.Quaternion(),toAttitude=new T.Quaternion();
  let receivedAt=0,blendMs=1,fromTime=0,shownTime=0;
  worker.onmessage=({data})=>{
    if(data.scan){
      try{
        beams??=data.beams;
        if(!renderer.capabilities.isWebGL2 || renderer.getContext().isContextLost()){
          worker.postMessage({scanResult:true});return;
        }
        scan??=createRangeScan(T,renderer,wreck,beams);
        const ranges=scan(data.pos,data.q);worker.postMessage({scanResult:true,ranges},[ranges.buffer]);
      }catch(e){error=e.message;worker.terminate();}
      return;
    }
    busy=false;
    if(data.error){error=data.error;return;}
    if(data.mapRows)map.update(data.mapRows);
    const now=performance.now();
    fromPosition.copy(mesh.position);fromAttitude.copy(mesh.quaternion);fromTime=shownTime;
    toPosition.fromArray(data.position);
    const [w,x,y,z]=data.q;toAttitude.set(x,y,z,w);
    blendMs=frame?Math.max(16,Math.min(800,now-receivedAt)):1;
    receivedAt=now;frame=data;previous=data.time;
  };
  worker.onerror=e=>{error=e.message;busy=false;};
  addEventListener('pagehide',()=>worker.terminate(),{once:true});
  return {manual:false,active:false,mapVisible:false,get frame(){return frame;},get error(){return error;},mesh,
    update(time,keys,wind,bearing){
      map.group.visible=this.active&&this.mapVisible;
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
      const axis=(a,b)=>Number(keys.has(a))-Number(keys.has(b));
      const pilot=this.active?[axis('KeyW','KeyS'),axis('KeyA','KeyD'),axis('KeyQ','KeyE'),axis('KeyR','KeyF')]:[0,0,0,0];
      worker.postMessage({manual:this.manual,pilot,wind,bearing,steps:Math.min(20,Math.floor((time-previous)*100+1e-6))});
    }};
}
