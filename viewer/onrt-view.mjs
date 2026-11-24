import {period,wakeStep,waveCutCsv} from './onrt-basin.mjs';

import {createWakePlayback} from './onrt-playback.mjs';

const $=id=>document.getElementById(id);
const T=window.THREE, canvas=$('view');
async function start() {
  const renderer=new T.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(44,1,.025,220);
  scene.background=new T.Color(0xb8d4dd);
  scene.fog=new T.FogExp2(0xb8d4dd,.022);
  scene.add(new T.HemisphereLight(0xf4fbff,0x678786,1.35));
  const sun=new T.DirectionalLight(0xffefd3,1.3);
  sun.position.set(-4,8,4);scene.add(sun);
  const ship=new T.Group();scene.add(ship);
  const base='./assets/onrt/';
  const [parts,buffer]=await Promise.all([
    fetch(base+'parts.json').then(r=>r.json()),fetch(base+'geometry.bin').then(r=>r.arrayBuffer())]);
  const meshes={};
  const colors={bottom:0x844c3c,topsides:0x9caeb5,house:0xb1bec2,appendages:0x63574b,
    portRudder:0x875648,starboardRudder:0x875648,propeller:0xbf9860};
  for(const [name,{offset,vertices,indices}] of Object.entries(parts)) {
    const encoded=new Int16Array(buffer,offset,3*vertices);
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(Float32Array.from(encoded,v=>v*.0001),3));
    geometry.setIndex(new T.BufferAttribute(new Uint16Array(buffer,offset+6*vertices,indices),1));
    geometry.computeVertexNormals();
    const material=new T.MeshStandardMaterial({color:colors[name],roughness:.68,metalness:.12,side:T.DoubleSide});
    meshes[name]=new T.Mesh(geometry,material);
    if(name!=='propeller') ship.add(meshes[name]);
  }
  const rudders=[],props=[];
  for(const side of [-1,1]) {
    const mesh=side<0?meshes.portRudder:meshes.starboardRudder;
    const pivot=new T.Group();
    pivot.position.set(1.625-.955*3.147,-.032,side*.020116*3.147);
    mesh.position.copy(pivot.position).multiplyScalar(-1);
    pivot.add(mesh);ship.add(pivot);rudders.push(pivot);
    const mount=new T.Group();
    mount.position.set(1.625-.9267*3.147,-.03565*3.147,side*.02661*3.147);
    mount.rotation.z=5*Math.PI/180;
    const prop=meshes.propeller.clone();
    prop.scale.z=side;mount.add(prop);ship.add(mount);props.push(prop);
  }

  // Rendering interpolates the Modelica elevation samples in world coordinates.
  // The IIHR basin spans 40 x 20 m, with its wavemaker 34.5 m ahead of
  // the carriage origin. The static lattice never snaps beneath a moving camera.
  const surface=new T.PlaneGeometry(40,20,400,200);
  surface.rotateX(-Math.PI/2);
  surface.translate(14.5,0,0);
  const data=new Uint8Array(64*64*4);
  const map=new T.DataTexture(data,64,64,T.RGBAFormat);
  map.wrapS=map.wrapT=T.RepeatWrapping;map.magFilter=map.minFilter=T.NearestFilter;map.needsUpdate=true;
  const uniforms={field:{value:map},origin:{value:new T.Vector2()},eye:{value:camera.position},
    wave:{value:new T.Vector4()},time:{value:0},amp:{value:0},contours:{value:0},basin:{value:period},heightScale:{value:new T.Vector2(1,1)},frameMix:{value:1}};
  const material=new T.ShaderMaterial({uniforms,side:T.DoubleSide,transparent:true,
    vertexShader:`
    uniform sampler2D field;
    uniform vec2 origin;
    uniform vec4 wave;
    uniform float basin,time,amp,frameMix; uniform vec2 heightScale;
    varying vec3 surfacePoint;
    varying float wakeHeight;
    float sampleCell(vec2 cell){
      vec4 packedHeight=texture2D(field,(cell+0.5)/64.0);
      vec2 heights=heightScale*((packedHeight.xz*65280.+packedHeight.yw*255.)/32767.-1.);
      return mix(heights.x,heights.y,frameMix);
    }
    void main(){
      vec3 p=(modelMatrix*vec4(position,1.)).xyz;
      vec2 en=vec2(p.x,-p.z),uv=en*(64.0/basin),i=floor(uv),f=fract(uv);
      float h=mix(mix(sampleCell(i),sampleCell(i+vec2(1,0)),f.x),
                  mix(sampleCell(i+vec2(0,1)),sampleCell(i+1.),f.x),f.y);
      vec2 d=abs(en-origin);
      wakeHeight=h*(1.-smoothstep(.46*basin,.5*basin,max(d.x,d.y)));
      p.y=wakeHeight+amp*cos(dot(wave.xy,en)-wave.z*time);
      surfacePoint=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
    }`,
    fragmentShader:`
    varying vec3 surfacePoint;varying float wakeHeight;uniform vec3 eye;uniform float contours;
    void main(){
      vec3 n=normalize(cross(dFdx(surfacePoint),dFdy(surfacePoint)));
      if(n.y<0.)n=-n;
      vec3 v=normalize(eye-surfacePoint);
      float f=pow(1.-abs(dot(n,v)),4.);
      vec3 c=mix(vec3(.09,.29,.34),vec3(.70,.83,.86),clamp(.15+.8*f+.65*(1.-n.y),0.,1.));
      c+=vec3(.9,.85,.7)*pow(max(0.,dot(reflect(-normalize(vec3(-.5,1.,.5)),n),v)),100.);
      if(contours>.5){
        float mm=wakeHeight*1000.;
        c=mix(vec3(.55,.65,.67),mm>=0.?vec3(.9,.36,.15):vec3(.05,.32,.55),clamp(abs(mm)/20.,0.,1.));
        float level=abs(fract(mm/5.+.5)-.5);
        float width=max(.0001,fwidth(mm/5.));
        float line=(1.-smoothstep(.25,1.25,level/width))*(1.-smoothstep(.3,.7,width));
        c=mix(c,vec3(.94),line*smoothstep(.5,2.,abs(mm)));
      }
      float distanceToEye=length(eye-surfacePoint);
      c=mix(c,vec3(.722,.831,.867),smoothstep(12.,95.,distanceToEye));
      gl_FragColor=vec4(c,gl_FrontFacing?mix(.79+.21*f,1.,smoothstep(6.,18.,distanceToEye)):.33);
    }`});
  const water=new T.Mesh(surface,material);scene.add(water);
  const floorVertices=[];
  for(let x=-5.5;x<=34.5;x++)floorVertices.push(x,-3,-10,x,-3,10);
  for(let z=-10;z<=10;z++)floorVertices.push(-5.5,-3,z,34.5,-3,z);
  const floorGeometry=new T.BufferGeometry();
  floorGeometry.setAttribute('position',new T.Float32BufferAttribute(floorVertices,3));
  scene.add(new T.LineSegments(floorGeometry,new T.LineBasicMaterial({color:0x748f92})));
  let azimuth,elevation,radius;
  function recenter(){azimuth=1.13;elevation=.37;radius=innerWidth<580?5.9:4.7;}
  $('recenter').onclick=recenter;recenter();
  const fingers=new Map();
  canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);fingers.set(e.pointerId,[e.clientX,e.clientY]);};
  canvas.onlostpointercapture=e=>fingers.delete(e.pointerId);
  canvas.onpointermove=e=>{
    const old=fingers.get(e.pointerId);if(!old)return;
    const other=[...fingers].find(([id])=>id!==e.pointerId)?.[1];
    if(other){
      const span=(x,y)=>Math.hypot(x-other[0],y-other[1]);
      radius=Math.max(.45,Math.min(22,radius*span(...old)/Math.max(1,span(e.clientX,e.clientY))));
    }else{
      azimuth-=(e.clientX-old[0])*.007;
      elevation=Math.max(-1.47,Math.min(1.52,elevation+(e.clientY-old[1])*.006));
    }
    fingers.set(e.pointerId,[e.clientX,e.clientY]);
  };
  canvas.onwheel=e=>{e.preventDefault();radius=Math.max(.45,Math.min(22,radius*Math.exp(.001*e.deltaY)));};
  let worker,ready=false,busy=false,state,tile,playback,uploadedLeft,uploadedRight,accum=0,last=performance.now(),failed=false;
  const keys=new Set();
  function inputs(){
    return {shaftDemand:$('mode').value==='tow'?0:Number($('shaft').value),helm:$('mode').value==='tow'?0:Number($('helm').value),
      tow:Number($('mode').value==='tow'),towSpeed:Number($('towSpeed').value),waveDirection:(Number($('waves').value)||0)*Math.PI/180,
      waveAmplitude:$('waves').value==='calm'?0:3.147*.01};
  }
  function labels() {
    const s=inputs();$('towControl').hidden=!s.tow;$('towLabel').value=s.towSpeed.toFixed(2)+' m/s';$('shaftLabel').value=Math.round(s.shaftDemand)+' rpm';
    $('helmLabel').value=s.helm===0?'Amidships':Math.abs(s.helm)+'° '+(s.helm>0?'port':'starboard');
  }
  function fail(message){failed=true;ready=false;$('readout').textContent='Basin stopped · '+message;worker?.terminate();}
  function reset(){
    worker?.terminate();ready=busy=failed=false;state=tile=uploadedLeft=uploadedRight=null;accum=0;playback=createWakePlayback(3*wakeStep);
    map.image.data.fill(0);uniforms.heightScale.value.set(0,0);map.needsUpdate=true;keys.clear();
    $('save').disabled=true;$('readout').textContent='Loading vessel and wave solver…';
    for(const id of ['shaft','helm','design','center'])$(id).disabled=$('mode').value==='tow';
    labels();worker=new Worker(new URL('./onrt-worker.mjs',import.meta.url),{type:'module'});
    worker.onerror=e=>fail(e.message);
    worker.onmessage=({data})=>{
      if(data.error){fail(data.error);return;}
      if(data.ready){ready=true;last=performance.now();return;}
      busy=false;
      if(!data.frames.every(frame=>Number.isFinite(frame.state.surge))){fail('Non-finite state');return;}
      playback.append(data.frames);
      ({state,tile}=data.frames.at(-1));
      $('save').disabled=false;
      const bearing=(Math.round(90-state.heading*180/Math.PI)%360+360)%360;
      $('readout').textContent=state.surge.toFixed(2)+' m/s  ·  '+state.rpm.toFixed(0)+' rpm  ·  '+state.time.toFixed(1)+' s\n'+
        'E '+state.east.toFixed(2)+' m  ·  N '+state.north.toFixed(2)+' m  ·  '+bearing+'°T';
    };
    worker.postMessage({type:'init',inputs:inputs()});
  }
  $('mode').onchange=reset;$('waves').onchange=reset;$('reset').onclick=reset;
  $('towSpeed').oninput=$('shaft').oninput=$('helm').oninput=labels;
  $('design').onclick=()=>{$('shaft').value=538;labels();};
  $('center').onclick=()=>{$('helm').value=0;labels();};
  $('save').onclick=()=>{
    if(!state||!tile)return;
    const url=URL.createObjectURL(new Blob([waveCutCsv(state,tile)],{type:'text/csv'}));
    const a=document.createElement('a');a.download='onrt-wave-cuts.csv';a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const bindings=['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  window.addEventListener('keydown',e=>{
    if(e.code==='Home'){e.preventDefault();recenter();return;}
    if(!bindings.includes(e.code)||e.target.tagName==='SELECT'||e.ctrlKey||e.metaKey||e.altKey)return;
    e.preventDefault();keys.add(e.code);
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
  function frame(now) {
    const dt=Math.max(0,Math.min(.15,(now-last)*.001));last=now;
    if(canvas.width!==Math.floor(innerWidth*renderer.getPixelRatio())||canvas.height!==Math.floor(innerHeight*renderer.getPixelRatio())){
      renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;
      // Keep the vessel centered in the portion of the screen available to the camera.
      camera.setViewOffset(innerWidth,innerHeight,innerWidth>700?-Math.min(170,innerWidth*.14):0,
        innerWidth<580?innerHeight*.17:0,innerWidth,innerHeight);
      camera.updateProjectionMatrix();
    }
    if(ready&&!failed){
      accum=Math.min(.16,accum+dt);
      if(!busy && accum>=wakeStep){
        const steps=Math.min(4,Math.floor(accum/wakeStep));accum-=steps*wakeStep;
        if(keys.size&&$('mode').value==='drive'){
          const held=(a,b)=>Number(keys.has(a)||keys.has(b));
          $('shaft').value=+$('shaft').value+Math.round(steps*wakeStep*140)*(held('KeyW','ArrowUp')-held('KeyS','ArrowDown'));
          $('helm').value=+$('helm').value+Math.round(steps*wakeStep*35)*(held('KeyA','ArrowLeft')-held('KeyD','ArrowRight'));labels();
        }
        busy=true;worker.postMessage({type:'step',steps,inputs:inputs()});
      }
    }
    const sample=playback.sample(dt);
    if(sample){
      const {left,right,mix}=sample;
      if(left!==uploadedLeft||right!==uploadedRight){
        for(const [index,frame] of [left,right].entries()){
          const limit=frame.limit??=frame.tile.reduce((peak,h)=>Math.max(peak,Math.abs(h)),.001);
          uniforms.heightScale.value.setComponent(index,limit);
          for(let i=0;i<frame.tile.length;i++){
            const q=Math.round((1+frame.tile[i]/limit)*32767);
            data[4*i+2*index]=q>>8;data[4*i+2*index+1]=q&255;
          }
        }
        map.needsUpdate=true;uploadedLeft=left;uploadedRight=right;
      }
      uniforms.frameMix.value=mix;
      const s=right.state;
      const at=k=>left.state[k]+mix*(s[k]-left.state[k]);
      ship.position.set(at('east'),at('heave'),-at('north'));
      ship.rotation.set(at('roll'),at('heading'),at('pitch'),'YZX');
      rudders.forEach(r=>r.rotation.y=-at('rudder')*Math.PI/180);
      props.forEach((p,i)=>p.rotation.x=(i===0?1:-1)*at('propAngle'));
      const wave=inputs();uniforms.time.value=at('time');uniforms.amp.value=wave.waveAmplitude;
      uniforms.wave.value.set(s.waveNumber*Math.cos(wave.waveDirection),s.waveNumber*Math.sin(wave.waveDirection),s.waveOmega,0);
    }
    uniforms.origin.value.set(ship.position.x,-ship.position.z);
    uniforms.contours.value=Number($('contours').checked);
    if(ready&&state&&(ship.position.x < -5.5 || ship.position.x > 34.5 || Math.abs(ship.position.z)>10)){
      ready=false;worker.terminate();$('readout').textContent+=' · Basin edge reached. Reset run to release again.';
    }
    camera.position.set(ship.position.x+radius*Math.cos(azimuth)*Math.cos(elevation),
      .07+radius*Math.sin(elevation),ship.position.z+radius*Math.sin(azimuth)*Math.cos(elevation));
    camera.lookAt(ship.position.x,.07,ship.position.z);renderer.render(scene,camera);requestAnimationFrame(frame);
  }
  reset();requestAnimationFrame(frame);
}
start().catch(error=>{$('readout').textContent='Basin could not start · '+error.message;});
