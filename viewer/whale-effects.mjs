import {loadInstance} from './fmi3/instance.mjs';
import {surfaceSpray,waterStreaks} from './water-spray.mjs';

const noiseGLSL=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float billow(vec2 p){return .56*noise(p)+.28*noise(2.1*p+7.)+.16*noise(4.3*p-2.);}
`;

function mistCloud(T,scene,name,n,color){
  const geo=new T.BufferGeometry(),buffer=new T.InterleavedBuffer(new Float32Array(n*5),5).setUsage(T.DynamicDrawUsage);
  geo.setAttribute('position',new T.InterleavedBufferAttribute(buffer,3,0));
  geo.setAttribute('sprite',new T.InterleavedBufferAttribute(buffer,2,3));
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{pixels:{value:600},tint:{value:new T.Color(color)}},
    vertexShader:`attribute vec2 sprite;uniform float pixels;varying float opacity,seed;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;
        gl_PointSize=clamp(.5*pixels*projectionMatrix[1][1]*sprite.x/max(.1,-p.z),1.,128.);
        opacity=sprite.y;seed=float(gl_VertexID)*.713;}`,
    fragmentShader:noiseGLSL+`uniform vec3 tint;varying float opacity,seed;
      void main(){vec2 q=gl_PointCoord*2.-1.;
        float density=billow(2.2*q+vec2(seed,seed*.37));
        float edge=1.-smoothstep(.10,.9,length(q)+.48*(density-.45));
        float alpha=opacity*edge*smoothstep(.14,.78,density);
        if(alpha<.006)discard;
        gl_FragColor=vec4(tint*(.82+.28*density),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const mesh=new T.Points(geo,material);mesh.name=name;mesh.frustumCulled=false;scene.add(mesh);mesh.visible=false;
  return {mesh,update(values){buffer.array.set(values);buffer.needsUpdate=true;material.uniforms.pixels.value=innerHeight;},
    dispose(){mesh.removeFromParent();geo.dispose();material.dispose();}};
}

function impactCurtain(T,scene){
  const n=97,rows=5,geo=new T.BufferGeometry(),xyz=new T.BufferAttribute(new Float32Array(n*rows*3),3).setUsage(T.DynamicDrawUsage);
  const coverage=new T.BufferAttribute(new Float32Array(n*rows),1).setUsage(T.DynamicDrawUsage),indices=[],uv=[];
  for(let i=0;i<n;i++)for(let j=0;j<rows;j++){
    uv.push(i/(n-1),j/(rows-1));
    if(i&&j){const k=i*rows+j;indices.push(k-rows-1,k-1,k,k-rows-1,k,k-rows);}
  }
  geo.setIndex(indices);geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setAttribute('position',xyz);geo.setAttribute('coverage',coverage);
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{age:{value:0}},
    vertexShader:`attribute float coverage;varying vec2 tex;varying float strength;
      void main(){tex=uv;strength=coverage;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:noiseGLSL+`uniform float age;varying vec2 tex;varying float strength;
      void main(){float angle=tex.x*6.2831853;vec2 ring=vec2(sin(angle),cos(angle));
        float folds=billow(ring*19.+vec2(2.*tex.y,age*.7));
        float holes=billow(ring*35.+vec2(tex.y*5.,age*.6));
        float lip=smoothstep(.98,.998,tex.y);
        float torn=1.-smoothstep(.72+.22*folds,1.,tex.y);
        float lace=smoothstep(.16+.35*tex.y+.16*min(age,1.),.70,holes+.14*folds);
        float alpha=strength*torn*lace*(.76-.18*tex.y)*(1.-lip);
        if(alpha<.016)discard;
        gl_FragColor=vec4(mix(vec3(.40,.58,.64),vec3(.94,.98,1.),.18+.80*folds),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const mesh=new T.Mesh(geo,material);mesh.name='Breach water curtain';mesh.visible=false;mesh.frustumCulled=false;scene.add(mesh);
  return {mesh,update(values,t){
    material.uniforms.age.value=t;
    for(let i=0;i<n;i++)for(let j=0;j<rows;j++){
      const f=j/(rows-1),k=i*rows+j,r=.68+.32*f;
      xyz.setXYZ(k,values[4*i]*r,values[4*i+1]*r,-.08+values[4*i+2]*f);
      coverage.setX(k,values[4*i+3]);
    }
    xyz.needsUpdate=coverage.needsUpdate=true;
  },dispose(){mesh.removeFromParent();geo.dispose();material.dispose();}};
}

export function whaleEffects(T,scene,surface){
  const plume=mistCloud(T,scene,'Humpback blow',168,0xf2f5f5),bubbles=mistCloud(T,scene,'Breach bubble cloud',160,0xd0e7e9);
  const curtain=impactCurtain(T,scene),spray=waterStreaks(T,scene,'Breach impact spray',520);
  const runoff=surfaceSpray(T,scene,'Fluke runoff and surface spray',20,surface),areas=new Float64Array(20);
  let model,impactStamp,heading=0,last=-Infinity;
  loadInstance('WhaleSpray',{}).then(m=>{model=m;}).catch(console.error);
  function update(frame,t,animal,wind){
    const age=t-frame[60],speed=frame[64],blow=frame[22];
    animal.socket.getWorldPosition(plume.mesh.position);
    plume.mesh.visible=blow>=0&&blow<3.2&&plume.mesh.position.z>=surface(plume.mesh.position.x,plume.mesh.position.y)-.05;
    bubbles.mesh.visible=speed>1.2&&age>=0&&age<8.5;curtain.mesh.visible=bubbles.mesh.visible&&age<2.8;
    spray.draw(t);runoff.draw(t);
    if(t>=last&&t-last<.039)return;
    last=t;
    animal.edgePoints(runoff.positions);
    for(let i=16;i<20;i++){
      const k=81+(i-15)*5;
      runoff.positions[i].set(frame[k],frame[k+1],frame[23]);
      areas[i]=frame[k+2]*frame[k+4];
    }
    runoff.sample(t,areas,frame[27],frame[20],16);
    if(!model||(!plume.mesh.visible&&!bubbles.mesh.visible))return;
    model.set('breathAge',blow);model.set('impactAge',age);model.set('impactSpeed',speed);model.set('wind',wind);
    model.set('swimVelocity',[frame[27]*Math.cos(frame[20]),frame[27]*Math.sin(frame[20])]);
    if(plume.mesh.visible)plume.update(model.get('plume'));
    if(!bubbles.mesh.visible)return;
    if(frame[60]!==impactStamp){
      impactStamp=frame[60];heading=frame[20];spray.clear();
      const launch=model.get('droplets'),c=Math.cos(heading),s=Math.sin(heading);
      for(let k=0;k<launch.length;k+=6){
        const [x,y,vx,vy,vz,delay]=launch.slice(k,k+6);
        spray.emit(frame[61]+c*x-s*y,frame[62]+s*x+c*y,frame[63]+.03,impactStamp+delay,
          c*vx-s*vy,s*vx+c*vy,vz,.010+.015*(k%13)/12,frame[63],.049);
      }
      spray.draw(t);
    }
    curtain.mesh.position.fromArray(frame,61);curtain.mesh.rotation.z=heading;
    bubbles.mesh.position.copy(curtain.mesh.position);bubbles.mesh.rotation.z=heading;
    if(curtain.mesh.visible)curtain.update(model.get('curtain'),age);
    bubbles.update(model.get('bubbles'));
  }
  return {update,dispose(){for(const effect of [plume,bubbles,curtain,spray,runoff])effect.dispose();}};
}
