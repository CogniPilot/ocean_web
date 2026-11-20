import {createRangeScan} from './range-scan.mjs';

export function submarine(T,scene,renderer,wreck){
  const mesh=surveyVehicle(T);scene.add(mesh);mesh.position.set(-5,0,-10);
  const bubbles=bubbleWake(T,scene,mesh);
  const worker=new Worker(new URL('./sub-worker.mjs',import.meta.url),{type:'module'});
  let frame,busy=false,scan,error,previous=0;
  worker.onmessage=({data})=>{
    if(data.scan){
      try{
        scan??=createRangeScan(T,renderer,wreck,data.beams);
        const ranges=scan(data.pos,data.q);worker.postMessage({ranges},[ranges.buffer]);
      }catch(e){error=e.message;worker.terminate();}
      return;
    }
    busy=false;
    if(data.error){error=data.error;return;}
    frame=data;mesh.position.fromArray(data.position);
    const [w,x,y,z]=data.q;mesh.quaternion.set(x,y,z,w);
    bubbles(data.time-previous,data.rpm,data.cavitation,data.flow,innerHeight);previous=data.time;
  };
  worker.onerror=e=>{error=e.message;busy=false;};
  addEventListener('pagehide',()=>worker.terminate(),{once:true});
  return {manual:false,active:false,get frame(){return frame;},get error(){return error;},mesh,
    update(time,keys,wind,bearing){
      if(error||busy||time<previous+.049)return;
      busy=true;
      const axis=(a,b)=>Number(keys.has(a))-Number(keys.has(b));
      const pilot=this.active?[axis('KeyW','KeyS'),axis('KeyA','KeyD'),axis('KeyQ','KeyE'),axis('KeyR','KeyF')]:[0,0,0,0];
      worker.postMessage({manual:this.manual,pilot,wind,bearing,steps:Math.min(20,Math.floor((time-previous)*100+1e-6))});
    }};
}
