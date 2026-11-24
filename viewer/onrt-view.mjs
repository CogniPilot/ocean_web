import {loadInstance} from './fmi3/instance.mjs';
import {sampleTrial} from './onrt-trial.mjs';
import {installOrbit} from './onrt-orbit.mjs';
import {keyboardAxisKey,preferredKeyboardLayout,saveKeyboardLayout} from './keyboard-sticks.mjs';
import {period,wakeStep,waveCutCsv} from './onrt-basin.mjs';

import {loadBasinMaterials,metricSurface} from './onrt-materials.mjs';
import {createFacility} from './onrt-facility.mjs';
import {wakeSamplingGLSL} from './onrt-wake-display.mjs';
import {createWakePlayback} from './onrt-playback.mjs';

const $=id=>document.getElementById(id);
const T=window.THREE, canvas=$('view');
async function start() {
  const filter=$('crtFilter');
  try{filter.checked=localStorage.getItem('ocean-crt-filter')!=='off';}catch{filter.checked=true;}
  $('crtOverlay').hidden=!filter.checked;
  filter.onchange=()=>{ $('crtOverlay').hidden=!filter.checked;
    try{localStorage.setItem('ocean-crt-filter',filter.checked?'on':'off');}catch{}
  };
  const renderer=new T.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(44,1,.025,220);
  scene.background=new T.Color(0xb8d4dd);
  scene.fog=new T.FogExp2(0xc5cecd,.009);

  renderer.toneMapping=T.ACESFilmicToneMapping;
  // Light from the paired pendant rows, with a small diffuse room bounce.
  scene.add(new T.HemisphereLight(0xe6f0fa,0xaccac2,.45));
  for(const x of [.4,14.5,28.6])for(const z of [-5.6,5.6]){
    const lamp=new T.SpotLight(0xfff4df,245,34,1.17,.65,2);
    lamp.position.set(x,8.35,z);lamp.target.position.set(x,0,z);
    scene.add(lamp,lamp.target);
  }
  // The wall fixtures wash the cladding and rails across the side galleries.
  for(const z of [-12.6,12.6]){
    for(const x of [4.8,23.6]){
      const lamp=new T.PointLight(0xf2f6ff,24,9,2);
      lamp.position.set(x,3.22,z);scene.add(lamp);
    }
  }
  const finishes=await loadBasinMaterials(T,renderer);
  const facility=await createFacility(T,scene,finishes);
  const cameraModel=await loadInstance('BasinCamera',{solids:facility.cameraSolids});
  // Bake the hall and its bright fixtures once for roughness-filtered specular lighting.
  const reflectionType=renderer.extensions.has('EXT_color_buffer_float')?T.HalfFloatType:T.UnsignedByteType;
  const capture=new T.WebGLCubeRenderTarget(128,{type:reflectionType});
  const probe=new T.CubeCamera(.1,90,capture);probe.position.set(14.5,1.1,0);
  probe.update(renderer,scene);
  const pmrem=new T.PMREMGenerator(renderer);
  scene.environment=pmrem.fromCubemap(capture.texture).texture;
  capture.dispose();pmrem.dispose();
  const ship=new T.Group();scene.add(ship);
  const base='./assets/onrt/';
  const [parts,buffer]=await Promise.all([
    fetch(base+'parts.json').then(r=>r.json()),fetch(base+'geometry.bin').then(r=>r.arrayBuffer())]);
  const meshes={};
  const colors={bottom:0x45534d,topsides:0x41464a,house:0x555d61,appendages:0x63574b,
    portRudder:0x875648,starboardRudder:0x875648,propeller:0xbf9860};
  for(const [name,{offset,vertices,indices}] of Object.entries(parts)) {
    const encoded=new Int16Array(buffer,offset,3*vertices);
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(Float32Array.from(encoded,v=>v*.0001),3));
    geometry.setIndex(new T.BufferAttribute(new Uint16Array(buffer,offset+6*vertices,indices),1));
    geometry.computeVertexNormals();
    const material=finishes.material(name==='propeller'?'bronze':'hull',colors[name]);
    material.side=T.DoubleSide;
    meshes[name]=new T.Mesh(metricSurface(T,geometry),material);
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

  const ghost=new T.Group();
  // A depth prepass keeps the technical overlay at one opacity through overlapping
  // hull sections. Exclude the overlay from the physical water reflection.
  const ghostDepth=new T.MeshBasicMaterial({transparent:true,colorWrite:false,depthWrite:true,side:T.DoubleSide});
  const ghostSkin=new T.MeshBasicMaterial({color:0x44e8fc,transparent:true,opacity:.52,depthWrite:false,side:T.DoubleSide});
  ghostDepth.forceSinglePass=ghostSkin.forceSinglePass=true;
  for(const part of ['topsides','house','bottom']){
    const geometry=meshes[part].geometry;
    const depth=new T.Mesh(geometry,ghostDepth),skin=new T.Mesh(geometry,ghostSkin);
    depth.renderOrder=2;skin.renderOrder=3;
    ghost.add(depth,skin);
  }
  const ghostProps=props.map(source=>{
    const mount=source.parent.clone(false),blade=source.clone();
    blade.material=new T.MeshBasicMaterial({color:0x92f5ff,side:T.DoubleSide});
    mount.add(blade);ghost.add(mount);return blade;
  });
  ghost.visible=false;scene.add(ghost);

  // Rendering interpolates the Modelica elevation samples in world coordinates.
  // The IIHR basin spans 40 x 20 m, with its wavemaker 34.5 m ahead of
  // the carriage origin. The static lattice never snaps beneath a moving camera.
  const surface=new T.PlaneGeometry(40,20,640,120);
  surface.rotateX(-Math.PI/2);
  surface.translate(14.5,0,0);
  const data=new Uint8Array(64*64*4);
  const map=new T.DataTexture(data,64,64,T.RGBAFormat);
  map.wrapS=map.wrapT=T.RepeatWrapping;map.magFilter=map.minFilter=T.LinearFilter;map.needsUpdate=true;
  const trainData=new Uint8Array(641*4),trainMap=new T.DataTexture(trainData,641,1);
  trainMap.minFilter=trainMap.magFilter=T.LinearFilter;
  const mirror=new T.PerspectiveCamera(),reflection=new T.WebGLRenderTarget(640,360,{type:reflectionType});
  const mirrorMatrix=new T.Matrix4(),sight=new T.Vector3(),target=new T.Vector3();
  const targetMin=new T.Vector3(-5.2,.07,-9.75),targetMax=new T.Vector3(34.2,7.4,9.75);
  const cameraMin=new T.Vector3(-9.15,.28,-12.65),cameraMax=new T.Vector3(38.25,8.68,12.8);
  const clipWater=[new T.Plane(new T.Vector3(0,1,0),.001)];
  const uniforms={train:{value:trainMap},mirrored:{value:reflection.texture},mirrorMatrix:{value:mirrorMatrix},field:{value:map},origin:{value:new T.Vector2()},eye:{value:camera.position},
    wave:{value:new T.Vector4()},time:{value:0},amp:{value:0},contours:{value:0},basin:{value:period},heightScale:{value:new T.Vector2(1,1)},frameMix:{value:1}};
  const material=new T.ShaderMaterial({uniforms,side:T.DoubleSide,transparent:true,depthWrite:false,
    vertexShader:`
    ${wakeSamplingGLSL}
    uniform sampler2D train;
    uniform vec4 wave;
    uniform float time,amp;
    varying vec3 surfacePoint;
    void main(){
      vec3 p=(modelMatrix*vec4(position,1.)).xyz;
      vec2 en=vec2(p.x,-p.z);
      vec4 h=texture2D(train,vec2(((p.x+5.5)*16.+.5)/641.,.5));
      vec2 packet=(h.xz*65280.+h.yw*255.-32767.)/65534.;
      p.y=mix(packet.x,packet.y,frameMix)+sampleWake(en)+amp*cos(dot(wave.xy,en)-wave.z*time+wave.w);
      surfacePoint=p;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
    }`,
    fragmentShader:`
    ${wakeSamplingGLSL}
    uniform sampler2D mirrored;
    uniform mat4 mirrorMatrix;
    varying vec3 surfacePoint;uniform vec3 eye;uniform float contours;
    void main(){
      vec3 n=normalize(cross(dFdx(surfacePoint),dFdy(surfacePoint)));
      if(n.y<0.)n=-n;
      vec3 v=normalize(eye-surfacePoint);
      float f=.0204+.9796*pow(1.-clamp(abs(dot(n,v)),0.,1.),5.);
      vec4 reflected=mirrorMatrix*vec4(surfacePoint.x,0.,surfacePoint.z,1.);
      vec2 uv=reflected.xy/reflected.w*.5+.5+n.xz*.055;
      vec3 hallColor=texture2D(mirrored,clamp(uv,.001,.999)).rgb;
      float alpha=f+(1.-f)*.48;
      vec3 c=mix(vec3(.014,.29,.27),hallColor,f/alpha);
      if(contours>.5){
        float mm=sampleWake(vec2(surfacePoint.x,-surfacePoint.z))*1000.;
        c=mix(vec3(.55,.65,.67),mm>=0.?vec3(.9,.36,.15):vec3(.05,.32,.55),clamp(abs(mm)/20.,0.,1.));
        float level=abs(fract(mm/5.+.5)-.5);
        float width=max(.0001,fwidth(mm/5.));
        float line=(1.-smoothstep(.25,1.25,level/width))*(1.-smoothstep(.3,.7,width));
        c=mix(c,vec3(.94),line*smoothstep(.5,2.,abs(mm)));
      }
      gl_FragColor=vec4(c,contours>.5?.94:(gl_FrontFacing?alpha:.36));
      if(contours<.5){
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    }`});
  const water=new T.Mesh(surface,material);scene.add(water);
  const L=3.147,mid=1.625-L/2,turnNorth=-5;
  const landmark=new T.Mesh(new T.RingGeometry(.20,.25,40),new T.MeshBasicMaterial({color:0x43eaf2,side:T.DoubleSide}));
  landmark.rotation.x=-Math.PI/2;landmark.position.set(mid+2.35*L,.035,-(turnNorth+1.32*L));
  landmark.visible=false;scene.add(landmark);
  let previousTurn;
  function recordTurn(s){
    if(previousTurn)for(const [angle,ids] of [[Math.PI/2,['advance','transfer']],[Math.PI,['tactical']]]){
      if(previousTurn.heading>=angle||s.heading<angle||$(ids[0]).textContent!=='—')continue;
      const f=(angle-previousTurn.heading)/(s.heading-previousTurn.heading);
      const at=k=>previousTurn[k]+f*(s[k]-previousTurn[k]);
      const transfer=(at('north')-turnNorth+mid*Math.sin(angle))/L;
      if(ids.length===2)$('advance').textContent=((at('east')+mid*(Math.cos(angle)-1))/L).toFixed(2);
      $(ids.at(-1)).textContent=transfer.toFixed(2);
    }
    previousTurn=s;
  }
  const pan=new T.Vector3();
  const flyEye=new T.Vector3(),forward=new T.Vector3(),rightward=new T.Vector3(),goal=new T.Vector3(),move=new T.Vector3();
  const keys=new Set(),savedViews=new Map();
  let azimuth,elevation,radius,activeView;

  function recenter(){
    pan.set(0,0,0);keys.clear();
    const view=$('cameraView').value;
    $('cameraHelp').textContent=view==='hall'?'WASD or arrows to fly · R/F up/down · left-drag to look · right-drag to pan · V changes view':'Left-drag to orbit · right-drag to pan · scroll to zoom · V changes view';
    if(view==='ship'){azimuth=1.13;elevation=.37;radius=innerWidth<580?5.9:4.7;}
    else if(view==='props'){azimuth=2.83;elevation=-.24;radius=.62;}
    else if(view==='generator'){azimuth=2.56;elevation=.36;radius=10;}
    else {azimuth=Math.PI+.08;elevation=.22;radius=6;flyEye.set(-7.9,5.7,-1.8);}
  }
  activeView=$('cameraView').value;
  $('cameraView').onchange=()=>{
    savedViews.set(activeView,{azimuth,elevation,radius,pan:pan.clone(),eye:flyEye.clone()});
    activeView=$('cameraView').value;recenter();
    const saved=savedViews.get(activeView);
    if(saved){({azimuth,elevation,radius}=saved);pan.copy(saved.pan);flyEye.copy(saved.eye);}
    $('cameraView').blur();
  };
  $('recenter').onclick=recenter;recenter();
  installOrbit(canvas,camera,pan,()=>radius,(dx,dy)=>{
    azimuth-=dx*.008;elevation=T.MathUtils.clamp(elevation+dy*.006,activeView==='hall'||activeView==='props'?-1.45:.03,1.4);
  },factor=>{
    if(activeView==='hall')pan.addScaledVector(camera.getWorldDirection(forward),radius*(1-factor));
    else radius=Math.max(.35,Math.min(45,radius*factor));
  },()=>{});
  let worker,ready=false,busy=false,state,tile,playback,uploadedLeft,uploadedRight,accum=0,last=performance.now(),failed=false;
  let generatorStart=-100000,program={},trial,readoutTick=-1;
  const replayMode=()=>$('mode').value==='iihr';
  const requestedRun=new URLSearchParams(location.search).get('run');
  if(['iihr','turn'].includes(requestedRun))$('mode').value=requestedRun;
  $('generate').onclick=()=>{
    if(!ready||!state)return;
    for(const id of ['frequency','stroke','cycles','ramp'])if(!$(id).reportValidity())return;
    generatorStart=state.time;
    program={generatorFrequency:+$('frequency').value,generatorStroke:+$('stroke').value/1000,
      generatorCycles:+$('cycles').value,generatorRampCycles:+$('ramp').value,generatorStop:1e9};
    $('generate').disabled=true;
  };
  $('frequency').oninput=()=>{
    const hz=+$('frequency').value;
    if(hz>0)$('stroke').max=Math.floor(Math.min(250,155/hz));
  };
  $('stopTrain').onclick=()=>{if(state){program.generatorStop=state.time;$('stopTrain').disabled=true;}};
  function inputs(){
    if($('mode').value==='turn')return {generatorStart:-100000,basinContact:1,shaftDemand:538,helm:35,tow:0,towSpeed:1.11,waveAmplitude:0,waveDirection:0};

    return {...program,generatorStart,basinContact:1,shaftDemand:$('mode').value==='tow'?0:Number($('shaft').value),helm:$('mode').value==='tow'?0:Number($('helm').value),
      tow:Number($('mode').value==='tow'),towSpeed:Number($('towSpeed').value),waveDirection:(Number($('waves').value)||0)*Math.PI/180,
      waveAmplitude:$('waves').value==='calm'?0:3.147*.01};
  }
  function labels() {
    const s=inputs();$('towControl').hidden=!s.tow;$('towLabel').value=s.towSpeed.toFixed(2)+' m/s';$('shaftLabel').value=Math.round(s.shaftDemand)+' rpm';
    $('helmLabel').value=s.helm===0?'Amidships':Math.abs(s.helm)+'° '+(s.helm>0?'port':'starboard');
  }
  let rateStart,rateTime,rateText='';
  document.addEventListener('visibilitychange',()=>{rateStart=undefined;rateText='';});
  function fail(message){failed=true;ready=false;$('readout').textContent='Basin stopped · '+message;worker?.terminate();}
  function reset(){
    const replay=replayMode(),turn=$('mode').value==='turn';
    previousTurn=undefined;landmark.visible=turn;$('turnPanel').hidden=!turn;
    for(const id of ['advance','transfer','tactical'])$(id).textContent='—';
    trial=undefined;readoutTick=-1;ghost.visible=false;
    $('comparison').hidden=!replay;$('manual').hidden=replay||turn;$('generatorControl').hidden=replay||turn;
    $('trackGap').textContent=$('heaveGap').textContent=$('rpmHistory').textContent='';
    if(replay&&activeView==='hall'){activeView=$('cameraView').value='ship';recenter();}
    worker?.terminate();ready=busy=failed=false;state=tile=uploadedLeft=uploadedRight=null;accum=0;playback=createWakePlayback(3*wakeStep);
    rateStart=undefined;rateText='';
    generatorStart=-100000;program={};$('stopTrain').disabled=true;
    $('generate').disabled=true;$('generatorStatus').textContent='Ready';
    for(let i=0;i<641;i++)trainData.set([127,255,127,255],4*i);
    trainMap.needsUpdate=true;facility.update(0,0,0);
    map.image.data.fill(0);uniforms.heightScale.value.set(0,0);map.needsUpdate=true;keys.clear();
    $('save').disabled=true;$('readout').textContent='Loading vessel and wave solver…';
    for(const id of ['shaft','helm','design','center'])$(id).disabled=$('mode').value==='tow';
    labels();worker=new Worker(new URL('./onrt-worker.mjs',import.meta.url),{type:'module'});
    worker.onerror=e=>fail(e.message);
    worker.onmessage=({data})=>{
      if(data.error){fail(data.error);return;}
      if(turn&&data.frames)for(const {state} of data.frames)recordTurn(state);
      if(data.ready){
        if(data.trial){
          $('gaugeTrace').setAttribute('points',data.trial.rows.map(r=>(300*r.time/data.trial.end).toFixed(2)+','+(40-r.gauge*1000).toFixed(2)).join(' '));
        }
        trial=data.trial;playback.append([data.first]);ready=true;last=performance.now();return;
      }
      busy=false;
      if(!data.frames.every(frame=>Number.isFinite(frame.state.surge))){fail('Non-finite state');return;}
      playback.append(data.frames);
      ({state,tile}=data.frames.at(-1));
      $('save').disabled=false;
      const age=state.time-generatorStart;
      const active=generatorStart>=0 && age<state.trainDuration;
      $('generate').disabled=active;
      $('stopTrain').disabled=!active||age>=state.driveDuration||program.generatorStop!==1e9;
      $('generatorStatus').textContent=!active?'Ready':age<state.driveDuration?
        program.generatorFrequency+' Hz · plunger '+Math.round(1000*state.plungerTravel)+' mm':
        'Waves crossing basin · '+Math.ceil(state.trainDuration-age)+' s remaining';
      const now=performance.now();
      if(rateStart===undefined){rateStart=now;rateTime=state.time;}
      if(now-rateStart>=1000){
        rateText='  ·  '+((state.time-rateTime)*1000/(now-rateStart)).toFixed(2)+'× realtime';
        rateStart=now;rateTime=state.time;
      }
      if(trial)return;
      const bearing=(Math.round(90-state.heading*180/Math.PI)%360+360)%360;
      $('readout').textContent=state.surge.toFixed(2)+' m/s  ·  '+state.rpm.toFixed(0)+' rpm  ·  '+state.time.toFixed(1)+' s'+rateText+'\n'+
        'E '+state.east.toFixed(2)+' m  ·  N '+state.north.toFixed(2)+' m  ·  '+bearing+'°T';
    };
    worker.postMessage({type:'init',trial:replay,inputs:turn?{...inputs(),initialNorth:turnNorth,initialSurge:1.11,initialRpm:538}:inputs()});
  }

  $('mode').onchange=()=>{
    const url=new URL(location.href);
    if(['iihr','turn'].includes($('mode').value))url.searchParams.set('run',$('mode').value);else url.searchParams.delete('run');
    history.replaceState(null,'',url);reset();
  };$('waves').onchange=reset;$('reset').onclick=reset;
  $('towSpeed').oninput=$('shaft').oninput=$('helm').oninput=labels;
  $('design').onclick=()=>{$('shaft').value=538;labels();};
  $('center').onclick=()=>{$('helm').value=0;labels();};
  $('save').onclick=()=>{
    if(!state||!tile)return;
    const url=URL.createObjectURL(new Blob([waveCutCsv(state,tile)],{type:'text/csv'}));
    const a=document.createElement('a');a.download='onrt-wave-cuts.csv';a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const layout=$('keyLayout');
  layout.value=preferredKeyboardLayout();
  layout.onchange=()=>{keys.clear();saveKeyboardLayout(layout.value);layout.blur();};
  window.addEventListener('keydown',e=>{
    if(e.altKey||e.ctrlKey||e.metaKey||e.target.matches?.('input,textarea,[contenteditable=true]'))return;
    if(e.code==='KeyV'){
      if(!e.repeat){const menu=$('cameraView');menu.selectedIndex=(menu.selectedIndex+1)%menu.length;menu.dispatchEvent(new Event('change'));}
      e.preventDefault();return;
    }
    if(e.code==='Home'){e.preventDefault();recenter();return;}
    if(e.target.tagName==='SELECT')return;
    if(activeView==='hall'&&['KeyW','KeyA','KeyS','KeyD','KeyR','KeyF','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){
      e.preventDefault();keys.add(e.code);return;
    }
    if(!keyboardAxisKey(e.code,layout.value,'motorboat')||e.target.tagName==='SELECT'||e.ctrlKey||e.metaKey||e.altKey)return;
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
    if(ready&&!failed&&(!trial||!state||state.time<trial.end)){
      accum=Math.min(.16,accum+dt);
      if(!busy && accum>=wakeStep){
        const steps=Math.min(4,Math.floor(accum/wakeStep));accum-=steps*wakeStep;
        if(keys.size&&activeView!=='hall'&&$('mode').value==='drive'){
          const held=(a,b)=>Number(keys.has(a)||keys.has(b));
          $('shaft').value=+$('shaft').value+Math.round(steps*wakeStep*140)*(held('KeyW','ArrowUp')-held('KeyS','ArrowDown'));
          $('helm').value=+$('helm').value+Math.round(steps*wakeStep*35)*(held('KeyA','ArrowLeft')-held('KeyD','ArrowRight'));labels();
        }
        busy=true;worker.postMessage({type:'step',steps,inputs:inputs()});
      }
    }
    const sample=playback.sample(dt,trial?.end);
    if(sample){
      const {left,right,mix}=sample;
      if(left!==uploadedLeft||right!==uploadedRight){
        for(const [index,frame] of [left,right].entries()){
          const limit=frame.limit??=frame.display.reduce((peak,h)=>Math.max(peak,Math.abs(h)),.001);
          uniforms.heightScale.value.setComponent(index,limit);
          for(let i=0;i<641;i++){
            const q=Math.round(32767+65534*frame.state.generatorProfile[i]);
            trainData[4*i+index*2]=q>>8;trainData[4*i+index*2+1]=q&255;
          }
          for(let i=0;i<frame.display.length;i++){
            const q=Math.round((1+frame.display[i]/limit)*32767);
            data[4*i+2*index]=q>>8;data[4*i+2*index+1]=q&255;
          }
        }
        trainMap.needsUpdate=true;map.needsUpdate=true;uploadedLeft=left;uploadedRight=right;
      }
      uniforms.frameMix.value=mix;
      const s=right.state;
      const at=k=>left.state[k]+mix*(s[k]-left.state[k]);
      ship.position.set(at('east'),at('heave'),-at('north'));
      const wave=trial?.initial??inputs(),time=at('time');
      // Infer the actuator displacement from the model's linear wedge transfer
      // and the phase of the established incident wave at the east boundary.
      const travel=trial?-wave.waveAmplitude/(.36*s.waveNumber)*Math.sin(s.waveOmega*time+s.waveNumber*34.5-wave.initialPhase):at('plungerTravel');
      facility.update(ship.position.x,ship.position.z,travel);
      ship.rotation.set(at('roll'),at('heading'),at('pitch'),'YZX');
      rudders.forEach(r=>r.rotation.y=-at('rudder')*Math.PI/180);
      props.forEach((p,i)=>p.rotation.x=(i===0?1:-1)*at('propAngle'));

      if(trial){
        const measured=sampleTrial(trial.rows,time);
        ghost.visible=true;
        ghostProps[0].rotation.x=measured('portAngle');ghostProps[1].rotation.x=-measured('starboardAngle');
        ghost.position.set(measured('east'),measured('heave'),-measured('north')-Number($('ghostOffset').value));
        ghost.rotation.set(measured('roll'),measured('heading'),measured('pitch'),'YZX');
        const finished=time>=trial.end-1e-7,tick=finished?Infinity:Math.floor(time*10);
        if(tick!==readoutTick){
          readoutTick=tick;
          $('readout').textContent=(finished?'Replay complete · ':'')+time.toFixed(2)+' / '+trial.end.toFixed(2)+' s · 538 rpm · head seas';
          const gap=Math.hypot(at('east')-measured('east'),at('north')-measured('north'));
          const dz=1000*(at('heave')-measured('heave'));
          $('trackGap').textContent='Track separation '+gap.toFixed(2)+' m';
          $('heaveGap').textContent='Heave Δ '+(dz>=0?'+':'')+dz.toFixed(0)+' mm';
          $('gaugeValue').textContent=(measured('gauge')*1000).toFixed(1)+' mm';
          for(const attr of ['x1','x2'])$('gaugeCursor').setAttribute(attr,300*time/trial.end);
          $('rpmHistory').textContent='Recorded shafts (P/S) '+Math.round(measured('portRpm'))+' / '+Math.round(measured('starboardRpm'))+' rpm';
        }
      }
      uniforms.time.value=time;uniforms.amp.value=wave.waveAmplitude;
      uniforms.wave.value.set(s.waveNumber*Math.cos(wave.waveDirection),s.waveNumber*Math.sin(wave.waveDirection),s.waveOmega,wave.initialPhase??0);
    }
    uniforms.origin.value.set(ship.position.x,-ship.position.z);
    uniforms.contours.value=Number($('contours').checked);
    const view=$('cameraView').value;
    if(view==='hall'){
      forward.set(-Math.cos(azimuth)*Math.cos(elevation),-Math.sin(elevation),-Math.sin(azimuth)*Math.cos(elevation));
      rightward.set(Math.sin(azimuth),0,-Math.cos(azimuth));
      const held=(a,b)=>Number(keys.has(a)||keys.has(b));
      move.copy(forward).multiplyScalar(held('KeyW','ArrowUp')-held('KeyS','ArrowDown'));
      move.addScaledVector(rightward,held('KeyD','ArrowRight')-held('KeyA','ArrowLeft'));
      move.y+=Number(keys.has('KeyR'))-Number(keys.has('KeyF'));
      goal.copy(flyEye).addScaledVector(move.clampLength(0,1),4*dt).add(pan);pan.set(0,0,0);
      cameraModel.set('previous',flyEye.toArray());cameraModel.set('desired',goal.toArray());
      cameraModel.set('boat',[ship.position.x,ship.position.y,ship.position.z,ship.rotation.y]);
      cameraModel.set('carrier',[facility.bridge.position.x,facility.trolley.position.z,facility.stroke]);
      flyEye.fromArray(cameraModel.get('position'));camera.position.copy(flyEye);
      target.copy(flyEye).addScaledVector(forward,radius);
    }else{
      if(view==='props'){const hull=ghost.visible?ghost:ship;hull.updateMatrixWorld();hull.localToWorld(target.set(-1.30,-.11,0));}
      else if(view==='ship')target.set(ship.position.x,.07,ship.position.z);
      else if(view==='generator')target.set(32,.25,0);
      else target.set(12,.3,0);
      if(view==='ship'&&ghost.visible)target.lerp(ghost.position,.5);
      target.add(pan);
      if(view!=='props')target.clamp(targetMin,targetMax);
      camera.position.set(target.x+radius*Math.cos(azimuth)*Math.cos(elevation),target.y+radius*Math.sin(elevation),
        target.z+radius*Math.sin(azimuth)*Math.cos(elevation));
      // Keep the observer inside the hall when orbiting near a wall or roof.
      if(view!=='props')camera.position.clamp(cameraMin,cameraMax);
      if(view==='ship' && Math.abs(target.z)<9.8){
        camera.position.x=Math.max(-5.24,Math.min(34.05,camera.position.x));
        camera.position.z=Math.max(-9.63,Math.min(9.63,camera.position.z));
      }
      // Clear the coping and equipment if the view is on the perimeter deck.
      if(camera.position.x< -5.2||camera.position.x>33.85||Math.abs(camera.position.z)>9.62)
        camera.position.y=Math.max(camera.position.y,1.95);
    }
    camera.lookAt(target);camera.updateMatrixWorld();
    if(camera.position.y>0&&!uniforms.contours.value){
      mirror.copy(camera);mirror.position.y=-camera.position.y;
      sight.copy(target);sight.y=-target.y;
      mirror.up.setFromMatrixColumn(camera.matrixWorld,1);mirror.up.y*=-1;
      mirror.lookAt(sight);mirror.updateMatrixWorld();
      mirrorMatrix.multiplyMatrices(mirror.projectionMatrix,mirror.matrixWorldInverse);
      const showGhost=ghost.visible,showMarker=landmark.visible;ghost.visible=false;landmark.visible=false;water.visible=false;renderer.clippingPlanes=clipWater;renderer.setRenderTarget(reflection);
      renderer.render(scene,mirror);renderer.setRenderTarget(null);renderer.clippingPlanes=[];water.visible=true;ghost.visible=showGhost;landmark.visible=showMarker;
    }
    renderer.render(scene,camera);requestAnimationFrame(frame);
  }
  reset();requestAnimationFrame(frame);
}
start().catch(error=>{$('readout').textContent='Basin could not start · '+error.message;});
