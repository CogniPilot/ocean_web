import {createLandingTagDetector} from './landing-tags.mjs';
import {droneFlowKernel,flowProfiles} from './drone-flow.mjs';

export function placeDownCamera(T,eye,drone){
  const {position,quaternion}=drone;
  eye.position.set(.01,0,-.06).applyQuaternion(quaternion).add(position);
  eye.up.set(1,0,0).applyQuaternion(quaternion);
  const down=new T.Vector3(0,0,-1).applyQuaternion(quaternion);
  eye.lookAt(down.add(eye.position));
  eye.updateMatrixWorld();
}

function reader(renderer,width,height){
  const gl=renderer.getContext(),pixels=new Uint8Array(width*height*4);
  const buffer=renderer.capabilities.isWebGL2?gl.createBuffer():null;
  let fence;
  return {
    get busy(){return Boolean(fence);},
    read(target,done){
      if(!buffer){renderer.readRenderTargetPixels(target,0,0,width,height,pixels);done(pixels);return;}
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,buffer);
      try{
        gl.bufferData(gl.PIXEL_PACK_BUFFER,pixels.byteLength,gl.STREAM_READ);
        gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,0);
        fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
      }finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);}
      this.done=done;
    },
    poll(){
      if(!fence)return;
      const status=gl.clientWaitSync(fence,0,0);
      if(status===gl.TIMEOUT_EXPIRED)return;
      gl.deleteSync(fence);fence=null;
      if(status===gl.WAIT_FAILED)return;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER,buffer);
      try{gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,pixels);}
      finally{gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);}
      this.done(pixels);
    },
    dispose(){if(fence)gl.deleteSync(fence);if(buffer)gl.deleteBuffer(buffer);}
  };
}
function imageOutput(canvas){
  const ctx=canvas.getContext('2d'),stride=4*canvas.width;
  const image=ctx.createImageData(canvas.width,canvas.height);
  return (rgba,gray=false)=>{
    for(let y=0;y<canvas.height;y++)
      image.data.set(rgba.subarray(y*stride,(y+1)*stride),(canvas.height-1-y)*stride);
    if(gray)for(let i=0;i<image.data.length;i+=4){
      const luma=.2126*image.data[i]+.7152*image.data[i+1]+.0722*image.data[i+2];
      image.data[i]=image.data[i+1]=image.data[i+2]=luma;
    }
    ctx.putImageData(image,0,0);
    return ctx;
  };
}

