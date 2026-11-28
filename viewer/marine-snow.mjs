import {currentVelocities} from './physics-view.mjs';

export function waterParticleLighting(T){
  const lampCount=2,aim=new T.Vector3();
  const uniforms={ambientLight:{value:1},
    lampPosition:{value:Array.from({length:lampCount},()=>new T.Vector3())},
    lampDirection:{value:Array.from({length:lampCount},()=>new T.Vector3())},
    beam:{value:Array.from({length:lampCount},()=>new T.Vector2())}};
  const vertexShader=`
    uniform float ambientLight;
    uniform vec2 beam[${lampCount}];
    uniform vec3 lampPosition[${lampCount}],lampDirection[${lampCount}];
    float particleLampLight(vec3 point){
      float light=0.;
      for(int i=0;i<${lampCount};i++){
        float range=beam[i].y;
        if(range<=0.)continue;
        vec3 offset=point-lampPosition[i];
        float distanceToLamp=length(offset),cone=beam[i].x;
        light+=smoothstep(cone,min(1.,cone+.065),dot(offset/max(.01,distanceToLamp),lampDirection[i]))
          *(1.-smoothstep(.5*range,range,distanceToLamp))/(1.+.10*distanceToLamp*distanceToLamp);
      }
      return min(1.,light);
    }`;
  return {uniforms,vertexShader,update(lights,ambient){
    uniforms.ambientLight.value=ambient;
    for(let i=0;i<lampCount;i++){
      const light=lights?.[i],beam=uniforms.beam.value[i];
      beam.set(light?Math.cos(light.angle):1,light?.distance??0);
      if(!light)continue;
      const position=uniforms.lampPosition.value[i];
      light.getWorldPosition(position);
      light.target.getWorldPosition(aim);
      uniforms.lampDirection.value[i].subVectors(aim,position).normalize();
    }
  }};
}

// Neutral suspended particles sample the same mean-current field as the sub.
// Wrapping the fixed pool at the far edges keeps the water still in world
// coordinates as the camera pans, without allocating particles during a dive.
export function marineSnow(T,scene,mobile,lighting){
  const batch=125,count=batch*(mobile?10:20),radius=6.5,span=2*radius;
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
    uniforms:{surface:{value:0},pixels:{value:1},time:{value:0},...lighting.uniforms},
    vertexShader:`
      attribute float grain;
      uniform float surface,pixels,time;
      varying float brightness;
      ${lighting.vertexShader}
      void main(){
        float dist=length(position-cameraPosition);
        float diameter=max(1.45,pixels*clamp(1.+(1.+2.35*grain)/max(.55,dist),1.15,3.2))
          *mix(.25,1.,pow(grain,3.));
        float turn=sin(time*mix(.72,1.65,grain)+71.*grain)+.28*sin(time*.92+43.*grain);
        float glint=smoothstep(-.65,.63,turn);
        brightness=(.39*ambientLight+.78*particleLampLight(position))*mix(.46,1.,grain)
          *(1.-smoothstep(4.4,6.4,dist))*smoothstep(.12,.48,dist)
          *smoothstep(.015,.13,surface-position.z)*glint*min(1.,diameter*diameter);
        gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);
        gl_PointSize=max(1.,diameter);
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
  const center=new T.Vector3(),uniforms=material.uniforms;
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
      uniforms.surface.value=surface;uniforms.pixels.value=pixels;uniforms.time.value=time;
    },
    dispose(){scene.remove(cloud);geometry.dispose();material.dispose();}
  };
}
