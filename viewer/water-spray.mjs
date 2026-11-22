import {loadInstance} from './fmi3/instance.mjs';

// Each quad represents a small volume of water released at a particular time.
// Its endpoints span a short exposure of a ballistic trajectory in world space.
export function waterStreaks(T,scene,name,capacity,bow=false){
  const geometry=new T.InstancedBufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute([-1,0,0,1,0,0,-1,1,0,1,1,0],3));
  geometry.setIndex([0,1,2,2,1,3]);
  function attribute(key,n){
    const a=new T.InstancedBufferAttribute(new Float32Array(n*capacity),n).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute(key,a);return a;
  }
  const origin=attribute('origin',4),launch=attribute('launch',4),water=attribute('water',2);
  const clock={value:0},pixels={value:600};
  const material=new T.ShaderMaterial({defines:bow?{BOW_DROPLETS:1}:{},uniforms:{clock,pixels},transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:`
      uniform float clock,pixels;
      attribute vec4 origin,launch;
      attribute vec2 water;
      varying vec2 uvDrop;
      varying float alpha;
      vec3 path(float t){return origin.xyz+t*(launch.xyz-vec3(0.,0.,4.905*t));}
      void main(){
        float age=clock-origin.w;
        gl_Position=vec4(2.,2.,2.,1.);alpha=0.;uvDrop=position.xy;
        if(launch.w<=0.||age<0.||age>2.)return;
        vec3 tip=path(age);
        #ifdef BOW_DROPLETS
        if(tip.z<water.x)return;
        vec3 p=(viewMatrix*vec4(tip,1.)).xyz;
        float pixel=max(.0001,-p.z/(pixels*projectionMatrix[1][1]));
        float radius=max(launch.w,pixel*.8);
        p.xy+=radius*vec2(position.x,2.*position.y-1.);
        gl_Position=projectionMatrix*vec4(p,1.);
        alpha=.73*min(1.,launch.w/radius)*exp(-1.4*age);
        #else
        vec3 base=path(max(0.,age-water.y));
        if(max(tip.z,base.z)<water.x-.015)return;
        tip.z=max(water.x,tip.z);base.z=max(water.x,base.z);
        vec3 a=(viewMatrix*vec4(base,1.)).xyz,b=(viewMatrix*vec4(tip,1.)).xyz;
        vec2 axis=normalize(b.xy-a.xy+.000001);
        float pixel=max(.0001,-b.z/(pixels*projectionMatrix[1][1]));
        float radius=max(launch.w,pixel*.72);
        vec3 p=mix(a,b,position.y);
        p.xy+=radius*(position.x*vec2(-axis.y,axis.x)+axis*(2.*position.y-1.));
        gl_Position=projectionMatrix*vec4(p,1.);
        alpha=.74*min(1.,launch.w/radius);
        #endif
      }`,
    fragmentShader:`
      varying vec2 uvDrop;varying float alpha;
      void main(){
        #ifdef BOW_DROPLETS
        float r=length(vec2(uvDrop.x,2.*uvDrop.y-1.));
        float a=alpha*(1.-smoothstep(.12,1.,r));
        #else
        float width=mix(.56,1.,uvDrop.y);
        float a=alpha*(1.-smoothstep(.08,width,abs(uvDrop.x)))*smoothstep(0.,.12,uvDrop.y)*(1.-smoothstep(.86,1.,uvDrop.y));
        #endif
        if(a<.008)discard;
        gl_FragColor=vec4(mix(vec3(.54,.72,.77),vec3(.92,.97,1.),1.-abs(uvDrop.x)),a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.frustumCulled=false;mesh.renderOrder=1;
  geometry.instanceCount=0;mesh.visible=false;scene.add(mesh);
  let cursor=0,last=-Infinity,dirty=false;
  function emit(x,y,z,t,vx,vy,vz,r,level,exposure){
    origin.setXYZW(cursor,x,y,z,t);launch.setXYZW(cursor,vx,vy,vz,r);water.setXY(cursor,level,exposure);
    cursor=(cursor+1)%capacity;geometry.instanceCount=Math.min(capacity,geometry.instanceCount+1);
    dirty=true;last=Math.max(last,t);
  }
  function draw(t){clock.value=t;pixels.value=innerHeight;
    mesh.visible=t-last<2&&geometry.instanceCount>0;
    if(dirty){origin.needsUpdate=launch.needsUpdate=water.needsUpdate=true;dirty=false;}
  }
  function clear(){geometry.instanceCount=0;cursor=0;last=-Infinity;mesh.visible=false;}
  return {mesh,emit,draw,clear,dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}

export function surfaceSpray(T,scene,name,count,surface,{bow=false}={}){
  const drops=waterStreaks(T,scene,name,bow?768:2048,bow),positions=Array.from({length:count},()=>new T.Vector3());
  const before=positions.map(p=>p.clone()),wetAt=new Float64Array(count).fill(-Infinity);
  const sections=new Float64Array(80),lastArea=new Float64Array(count),carry=new Float64Array(count);
  let previous,shoulderTime,model,seed=7561;
  loadInstance('SurfaceSpray',{}).then(m=>{model=m;}).catch(console.error);
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  function clear(){previous=shoulderTime=undefined;wetAt.fill(-Infinity);carry.fill(0);lastArea.fill(0);drops.clear();}
  // A sampler fills world positions and wetted cross-sections from the solved
  // boat or animal. For runoff, sample actual animated trailing-edge vertices.
  function sample(time,area,speed,heading,edgeCount=0){
    if(previous!==undefined&&(time<previous||time-previous>.5))clear();
    const dt=time-(previous??time);if(dt>0&&dt<.035)return;
    if(time===previous)return;
    const levels=[],c=Math.cos(heading),s=Math.sin(heading);
    let active=false;
    for(let i=0;i<count;i++){
      const p=positions[i],level=surface(p.x,p.y);levels.push(level);
      if(p.z<=level)wetAt[i]=time;
      const k=4*i,isEdge=i<edgeCount;
      const entry=dt?Math.max(0,(area[i]-lastArea[i])/dt)/.35:0;
      sections[k]=isEdge?0:area[i];sections[k+1]=Math.abs(speed);
      sections[k+2]=entry;sections[k+3]=isEdge&&p.z>level&&time-wetAt[i]<2.7?time-wetAt[i]:-1;
      active||=sections[k]>0||sections[k+3]>=0;
      lastArea[i]=area[i];
    }
    if(model&&active&&dt>0){
      model.set('sections',sections);
      const release=model.get('release');
      for(let i=0;i<count;i++){
        const p=positions[i],old=before[i],k=i*4,isEdge=i<edgeCount;
        const flux=isEdge?release[k+3]*.23:release[k];
        carry[i]+=Math.min(250,dt*flux/(isEdge?.0000025:bow?.000020:.000011));
        const n=Math.floor(carry[i]);carry[i]-=n;
        for(let j=0;j<n;j++){
          const f=(j+random())/n;
          const side=bow?(i<2?1:-1):(random()<.5?-1:1);
          const swirl=side*(.35+random())*release[k+1];
          const vx=(p.x-old.x)/dt,vy=(p.y-old.y)/dt,vz=(p.z-old.z)/dt;
          const beam=bow?side*random()*.07:(random()-.5)*(isEdge?.16:.26),travel=(random()-.5)*(isEdge?.04:.45);
          const x=old.x+f*(p.x-old.x)-s*beam+c*travel,y=old.y+f*(p.y-old.y)+c*beam+s*travel;
          const z=isEdge?old.z+f*(p.z-old.z):levels[i]+(bow?.008:.018);
          if(z<=levels[i])continue;
          const surge=speed*(.18+.20*random()),rise=(.45+random())*release[k+2];
          drops.emit(x,y,z,previous+f*dt,isEdge?vx:c*surge-s*swirl,isEdge?vy:s*surge+c*swirl,
            isEdge?vz-.18:rise,isEdge?.007+.006*random():bow?.003+.009*random():.006+.013*random(),levels[i],isEdge?.085:.032);
        }
      }
    }
    for(let i=0;i<count;i++)before[i].copy(positions[i]);
    previous=time;drops.draw(time);
  }
  function sampleShoulders(time,release,[east,north,c,s]){
    if(shoulderTime!==undefined&&(time<shoulderTime||time-shoulderTime>.5))clear();
    const dt=time-(shoulderTime??time);
    if(shoulderTime===time)return;
    for(let i=0;i<count;i++){
      const k=i*6,x=east+c*release[k]-s*release[k+1],y=north+s*release[k]+c*release[k+1];
      const old=before[i],flux=release[k+5];
      if(dt>0&&flux>0){
        carry[i]+=Math.min(64,dt*flux/.000004);
        const n=Math.floor(carry[i]);carry[i]-=n;
        for(let j=0;j<n;j++){
          const f=(j+random())/n,along=(random()-.5)*.13,across=(random()-.5)*.08;
          const px=old.x+f*(x-old.x)+c*along-s*across;
          const py=old.y+f*(y-old.y)+s*along+c*across;
          const level=surface(px,py,true);
          const forward=release[k+2]*(.82+.36*random()),side=release[k+3]*(.76+.48*random());
          const rise=release[k+4]*(.68+.78*random());
          drops.emit(px,py,level+.012,shoulderTime+dt*f,c*forward-s*side,s*forward+c*side,rise,
            .003+.010*random(),level,.032);
        }
      }
      old.set(x,y,0);
    }
    shoulderTime=time;drops.draw(time);
  }
  return {positions,sample,sampleShoulders,draw:drops.draw,points:drops.mesh,clear,dispose:drops.dispose};
}