export function droneSensors(T,renderer,{flowCanvas,padCanvas,render,rangeAt,tags,reportFlow,reportPad,reportRange}){
  const size=flowCanvas.width,visionSize=padCanvas.width;
  const target=(width,depthBuffer=true)=>new T.WebGLRenderTarget(width,width,{
    depthBuffer,minFilter:T.NearestFilter,magFilter:T.NearestFilter
  });
  const frames=[target(size),target(size)],vision=target(visionSize);
  const kernel=droneFlowKernel(T,renderer),layouts=new Map(tags.map(tag=>[tag.id,tag]));
  let tagDetector,disposed=false;
  createLandingTagDetector(visionSize,visionSize).then(detector=>{
    if(disposed)detector.dispose();else tagDetector=detector;
  }).catch(error=>console.warn('Landing tag detector unavailable',error));
  const flowRead=reader(renderer,kernel.grid,kernel.grid),rawRead=reader(renderer,size,size);
  const padRead=reader(renderer,visionSize,visionSize);
  const showFlow=imageOutput(flowCanvas),showPad=imageOutput(padCanvas);
  const flowEye=new T.PerspectiveCamera(42,1,.015,300),padEye=new T.PerspectiveCamera(95,1,.015,300);
  const point=new T.Vector3(),direction=new T.Vector3(),laserOrigin=new T.Vector3(),vertical=new T.Vector3(0,0,-1);
  let next=0,lastFlow,lastVision=-Infinity,lastProfile,previousPad=null,padLock=null,lastRange=-Infinity,altimeter;
  function laserSample(drone){
    // The receiver matrix sees a wider field, but the 850 nm emitter
    // illuminates roughly two degrees. Sample the center and beam edges.
    laserOrigin.set(.025,0,-.06).applyQuaternion(drone.quaternion).add(drone.position);
    const readings=[];
    for(const [x,y] of [[0,0],[.01745,0],[-.01745,0],[0,.01745],[0,-.01745]]){
      direction.set(x,y,-1).normalize().applyQuaternion(drone.quaternion);
      const hit=rangeAt(laserOrigin,direction,true);
      if(hit){
        const range=laserOrigin.distanceTo(hit);
        if(range>=.01&&range<=30)readings.push({range,height:drone.position.z-hit.z,surface:hit.z});
      }
    }
    if(readings.length<3)return;
    readings.sort((a,b)=>a.range-b.range);
    if(readings.at(-1).range-readings[0].range>.12+.035*readings[0].range)return;
    return readings[Math.floor(readings.length/2)];
  }
  function step(now,time,drone,profileName,flowVisible,padVisible,landing){
    flowRead.poll();rawRead.poll();padRead.poll();
    const destination=renderer.getRenderTarget(),profile=flowProfiles[profileName];
    try{
      if((flowVisible||landing)&&now-lastRange>=67){
        lastRange=now;altimeter=laserSample(drone);
        reportRange(altimeter,time);
      }
      if(!flowVisible){lastFlow=undefined;}
      else if(!flowRead.busy&&!rawRead.busy&&(lastFlow===undefined||time-lastFlow>=.019)){
        if(lastProfile!==profileName){lastFlow=undefined;lastProfile=profileName;}
        const frame=frames[next],dt=time-lastFlow;
        flowEye.fov=profile.fov;flowEye.updateProjectionMatrix();
        placeDownCamera(T,flowEye,drone);
        render(flowEye,frame);
        rawRead.read(frame,pixels=>showFlow(pixels,true));
        if(Number.isFinite(dt)&&dt>0&&dt<.2){
          const range=altimeter?.range??Infinity;
          const output=kernel.compare(frames[1-next].texture,frame.texture,profile);
          flowRead.read(output,pixels=>reportFlow(kernel.measure(pixels,profile,dt,range),time));
        }
        lastFlow=time;next=1-next;
      }
      if(!padVisible&&!landing){previousPad=padLock=null;}
      else if(!padRead.busy&&now-lastVision>=110){
        lastVision=now;
        padEye.fov=altimeter&&altimeter.height<.72?122:82;
        padEye.updateProjectionMatrix();
        placeDownCamera(T,padEye,drone);
        // Keep the landing camera pointing down through gust-induced aircraft tilt.
        padEye.up.z=0;padEye.up.normalize();
        if(padEye.up.lengthSq()<.1)padEye.up.set(0,1,0);
        padEye.lookAt(point.copy(padEye.position).add(vertical));
        render(padEye,vision);
        const pose=padEye.clone(),origin=drone.position.clone();
        padRead.read(vision,pixels=>{
          function fromPixel({x,y}){
            point.set(2*(x+.5)/visionSize-1,1-2*(y+.5)/visionSize,.5).unproject(pose);
            direction.copy(point).sub(pose.position).normalize();
            return rangeAt(pose.position,direction,true)?.clone();
          }
          const matches=tagDetector?.detect(pixels).filter(detection=>layouts.has(detection.id))??[];
          function diagonalSquared({corners:[a,,b]}){
            return (a.x-b.x)**2+(a.y-b.y)**2;
          }
          matches.sort((a,b)=>diagonalSquared(b)-diagonalSquared(a));
          let surface;
          const match=matches.find(detection=>{
            const tag=layouts.get(detection.id);
            const center=fromPixel(detection.center);
            if(!center)return false;
            // AprilTag corners run from bottom left to bottom right to top right.
            const [bottomLeft,bottomRight,topRight,topLeft]=detection.corners.map(fromPixel);
            if(!bottomLeft||!bottomRight||!topRight||!topLeft)return false;
            const x=bottomRight.clone().sub(bottomLeft).add(topRight).sub(topLeft).multiplyScalar(.5);
            const y=topLeft.sub(bottomLeft).add(topRight).sub(bottomRight).multiplyScalar(.5);
            const side=.8*tag.size,tolerance=.20*tag.size;
            if(Math.abs(x.length()-side)>tolerance||Math.abs(y.length()-side)>tolerance)return false;
            surface=center.addScaledVector(x.normalize(),-tag.x).addScaledVector(y.normalize(),-tag.y);
            return true;
          });
          if(padVisible){
            const ctx=showPad(pixels);
            if(match){
              ctx.strokeStyle='#64ffd3';ctx.lineWidth=1;ctx.beginPath();
              for(const {x,y} of match.corners)ctx.lineTo(x,y);
              ctx.closePath();ctx.stroke();
            }
          }
          let cue;
          if(match){
            if(origin.z>surface.z){
              const dt=time-(previousPad?.time??time);
              const confirmed=dt>.001&&dt<.4&&Math.hypot(surface.x-previousPad.x,surface.y-previousPad.y)<.14+1.55*dt;
              if(confirmed){
                surface.x=.64*surface.x+.36*previousPad.x;
                surface.y=.64*surface.y+.36*previousPad.y;
              }
              const vx=confirmed?(surface.x-previousPad.x)/dt:0,vy=confirmed?(surface.y-previousPad.y)/dt:0;
              const confirmations=confirmed?previousPad.confirmations+1:1;
              previousPad={x:surface.x,y:surface.y,time,confirmations};
              if(confirmations>=3){
                const dx=surface.x-origin.x,dy=surface.y-origin.y,height=origin.z-surface.z;
                const eastSpeed=.55*(padLock?.eastSpeed??0)+.45*Math.max(-.9,Math.min(.9,vx));
                const northSpeed=.55*(padLock?.northSpeed??0)+.45*Math.max(-.9,Math.min(.9,vy));
                cue=[1,dx,dy,height,eastSpeed,northSpeed];
                padLock={x:surface.x,y:surface.y,z:surface.z,height,dx,dy,eastSpeed,northSpeed,time};
              }
            }
          }
          if(!match)previousPad=null;
          // The marker leaves the lens at the bottom of a centered approach.
          // A short range-aided flare can finish only from the last close lock.
          if(!cue&&landing&&padLock&&padLock.height<.72&&Math.hypot(padLock.dx,padLock.dy)<.16&&altimeter){
            const elapsed=time-padLock.time;
            const surface=rangeAt(origin,vertical,true);
            if(surface&&elapsed>0&&elapsed<3.1&&Math.abs(surface.z-padLock.z)<.26){
              const dx=padLock.x+elapsed*padLock.eastSpeed-origin.x;
              const dy=padLock.y+elapsed*padLock.northSpeed-origin.y;
              const height=origin.z-surface.z;
              if(height>0&&height<.56&&Math.hypot(dx,dy)<.14)
                cue=[1,dx,dy,height,padLock.eastSpeed,padLock.northSpeed];
            }
          }
          if(landing&&cue&&cue[3]<.65&&(!altimeter||Math.abs(altimeter.height-cue[3])>.24))cue=undefined;
          reportPad(cue,time,Boolean(match));
        });
      }
    }finally{renderer.setRenderTarget(destination);}
  }
  return {step,dispose(){
    disposed=true;tagDetector?.dispose();
    flowRead.dispose();rawRead.dispose();padRead.dispose();kernel.dispose();
    for(const frame of frames)frame.dispose();
    vision.dispose();
  }};
}
