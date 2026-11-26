import {currentVelocities} from './physics-view.mjs';

// Neutral suspended particles sample the same mean-current field as the sub.
// Wrapping the fixed pool at the far edges keeps the water still in world
// coordinates as the camera pans, without allocating particles during a dive.
export function marineSnow(T,scene,mobile){
  const batch=125,count=batch*(mobile?6:12),radius=6.5,span=2*radius;
  const position=new Float32Array(count*3),velocity=new Float32Array(count*3);
  const grain=new Float32Array(count),query=new Float64Array(batch*3);
  for(let i=0;i<count;i++){
    grain[i]=Math.random();
    for(let j=0;j<3;j++)position[3*i+j]=(Math.random()-.5)*span;
  }
  const geometry=new T.BufferGeometry();
  const coordinates=new T.BufferAttribute(position,3).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position',coordinates);
  geometry.setAttribute('grain',new T.BufferAttribute(grain,1));
  const material=new T.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:{surface:{value:0},pixels:{value:1},lampPosition:{value:new T.Vector3()},
      lampDirection:{value:new T.Vector3()},coneCos:{value:1},beamRange:{value:0},daylight:{value:1}},
    vertexShader:`
      attribute float grain;
      uniform float surface,pixels,coneCos,beamRange,daylight;
      uniform vec3 lampPosition,lampDirection;
      varying float brightness;
      void main(){
        vec3 eyeOffset=position-cameraPosition;
        float dist=length(eyeOffset);
        vec3 fromLamp=position-lampPosition;
        float r=length(fromLamp);
        float lit=0.;
        if(beamRange>0.)lit=smoothstep(coneCos,min(1.,coneCos+.065),dot(fromLamp/max(.01,r),lampDirection))
          *(1.-smoothstep(.5*beamRange,beamRange,r))/(1.+.12*r*r);
        brightness=(.055+.32*daylight+.55*lit)*mix(.4,1.,grain)
          *(1.-smoothstep(4.1,6.4,dist))*smoothstep(.12,.48,dist)
          *smoothstep(.015,.13,surface-position.z);
        gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);
        // Keep fine sediment visible when adaptive resolution drops below one.
        gl_PointSize=max(1.25,pixels*clamp(.85+(1.+2.1*grain)/max(.55,dist),1.05,3.));
      }`,
    fragmentShader:`
      varying float brightness;
      void main(){
        vec2 p=2.*gl_PointCoord-1.;
        float alpha=brightness*(1.-smoothstep(.16,1.,dot(p,p)));
        gl_FragColor=vec4(.60,.76,.77,alpha);
      }`
  });
  const cloud=new T.Points(geometry,material);
  cloud.name='Suspended sediment';cloud.frustumCulled=false;cloud.visible=false;
  scene.add(cloud);
  let lastTime,nextSample=-Infinity,cursor=0;
  const center=new T.Vector3(),aim=new T.Vector3(),uniforms=material.uniforms;
  function sample(start,probe,environment,ambient){
    if(probe&&environment?.every(Number.isFinite)){
      query.set(position.subarray(start*3,(start+batch)*3));
      currentVelocities(probe,query,environment,velocity.subarray(start*3,(start+batch)*3));
    }else{
      for(let i=start;i<start+batch;i++){
        velocity[3*i]=ambient[0];velocity[3*i+1]=ambient[1];velocity[3*i+2]=ambient[2]??0;
      }
    }
  }
  return {
    update(time,eye,surface,pixels,probe,environment,ambient){
      cloud.visible=eye.z<surface-.025;
      if(!cloud.visible){lastTime=undefined;return;}
      const reset=lastTime===undefined||time<lastTime||center.distanceToSquared(eye)>radius*radius;
      const dt=reset?0:Math.max(0,Math.min(.15,time-lastTime));
      center.copy(eye);lastTime=time;
      for(let i=0;i<count;i++)for(let axis=0;axis<3;axis++){
        const j=i*3+axis,c=axis===0?eye.x:axis===1?eye.y:eye.z;
        const offset=position[j]+dt*velocity[j]-c;
        position[j]=c+offset-span*Math.floor((offset+radius)/span);
      }
      coordinates.needsUpdate=true;
      if(reset){
        for(let i=0;i<count;i+=batch)sample(i,probe,environment,ambient);
        cursor=0;nextSample=time+.22;
      }else if(time>=nextSample){
        sample(cursor,probe,environment,ambient);cursor=(cursor+batch)%count;nextSample=time+.22;
      }
      uniforms.surface.value=surface;uniforms.pixels.value=pixels;
    },
    lighting(light,daylight){
      uniforms.daylight.value=daylight;uniforms.beamRange.value=light?.distance??0;
      if(!light)return;
      light.getWorldPosition(uniforms.lampPosition.value);
      light.target.getWorldPosition(aim);
      uniforms.lampDirection.value.subVectors(aim,uniforms.lampPosition.value).normalize();
      uniforms.coneCos.value=Math.cos(light.angle);
    },
    dispose(){scene.remove(cloud);geometry.dispose();material.dispose();}
  };
}
