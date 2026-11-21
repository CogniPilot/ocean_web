import {sailingStart,windBearing,windSpeed} from './sailing-start.mjs';
import {wreckCaustics} from './caustics.mjs';
import {loadVehicleShell} from './vehicle-assets.mjs';
import {loadInstance} from './fmi3/instance.mjs?api=2';
import {sailboatMesh,observeBoat} from './board/boat.mjs';
import {splitCamera} from "./waterline.mjs";
import {drawCompass} from './compass.mjs';
import {forceDisplay,firstPersonInstruments} from './instrumentation.mjs?hud=2';
import {submarine} from './submarine.mjs?hud=2';
import {surveyDrone} from "./drone.mjs?hud=2";
import {mastCamera} from "./mast-camera.mjs";
import {courseScene,raceAudio,firstLeg,trueBearing} from "./regatta.mjs";
import {fleet} from "./fleet.mjs";
const T=window.THREE,$=id=>document.getElementById(id);
// Present two committed world poses between worker packets. Restore the
// measured pose after drawing so mast captures and peer packets stay synchronized.
function displayPose(){
  const start=new T.Vector3(),end=new T.Vector3(),startQ=new T.Quaternion(),endQ=new T.Quaternion();
  let stamp,arrival,interval=1;
  return {
    apply(mesh,time,now,running){
      if(time!==stamp){
        if(stamp===undefined){
          start.copy(mesh.position);startQ.copy(mesh.quaternion);
        }else{
          const blend=Math.min(1,(now-arrival)/interval);
          start.lerp(end,blend);startQ.slerp(endQ,blend);
          interval=Math.max(1,Math.min(160,Math.max(now-arrival,.9*interval)));
        }
        end.copy(mesh.position);endQ.copy(mesh.quaternion);stamp=time;arrival=now;
      }
      const blend=running?Math.min(1,(now-arrival)/interval):1;
      mesh.position.lerpVectors(start,end,blend);
      mesh.quaternion.slerpQuaternions(startQ,endQ,blend);
    },
    restore(mesh){mesh.position.copy(end);mesh.quaternion.copy(endQ);}
  };
}
async function run(){
  const url=new URL(location.href);
  const requestedHull=url.searchParams.get('boat');
  const runtime=url.searchParams.get('runtime')??document.body.dataset.defaultRuntime;
  const mobile=matchMedia('(pointer: coarse)').matches;
  const initialControl=url.searchParams.get('control');
  const sailingOnly=requestedHull!=='Sailboat' && url.searchParams.get('demo')!=='wreck' &&
    (runtime==='sailing' || (runtime==='world' && !url.searchParams.has('runtime') && (mobile || url.searchParams.has('room')))) &&
    (!initialControl || initialControl==='boat');
  const integrated=(runtime==='world'||runtime==='sailing')&&requestedHull!=='Sailboat';
  const cat=integrated||requestedHull==='Hobie16';
  const vessel=cat?'Hobie16':'Sailboat';
  $('vessel').value=vessel;
  $('vessel').onchange=()=>{url.searchParams.set('boat',$('vessel').value);if($('vessel').value!=='Hobie16')url.searchParams.delete('runtime');location.assign(url);};
  document.querySelector('h1').textContent=cat?'Hobie 16':'Sailboat';
  $('trampoline').hidden=!cat;$('vangControl').hidden=false;
  $('luffControlName').textContent=cat?'Downhaul':'Vang';
  // Start at the default loaded waterline for each hull.
  const inputs={...sailingStart(cat),launchHeight:cat ? .20 : .069,windEast:windSpeed*Math.cos(windBearing),windNorth:windSpeed*Math.sin(windBearing),currentEast:.2,currentNorth:.04,waveHeight:0,waveRoll:0,wavePitch:0,[cat?'downhaulInput':'vangInput']:.5,manualHelm:1,rudderInput:0,trimInput:0};
  const simulationReady=Promise.all([
    integrated?import('./world-view.mjs?hud=1').then(module=>module.openWorld(sailingOnly)):loadInstance(vessel,inputs),
    loadVehicleShell(cat?'hobie-hulls':'sloop-hull'),
    sailingOnly ? undefined : loadVehicleShell('survey-pressure-housing')
  ]);
  const renderer=new T.WebGLRenderer({canvas:$('view'),antialias:!mobile});
  renderer.setPixelRatio(Math.min(mobile ? .8 : 1,devicePixelRatio));renderer.toneMapping=T.ACESFilmicToneMapping;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(52,1,.045,550);camera.up.set(0,0,1);
  coast(T,scene,renderer.capabilities.isWebGL2 || renderer.extensions.has('ANGLE_instanced_arrays'));
  const [simulation]=await simulationReady;
  const world=integrated?simulation:null;
  const model=world?.boat??simulation;
  const worker=world?null:new Worker(new URL('./wave-worker.mjs',import.meta.url),{type:'module'});
  let waterFrame,waterError;
  if(worker){
    worker.onmessage=({data})=>{if(data.error)waterError=Error(data.error);else waterFrame=data;};
    worker.onerror=event=>{waterError=Error(event.message);};
    addEventListener('pagehide',()=>worker.terminate(),{once:true});
  }
  let omitWake=0;
  function waveInputs(){
    const [east,north,heading,heel,pitch,volume]=model.getMany(['east','north','heading','heel','pitch','sectionVolume']);
    return {omitWake,seaAmplitude:Number($('seaState').value),east,north,heading,heel,pitch,volume};
  }
  worker?.postMessage({init:{...waveInputs(),currentEast:inputs.currentEast,currentNorth:inputs.currentNorth,
    beamHalf:model.get('beamHalf'),stations:model.get('stationX'),separation:model.get('halfSpacing'),
    windEast:inputs.windEast,windNorth:inputs.windNorth}});
  let wakeTicks=0,lastSections;
  function settings(open){$('setup').hidden=!open;$('settings').setAttribute('aria-expanded',String(open));}
  settings(!mobile);$('settings').onclick=()=>settings($('setup').hidden);
  const boat=sailboatMesh(T,cat,model.get("foilX")[0]);scene.add(boat.group);
  const race=world?.race??await loadInstance('Regatta',{windBearing:Math.atan2(inputs.windNorth,inputs.windEast),east:model.get('east'),north:model.get('north'),utc:Date.now()/1000});
  const windField=world?.wind??await loadInstance('MarineWind',{meanEast:inputs.windEast,meanNorth:inputs.windNorth,east:model.get('east'),north:model.get('north')});
  let captureMast;
  $('mastCapture').onclick=()=>{
    captureMast??=mastCamera(T,renderer,scene,boat,cat);
    const shot=captureMast(),file={...shot,vehicle:vessel,simulationTime:model.time,positionENU:[model.get('east'),model.get('north'),model.get('heave')],rollPitchYaw:[model.get('heel'),model.get('pitch'),model.get('heading')],vaneRad:model.get('vane'),windTile:{sampleTime:windField.time,periodM:96,shape:[48,48,3],components:['east','north','roughness'],data:Array.from(windField.get('field'))}};
    const a=document.createElement('a'),href=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:'application/json'}));a.href=href;a.download='mast-'+model.time.toFixed(2)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),10000);
  };
  const boardClock=courseScene(T,scene,race),audio=raceAudio();
  let lastCountdown=null,raceTick=0,lastLap;
  const roomName=(url.searchParams.get('room')||'regatta').slice(0,64);
  const remote=fleet(T,scene,roomName,$('online'),{
    read:()=>({wind:Number($('wind').value),bearing:ocean.U.bearing.value,sea:$('seaState').value,sky:$('sky').value}),
    apply(settings){
      if(settings.wind!==undefined)$('wind').value=settings.wind;
      if(settings.bearing!==undefined)ocean.U.bearing.value=settings.bearing;
      if(settings.wind!==undefined||settings.bearing!==undefined)applyWind();
      if(settings.sea!==undefined){$('seaState').value=settings.sea;applySea();}
      if(settings.sky!==undefined)$('sky').value=settings.sky;
    }
  },$('crew'));camera.layers.enable(1);
  let joinAttempt=0;
  async function multiplayer(on){
    const attempt=++joinAttempt;
    $('multiplayer').setAttribute('aria-pressed',String(on));
    $('invite').hidden=true;
    if(!on){remote.leave();return;}
    $('online').textContent='Joining…';
    try{
      const transport=await import('./vendor/trystero.mjs');
      if(attempt!==joinAttempt)return;
      remote.join(transport);
      $('invite').hidden=false;
    }catch(error){
      if(attempt!==joinAttempt)return;
      remote.leave();
      $('multiplayer').setAttribute('aria-pressed','false');
      $('online').textContent='Unable to join';
      console.error(error);
    }
  }
  $('multiplayer').onclick=()=>multiplayer($('multiplayer').getAttribute('aria-pressed')!=='true');
  addEventListener('pagehide',()=>multiplayer(false));
  $('invite').onclick=async()=>{const link=new URL(location.href);link.searchParams.set('room',roomName);
    try{await navigator.clipboard.writeText(link.href);$('invite').textContent='Copied';}catch{prompt('Race room link',link.href);}};
  const theme=$('theme'),music=$('music');
  let musicContext,musicGain;
  function volumeControl(id,apply){
    const slider=$(id),key='ocean_web.'+id;
    try{
      const stored=localStorage.getItem(key);
      if(stored!==null && /^\d{1,3}$/.test(stored) && Number(stored)<=100)slider.value=stored;
    }catch{}
    const update=()=>{
      $(id+'Text').value=slider.value+'%';
      apply(slider.valueAsNumber/100);
    };
    update();
    slider.oninput=()=>{update();try{localStorage.setItem(key,slider.value);}catch{}};
  }
  volumeControl('effectsVolume',audio.setVolume);
  volumeControl('musicVolume',value=>musicGain?.gain.setTargetAtTime(value,musicContext.currentTime,.025));
  function audioPreference(id,apply,describe){
    const button=$(id),key='ocean_web.'+id+'Enabled';
    let on=true;
    try{on=localStorage.getItem(key)!=='false';}catch{}
    function show(){button.setAttribute('aria-pressed',String(on));describe(on);}
    function sync(){apply(on).catch(error=>{
      if(error.name!=='NotAllowedError' && error.name!=='AbortError')$('online').textContent=error.message;
    });}
    button.onclick=()=>{on=!on;try{localStorage.setItem(key,String(on));}catch{}show();sync();};
    show();sync();
    return ()=>{if(on)sync();};
  }
  const startMusic=audioPreference('music',async on=>{
    if(!on){theme.pause();return;}
    if(!musicContext){
      musicContext=new AudioContext();musicGain=musicContext.createGain();
      musicGain.gain.value=$('musicVolume').valueAsNumber/100;
      musicContext.createMediaElementSource(theme).connect(musicGain).connect(musicContext.destination);
    }
    await Promise.all([musicContext.resume(),theme.play()]);
  },on=>{music.title=(on?'Mute':'Play')+' music by Olivier Bérubé';});
  const startEffects=audioPreference('sound',audio.setEnabled,on=>{
    $('sound').title=on?'Mute sound':'Turn sound on';
    $('sound').firstElementChild.textContent=on?'🔊':'🔇';
  });
  function unlockAudio(event){
    if(!event.isTrusted)return;
    startMusic();startEffects();
    for(const type of ['click','keydown'])removeEventListener(type,unlockAudio);
  }
  for(const type of ['click','keydown'])addEventListener(type,unlockAudio);
  const hemi=new T.HemisphereLight(0xe5f8fb,0x767266,1.8);hemi.position.z=1;scene.add(hemi);
  const sun=new T.DirectionalLight(0xffe6b4,2.5);sun.position.set(15,10,20);scene.add(sun);
  const ocean=atmosphere(scene),sea={tile:new Float32Array(1024),wind:Math.hypot(inputs.windEast,inputs.windNorth),tide:0};
  const profiles={
    low:{ratio:.75,min:.5,capture:.375,interval:150,mesh:88,sky:.5},
    balanced:{ratio:1,min:.75,capture:.75,interval:65,mesh:120,sky:.75},
    high:{ratio:1,min:1,capture:1,interval:0,mesh:144,sky:1}
  };
  let preferred;
  try{preferred=localStorage.getItem('ocean-render-quality');}catch{}
  const selector=$('quality');
  selector.value=Object.hasOwn(profiles,preferred)?preferred:(mobile?'low':'high');
  let profile,pixelScale;
  function applyQuality(){
    omitWake=Number(selector.value==='low');
    world?.setWakeEnabled(!omitWake);
    remote.setWakeReception(Boolean(world?.hasPeerWake && !omitWake));
    if(omitWake && world?.hasPeerWake)world.set('peerWake',new Float64Array(4*38));
    profile=profiles[selector.value];pixelScale=Math.min(devicePixelRatio,profile.ratio);
    renderer.setPixelRatio(pixelScale);ocean.setQuality(profile,selector.value==='low');
  }
  applyQuality();
  selector.onchange=()=>{
    applyQuality();lastCapture=-Infinity;resize();
    try{localStorage.setItem('ocean-render-quality',selector.value);}catch{}
  };
  ocean.update(sea,sea);ocean.U.under.value=0;ocean.U.sunDir.value.copy(sun.position).normalize();
  ocean.U.moonDir.value.set(-.8,-.4,-.5);ocean.U.bearing.value=Math.atan2(inputs.windNorth,inputs.windEast);
  const rain=stormRain(T,scene,ocean,mobile);
  const caustics=wreckCaustics(T,renderer,ocean,mobile);
  // These objects are wholly below mean sea level, including their animation ranges.
  const submergedScenery=new T.Group();scene.add(submergedScenery);
  const materials=seabedMaterials(T,caustics.uniforms);const bottom=new T.Mesh(new T.PlaneGeometry(500,500),materials.sand);bottom.position.z=-13.71;submergedScenery.add(bottom);
  const wreckVisual=batchScenery(T,makeWreck(T,materials));submergedScenery.add(wreckVisual);caustics.setWreck(wreckVisual);const life=marineLife(T,submergedScenery,renderer.capabilities.isWebGL2);
  const underwaterFog=new T.FogExp2(0x124759,.075),split=splitCamera(T);
  const fpvForward=new T.Vector3(),drawInstruments=firstPersonInstruments($('flightHud'));
  const helmSeat=new T.Vector3(cat ? -1.2 : -.73,0,cat ? .65 : .18),orbitCenter=new T.Vector3();
  let angle=-.8,distance=cat?14:5.7,tilt=.16,drag=null,running=true,manual=true;
  $('view').onpointerdown=e=>{drag=[e.clientX,e.clientY];e.target.setPointerCapture(e.pointerId);};
  $('view').onpointermove=e=>{if(drag){angle-=(e.clientX-drag[0])*.008;tilt=Math.min(1.4,Math.max(-1.45,tilt+(e.clientY-drag[1])*.006));drag=[e.clientX,e.clientY];}};
  $('view').onlostpointercapture=()=>drag=null;
  $('view').onwheel=e=>distance=Math.max(2,Math.min(22,distance*Math.exp(e.deltaY*.001)));
  $('cameraDepth').onchange=()=>{
    const view=$('cameraDepth').value;
    if(view==='deck')tilt=.23;
    if(view==='keel')tilt=-.9;
  };
  if(cat){
    const trim=()=>{
      const auto=$('autoTrim').checked;
      $('ballX').disabled=$('ballY').disabled=auto;
      model.set('ballastManual',Number(!auto));
      model.set('ballastCmdX',Number($('ballX').value)/100);
      model.set('ballastCmdY',Number($('ballY').value)/100);
    };
    for(const id of ['autoTrim','ballX','ballY'])$(id).oninput=trim;
    trim();
    function deck(){
      const auto=$('autoDeck').checked;model.set('deckManual',Number(!auto));
      for(const [id,input] of [['mainCar','mainCarInput'],['jibCar','jibCarInput'],['jibSheet','jibTrimInput']]){
        $(id).disabled=auto;model.set(input,Number($(id).value)/100);
      }
    }
    for(const id of ['autoDeck','mainCar','jibCar','jibSheet'])$(id).oninput=deck;
    deck();
  }
  function applySea(){
    const level=Number($('seaState').value);
    if(world)world.set('seaState',level);
    else model.set('swellAmplitude',.30*level);
  }
  $('seaState').onchange=()=>{applySea();remote.changeWeather('sea',$('seaState').value);};
  $('sky').onchange=()=>remote.changeWeather('sky',$('sky').value);
  const keys=new Set();let drone;
  $('subSensors').open=!mobile;
  const sub=sailingOnly ? null : submarine(T,scene,world), sensorCanvas=$('sensorCam').getContext('2d');
  const drawForces=forceDisplay(T,scene,sub?.mesh,boat.group,cat,model);
  $('sonarMap').onchange=()=>{if(sub)sub.mapVisible=$('sonarMap').checked;};
  for(const id of ['showForces','showCompass'])$(id).onclick=()=>{
    const enabled=$(id).getAttribute('aria-pressed')!=='true';
    $(id).setAttribute('aria-pressed',String(enabled));
    if(id==='showCompass')$('dial').hidden=!enabled;
  };
  let drawnFrame,display;
  function drawFeatures(frame){
    if(!frame?.image||drawnFrame===frame.image)return;
    drawnFrame=frame.image;
    display??=sensorCanvas.createImageData(180,120);
    for(let y=0;y<120;y++)for(let x=0;x<180;x++){
      const i=(180*y+x)*4,value=frame.image[36*Math.floor(y/5)+Math.floor(x/5)];
      display.data[i]=display.data[i+1]=display.data[i+2]=value;display.data[i+3]=255;
    }
    sensorCanvas.putImageData(display,0,0);sensorCanvas.strokeStyle='#6aff96';
    for(let i=0;i<frame.estimate[15];i++)sensorCanvas.strokeRect(5*frame.features[5*i]-2,5*frame.features[5*i+1]-2,8,8);
  }
  const analog=new Map();
  const axis=(a,b)=>Math.max(-1,Math.min(1,Number(keys.has(a))-Number(keys.has(b))+(analog.get(a)||0)-(analog.get(b)||0)));
  const panel=$('vehiclePanel'),togglePanel=$('collapsePanel');
  togglePanel.onclick=()=>{panel.hidden=!panel.hidden;togglePanel.textContent=panel.hidden?'Show controls':'Hide controls';togglePanel.setAttribute('aria-expanded',String(!panel.hidden));};
  new ResizeObserver(([entry])=>document.body.style.setProperty('--panel-height',entry.target.offsetHeight+'px')).observe(panel.parentElement);
  const manualSelected=()=>sub?.active?sub.manual:drone?.active?drone.manual:manual;
  function touchControls(){
    analog.clear();
    const pad=$('sticks'),boatActive=!sub?.active&&!drone?.active;
    document.querySelectorAll('[data-boat]').forEach(el=>el.hidden=!boatActive);
    $('trampoline').hidden=!cat||!boatActive;
    document.querySelector('aside[aria-label="Race committee"]').hidden=!boatActive;
    $('showForces').hidden=$('showCompass').hidden=Boolean(drone?.active);
    $('dial').hidden=drone?.active||$('showCompass').getAttribute('aria-pressed')!=='true';
    $('helm').textContent=manualSelected()?'Manual':'Autopilot';
    pad.replaceChildren();pad.hidden=!mobile || !manualSelected();
    helm();
    if(pad.hidden)return;
    const layout=boatActive?[['Rudder','KeyD',null],['Ease / haul',null,'KeyW']]:
      [['Sway / forward','KeyD','KeyW'],['Yaw / rise','KeyE','KeyR']];
    for(const [label,horizontal,vertical] of layout){
      const stick=document.createElement('div'),knob=document.createElement('span'),caption=document.createElement('small');
      stick.className='stick';knob.className='knob';caption.textContent=label;stick.setAttribute('aria-label',label);
      stick.append(knob,caption);pad.append(stick);
      let finger=null;
      function move(e){
        const rect=stick.getBoundingClientRect(),half=rect.width/2;
        let x=horizontal?(e.clientX-rect.left-half)/(half*.73):0,y=vertical?(rect.top+half-e.clientY)/(half*.73):0;
        const scale=Math.max(1,Math.hypot(x,y));x/=scale;y/=scale;
        if(horizontal)analog.set(horizontal,x);
        if(vertical)analog.set(vertical,y);
        knob.style.transform='translate('+x*half*.57+'px,'+(-y*half*.57)+'px)';helm();
      }
      stick.onpointerdown=e=>{if(finger!==null)return;e.preventDefault();finger=e.pointerId;stick.setPointerCapture(finger);move(e);};
      stick.onpointermove=e=>{if(e.pointerId===finger)move(e);};
      stick.onlostpointercapture=e=>{if(e.pointerId!==finger)return;finger=null;analog.delete(horizontal);analog.delete(vertical);knob.style.transform='';helm();};
    }
  }
  const targetSelect=$('controlTarget'),wreckSurvey=url.searchParams.get('demo')==='wreck';
  let loadingDrone;
  function loadDrone(){
    loadingDrone??=surveyDrone(T,scene,world).then(vehicle=>{
      drone=vehicle;
      if(wreckSurvey)drone.manual=false;
    }).catch(error=>{loadingDrone=undefined;throw error;});
    return loadingDrone;
  }
  $('cutMotors').onclick=()=>{
    const cut=$('cutMotors').getAttribute('aria-pressed')!=='true';
    drone.cut(cut);$('cutMotors').setAttribute('aria-pressed',String(cut));
    $('cutMotors').textContent=cut?'Restore motors':'Cut motors';
  };
  async function selectTarget(){
    if(sailingOnly && targetSelect.value!=='boat'){
      if($('multiplayer').getAttribute('aria-pressed')==='true')url.searchParams.set('room',roomName);
      else url.searchParams.delete('room');
      url.searchParams.set('control',targetSelect.value);
      url.searchParams.set('runtime','world');location.assign(url);return;
    }
    keys.clear();analog.clear();helm();
    if(targetSelect.value==='drone'&&!drone){
      try{await loadDrone();}
      catch(error){
        if(targetSelect.value!=='drone')return;
        targetSelect.title=error.message;targetSelect.value=sub?.active?'sub':'boat';
      }
      if(targetSelect.value!=='drone'&&drone)return;
    }
    if(sub)sub.active=targetSelect.value==='sub';
    if(sub?.active){angle=Math.PI-.48;tilt=.32;}
    if(!world && drone?.active && targetSelect.value!=='drone' && drone.manual){
      race.set('landingReaction',[0,0,0,0,0,0]);model.set('droneLoad',[0,0,0,0,0,0]);
    }
    drone?.select(targetSelect.value==='drone');
    const flying=Boolean(drone?.active);
    $('view').focus({preventScroll:true});
    $('onboardOption').hidden=!sub?.active;
    $('droneFpvOption').hidden=!flying;
    if((!sub?.active&&$('cameraDepth').value==='onboard')||(!flying&&$('cameraDepth').value==='fpv'))$('cameraDepth').value='deck';
    $('subPanel').hidden=!sub?.active;
    $('cutMotors').hidden=$('flightKeys').hidden=!flying;
    document.querySelector('h1').textContent=sub?.active?'Survey submarine':flying?'RDD2 survey drone':(cat?'Hobie 16':'Sailboat');
    touchControls();
  }
  targetSelect.disabled=false;targetSelect.onchange=selectTarget;
  const initialTarget=wreckSurvey?'sub':url.searchParams.get('control');
  if(wreckSurvey){
    sub.manual=false;sub.mapVisible=true;$('sonarMap').checked=true;
  }
  if((world&&!sailingOnly)||wreckSurvey)loadDrone().catch(error=>{targetSelect.title=error.message;});
  if(initialTarget==='drone'||initialTarget==='sub'){
    targetSelect.value=initialTarget;
    selectTarget().then(()=>{
      if(targetSelect.value===initialTarget&&url.searchParams.get('view')==='fpv')$('cameraDepth').value=initialTarget==='sub'?'onboard':'fpv';
    });
  }

  function helm(){drone?.input(axis,keys.has('ShiftLeft')||keys.has('ShiftRight'));if(drone?.active||sub?.active){model.set('rudderInput',0);model.set('trimInput',0);return;}model.set('rudderInput',axis('KeyA','KeyD'));model.set('trimInput',axis('KeyW','KeyS'));}
  addEventListener('keydown',e=>{if(manualSelected()&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){keys.add(e.code);helm();}});
  addEventListener('keyup',e=>{keys.delete(e.code);helm();});addEventListener('blur',()=>{keys.clear();analog.clear();helm();});
  $('helm').onclick=()=>{
    if(sub?.active)sub.manual=!sub.manual;
    else if(drone?.active)drone.manual=!drone.manual;
    else{manual=!manual;model.set('manualHelm',Number(manual));}
    keys.clear();touchControls();
  };
  touchControls();
  $('vang').oninput=()=>model.set(cat?'downhaulInput':'vangInput',Number($('vang').value)/100);
  $('play').onclick=()=>{running=!running;if(!running)world?.clearQueued();$('play').textContent=running?'Pause':'Resume';};
  function applyWind(){const w=+$('wind').value;if(world){world.set('windSpeed',w);world.set('windBearing',ocean.U.bearing.value);}else{windField.set('meanEast',w*Math.cos(ocean.U.bearing.value));windField.set('meanNorth',w*Math.sin(ocean.U.bearing.value));}ocean.U.wind.value=w;$('windOut').textContent=w+' m/s';}
  $('wind').oninput=()=>{applyWind();remote.changeWeather('wind',Number($('wind').value));};
  if(url.searchParams.has('room'))multiplayer(true);
  function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  resize();addEventListener('resize',resize);
  $('luff').onclick=()=>{
    // Swing the wind onto the current bow. The wind stays at that bearing as the boat turns.
    ocean.U.bearing.value=Math.atan2(-Math.sin(model.get('heading')),-Math.cos(model.get('heading')));
    remote.changeWeather('bearing',ocean.U.bearing.value);
    $('wind').oninput();
    if(!manual)$('helm').click();
    keys.clear();helm();
    // Haul the boom amidships to feather the rig in the headwind.
    model.set('trimInput',-1);
  };
  const hullDisplay=displayPose(),flightDisplay=displayPose();
  const capturePosition=new T.Vector3(),captureRotation=new T.Quaternion();
  let captureTime=-Infinity,captureSky,captureSea,captureAspect;
  let prev=performance.now(),acc=0,lastCapture=-Infinity;
  let frameCost=1000/30,lastQualityCheck=0;
  let lastEnvironment,lastThunder;
  function updateLight(time){
    const sky=$('sky').value;
    const phase=sky==='Cycle'?time/240:sky==='Sunset'?.055:sky==='Moonlit'?-1:.9;
    if(sky!==lastEnvironment||sky==='Cycle'){
      const z=Math.sin(phase),x=Math.cos(phase);
      ocean.U.sunDir.value.set(x,.32,z).normalize();
      ocean.U.moonDir.value.copy(ocean.U.sunDir.value).negate();
      ocean.U.storm.value=Number(sky==='Storm');
      const day=Math.max(0,z);
      sun.position.copy(ocean.U.sunDir.value).multiplyScalar(30);
      sun.intensity=(.12+2.4*day)*(sky==='Storm'?.45:1);
      sun.color.set(sky==='Sunset'?0xffaf76:0xffe6b4);
      hemi.intensity=(.27+1.7*day)*(sky==='Storm'?.6:1);
      lastEnvironment=sky;
    }
    ocean.updateSky(renderer,time,sky);
  }
  const noGo=model.get('noGo');
  let meshTime,observedBoat;
  let lastWorldTick=-1,lastFieldTick=-1,lastSurfaceTick=-1,previousSurface;
  function draw(now){
    try{
      if(now>=raceTick){
        raceTick=now+50;
        const left=Math.ceil(race.get('countdown')),stage=race.get('stage');
        if(lastCountdown!==null&&lastCountdown<5&&left>295)audio.signal();
        lastCountdown=left;const label=left>298?'START':Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
        boardClock(label);$('countdown').textContent=label;
        const lap=race.get('lapTime');
        const tenths=Math.round(lap*10);
        const timer=Math.floor(tenths/600)+':'+((tenths%600)/10).toFixed(1).padStart(4,'0');
        if(stage===5)lastLap=timer;
        let cue=['Wait for start','Cross upwind','Mark 1','Mark 2','Cross finish downwind','Finished'][stage];
        if(stage===2 || stage===3){
          const e=race.get('markEast')[stage-2]-model.get('east');
          const n=race.get('markNorth')[stage-2]-model.get('north');
          cue+=' · '+trueBearing(e,n)+' · '+Math.round(Math.hypot(e,n))+' m';
        }
        $('raceCourse').textContent='TRI 1 · First leg '+firstLeg(race)+' · 1 & 2 to port';
        $('raceStatus').textContent=cue+(stage>=2?' · Lap '+timer:lastLap?' · Last lap '+lastLap:'');
        model.set('traffic',remote.contacts(model.get('east'),model.get('north')));
      }
      frameCost=.94*frameCost+.06*Math.min(120,now-prev);
      if(profile.min<profile.ratio&&now-lastQualityCheck>1500){
        const next=Math.max(Math.min(devicePixelRatio,profile.min),Math.min(devicePixelRatio,profile.ratio,pixelScale+(frameCost>39?-.1:frameCost<23?.05:0)));
        if(Math.abs(next-pixelScale)>.01){pixelScale=next;renderer.setPixelRatio(pixelScale);resize();}
        lastQualityCheck=now;
      }
      if(running)acc+=Math.max(0,Math.min(.22,(now-prev)/1000));prev=now;
      if(waterError)throw waterError;
      if(world){
        if(world.hasSeaClock){
          const phase=remote.seaTime(world.time,now);
          world.set('seaClockOffset',phase-world.time);
          if(world.hasWindAnchor)world.set('windAnchor',remote.windAnchor(phase,now,
            windField.get('gustEast'),windField.get('gustNorth'),windField.get('travelE'),windField.get('travelN')));
        }
        if(world.hasPeerWake){
          const strips=$('controlTarget').value==='boat'?world.get('waves.sourceStrips'):null;
          const sources=remote.wakeSources(now,strips,model.get('waterStamp'));
          if(!omitWake)world.set('peerWake',sources);
        }
        const steps=Math.min(5,Math.floor(acc/.01));acc=Math.min(.1,acc);
        if(running)acc=Math.max(0,acc-world.advance(steps)*.01);
        const tick=Math.round(world.time*100),waveTick=model.get('waterStamp'),fieldTick=Math.floor(tick/25);
        if(lastWorldTick!==waveTick){
          ocean.updateSpectrum(world.get('waves.height'),world.get('waves.driftE'),world.get('waves.driftN'),world.get('waves.period'));
          lastWorldTick=waveTick;
        }
        if(lastFieldTick!==fieldTick){
          ocean.updateWind(windField.get('field'));
          ocean.U.cloudTravel.value.set(windField.get(world.hasWindAnchor?'gustEast':'travelE'),windField.get(world.hasWindAnchor?'gustNorth':'travelN'));
          ocean.U.lightning.value.set(windField.get('strikeBearing'),windField.get('strikeFlash'));
          const thunder=windField.get('thunderArrival');if($('sky').value==='Storm'&&lastThunder!==undefined&&thunder>lastThunder)audio.thunder();
          lastThunder=thunder;lastFieldTick=fieldTick;
        }
        const surfaceTick=Math.floor(tick/20);
        if(surfaceTick!==lastSurfaceTick){
          const surface={tile:world.get('boatWater.tile'),tide:world.get('boatWater.tide'),wind:world.get('boatWater.wind')};
          ocean.update(previousSurface??surface,surface);previousSurface=surface;lastSurfaceTick=surfaceTick;
        }
        ocean.U.blend.value=Math.min(1,(tick%20)/10);
        wakeTicks=tick;
      }
      // Keep complete 10 ms solver steps but yield between them for input and rendering.
      const deadline=performance.now()+8;
      if(!world)acc=Math.min(acc,.1);
      while(running&&!world&&acc>=.01&&performance.now()<deadline){
        // One in-flight step. A slower device can display and accept controls
        // while the worker finishes, without dropping or reordering hull samples.
        if(wakeTicks%10===0 && !waterFrame){acc=Math.min(acc,.1);break;}
        if(wakeTicks%25===0){
          if(drone){
            const [east,north]=drone.position;
            windField.set('droneEast',east);windField.set('droneNorth',north);
          }
          windField.set('east',model.get('east'));windField.set('north',model.get('north'));windField.advance(.25);
          const [strike,bearing,flash,travelE,travelN,droneWind,localEast,localNorth,field]=windField.getMany(
            ['thunderArrival','strikeBearing','strikeFlash','travelE','travelN','droneWind','localEast','localNorth','field']);
          if($('sky').value==='Storm'&&lastThunder!==undefined&&strike>lastThunder)audio.thunder();
          lastThunder=strike;
          ocean.U.lightning.value.set(bearing,flash);
          ocean.U.cloudTravel.value.set(travelE,travelN);
          if(drone){drone.wind(droneWind);if(sub?.frame)drone.station(sub.frame.estimate[0],sub.frame.estimate[1]);}
          model.set('windEast',localEast);model.set('windNorth',localNorth);ocean.updateWind(field);
        }
        if(wakeTicks%10===0){
          const {height,incident,sections,origin,period,load}=waterFrame;
          waterFrame=null;
          race.set('wakeTile',height);race.set('driftEast',origin[0]);race.set('driftNorth',origin[1]);
          race.set('swellHeight',model.get('swellAmplitude'));
          worker.postMessage({...waveInputs(),windEast:windField.get('meanEast'),windNorth:windField.get('meanNorth')});
          model.set('useSectionWater',1);model.set('previousWater',lastSections??sections);
          model.set('sectionWater',sections);model.set('waterStamp',model.time);lastSections=sections;
          model.set('waveHeight',incident[0]);model.set('wavePitch',incident[1]);model.set('waveRoll',incident[2]);
          model.set('wakeEast',load[0]);model.set('wakeNorth',load[1]);model.set('wakeYaw',load[2]);
          ocean.updateSpectrum(height,...origin,period);
        }
        wakeTicks++;
        model.advance(.01);
        if(wakeTicks%5===0){
          race.set('east',model.get('east'));race.set('north',model.get('north'));
          race.set('utc',Date.now()/1000);race.advance(.05);
        }
        if(drone && (drone.active||!drone.manual)){drone.deck(race.get('deckState'));drone.sailDeck(model.get('landingDeck'),cat);drone.step(.005);drone.step(.005);race.set('landingReaction',drone.deckReaction);model.set('droneLoad',drone.sailReaction);}acc-=.01;
      }
      ocean.U.spectrumBlend.value=world?model.get('waterFraction'):Math.min(1,((wakeTicks===0?0:(wakeTicks-1)%10+1)+acc/.01)/10);
      if(model.time!==meshTime){
        observedBoat=observeBoat(model);
        if(!observedBoat.every(Number.isFinite))throw Error('Non-finite FMI state at '+model.time);
      }
      const s=observedBoat;
      const subFrame=sub?.frame;
      if(!$('dial').hidden)drawCompass($('dial'),Math.hypot(model.get('windEast'),model.get('windNorth')),Math.atan2(model.get('windNorth'),model.get('windEast')),sub?.active&&subFrame?subFrame.flow:[model.get('currentEast'),model.get('currentNorth')],sub?.active&&subFrame?subFrame.estimate[3]:s[2],sub?.active?'sub':'surface',noGo);
      drawForces(!drone?.active&&$('showForces').getAttribute('aria-pressed')==='true',s,subFrame,!!sub?.active);
      const [ballastX,ballastY,k,direction,amplitude,phase,mainCar,jibCar,ve,vn,yawRate,sag,vang,leech,tension]=model.getMany(
        ['ballastX','ballastY','swellK','swellBearing','swellAmplitude','swellPhase','mainCar','jibCar','ve','vn','yawRate','exposedSheetSag',cat?'downhaulTension':'vangTension','leechSpeed','mainTension']);
      const ballast=cat?[ballastX,ballastY]:null;
      {
        ocean.U.swellCenter.value.set(s[0],s[1]);
        ocean.U.swell.value.set(amplitude,phase,k*Math.cos(direction),k*Math.sin(direction));
      }
      if(cat)$('weightPos').textContent='X '+ballast[0].toFixed(2)+' m · Y '+ballast[1].toFixed(2)+' m';
      remote.frame(now,s,cat,[...(ballast||[0,0]),mainCar,jibCar,ve,vn,yawRate,0],sub?.mesh,drone?.group,$('controlTarget').value);
      document.body.dataset.visiblePeers=remote.visible;
      const t=model.time;
      if(t!==meshTime){
        boat.update(s,ballast,cat?[mainCar,jibCar]:null,sag,cat?model.get('shroudTail'):null,cat?model.get('sailTail'):null,cat?model.get('stayPath'):null);
        life(t);causticTime.value=t;meshTime=t;
      }
      ocean.U.tm.value=t;ocean.U.boat.value.set(s[0],s[1],s[2],s[10]);
      if(world)hullDisplay.apply(boat.group,t,now,running);
      boat.group.localToWorld(orbitCenter.copy(helmSeat));
      const horizontal=distance*Math.cos(tilt);
      camera.up.set(0,0,1);
      camera.position.set(horizontal*Math.cos(angle),horizontal*Math.sin(angle),distance*Math.sin(tilt)).add(orbitCenter);
      if($('cameraDepth').value==='line')camera.position.z=0;
      camera.position.z=Math.max(-13.1,camera.position.z);
      camera.lookAt(orbitCenter);
      const flightHud=$('flightHud');
      const droneFpv=drone?.active && $('cameraDepth').value==='fpv';
      const subFpv=sub?.active && $('cameraDepth').value==='onboard' && sub.frame?.estimate;
      flightHud.hidden=!(droneFpv||subFpv);
      if(droneFpv)drawInstruments(drone.instruments(),camera.fov,renderer.domElement.clientHeight);
      if(subFpv){
        const e=sub.frame.estimate;
        drawInstruments({sub:true,roll:e[6],pitch:e[7],yaw:e[3],speed:Math.hypot(e[4],e[5]),level:-e[2]},camera.fov,renderer.domElement.clientHeight);
      }
      if(drone){
        drone.draw();
        if(world)flightDisplay.apply(drone.group,t,now,running);
        if(drone.active){
          const {position,quaternion}=drone.group;
          if($('cameraDepth').value==='fpv'){
            camera.position.set(.20,0,.035).applyQuaternion(quaternion).add(position);
            camera.up.set(0,0,1).applyQuaternion(quaternion);
            camera.lookAt(fpvForward.set(1,0,0).applyQuaternion(quaternion).add(camera.position));
          }else{
            camera.position.set(distance*.6*Math.cos(angle),distance*.6*Math.sin(angle),distance*.6*Math.sin(tilt)).add(position);
            camera.lookAt(position);
          }
        }
      }
      const showSensorImage=sub?.active && $('subSensors').open;
      if(running&&!sailingOnly)sub.update(t,axis,ocean.U.wind.value,ocean.U.bearing.value,showSensorImage);
      if(sub?.active){
        const p=sub.mesh.position;
        if($('cameraDepth').value==='onboard'){
          const q=sub.mesh.quaternion;
          camera.position.set(.592,0,.10).applyQuaternion(q).add(p);
          camera.up.set(0,0,1).applyQuaternion(q);
          camera.lookAt(new T.Vector3(1,0,0).applyQuaternion(q).add(camera.position));
        }else{
          camera.position.set(p.x+.6*distance*Math.cos(angle),p.y+.6*distance*Math.sin(angle),p.z+.6*distance*Math.sin(tilt));camera.lookAt(p);
        }
        if(showSensorImage)drawFeatures(sub.frame);
      }
      ocean.dome.position.copy(camera.position);ocean.water.position.set(s[0],s[1],0);updateLight(t);caustics.update(t,selector.value!=='low'||camera.position.z<ocean.U.tide.value+.5);
      const surfaceBand=.55+1.8*Number($('seaState').value)+Math.abs(ocean.U.swell.value.x);
      const storm=$('sky').value==='Storm';
      rain.visible=false; // Optical reflection and refraction targets exclude foreground streaks.
      // The underwater shader computes the view through the surface from the sky.
      // Its opaque submerged pass never samples the planar capture targets.
      if(camera.position.z<=-surfaceBand)lastCapture=-Infinity;
      else if(now-lastCapture>=profile.interval && (lastCapture===-Infinity ||
        t!==captureTime || camera.aspect!==captureAspect || remote.visible || captureSky!==$('sky').value || captureSea!==$('seaState').value ||
        !capturePosition.equals(camera.position) || !captureRotation.equals(camera.quaternion))){
        capturePosition.copy(camera.position);captureRotation.copy(camera.quaternion);
        captureTime=t;captureAspect=camera.aspect;captureSky=$('sky').value;captureSea=$('seaState').value;
        ocean.capture(renderer,camera,submergedScenery);lastCapture=now;
      }
      rain.visible=storm && camera.position.z>=-surfaceBand;
      if(rain.visible)rain.material.uniforms.rainWind.value.set(model.get('windEast'),model.get('windNorth'));
      audio.update(model.get('cupSpeed'),storm,camera.position.z-ocean.U.tide.value,Number($('seaState').value));
      if(Math.abs(camera.position.z)<surfaceBand){split(renderer,scene,camera,ocean,underwaterFog);}
      else{
        const submerged=camera.position.z<0;
        scene.fog=submerged?underwaterFog:null;scene.background=submerged?underwaterFog.color:null;
        ocean.U.under.value=Number(submerged);ocean.dome.visible=!submerged;renderer.render(scene,camera);
      }
      if(world){
        hullDisplay.restore(boat.group);
        if(drone)flightDisplay.restore(drone.group);
      }
      document.body.dataset.eyeDepth=camera.position.z.toFixed(2);
      $('vangLoad').textContent=vang.toFixed(0)+' N';
      $('readout').textContent=t.toFixed(1)+' s · '+Math.hypot(s[34],s[35]).toFixed(2)+' m/s · waypoint '+s[8]+' · main leech '+leech[0].toFixed(2)+' m/s · sheet '+(tension<.1?'slack':tension.toFixed(0)+' N');
      if(drone?.active){const [e,n,z]=drone.position;$('readout').textContent='E '+e.toFixed(1)+' m · N '+n.toFixed(1)+' m · Altitude '+z.toFixed(2)+' m · Drag '+Math.hypot(...drone.drag).toFixed(2)+' N';}
      if(sub?.active){
        const f=sub.frame;
        $('readout').textContent=sub.error||(!f?'Starting underwater navigation…':f.time.toFixed(2)+' s · Depth '+(-f.position[2]).toFixed(2)+' m · '+f.estimate[15]+' features · '+f.estimate[16]+' matches · '+f.estimate[12]+' keyframes'+(f.surveyDone?' · Survey complete':f.waypoint?' · Waypoint '+f.waypoint+'/'+f.waypointCount:''));
      }
      document.body.dataset.runtime=sailingOnly?'sailing':world?'world':'fleet';document.body.dataset.simTime=t;document.body.dataset.east=s[0];requestAnimationFrame(draw);
    }catch(e){$('readout').textContent=e.message;console.error(e);}
  }
  requestAnimationFrame(draw);
}
run().catch(e=>{document.getElementById('readout').textContent=e.message;console.error(e);});
