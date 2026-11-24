import {harborMap} from './harbor-map.mjs';
import {physicsView,sampleAirflow,hullInspectionFields,refinedHullInspectionFields,cruiserInspectionFields,battenInspectionFields} from './physics-view.mjs';
import {collisionOverlay,drawAnimalCollision,drawVesselContacts,hullWires,pontoonWires,compoundHullWires} from './collision-view.mjs';
import {cruiserInertia,inertiaOverlay,sailingInertia,subInertia} from './inertia-view.mjs';
import {surfaceCollisionShapes} from './surface-collision-view.mjs';
import {subCollisionShapes} from './sub-collision-view.mjs';
import {cruiserSonar,imagingBeepInterval} from './cruiser-sonar.mjs';
import {cruiserChart} from './cruiser-chart.mjs';
import {sailingStart,startGate,windBearing} from './sailing-start.mjs';
import {waterCaptureLayer,showInLowWaterCapture} from './render-layers.mjs';
import {wreckCaustics} from './caustics.mjs';
import {loadVehicleShell} from './vehicle-assets.mjs';
import {loadInstance} from './fmi3/instance.mjs?api=3';
import {sailboatMesh,observeBoat,sailingRigFields} from './board/boat.mjs';
import {sailPanelFields,readSailPanels} from './board/sail-battens.mjs';
import {bowFoamGrid} from './bow-grid.mjs';
import {splitCamera} from "./waterline.mjs";
import {drawCompass,drawDroneCompass} from './compass.mjs';
import {forceDisplay,firstPersonInstruments} from './instrumentation.mjs?hud=2';
import {mastCamera} from "./mast-camera.mjs";
import {cameraCones} from './camera-cones.mjs';
import {courseScene,raceCoursePoints,raceAudio,firstLeg,raceTarget} from "./regatta.mjs";
import {raceRules} from './race-rules.mjs';
import {lapLeaderboard,lapClock} from "./lap-board.mjs";
import {animalSticks,controlGain,keyboardAxisKey,keyboardSticks,pilotSticks} from './keyboard-sticks.mjs';
import {surfaceSpray} from './water-spray.mjs';
import {wildlifeWater} from './wildlife-wake.mjs';
import {cabinCruiser,cruiserUnderwaterViews,hullLamps,hullGlowLobes,cruiserBeamGLSL,cruiserHullGLSL,searchlightHeight} from './motorboat.mjs';
import {fishFinder} from './fish-finder.mjs';
import {harborTraffic} from './harbor-traffic.mjs';
import {gullIndex,vesselNpcNames} from './npc-room.mjs';
import {fleet,loadFleetTurn} from "./fleet.mjs";
import {neuralUpscaling} from './neural-upscaler.mjs';
const T=window.THREE,$=id=>document.getElementById(id);
const renderInterval=1000/30,knotsPerMetrePerSecond=3600/1852;
const objectDrawRange=5500,longSwell='1.5';
const directControls=['drone','sub','whale','shark','gull','motorboat'];
const profiles={
  fast:{target:20,ratio:.6,min:.4,mesh:48,sky:.375,omitWake:true,skipCaptures:true},
  low:{target:20,captureInterval:1000/15,ratio:.75,min:.5,capture:.375,reflectSamples:0,mesh:88,sky:.5,omitWake:true},
  balanced:{target:10,captureInterval:1000/30,ratio:1,min:.75,capture:.75,reflectSamples:2,mesh:120,sky:.75,compactOnMobile:true},
  high:{target:5,captureInterval:0,ratio:1,min:1,capture:1.25,mesh:144,sky:1,reflectSamples:2}
};
// Present two committed world poses between worker packets. Restore the
// measured pose after drawing so mast captures and peer packets stay synchronized.
function displayPose(){
  const start=new T.Vector3(),end=new T.Vector3(),startQ=new T.Quaternion(),endQ=new T.Quaternion();
  let stamp,arrival,interval=1;
  return {
    previous:1,
    apply(mesh,time,now,running){
      if(time!==stamp){
        if(stamp===undefined){
          start.copy(mesh.position);startQ.copy(mesh.quaternion);
        }else{
          const blend=Math.min(1,(now-arrival)/interval);
          this.previous=blend;
          start.lerp(end,blend);startQ.slerp(endQ,blend);
          interval=Math.max(1,Math.min(160,Math.max(now-arrival,.9*interval)));
        }
        end.copy(mesh.position);endQ.copy(mesh.quaternion);stamp=time;arrival=now;
      }
      const blend=running?Math.min(1,(now-arrival)/interval):1;
      mesh.position.lerpVectors(start,end,blend);
      mesh.quaternion.slerpQuaternions(startQ,endQ,blend);
      return blend;
    },
    restore(mesh){mesh.position.copy(end);mesh.quaternion.copy(endQ);}
  };
}
// Blend successive completed water samples over their observed delivery time.
function waterPresentation(nominal=1){
  let stamp,arrival,interval=1;
  return {
    sample(value,now){
      if(stamp===value)return;
      interval=arrival===undefined?nominal:Math.max(nominal,Math.min(500,now-arrival));
      stamp=value;arrival=now;
    },
    blend(now,running){return running&&arrival!==undefined?Math.min(1,(now-arrival)/interval):1;}
  };
}
function pontoonPresentation(){
  const timing=waterPresentation(100);
  let stamp,from,to,shown;
  return (points,sectionTime,now,running)=>{
    if(!shown||shown.length!==points.length){
      shown=points.slice();
      from=points.slice();to=points;
      stamp=sectionTime;
      timing.sample(stamp,now);
    }else if(stamp!==sectionTime){
      // Retain the displayed trace when a new native sample arrives, so
      // a worker batch can never move the line discontinuously.
      from.set(shown);
      to=points;
      stamp=sectionTime;
      timing.sample(stamp,now);
    }
    const blend=timing.blend(now,running);
    for(let i=0;i<shown.length;i++)shown[i]=from[i]+blend*(to[i]-from[i]);
    return shown;
  };
}
function vehicleLink(url,choice){
  const link=new URL(url);
  for(const name of ['runtime','boat','control','demo','view'])link.searchParams.delete(name);
  if(directControls.includes(choice))link.searchParams.set('control',choice);
  else if(choice==='sloop')link.searchParams.set('boat','Sailboat');
  else if(choice==='hobie')link.searchParams.set('boat','Hobie16');
  return link;
}
function joinRoomLink(url,room){
  url.searchParams.set('room',room);
  url.searchParams.set('join','1');
  return url;
}
async function chooseVehicle(){
  const dialog=$('vehiclePicker');
  dialog.addEventListener('cancel',event=>event.preventDefault());
  dialog.showModal();
  return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true}));
}
const resetStorage='ocean-world-reset';
const crtStorage='ocean-crt-filter';
const settingsFields='wind seaState sky storm quality simulationSpeed compassWind crtFilter keyLayout roomName physicsView physicsRig physicsHulls physicsWater physicsAir waveLayer collisionShapes inertiaShapes cameraCones showDroneCovariance vang outhaul autoTrim showBallastMarker ballX ballY autoDeck jibTackAssist mainCar jibCar jibSheet searchLamp keelLamp lampYaw lampTilt subMode flightMode sonarMap showDvlRays cruiserSonarRange echoCamera wiperSwitch jibHalyard mastPort musicVolume effectsVolume spawnKind'.split(' ');
const toggleSettings=['showCompass','showForces','cruiserChartFit','cutMotors','helm','subLamp'];
const settingPanels=()=>document.querySelectorAll('.control-pane,#racePanel,#fleetRoster,#cruiserSonarPanel,#cruiserCameras,#subSensors,#fishFinder');
function readReset(){
  try{
    const json=sessionStorage.getItem(resetStorage);
    sessionStorage.removeItem(resetStorage);
    return JSON.parse(json);
  }catch{return null;}
}
const viewerLayout=[...document.body.children].filter(node=>node.tagName!=='SCRIPT').map(node=>node.cloneNode(true));
const initialBodyStyle=document.body.style.cssText;
let localRadioRecording,localRadioUrl;
async function run(saved=readReset(),carried){
  const lifetime=new AbortController(),{signal}=lifetime;
  const on=(target,type,listener,options)=>target.addEventListener(type,listener,{...options,signal});
  const cleanup=callback=>signal.addEventListener('abort',callback,{once:true});
  for(const id of settingsFields){
    const field=$(id),value=saved?.fields[id];
    if(typeof value==='boolean')field.checked=value;
    else if(typeof value==='string')field.value=value;
  }
  const crtFilter=$('crtFilter'),crtOverlay=$('crtOverlay');
  if(typeof saved?.fields.crtFilter!=='boolean'){
    try{crtFilter.checked=localStorage.getItem(crtStorage)!=='off';}catch{}
  }
  crtOverlay.hidden=!crtFilter.checked;
  on(crtFilter,'change',()=>{
    crtOverlay.hidden=!crtFilter.checked;
    try{localStorage.setItem(crtStorage,crtFilter.checked?'on':'off');}catch{}
  });
  const keyLayout=$('keyLayout');
  if(!saved?.fields.keyLayout){try{if(localStorage.getItem('ocean-key-layout')==='wasd')keyLayout.value='wasd';}catch{}}
  const wasd=()=>keyLayout.value==='wasd';
  let url=new URL(location.href);
  if(url.searchParams.get('control')==='onrt'){location.replace('./onrt.html');return;}
  const packaged=document.body.dataset.defaultRuntime==='world';
  if(packaged&&!['runtime','boat','control','demo'].some(name=>url.searchParams.has(name))){
    const choice=await chooseVehicle();
    if(choice==='onrt'){location.assign('./onrt.html');return;}
    url=vehicleLink(url,choice);
    history.replaceState(history.state,'',url);
  }
  const startupScreen=$('startupScreen'),startupStatus=$('startupStatus'),startupProgress=$('startupProgress');
  function reportStartup(status,progress){
    if(signal.aborted)return;
    if(startupStatus.textContent!==status)startupStatus.textContent=status;
    if(progress>startupProgress.value)startupProgress.value=progress;
  }
  reportStartup('Loading model and scene',.05);
  const startupControls=[...document.body.children].filter(node=>node!==startupScreen&&node.tagName!=='SCRIPT');
  for(const node of startupControls)node.inert=true;
  let starting=true;
  on(window,'keydown',event=>{
    if(!starting||startupScreen.contains(event.target))return;
    event.stopImmediatePropagation();
  },{capture:true});
  const joinRoomOnLoad=url.searchParams.has('room')&&url.searchParams.get('join')==='1';
  const requestedHull=url.searchParams.get('boat');
  const mobile=matchMedia('(pointer: coarse)').matches;
  const selector=$('quality');
  let preferred;
  try{preferred=localStorage.getItem('ocean-render-quality');}catch{}
  const requestedQuality=url.searchParams.get('quality');
  selector.value=saved?.fields.quality??(Object.hasOwn(profiles,requestedQuality)?requestedQuality:
    Object.hasOwn(profiles,preferred)?preferred:mobile?'low':'high');
  let profile=profiles[selector.value],omitWake=Number(Boolean(profile.omitWake)),pixelScale,upscaling;
  const adaptiveWater=()=>mobile&&(selector.value==='balanced'||selector.value==='high');
  const speedSelect=$('simulationSpeed'),multiplayerButton=$('multiplayer');
  const requestedSpeed=saved?.fields.simulationSpeed??url.searchParams.get('speed');
  if(['1','1.5','2'].includes(requestedSpeed))speedSelect.value=requestedSpeed;
  let playbackRate=1,timedLap=true,frameTest;
  let statsStart,statsTime,statsFrames=0,statsRunning;
  const wreckSurvey=url.searchParams.get('demo')==='wreck';
  const initialTarget=wreckSurvey?'sub':url.searchParams.get('control');
  const selectedRole=directControls.includes(initialTarget)?initialTarget:'boat';
  const fullWorld=selectedRole!=='motorboat'&&url.searchParams.get('runtime')==='world'&&requestedHull!=='Sailboat';
  const sailingMode=requestedHull==='Sailboat'?'sloop':'sailing';
  const modes={boat:sailingMode,motorboat:'motorboat',drone:'flight',sub:'submarine',whale:'habitat',shark:'habitat',gull:'habitat'};
  const mode=selectedRole==='motorboat'?'motorboat':fullWorld?'world':packaged?modes[selectedRole]:url.searchParams.get('runtime')==='sailing'?sailingMode:null;
  const cruiserRuntime=carried?.cruiserRuntime??(mode==='motorboat'?{lifetime:new AbortController()}:null);
  let preserveCruiser=false;
  if(cruiserRuntime)cleanup(()=>{if(!preserveCruiser)cruiserRuntime.lifetime.abort();});
  const hasBoat=!mode||mode==='world'||mode===sailingMode;
  const hasSub=fullWorld||mode==='submarine'||(!packaged&&!mode);
  const cat=hasBoat&&(mode==='world'||mode==='sailing'||requestedHull==='Hobie16');
  const vessel=cat?'Hobie16':'Sailboat';
  document.querySelector('h1').textContent=cat?'Hobie 16':'Sailboat';
  $('mainSheetStatus').hidden=!cat;
  $('trampoline').hidden=!cat;$('vangControl').hidden=false;
  $('luffControlName').textContent=cat?'Mainsail downhaul':'Boom vang';
  // Start at the default loaded waterline for each hull.
  const start=sailingStart(cat),weatherBearing=saved?.bearing??windBearing,initialWind=$('wind').valueAsNumber;
  if(saved?.spawn)Object.assign(start,saved.spawn);
  const inputs={...start,launchHeight:cat ? .20 : .069,launchSeaState:Number($('seaState').value),windEast:initialWind*Math.cos(weatherBearing),windNorth:initialWind*Math.sin(weatherBearing),currentEast:.2,currentNorth:.04,waveHeight:0,waveRoll:0,wavePitch:0,[cat?'downhaulInput':'vangInput']:.5,manualHelm:1,rudderInput:0,trimInput:0};
  function reportModelProgress({phase,received,total}){
    if(phase==='download')reportStartup('Downloading physics model',.12+.38*Math.min(1,received/total));
    else if(phase==='construct')reportStartup('Starting physics model',.53);
    else if(phase==='initialize')reportStartup('Initializing physics model',.60);
    else if(phase==='warmup')reportStartup('Warming up physics',.66);
  }
  const simulationReady=Promise.all([
    mode==='motorboat'&&cruiserRuntime.world?cruiserRuntime.world:
      mode?import('./world-view.mjs').then(module=>module.openWorld(mode,Number($('seaState').value),omitWake,mobile&&mode==='sailing'?2:1,{
        start,weatherBearing,wind:initialWind,motorStart:saved?.spawn,warmSolver:true,onProgress:reportModelProgress,
        signal:mode==='motorboat'?cruiserRuntime.lifetime.signal:signal
      })):loadInstance(vessel,inputs),
    hasBoat?loadVehicleShell(cat?'hobie-hulls':'sloop-hull'):null,
    hasSub?Promise.all([import('./submarine.mjs?hud=2'),loadVehicleShell('survey-pressure-housing')]):null
  ]);
  const renderer=new T.WebGLRenderer({canvas:$('view'),antialias:!mobile});
  renderer.setPixelRatio(Math.min(mobile ? .8 : 1,devicePixelRatio));renderer.toneMapping=T.ACESFilmicToneMapping;
  cleanup(()=>{renderer.dispose();renderer.forceContextLoss();});
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(52,1,.045,objectDrawRange);camera.up.set(0,0,1);
  const clouds=harborClouds(T,scene);
  const island=coast(T,scene,renderer.capabilities.isWebGL2 || renderer.extensions.has('ANGLE_instanced_arrays'));
  cleanup(()=>{island.userData.terrainTextures.dispose();island.userData.bed.texture.dispose();});
  island.traverse(showInLowWaterCapture);
  const [simulation,,subAssets]=await simulationReady;
  reportStartup('Preparing graphics',.72);
  const world=mode?simulation:null;
  if(mode==='motorboat')cruiserRuntime.world=world;
  const backgroundCruiserWorld=mode==='motorboat'?null:cruiserRuntime?.world;
  speedSelect.closest('label').hidden=!world;
  const worldReadyAt=performance.now();
  let prev=worldReadyAt,physicsWall=worldReadyAt,acc=0;
  const model=world?world.boat:simulation;
  let contactModel,contactLoad;
  const worker=world?null:new Worker(new URL('./wave-worker.mjs',import.meta.url),{type:'module'});
  let waterFrame,lastWaveFrame,waterError;
  if(worker){
    worker.onmessage=({data})=>{if(data.error)waterError=Error(data.error);else waterFrame=data;};
    worker.onerror=event=>{waterError=Error(event.message);};
    cleanup(()=>worker.terminate());
  }
  function waveInputs(){
    const [east,north,heading,heel,pitch,volume]=model.getMany(['east','north','heading','heel','pitch','sectionVolume']);
    const sea=$('seaState').value;
    return {omitWake,seaAmplitude:sea===longSwell?0:Number(sea),east,north,heading,heel,pitch,volume};
  }
  worker?.postMessage({init:{...waveInputs(),currentEast:inputs.currentEast,currentNorth:inputs.currentNorth,
    beamHalf:model.get('beamHalf'),stations:model.get('stationX'),separation:model.get('halfSpacing'),
    windEast:inputs.windEast,windNorth:inputs.windNorth}});
  function localSwimmerWater(){
    if(motor){
      const [x,y,,heel,pitch,heading]=world.get('boatPose');
      return ocean.swimmerWater.hullWater('motor',x,y,heading,heel,pitch);
    }
    const [x,y,heading,heel,pitch]=model.getMany(['east','north','heading','heel','pitch']);
    return ocean.swimmerWater.hullWater(cat?'hobie':'sloop',x,y,heading,heel,pitch);
  }
  let wakeTicks=0,lastSections;
  const lastDrift=new T.Vector2(),nextDrift=new T.Vector2();
  const panel=$('vehiclePanel'),togglePanel=$('collapsePanel'),setup=$('setup'),settingsButton=$('settings');
  function showControls(open){
    panel.hidden=!open;
    togglePanel.setAttribute('aria-label',open?'Hide controls':'Show controls');
    togglePanel.setAttribute('aria-expanded',String(open));
  }
  function settings(open){
    setup.hidden=!open;
    settingsButton.setAttribute('aria-expanded',String(open));
    if(open)showControls(true);
    panel.scrollTop=open?setup.offsetTop-panel.offsetTop:0;
  }
  settingsButton.onclick=()=>settings(setup.hidden);
  togglePanel.onclick=()=>{
    if(!panel.hidden)settings(false);
    showControls(panel.hidden);
  };
  const positionText=(cm,positive,negative)=>cm===0?'Centered':Math.abs(cm)+' cm '+(cm>0?positive:negative);
  const hasTraveler=cat&&['travelerEase','travelerTension','travelerSag'].every(name=>model.has(name));
  const hasJibTackle=cat&&['jibSheetPins','jibSheetLoads'].every(name=>model.has(name));
  const hasRigGeometry=cat&&sailingRigFields.every(name=>model.has(name));
  const hasMastRotation=cat&&model.has("mastRotation");
  const sailPanels=cat?readSailPanels(model):null;
  const hasClothPanels=Boolean(sailPanels);
  const verticesFields=sailPanelFields.map(fields=>fields[3]);
  const boat=model?sailboatMesh(T,cat,model.get('foilX')[0],sailPanels,
    model.has('blockStack')?model.get('blockStack'):undefined,
    model.has('travelerMounts')?model.get('travelerMounts'):undefined):null;
  if(boat)scene.add(boat.group);
  const compassWind=$('compassWind');
  compassWind.value=cat?'apparent':'true';
  try{
    const preference=saved?.fields.compassWind??localStorage.getItem('ocean-compass-wind');
    if(preference==='apparent'||preference==='true')compassWind.value=preference;
  }catch{}
  compassWind.onchange=()=>{
    try{localStorage.setItem('ocean-compass-wind',compassWind.value);}catch{}
    lastDial=-Infinity;
  };
  const physicsToggle=$('physicsView'),physicsCanvas=$('physicsCanvas');
  const physicsLayers=$('physicsLayers'),collisionToggle=$('collisionShapes'),inertiaToggle=$('inertiaShapes');
  collisionToggle.checked=saved?.fields.collisionShapes??(url.searchParams.get('collisions')==='1');
  inertiaToggle.checked=saved?.fields.inertiaShapes??(url.searchParams.get('inertia')==='1');
  inertiaToggle.onchange=()=>{
    if(inertiaToggle.checked)url.searchParams.set('inertia','1');
    else url.searchParams.delete('inertia');
    history.replaceState(history.state,'',url);
  };
  const waveGrids=$('physicsWater'),waveLayer=$('waveLayer'),airflowToggle=$('physicsAir');
  airflowToggle.checked=saved?.fields.physicsAir??(url.searchParams.get('airflow')==='1');
  const airflowInterval=125;
  let airflowModel,airflowLoad,airflowFailure,airflowFrame,previousAirflow,airflowAt=-Infinity;
  waveGrids.onchange=()=>$('waveLayerControl').hidden=!waveGrids.checked;
  waveGrids.onchange();
  let inspector,physicsEnabled=false,inspectionHull,inspectionTime,hullGridSamples;
  const pontoonTrace=pontoonPresentation();
  function physicsVisibility(){
    physicsEnabled=physicsToggle.checked;
    physicsCanvas.hidden=physicsLayers.hidden=!physicsEnabled;
    world?.setPhysicsRequested(physicsEnabled||collisionToggle.checked);
    if(physicsEnabled)inspector??=physicsView(T,physicsCanvas,$('physicsStatus'));
  }
  physicsToggle.checked=saved?.fields.physicsView??(url.searchParams.get('physics')==='1');
  physicsToggle.onchange=()=>{
    if(physicsToggle.checked)url.searchParams.set('physics','1');
    else url.searchParams.delete('physics');
    history.replaceState(history.state,'',url);
    physicsVisibility();
  };
  const cruiserViews={
    motorCabin:[[1.28,0,.65],[2.48,.10,.72]],
    motorHelm:[[-.92,-.49,1.82],[3.1,-.47,.80]],
    motorCockpit:[[-2.98,.42,1.94],[1.00,-.14,1.22]],
    ...cruiserUnderwaterViews
  };

  const motor=mode==='motorboat'?cabinCruiser(T,$('cruiserSonarCanvas'),$('cruiserChartCanvas')):null;
  const backgroundCruiser=backgroundCruiserWorld?cabinCruiser(T):null;
  if(backgroundCruiser)scene.add(backgroundCruiser.group);
  let remoteEncounterCruiser;
  cleanup(()=>{motor?.dispose();backgroundCruiser?.dispose();remoteEncounterCruiser?.dispose();});
  if(motor){
    scene.add(motor.group);
    const cameraDepth=$('cameraDepth');
    for(const [title,id] of [['Helm','motorHelm'],['Cabin','motorCabin'],['Aft cockpit','motorCockpit']]){
      cameraDepth.add(new Option(title,id));
    }
    for(const option of $('echoCamera').options){
      if(Object.hasOwn(cruiserUnderwaterViews,option.value)){
        cameraDepth.add(new Option('Underwater '+option.text.toLowerCase()+' camera',option.value));
      }
    }
  }
  const race=world?.race??await loadInstance('Regatta',{...startGate,windBearing,east:model.get('east'),north:model.get('north'),utc:Date.now()/1000,
    hullStations:model.get('stationX'),hullWidths:model.get('beamHalf'),hullOffset:model.get('halfSpacing')});
  const windField=world?.wind??await loadInstance('MarineWind',{meanEast:inputs.windEast,meanNorth:inputs.windNorth,east:model.get('east'),north:model.get('north')});
  let mast,lastMastPreview=-Infinity;
  const mastPanel=$('mastPanel'),mastButton=$('mastCapture');
  const hasMastCameras=Boolean(boat?.cameraPorts.length);
  mastButton.onclick=()=>{
    if(!hasMastCameras)return;
    mastPanel.hidden=!mastPanel.hidden;
    mastButton.setAttribute('aria-expanded',String(!mastPanel.hidden));
    lastMastPreview=-Infinity;
  };
  $('mastPort').onchange=()=>{lastMastPreview=-Infinity;};
  function fromMast(render){
    mast??=mastCamera(T,renderer,scene,boat,objectDrawRange);
    const underwater=boat.group.localToWorld(mastPosition.fromArray(boat.cameraPorts[Number($('mastPort').value)])).z<ocean.U.tide.value;
    const fog=scene.fog,background=scene.background,dome=ocean.dome.visible,under=ocean.U.under.value;
    scene.fog=underwater?underwaterFog:null;scene.background=underwater?underwaterFog.color:null;
    ocean.dome.visible=!underwater;ocean.U.under.value=Number(underwater);
    try{return render(mast);}
    finally{scene.fog=fog;scene.background=background;ocean.dome.visible=dome;ocean.U.under.value=under;}
  }
  const mastPosition=new T.Vector3();
  $('mastExport').onclick=()=>{
    const shot=fromMast(rig=>rig.capture()),file={...shot,vehicle:vessel,simulationTime:model.time,positionENU:[model.get('east'),model.get('north'),model.get('heave')],rollPitchYaw:[model.get('heel'),model.get('pitch'),model.get('heading')],vaneRad:model.get('vane'),windTile:{sampleTime:windField.time,periodM:windField.get('period'),shape:[48,48,3],components:['east','north','roughness'],data:Array.from(windField.get('field'))}};
    const a=document.createElement('a'),href=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:'application/json'}));a.href=href;a.download='mast-'+model.time.toFixed(2)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),10000);
  };
  if(!world){
    for(const [input,field] of [['hullStations','stationX'],['hullWidths','beamHalf'],['hullOffset','halfSpacing']])race.set(input,model.get(field));
  }
  const course=courseScene(T,scene,race),audio=cruiserRuntime?.audio??raceAudio(T);
  cleanup(()=>{if(!preserveCruiser)audio.dispose();});
  let lastCountdown=null,raceTick=0,lastReportedFinish=0;
  const lastLaps=new Map();
  const normalizeRoom=value=>value.trim().slice(0,64)||'regatta';
  let roomName=normalizeRoom(url.searchParams.get('room')??saved?.fields.roomName??'');
  const roomField=$('roomName');roomField.value=roomName;
  const laps=lapLeaderboard(mode==='flight'?'RDD2':hasBoat?vessel:'Hobie16',roomName,$('racePanel'));
  const ruleTracker=raceRules(),penaltyFlag=$('racePenalty');
  let penaltyTurns=0;
  const turnCount=turns=>turns+' turn'+(turns===1?'':'s');
  function updatePenalty(status){
    if(!status)return;
    const {remaining,reason,degrees,wellClear}=status;
    if(remaining!==penaltyTurns){
      penaltyTurns=remaining;
      remote.setPenalty(remaining);
      if(world)world.set('finishAllowed',Number(!remaining));
      else race.set('finishAllowed',Number(!remaining));
    }
    penaltyFlag.hidden=!remaining;
    if(!remaining)return;
    const progress=wellClear?Math.min(350,Math.floor(degrees/10)*10)+'° / 360°':'Get clear before turning';
    const label='🚩 '+turnCount(remaining)+' · RRS '+reason.rule+' · '+reason.detail+' · '+progress;
    if(penaltyFlag.textContent!==label)penaltyFlag.textContent=label;
  }
  function resetPenalties(){
    ruleTracker.reset();updatePenalty({remaining:0});
  }
  function observePenalties(stage){
    if(!chatScope||!model||targetSelect.value!=='boat'){
      if(penaltyTurns)resetPenalties();
      return;
    }
    const [east,north,heading,speed,sheet,forces]=model.getMany(['east','north','heading','surge','sheet','peerContact']);
    const peers=new Map();
    for(const [slot,peer] of remote.contactPeers.entries()){
      const at=slot*9;
      const kind=peerCollisionSamples?.[at+8];
      if(peer&&kind<2&&peerCollisionSamples[at]>.5)peers.set(peer.id,{
        east:peerCollisionSamples[at+1],north:peerCollisionSamples[at+2],heading:peerCollisionSamples[at+3],
        cat:kind===1,sheet:peer.sheet,force:forces?.[slot]??0});
    }
    const [pinEast,pinNorth,markEast,markNorth,loads,countdown]=race.getMany(['pinEast','pinNorth','markEast','markNorth','markWrench','countdown']);
    const marks=[[pinEast,pinNorth],...[...markEast].map((x,i)=>[x,markNorth[i]])].map(([x,y],i)=>({
      east:x,north:y,force:loads?Math.hypot(...loads.slice(12*i,12*i+3)):0}));
    updatePenalty(ruleTracker.update({time:model.time,stage,countdown,boat:{east,north,heading,speed,sheet,cat},
      peers,marks,windFrom:ocean.U.bearing.value+Math.PI}));
  }
  const chatPanel=$('roomChat'),chatTitle=$('roomChatTitle'),chatButton=$('openChat'),chatLog=$('chatLog'),chatInput=$('chatMessage');
  let chatScope=null,chatPeers=0,unread=0;
  const chatWaiting="Waiting for someone to join this room.";
  function chatBadge(){
    const count=unread?' ('+unread+')':'';
    chatTitle.textContent='Room chat'+count;
    chatButton.textContent='Chat'+count;
  }
  function chatMessage(name,message){
    const row=document.createElement('li'),sender=document.createElement('strong');
    sender.textContent=name;
    row.append(sender,message);chatLog.append(row);
    if(chatLog.children.length>60)chatLog.firstElementChild.remove();
    if(chatPanel.open)chatLog.scrollTop=chatLog.scrollHeight;
    else{unread=Math.min(99,unread+1);chatBadge();}
  }
  const weather={
    read:()=>({wind:Number($('wind').value),bearing:ocean.U.bearing.value,sea:$('seaState').value,sky:$('sky').value,storm:$('storm').checked}),
    apply(settings){
      if(settings.wind!==undefined)$('wind').value=settings.wind;
      if(settings.bearing!==undefined)ocean.U.bearing.value=settings.bearing;
      if(settings.wind!==undefined||settings.bearing!==undefined)applyWind();
      if(settings.sea!==undefined){$('seaState').value=settings.sea;applySea();}
      if(settings.sky!==undefined)$('sky').value=settings.sky;
      if(settings.storm!==undefined)$('storm').checked=settings.storm;
    }
  };
  const chat={
    connected(room,peerCount){
      if(chatScope===room&&chatPeers===peerCount)return;
      if(chatScope!==room){
        chatScope=room;
        if(model)resetPenalties();
        chatButton.hidden=!room;
        chatPanel.hidden=!room;
        chatPanel.open=Boolean(room);
        chatLog.replaceChildren();
        chatInput.value='';
        unread=0;chatBadge();
      }
      chatPeers=peerCount;
      $('chatInvite').hidden=!room||peerCount>0;
      $('chatStatus').value=room&&!peerCount?chatWaiting:'';
    },
    receive:chatMessage
  };
  const remote=carried?.remote??fleet(T,scene,roomName,$('online'),weather,$('crew'),laps,playImagingHit,chat,audio.finishGun);
  function observeNpcFinish(number,row,status){
    laps.observeNpc(number,row,status,remote.npcName('npc-'+number));
    remote.recordFinish(status.heatStart,status.heatStart+status.elapsed,number);
  }
  const goBelow=$('goBelow'),anchorSwitch=$('anchorSwitch'),anchorReadout=$('anchorReadout'),wiperSwitch=$('wiperSwitch');
  let anchorLowered=cruiserRuntime?.anchorLowered??false;
  const cabinView=$('cabinControls'),cabinLight=$('cabinLight'),cabinRadio=$('cabinRadio'),integrityDisplay=$('cruiserIntegrity');
  const radioState=$('cabinRadioState'),radioStatus=$('cabinRadioStatus');
  const cabinLookDefault={yaw:0,pitch:0},cabinLook={...cabinLookDefault};
  const radioLocation=new URL('./assets/audio/spanish-ladies-radio.mp3',import.meta.url);
  const cruiserLampControls=['searchLamp','keelLamp','cameraKeelLamp'].map($);
  const encounterVariables=['encounterShark','structuralImpact','hullIntegrity','flooding','damagePanels','encounterHealth','boatDamage'];
  const targetData=new Float64Array(24*7),targetIds=Array(24).fill(null);
  let radio=cruiserRuntime?.radio,placeRadio=cruiserRuntime?.placeRadio,cabinLit=cruiserRuntime?.cabinLit??false;
  let radioRequested=cruiserRuntime?.radioRequested??false,radioCommand=0;
  let cruiserPowerLost=false,encounterStarted=cruiserRuntime?.started??false,encounterSession=cruiserRuntime?.session;
  let encounterFrame,lastImpact=cruiserRuntime?.lastImpact??0,lastHostCruiser;
  const cruiserSunk=(shark,damage)=>damage?.[2]>=2||shark?.[0]===4;
  const controlsEncounter=()=>multiplayerButton.getAttribute('aria-pressed')!=='true'||remote.connected&&remote.npc.host;
  function mayStartEncounter(){
    return Boolean(motor&&world.hasEncounter&&controlsEncounter());
  }
  function isEncounterNight(){
    const setting=$('sky').value;
    return setting==='Moonlit'||setting==='Cycle'&&ocean.U.sunDir.value.z<-.05;
  }
  function goBelowDeck(){
    if(!motor||animalId)return;
    cameraMenu.value=cameraMenu.value==='motorCabin'?'motorHelm':'motorCabin';
    cameraMenu.dispatchEvent(new Event('change'));
    viewport.focus();
  }
  goBelow.onclick=goBelowDeck;
  function toggleAnchor(){
    if(!motor||!world.hasAnchor)return;
    anchorLowered=!anchorLowered;
    world.set('lowerAnchor',Number(anchorLowered));
    anchorSwitch.setAttribute('aria-pressed',String(anchorLowered));
    anchorSwitch.textContent=anchorLowered?'Raise anchor':'Lower anchor';
  }
  if(backgroundCruiser){
    backgroundCruiser.setCabinLight(cabinLit);
    backgroundCruiser.setRadio(radioRequested);
  }
  anchorSwitch.onclick=toggleAnchor;
  $('wiperControl').hidden=!motor||!world.hasWiper;
  wiperSwitch.onchange=()=>{if(motor&&world.hasWiper)world.set('wiperSwitch',Number(wiperSwitch.checked));};
  if(motor)wiperSwitch.onchange();
  function toggleCabinLight(){
    if(cruiserPowerLost)return;
    cabinLit=!cabinLit;
    motor.setCabinLight(cabinLit);
    cabinLight.setAttribute('aria-pressed',String(cabinLit));
  }
  function setRadioIndicator(on){
    (motor??backgroundCruiser)?.setRadio(on);
    cabinRadio.setAttribute('aria-pressed',String(on));
    radioState.textContent=on?'On':'Off';
  }
  function prepareCabinRadio(){
    if(radio)return;
    radio=new Audio();
    radio.preload='auto';
    radio.loop=true;
    radio.src=localRadioUrl??radioLocation.href;
  }
  function stopRadio(){
    radioCommand++;
    radioRequested=false;
    radio?.pause();
    setRadioIndicator(false);
    radioStatus.value='';
  }
  async function toggleRadio(){
    if(!motor||cruiserPowerLost||cameraMenu.value!=='motorCabin')return;
    if(radioRequested){stopRadio();return;}
    const command=++radioCommand;
    radioRequested=true;
    setRadioIndicator(true);
    radioStatus.value='Starting…';
    try{
      if(!audio.enabled)enableSound();
      prepareCabinRadio();
      placeRadio??=audio.connectCabinRadio(radio);
      placeRadio(motor.cabinObjects.get('radio'),camera);
      if(radio.error)radio.load();
      const playback=radio.play();
      if(!encounterStarted&&mayStartEncounter()&&isEncounterNight()){
        encounterStarted=true;
        encounterSession=remote.connected?remote.npc.session:null;
      }
      await playback;
      if(!signal.aborted&&command===radioCommand)radioStatus.value='';
    }catch(error){
      if(signal.aborted||command!==radioCommand)return;
      stopRadio();
      radioStatus.value='Playback failed. Press Radio to retry.';
      console.warn('Cabin radio playback unavailable',error);
    }
  }
  cabinLight.onclick=()=>{if(motor)toggleCabinLight();};
  cabinRadio.onclick=toggleRadio;
  const radioPicker=$('radioRecording'),radioTrack=$('radioRecordingStatus'),resetRadioTrack=$('resetRadioRecording');
  $('localCabinRadio').hidden=!motor;
  function displayRadioTrack(){
    radioTrack.value=localRadioRecording?.name??'Bundled Spanish Ladies';
    resetRadioTrack.hidden=!localRadioRecording;
  }
  function setRadioTrack(file){
    stopRadio();
    if(localRadioUrl)URL.revokeObjectURL(localRadioUrl);
    localRadioRecording=file;
    localRadioUrl=file?URL.createObjectURL(file):undefined;
    if(radio)radio.src=localRadioUrl??radioLocation.href;
    displayRadioTrack();
  }
  radioPicker.onchange=()=>{
    if(radioPicker.files.length)setRadioTrack(radioPicker.files[0]);
  };
  resetRadioTrack.onclick=()=>{
    radioPicker.value='';
    setRadioTrack(undefined);
  };
  displayRadioTrack();
  cleanup(()=>{
    cabinLight.onclick=cabinRadio.onclick=null;
    if(!preserveCruiser&&radio)stopRadio();
  });
  if(motor){
    motor.setCabinLight(cabinLit);
    cabinLight.setAttribute('aria-pressed',String(cabinLit));
    setRadioIndicator(radioRequested);
    anchorSwitch.setAttribute('aria-pressed',String(anchorLowered));
    anchorSwitch.textContent=anchorLowered?'Raise anchor':'Lower anchor';
  }
  function refreshCabinControls(){
    cabinView.hidden=!motor||Boolean(animalId)||cameraMenu.value!=='motorCabin';
    if(!cabinView.hidden&&!cruiserPowerLost)prepareCabinRadio();
    cabinLight.disabled=cruiserPowerLost;
    cabinRadio.disabled=cruiserPowerLost;
    cabinRadio.title=cruiserPowerLost?'Cruiser power lost':!mayStartEncounter()?'The room host can start the night encounter':
      isEncounterNight()?'Cabin radio':'Switch to Moonlit for the night encounter';
    for(const field of cruiserLampControls)field.disabled=cruiserPowerLost;
    goBelow.hidden=!motor||Boolean(animalId);
    goBelow.textContent=cameraMenu.value==='motorCabin'?'Back to helm':'Go below';
    anchorSwitch.hidden=!motor||!world.hasAnchor||Boolean(animalId);
    anchorReadout.hidden=anchorSwitch.hidden;
  }
  function checkCruiserPower(simulation,cruiser){
    if(cruiserPowerLost||!cruiserSunk(simulation.get('encounterShark'),simulation.get('boatDamage')))return;
    cruiserPowerLost=true;cabinLit=false;
    cruiser.setElectricalPower(false);
    cabinLight.setAttribute('aria-pressed','false');
    stopRadio();
    refreshCabinControls();
  }
  function encounterId(id){
    let hash=2166136261;
    for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619);
    return (hash>>>0)||1;
  }
  function updateEncounterTargets(simulation,now){
    const rows=new Map();
    function record(id,type,x,y,z,radius,mass){
      if([x,y,z].every(Number.isFinite))rows.set(id,[encounterId(id),type,x,y,z,radius,mass]);
    }
    if(backgroundCruiser){
      const id=remote.npc.self??'local';
      if(model&&!animalId&&!drone?.active&&!sub?.active){
        const [x,y,z]=model.getMany(['east','north','heave']);
        record(id,1,x,y,z,2.2,cat?205:1900);
      }else if(drone?.active)record(id,3,...drone.position,.6,4);
      else if(sub?.active)record(id,4,...sub.mesh.position.toArray(),2,3300);
    }
    for(const {id,kind,x,y,z,hull} of remote.vessels(now)){
      record(id,hull?1:kind==='sub'?4:3,x,y,z,hull===3?2.5:hull?2.2:kind==='sub'?2:.6,
        hull===3?3600:hull===2?1900:hull?345:kind==='sub'?3300:4);
    }
    for(const [id,{kind}] of remote.npc.animals){
      const position=visitors.cameraSubject(id)?.position;
      if(position)record(id,2,position.x,position.y,position.z,kind==='whale'?3.2:1.6,kind==='whale'?25000:870);
    }
    for(const [i] of remote.npc.habitat.gulls.entries()){
      const id='gull-'+(i+1),position=visitors.cameraSubject(id)?.position;
      if(position)record(id,3,position.x,position.y,position.z,.32,1);
    }
    for(const [i,{kind}] of remote.npc.habitat.vessels.entries()){
      const id='npc-'+(i+1),position=npcTraffic?.subject(id)?.position;
      if(!position)continue;
      const hull=kind==='hobie'||kind==='sloop'||kind==='motorboat';
      record(id,hull?1:kind==='sub'?4:3,position.x,position.y,position.z,hull?2.2:kind==='sub'?2:.65,
        kind==='motorboat'?3600:kind==='sloop'?1900:kind==='hobie'?345:kind==='sub'?3300:4);
    }
    for(let i=0;i<targetIds.length;i++){
      if(!rows.has(targetIds[i]))targetIds[i]=null;
    }
    for(const id of rows.keys()){
      if(targetIds.includes(id))continue;
      const index=targetIds.indexOf(null);
      if(index<0)break;
      targetIds[index]=id;
    }
    targetData.fill(0);
    for(const [i,id] of targetIds.entries())if(id!==null)targetData.set(rows.get(id),i*7);
    simulation.set('encounterTargets',targetData);
  }
  const damagePoint=new T.Vector3();
  const backgroundCruiserPose=new Float64Array(10),noLandingLoad=new Float64Array(6);
  function supplyDroneDecks(now){
    if(!drone)return;
    const [east,north]=drone.position;
    if(drone.hasVesselDecks){
      const local=backgroundCruiserWorld?
        (backgroundCruiser.group.visible?backgroundCruiserWorld.get('landingDeck'):undefined):null;
      drone.surfaceDecks(remote.nearbyDecks(east,north,now,npcTraffic?.deckRows,remoteEncounterCruiser?.group.visible,local));
    }else if(mode==='flight')world.set('peerDeck',remote.nearbyDeck(east,north,now));
  }
  let lastCruiserTick=performance.now(),cruiserStepDebt=0;
  function updateEncounter(now,t,roomTime,running){
    const simulation=motor?world:backgroundCruiserWorld,localCruiser=motor??backgroundCruiser;
    if(localCruiser&&simulation.hasEncounter){
      const ownsEncounter=encounterStarted&&controlsEncounter()&&
        (remote.connected?encounterSession===remote.npc.session:encounterSession===null);
      simulation.set('startEncounter',Number(ownsEncounter));
      if(ownsEncounter)updateEncounterTargets(simulation,now);
      const rows=encounterVariables.map(simulation.get);
      localCruiser.updateDamage(rows[2],rows[3],rows[4],simulation.time);
      if(backgroundCruiser){
        const elapsed=Math.min(.25,Math.max(0,(now-lastCruiserTick)*.001));
        lastCruiserTick=now;
        backgroundCruiser.group.visible=ownsEncounter;
        if(ownsEncounter){
          checkCruiserPower(simulation,backgroundCruiser);
          const pose=simulation.get('boatPose'),engine=simulation.get('engine');
          const lamps=cruiserRuntime.lamps.slice();
          if(cruiserPowerLost)lamps[0]=lamps[1]=0;
          backgroundCruiser.group.position.fromArray(pose);
          backgroundCruiser.group.rotation.set(pose[3],pose[4],pose[5],'ZYX');
          backgroundCruiser.update(simulation.time,engine[0],engine[3],lamps,roomTime);
          backgroundCruiser.setAnchor(simulation.get('anchorState'));
          backgroundCruiserPose.set(pose);
          backgroundCruiserPose.set(lamps,6);
          rows.push(backgroundCruiserPose);
          if(running){
            if(simulation.hasLandingLoad)simulation.set('droneLandingLoad',drone?.vesselLandingLoad(0)??noLandingLoad);
            simulation.set('windSpeed',ocean.U.wind.value);
            simulation.set('windBearing',ocean.U.bearing.value);
            simulation.set('seaState',Number($('seaState').value));
            if(simulation.hasSeaClock)simulation.set('seaClockOffset',roomTime-simulation.time);
            cruiserStepDebt=Math.min(.25,cruiserStepDebt+elapsed*playbackRate);
            cruiserStepDebt=Math.max(0,cruiserStepDebt-.01*simulation.advance(Math.floor(cruiserStepDebt/.01)));
          }else{
            cruiserStepDebt=0;
            simulation.clearQueued();
          }
        }
      }
      if(ownsEncounter&&rows[0][0])remote.sendEncounter(now,rows);
      encounterFrame=ownsEncounter&&rows[0][0]?rows:remote.receiveEncounter(now);
    }else{
      encounterFrame=remote.receiveEncounter(now);
    }
    const parkedPose=remote.npc.host?undefined:encounterFrame?.[7];
    if(parkedPose){
      if(!remoteEncounterCruiser){remoteEncounterCruiser=cabinCruiser(T);scene.add(remoteEncounterCruiser.group);}
      remoteEncounterCruiser.group.visible=true;
      remoteEncounterCruiser.group.position.fromArray(parkedPose);
      remoteEncounterCruiser.group.rotation.set(parkedPose[3],parkedPose[4],parkedPose[5],'ZYX');
      remoteEncounterCruiser.update(t,0,0,parkedPose.slice(6),roomTime);
    }else if(remoteEncounterCruiser)remoteEncounterCruiser.group.visible=false;
    const hostCruiser=parkedPose?remoteEncounterCruiser:remote.hostCruiser();
    if(hostCruiser&&encounterFrame){
      hostCruiser.updateDamage(encounterFrame[2],encounterFrame[3],encounterFrame[4],roomTime);
      hostCruiser.setElectricalPower(!cruiserSunk(encounterFrame[0],encounterFrame[6]));
    }
    if(lastHostCruiser&&(lastHostCruiser!==hostCruiser||!encounterFrame)){
      lastHostCruiser.updateDamage([100,100,100,100,100,100],new Float64Array(30),new Float64Array(18),t);
      lastHostCruiser.setElectricalPower(true);
    }
    lastHostCruiser=encounterFrame?hostCruiser:undefined;
    visitors.showBreakwater(encounterFrame?.[0],roomTime);
    const damage=motor&&world.hasEncounter?world.get('boatDamage'):undefined;
    integrityDisplay.hidden=!damage||damage[0]>=100;
    if(!integrityDisplay.hidden)integrityDisplay.textContent=
      `Hull ${Math.round(damage[0])}% · ${Math.round(damage[1])} kg aboard${cruiserPowerLost?' · Submerged · Power lost':''}`;
    let rate=0,distance=Infinity;
    if(encounterFrame){
      const [,impact,,flood]=encounterFrame;
      if(impact[0]>0&&impact[0]!==lastImpact&&running){
        damagePoint.fromArray(impact,3);
        const offset=damagePoint.sub(camera.position),right=camera.matrixWorld.elements;
        const range=offset.length(),pan=(offset.x*right[0]+offset.y*right[1]+offset.z*right[2])/Math.max(2,range);
        audio.structureImpact(impact[2],range,pan,camera.position.z<ocean.U.tide.value);
      }
      lastImpact=impact[0];
      const cruiser=hostCruiser??localCruiser;
      if(cruiser)distance=camera.position.distanceTo(cruiser.group.position);
      if(running)for(let i=1;i<flood.length;i+=5)rate+=Math.max(0,flood[i]);
    }else lastImpact=0;
    audio.floodSound(rate,distance);
  }
  camera.layers.enable(1);camera.layers.enable(3);
  let npcTraffic=carried?.npcTraffic,npcTrafficLoad,npcRows,npcRaceUtc,npcDisplayUtc,npcCamCount=0;
  let joinAttempt=0;
  async function multiplayer(on){
    const attempt=++joinAttempt;
    multiplayerButton.setAttribute('aria-pressed',String(on));
    updatePlayback();
    $('invite').hidden=true;
    if(!on){remote.leave();return;}
    $('online').textContent='Joining…';
    try{
      const endpoint=document.querySelector('meta[name="ocean-turn-endpoint"]')?.content;
      const [transport,turn]=await Promise.all([import('./vendor/trystero.mjs'),loadFleetTurn(endpoint)]);
      if(signal.aborted||attempt!==joinAttempt)return;
      remote.join(transport,roomName,turn);
      restoreNpcRoster();
      $('invite').hidden=false;
    }catch(error){
      if(signal.aborted||attempt!==joinAttempt)return;
      remote.leave();
      multiplayerButton.setAttribute('aria-pressed','false');
      updatePlayback();
      $('online').textContent='Unable to join';
      console.error(error);
    }
  }
  roomField.onchange=()=>{
    const next=normalizeRoom(roomField.value);roomField.value=next;
    if(next===roomName)return;
    roomName=next;
    for(const id of ['invite','chatInvite'])$(id).textContent='Copy room link';
    if($('multiplayer').getAttribute('aria-pressed')==='true'){
      remote.leave();
      history.replaceState(history.state,'',joinRoomLink(url,roomName));
      multiplayer(true);
    }
  };
  roomField.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();roomField.blur();}});
  $('multiplayer').onclick=()=>{
    const on=$('multiplayer').getAttribute('aria-pressed')!=='true';
    if(on)joinRoomLink(url,roomName);
    else{
      url.searchParams.delete('room');
      url.searchParams.delete('join');
    }
    history.replaceState(history.state,'',url);
    multiplayer(on);
  };
  on(window,'pagehide',event=>{
    if(!event.persisted){lifetime.abort();remote.leave();}
  });
  on(window,'pageshow',event=>{if(event.persisted)remote.recover();});
  on(window,'online',remote.recover);
  for(const id of ['invite','chatInvite'])$(id).onclick=async event=>{
    const button=event.currentTarget,link=joinRoomLink(vehicleLink(location.href),roomName);
    try{await navigator.clipboard.writeText(link.href);button.textContent='Copied';}
    catch{prompt('Multiplayer room link',link.href);}
  };
  const theme=$('theme'),music=$('music');
  let musicContext,musicGain;
  cleanup(()=>{
    theme.pause();
    if(musicContext&&musicContext.state!=='closed')void musicContext.close().catch(()=>{});
  });
  function volumeControl(id,apply){
    const slider=$(id),key='ocean_web.'+id;
    try{
      const stored=saved?.fields[id]??localStorage.getItem(key);
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
  function audioToggle(id,apply,describe){
    const button=$(id);
    let selected=saved?.audio[id]===true,revision=0;
    function show(){button.setAttribute('aria-pressed',String(selected));describe(selected);}
    async function sync(){
      const version=++revision;
      try{await apply(selected&&!document.hidden);}
      catch(error){
        if(signal.aborted||version!==revision||error.name==='AbortError'||error.name==='NotAllowedError'&&selected)return;
        selected=false;show();await apply(false);
        if(error.name!=='NotAllowedError')console.warn('Simulator audio unavailable',error);
      }
    }
    button.onclick=()=>{selected=!selected;show();void sync();};
    if(selected){
      if(carried)void sync();
      const resume=event=>{
        if(event.target!==button&&selected&&event.isTrusted)void sync();
      };
      on(document,'pointerup',resume,{once:true});
      on(document,'keydown',resume,{once:true});
    }
    on(document,'visibilitychange',()=>{if(selected)void sync();});
    show();
    return ()=>{
      selected=true;show();void sync();
    };
  }
  audioToggle('music',async on=>{
    if(!on){theme.pause();if(musicContext)await musicContext.suspend();return;}
    if(!musicContext){
      musicContext=new AudioContext();musicGain=musicContext.createGain();
      musicGain.gain.value=$('musicVolume').valueAsNumber/100;
      musicContext.createMediaElementSource(theme).connect(musicGain).connect(musicContext.destination);
    }
    await Promise.all([musicContext.resume(),theme.play()]);
  },on=>{music.title=(on?'Mute':'Play')+' music by Olivier Bérubé';});
  const enableSound=audioToggle('sound',audio.setEnabled,on=>{
    $('sound').title=on?'Mute sound effects':'Turn sound effects on';
    $('sound').firstElementChild.textContent=on?'🔊':'🔇';
  });
  const hemi=new T.HemisphereLight(0xe5f8fb,0x767266,1.8);hemi.position.z=1;scene.add(hemi);
  const sun=new T.DirectionalLight(0xffe6b4,2.5);sun.position.set(15,10,20);scene.add(sun);
  showInLowWaterCapture(hemi);showInLowWaterCapture(sun);
  const makeWater=(T,u)=>wildlifeWater(T,u,undefined,renderer.capabilities.isWebGL2);
  const ocean=atmosphere(scene,{waterCaptureLayer,objectDrawRange,cruiserSurface:Boolean(motor),hobieSurface:cat,bowFoamGrid,islandBed:island.userData.bed},makeWater,surfaceSpray,
    cruiserBeamGLSL,cruiserHullGLSL,searchlightHeight,hullGlowLobes);
  cleanup(()=>ocean.dispose());
  const sea={tile:new Float32Array(1024),wind:Math.hypot(inputs.windEast,inputs.windNorth),tide:0};
  ocean.U.windPeriod.value=windField.get('period');
  let lastReflection=-Infinity;
  const reflectionEye=new T.Vector3(),reflectionOrientation=new T.Quaternion();
  function applyQuality(){
    lastReflection=-Infinity;
    profile=profiles[selector.value];
    omitWake=Number(Boolean(profile.omitWake));
    world?.setWakeEnabled(!omitWake);
    if(omitWake)ocean.clearWake();
    remote.setWakeReception(Boolean(world?.hasPeerWake && !omitWake));
    if(omitWake && world?.hasPeerWake)world.set('peerWake',new Float64Array(4*38));
    pixelScale=Math.min(devicePixelRatio,profile.ratio);
    ocean.setQuality(profile,Boolean(omitWake),renderer.capabilities.isWebGL2,adaptiveWater());
  }
  applyQuality();
  selector.onchange=()=>{
    applyQuality();resize();
    if(url.searchParams.has('quality')){url.searchParams.set('quality',selector.value);history.replaceState(history.state,'',url);}
    try{localStorage.setItem('ocean-render-quality',selector.value);}catch{}
  };
  ocean.update(sea,sea);ocean.U.under.value=0;ocean.U.sunDir.value.copy(sun.position).normalize();
  ocean.U.moonDir.value.set(-.8,-.4,-.5);ocean.U.bearing.value=weatherBearing;
  const rain=stormRain(T,scene,ocean,mobile);
  const caustics=wreckCaustics(T,renderer,ocean);
  const gullWind=new T.Vector2();
  function gullEnvironment(east,north,height){
    const direction=ocean.U.bearing.value,speed=ocean.U.referenceWind.value;
    const wind=[speed*Math.cos(direction),speed*Math.sin(direction)];
    ocean.sampleWind(east,north,gullWind);
    const seaLevel=ocean.sampleSurface(east,north,true);
    const waterSlope=height-seaLevel>.25?[0,0]:[
      (ocean.sampleSurface(east+.18,north,true)-ocean.sampleSurface(east-.18,north,true))/.36,
      (ocean.sampleSurface(east,north+.18,true)-ocean.sampleSurface(east,north-.18,true))/.36];
    return {wind,gust:[gullWind.x-wind[0],gullWind.y-wind[1]],seaLevel,waterSlope};
  }
  const whaleDirection=new T.Vector3(),listenerRight=new T.Vector3();
  const visitors=harborTraffic(T,scene,remote,(x,y)=>ocean.sampleSurface(x,y),(kind,position,strength)=>{
    const relative=position.clone().sub(camera.position),distance=relative.length();
    const pan=relative.normalize().dot(new T.Vector3(1,0,0).applyQuaternion(camera.quaternion));
    audio.wildlife(kind,distance,Math.max(-1,Math.min(1,pan)),camera.position.z<ocean.U.tide.value,strength);
  },caustics,ocean.U.tide,gullEnvironment,signal);
  // These objects are wholly below mean sea level, including their animation ranges.
  const submergedScenery=new T.Group();scene.add(submergedScenery);
  const materials=seabedMaterials(T,caustics.uniforms,island.userData.terrainTextures,ocean.U.tide);
  island.userData.sand.material.dispose();island.userData.sand.material=materials.shore;
  const bottom=new T.Mesh(new T.PlaneGeometry(500,500),materials.sand);bottom.position.z=-13.71;submergedScenery.add(bottom);
  showInLowWaterCapture(bottom);
  const wreckVisual=batchScenery(T,makeWreck(T,materials));submergedScenery.add(wreckVisual);caustics.setWreck(wreckVisual);
  const defaultContactHull={cat},contactHullFields=['stationX','beamHalf','halfSpacing'];
  const committeeFields=['committeeContactVertices','committeeContactFaces','committeeFittingVertices','fittingContactFaces'];
  let collisionPainter,shoreContacts,structureContacts,peerCollisionSamples,contactHull,pontoonWire,pontoonLoad,cruiserWire,cruiserWireLoad,cabinWire;
  let committeeWire,committeeLoad,droneWire;
  function setCommitteeWire(plant){
    const [vertices,faces,fittings,fittingFaces]=plant.getMany(committeeFields);
    committeeWire=[...hullWires(vertices,faces),...compoundHullWires(fittings,fittingFaces)];
  }
  function drawCollisions(){
    if(!collisionPainter){
      collisionPainter=collisionOverlay(T);
      shoreContacts=surfaceCollisionShapes(T,island,course.committee,course.marks);
      const wreck=makeWreck(T,materials);
      structureContacts=subCollisionShapes(T,wreck);
      wreck.children[0]?.geometry.dispose();
    }
    collisionPainter.begin();
    if(!contactHull&&model&&contactHullFields.every(name=>model.has(name))){
      const [stations,widths,spacing]=model.getMany(contactHullFields);
      contactHull={cat,stations,widths,spacing};
    }
    if(!cruiserWire){
      const cruiserWorld=motor?world:backgroundCruiserWorld;
      const vertices=cruiserWorld?.get('cruiserContactVertices'),faces=cruiserWorld?.get('cruiserContactFaces');
      if(vertices&&faces){
        cruiserWire=hullWires(vertices,faces);
        const walls=cruiserWorld.get('cabinContactVertices'),triangles=cruiserWorld.get('cabinContactFaces');
        if(walls&&triangles)cabinWire=hullWires(walls,triangles);
      }
      else if(packaged&&!cruiserWireLoad){
        const meshUrl=new URL('./motorboat/collision-mesh.json',import.meta.url);
        meshUrl.search=new URL(import.meta.url).search;
        cruiserWireLoad=fetch(meshUrl,{signal}).then(response=>{
          if(!response.ok)throw Error('Collision mesh HTTP '+response.status);
          return response.json();
        }).then(({vertices,faces,cabinVertices,cabinFaces})=>{
          cruiserWire=hullWires(vertices,faces);
          if(cabinVertices&&cabinFaces)cabinWire=hullWires(cabinVertices,cabinFaces);
        })
          .catch(error=>{if(!signal.aborted)console.warn('Cruiser collision mesh unavailable',error);});
      }
    }
    if(!committeeWire&&!committeeLoad){
      if(committeeFields.every(name=>race.has(name)))setCommitteeWire(race);
      else committeeLoad=loadInstance('Regatta',{}).then(setCommitteeWire)
        .catch(error=>console.warn('Committee collision mesh unavailable',error));
    }
    if(!droneWire&&drone){
      const geometry=drone.contactGeometry();
      if(geometry)droneWire=compoundHullWires(...geometry);
    }
    shoreContacts.draw(collisionPainter,boat?.group,contactHull??defaultContactHull,motor?.group,drone?.group,cruiserWire,committeeWire,droneWire);
    structureContacts.draw(collisionPainter,sub?.mesh.visible?sub.mesh:null);
    const vessel=boat?.group??motor?.group;
    const fields=['pontoonContactVertices','pontoonContactFaces'];
    if(!pontoonWire&&!pontoonLoad){
      if(model&&fields.every(name=>model.has(name)))pontoonWire=pontoonWires(...model.getMany(fields));
      else pontoonLoad=loadInstance('Hobie16').then(rig=>{pontoonWire=pontoonWires(...rig.getMany(fields));})
        .catch(error=>console.warn('Pontoon collision mesh unavailable',error));
    }
    drawVesselContacts(T,collisionPainter,vessel,motor?2:Number(cat),peerCollisionSamples,remote.contactTilts,
      npcTraffic?.contacts,npcTraffic?.tilts,pontoonWire,cruiserWire,cabinWire);
    if(cat&&model?.has('rigCollision'))collisionPainter.rigCapsules(boat.group,model.get('rigCollision'));
    if(backgroundCruiser?.group.visible&&cruiserWire){
      collisionPainter.lines(backgroundCruiser.group,cruiserWire,'#69e2bb');
      if(cabinWire)collisionPainter.lines(backgroundCruiser.group,cabinWire,'#69e2bb');
    }
    for(const animal of remote.npc.animals.values()){
      const frame=visitors.cameraSubject(animal.id);
      if(frame)drawAnimalCollision(collisionPainter,frame,animal.kind);
    }
    collisionPainter.render(renderer,camera);
  }
  collisionToggle.onchange=()=>{
    if(collisionToggle.checked)url.searchParams.set('collisions','1');
    else url.searchParams.delete('collisions');
    history.replaceState(history.state,'',url);
    world?.setPhysicsRequested(physicsEnabled||collisionToggle.checked);
  };
  let inertiaPainter;
  function drawInertia(){
    inertiaPainter??=inertiaOverlay(T);
    inertiaPainter.begin();
    if(boat?.group.visible)inertiaPainter.draw(boat.group,sailingInertia(model,cat));
    if(motor?.group.visible)inertiaPainter.draw(motor.group,cruiserInertia(world.get));
    if(drone?.group.visible)inertiaPainter.draw(drone.group,drone.inertia());
    if(sub?.mesh.visible){
      if(world)inertiaPainter.draw(sub.mesh,subInertia(name=>world.get('sub.'+name)));
      else inertiaPainter.drawStandaloneSub(sub.mesh);
    }
    for(const animal of remote.npc.animals.values()){
      inertiaPainter.drawWildlife(visitors.cameraSubject(animal.id),animal.kind);
    }
    remote.npc.habitat.gulls.forEach((_,i)=>inertiaPainter.drawWildlife(visitors.cameraSubject('gull-'+(i+1)),'gull'));
    inertiaPainter.render(renderer,camera);
  }
  function playImagingHit(position){
    audio.imagingHit(camera.position.distanceTo(position),camera.position.z<ocean.U.tide.value);
  }
  function imagingDisplay(){return $('cruiserSonarPanel').open||$('cameraDepth').value==='motorHelm';}
  function imagingActive(){
    const nightWatch=ocean.U.sunDir.value.z<0&&(remote.hasPeers||$('sound').getAttribute('aria-pressed')==='true');
    return !cruiserPowerLost&&!animalId&&running&&(imagingDisplay()||nightWatch);
  }
  let lastImagingBeep=-Infinity;
  const chart=motor?cruiserChart($('cruiserChartCanvas'),$('cruiserChartFit'),island.userData.chartTerrain):null;
  const imagingPing=motor?cruiserSonar($('cruiserSonarCanvas'),$('cruiserSonarReturn'),$('cruiserSonarRange'),chart,imagingDisplay,range=>{
    const now=performance.now();
    if(range===null||!imagingActive()||now-lastImagingBeep<imagingBeepInterval(range))return;
    lastImagingBeep=now;playImagingHit(motor.group.position);remote.imagingHit(range,motor.group.position);
  },signal):null;
  wreckVisual.traverse(showInLowWaterCapture);
  const life=marineLife(T,submergedScenery,renderer.capabilities.isWebGL2,visitors.fish);
  const underwaterFog=new T.FogExp2(0x124759,.075),cabinWaterFog=new T.FogExp2(0x124759,.48),split=splitCamera(T);
  const fpvForward=new T.Vector3(),cabinEye=new T.Vector3(),drawInstruments=firstPersonInstruments($('flightHud'));
  const helmSeat=new T.Vector3(cat ? -1.2 : -.73,0,cat ? .65 : .18),orbitCenter=new T.Vector3();
  const cameraMenu=$('cameraDepth'),skipperDefault={yaw:0,pitch:-.12},skipper={...skipperDefault};
  const skipperOption=cat?new Option('Skipper','ballast'):null;
  if(skipperOption)cameraMenu.add(skipperOption);
  function showSkipperView(show){
    if(skipperOption)skipperOption.hidden=skipperOption.disabled=!show;
  }
  let running=true,manual=true;
  const defaultDistance=motor?11.5:cat?14:5.7;
  const wildlifeDefaults={gull:{angle:-1,tilt:.36,distance:3.3},whale:{angle:-1.15,tilt:.20,distance:14},shark:{angle:-1.15,tilt:.12,distance:6}};
  const cameraOrbits=new Map(),cameraZoom=new Map(),cameraPan=new Map();
  const vehicleViews=new Set(['deck','line','keel']);
  function orbitKey(view){
    if(vehicleViews.has(view)){
      if(sub?.active)return 'sub-'+view;
      if(drone?.active)return 'drone-'+view;
    }
    return view;
  }
  function orbitFor(view){
    const key=orbitKey(view);
    let orbit=cameraOrbits.get(key);
    if(!orbit){
      const animal=wildlifeDefaults[view.split('-')[0]];
      const defaultTilt=sub?.active ? .32 : .16;
      orbit=animal?{...animal}:{
        angle:sub?.active?Math.PI-.48:-.8,
        tilt:view==='keel'?-.9:defaultTilt,
        distance:defaultDistance
      };
      cameraOrbits.set(key,orbit);
    }
    return orbit;
  }
  const panRight=new T.Vector3(),panUp=new T.Vector3(),gullCameraTarget=new T.Vector3();
  let followedGull;
  let panDistance=defaultDistance;
  function panView(dx,dy){
    const key=orbitKey(cameraMenu.value);
    let offset=cameraPan.get(key);
    if(!offset){offset=new T.Vector3();cameraPan.set(key,offset);}
    const scale=2*panDistance*Math.tan(T.MathUtils.degToRad(camera.fov/2))/Math.max(1,viewport.clientHeight);
    offset.addScaledVector(panRight.set(1,0,0).applyQuaternion(camera.quaternion),-dx*scale);
    offset.addScaledVector(panUp.set(0,1,0).applyQuaternion(camera.quaternion),dy*scale);
  }
  const fixedView=view=>view==='ballast'||view==='fpv'||view==='onboard'||Object.hasOwn(cruiserViews,view);
  function zoomView(scale){
    const view=cameraMenu.value;
    if(fixedView(view)||view.startsWith('npc-')){
      cameraZoom.set(view,T.MathUtils.clamp((cameraZoom.get(view)??1)*scale,.32,2.5));
    }else{
      const orbit=orbitFor(view),maxDistance=wildlifeDefaults[view.split('-')[0]]?45:22;
      orbit.distance=T.MathUtils.clamp(orbit.distance*scale,2,maxDistance);
    }
  }
  const viewport=$('view'),pointers=new Map();
  const cabinRay=new T.Raycaster(),cabinPointer=new T.Vector2();
  const clickSlop=e=>!cabinView.hidden&&e.pointerType!=='mouse'?12:5;
  function pickCabinControl(event){
    if(!motor||animalId)return false;
    const view=cameraMenu.value,below=view==='motorCabin';
    if(!below&&!['deck','motorHelm','motorCockpit'].includes(view))return false;
    const rect=viewport.getBoundingClientRect();
    cabinPointer.set(2*(event.clientX-rect.left)/rect.width-1,1-2*(event.clientY-rect.top)/rect.height);
    cabinRay.setFromCamera(cabinPointer,camera);
    const objects=below?motor.cabinObjects:motor.deckObjects;
    let chosen,nearest=Infinity;
    for(const [name,object] of objects){
      const hit=cabinRay.intersectObject(object,true)[0];
      if(hit&&hit.distance<nearest){nearest=hit.distance;chosen=name;}
    }
    if(!chosen)return false;
    const solid=cabinRay.intersectObject(motor.group,true).find(hit=>
      hit.object.visible&&hit.object.material?.opacity>.45);
    if(solid&&solid.distance+.015<nearest)return false;
    if(chosen==='light')toggleCabinLight();
    else if(chosen==='radio')toggleRadio();
    else if(chosen==='cabin')goBelowDeck();
    else if(chosen==='anchor')toggleAnchor();
    else if(chosen==='search')$('searchLamp').click();
    else if(chosen==='underwater')$('keelLamp').click();
    else if(chosen==='wipers'&&world.hasWiper)wiperSwitch.click();
    return true;
  }
  viewport.onpointerdown=e=>{
    const pan=e.pointerType==='mouse'&&e.button===2;
    if(e.pointerType==='mouse'&&e.button!==0&&!pan)return;
    if(pan)e.preventDefault();
    const multiTouch=pointers.size>0;
    for(const point of pointers.values())point[5]=true;
    pointers.set(e.pointerId,[e.clientX,e.clientY,pan,e.clientX,e.clientY,multiTouch]);
    viewport.setPointerCapture(e.pointerId);
  };
  viewport.onpointermove=e=>{
    const previous=pointers.get(e.pointerId);
    if(!previous)return;
    const [x,y,pan]=previous;
    previous[0]=e.clientX;previous[1]=e.clientY;
    if(pan){panView(e.clientX-x,e.clientY-y);return;}
    if(pointers.size===2){
      const [otherX,otherY]=[...pointers.values()].find(point=>point!==previous);
      const before=Math.hypot(x-otherX,y-otherY),after=Math.hypot(e.clientX-otherX,e.clientY-otherY);
      if(before>0&&after>0)zoomView(before/after);
      return;
    }
    if(pointers.size!==1)return;
    if(!cabinView.hidden&&!previous[5]&&Math.hypot(e.clientX-previous[3],e.clientY-previous[4])<clickSlop(e))return;
    previous[5]=true;
    const dx=(e.clientX-x)*.008,dy=(e.clientY-y)*.006;
    if(!cabinView.hidden){
      cabinLook.yaw=T.MathUtils.clamp(cabinLook.yaw-dx,-1.55,1.55);
      cabinLook.pitch=T.MathUtils.clamp(cabinLook.pitch-dy,-.75,.80);
    }else if(cameraMenu.value==='ballast'){
      skipper.yaw=T.MathUtils.clamp(skipper.yaw-dx,-1.8,1.8);
      skipper.pitch=T.MathUtils.clamp(skipper.pitch-dy,-1.1,1.1);
    }else if(!fixedView(cameraMenu.value)){
      const orbit=orbitFor(cameraMenu.value);
      orbit.angle-=dx;
      orbit.tilt=T.MathUtils.clamp(orbit.tilt+dy,-1.45,1.4);
    }
  };
  viewport.oncontextmenu=e=>e.preventDefault();
  viewport.onlostpointercapture=e=>pointers.delete(e.pointerId);
  viewport.onpointercancel=viewport.onlostpointercapture;
  viewport.onpointerup=e=>{
    const point=pointers.get(e.pointerId);
    if(point&&!point[2]&&pointers.size===1&&
        (cabinView.hidden||!point[5])&&Math.hypot(e.clientX-point[3],e.clientY-point[4])<clickSlop(e))pickCabinControl(e);
    pointers.delete(e.pointerId);
  };
  viewport.onwheel=e=>{
    e.preventDefault();
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1);
    zoomView(Math.exp(delta*.0015));
  };
  cameraMenu.onchange=refreshCabinControls;
  function recenterView(){
    const view=cameraMenu.value,key=orbitKey(view);
    cameraOrbits.delete(key);
    cameraPan.delete(key);
    cameraZoom.delete(view);
    if(view==='ballast')Object.assign(skipper,skipperDefault);
    if(view==='motorCabin')Object.assign(cabinLook,cabinLookDefault);
    viewport.focus({preventScroll:true});
  }
  $('recenterView').onclick=recenterView;
  let moveTraveler;
  if(cat){
    const marker=$('showBallastMarker');
    try{marker.checked=saved?.fields.showBallastMarker??(localStorage.getItem('ocean-ballast-marker')!=='off');}catch{}
    boat.setBallastVisible(marker.checked);
    marker.onchange=()=>{
      boat.setBallastVisible(marker.checked);
      try{localStorage.setItem('ocean-ballast-marker',marker.checked?'on':'off');}catch{}
    };
    const tackAssist=$('jibTackAssist');
    try{tackAssist.checked=saved?.fields.jibTackAssist??(localStorage.getItem('ocean-jib-tack-assist')!=='off');}catch{}
    model.set('manualJibAssist',Number(tackAssist.checked));
    tackAssist.onchange=()=>{
      model.set('manualJibAssist',Number(tackAssist.checked));
      try{localStorage.setItem('ocean-jib-tack-assist',tackAssist.checked?'on':'off');}catch{}
    };
    const reach=world&&!model.has('ballastTrapezeReach')?0:Math.round(100*model.get('ballastTrapezeReach'));
    if(reach>0){
      $('ballY').min=-reach;
      $('ballY').max=reach;
    }
    const trim=()=>{
      const auto=$('autoTrim').checked;
      const x=$('ballX').valueAsNumber,y=$('ballY').valueAsNumber;
      $('ballX').disabled=$('ballY').disabled=auto;
      $('ballXValue').value=auto?'Auto':positionText(x,'aft','forward');
      $('ballYValue').value=auto?'Auto':positionText(y,'starboard','port');
      model.set('ballastManual',Number(!auto));
      model.set('ballastCmdX',-x/100);
      model.set('ballastCmdY',-y/100);
    };
    for(const id of ['autoTrim','ballX','ballY'])$(id).oninput=trim;
    trim();
    function deck(){
      const auto=$('autoDeck').checked;model.set('deckManual',Number(!auto));
      for(const [id,input] of [['mainCar','mainCarInput'],['jibCar','jibCarInput'],['jibSheet','jibTrimInput']]){
        const control=$(id),value=control.valueAsNumber;
        control.disabled=auto;
        $(id+'Value').value=auto?'Auto':id==='jibCar'?value+' cm outboard':value+'% eased';
        model.set(input,value/100);
      }
    }
    const autoDeck=$('autoDeck'),main=$('mainCar'),jib=$('jibCar');
    function takeOverDeck(){
      main.value=hasTraveler?Math.round(model.get('travelerEase')*100):0;
      jib.value=Math.round(model.get('jibCar')*100);
      $('jibSheet').value=Math.round(model.get('jibSheet')*100);
    }
    for(const id of ['mainCar','jibCar','jibSheet'])$(id).oninput=deck;
    autoDeck.oninput=()=>{if(!autoDeck.checked)takeOverDeck();deck();};
    deck();
    moveTraveler=(code,fullRelease=false,gain=1)=>{
      if(autoDeck.checked){
        takeOverDeck();
        autoDeck.checked=false;
      }
      const step=5*gain;
      if(code==='ArrowUp'||code==='ArrowDown'){
        const easing=code==='ArrowUp';
        if(fullRelease)main.value=main.max;
        else main.value=main.valueAsNumber+(easing?step:-step);
      }else{
        jib.value=jib.valueAsNumber+(code==='ArrowRight'?step:-step);
      }
      deck();
    };
    $('easeTraveler').onclick=()=>moveTraveler('ArrowUp',true);
  }
  function applySea(){
    const sea=$('seaState');
    if(world)world.set('seaState',Number(sea.value));
    else{
      const [amplitude,waveNumber,frequency]=model.getMany(['swellPresetAmplitudes','swellPresetWaveNumbers','swellPresetFrequencies'])
        .map(values=>values[sea.selectedIndex]);
      model.set('swellAmplitude',amplitude);
      model.set('swellK',waveNumber);model.set('swellOmega',frequency);
      race.set('swellK',waveNumber);race.set('swellOmega',frequency);
    }
    ocean.U.rippleScale.value=sea.value===longSwell?.55:1;
  }
  applySea();
  $('seaState').onchange=()=>{applySea();remote.changeWeather('sea',$('seaState').value);};
  $('storm').onchange=()=>remote.changeWeather('storm',$('storm').checked);
  $('sky').onchange=()=>remote.changeWeather('sky',$('sky').value);
  const keys=new Set();let drone;
  $('subSensors').open=!mobile;
  const sub=subAssets ? subAssets[0].submarine(T,scene,world,signal) : null, sensorCanvas=sub && $('sensorCam').getContext('2d');
  const lampPass=(await import('./sub-lamp.mjs')).underwaterLamp(T,renderer,caustics.occluders,hullGlowLobes);
  const submergedLights=[],glowingHulls=[],lampScores=new WeakMap(),lampPosition=new T.Vector3(),beamDirection=new T.Vector3();
  const viewDirection=new T.Vector3(),aimPoint=new T.Vector3();
  function collectLight(light,eye){
    if(!light.visible||light.intensity<=0||light.userData.diffuseHullOnly)return;
    light.getWorldPosition(lampPosition);
    const range=light.distance,distance=lampPosition.distanceTo(eye.position);
    if(distance>range+45)return;
    // Estimate overlap in the water ahead of the lens, including off-axis emitters
    // which illuminate the view from the side. Keep the five strongest contributors.
    light.target.getWorldPosition(beamDirection).sub(lampPosition).normalize();
    let score=0;
    for(const interval of [.8,3,7]){
      aimPoint.copy(eye.position).addScaledVector(viewDirection,interval).sub(lampPosition);
      const along=aimPoint.dot(beamDirection);
      const miss=aimPoint.addScaledVector(beamDirection,-along).length();
      const width=.5+Math.max(0,along)*Math.tan(light.angle);
      const outside=Math.max(0,miss-width)+Math.max(0,-along,along-range);
      score+=light.intensity/((1+outside*outside*12)*(1+Math.max(0,along)**2));
    }
    lampScores.set(light,score);
    submergedLights.push(light);
  }
  function addHullLights(cruiser,eye){
    if(cruiser.underwaterLamps[0].intensity<=0)return;
    if(glowingHulls.length<5&&cruiser.group.position.distanceToSquared(eye.position)<42*42)glowingHulls.push(cruiser.group);
    for(const light of cruiser.underwaterLamps)collectLight(light,eye);
  }
  function renderBelow(world,eye,thumbnail=false,pictureSize){
    submergedLights.length=0;glowingHulls.length=0;
    eye.getWorldDirection(viewDirection);
    if(sub?.mesh.visible&&lamp)collectLight(lamp,eye);
    if(motor)addHullLights(motor,eye);
    if(backgroundCruiser?.group.visible)addHullLights(backgroundCruiser,eye);
    if(remoteEncounterCruiser?.group.visible)addHullLights(remoteEncounterCruiser,eye);
    for(const light of remote.lamps)collectLight(light,eye);
    for(const cruiser of remote.cruisers)addHullLights(cruiser,eye);
    if(submergedLights.length>5)submergedLights.sort((a,b)=>lampScores.get(b)-lampScores.get(a));
    const view=$('cameraDepth').value;
    const onboard=thumbnail||view==='onboard'||Boolean(motor&&Object.hasOwn(cruiserUnderwaterViews,view));
    const exposure=onboard?Math.floor(ocean.U.tm.value*24)%1024:-1;
    lampPass(world,eye,selector.value,submergedLights,exposure,thumbnail,glowingHulls,pictureSize);
  }
  const drawForces=forceDisplay(T,scene,sub?.mesh,boat?.group,cat,model);
  $('showCompass').setAttribute('aria-pressed',String(selectedRole==='boat'||selectedRole==='drone'));
  const covarianceOutput=$('droneCovariance'),showCovariance=$('showDroneCovariance');
  function covarianceVisibility(){
    const enabled=Boolean(drone?.active&&drone.hasNavigation&&!animalId);
    $('droneCovarianceLabel').hidden=!enabled;
    covarianceOutput.hidden=!enabled||!showCovariance.checked;
  }
  showCovariance.onchange=covarianceVisibility;
  $('sonarMap').onchange=()=>{if(sub)sub.mapVisible=$('sonarMap').checked;};
  for(const id of ['showForces','showCompass'])$(id).onclick=()=>{
    const enabled=$(id).getAttribute('aria-pressed')!=='true';
    $(id).setAttribute('aria-pressed',String(enabled));
    if(id==='showCompass')$('dial').hidden=!enabled;
  };
  const lamp=sub?.mesh.getObjectByName('Survey lamp');
  const lampButton=$('subLamp');
  let lastPreview=-Infinity,lastDvl;
  function toggleLamp(){
    if(!sub?.active)return;
    lamp.visible=!lamp.visible;
    sub.mesh.getObjectByName('Survey lamp lens').visible=lamp.visible;
    lampButton.setAttribute('aria-pressed',String(lamp.visible));
    lastPreview=-Infinity;
  }
  lampButton.onclick=toggleLamp;
  $('lampCenter').onclick=()=>{$('lampYaw').value=0;$('lampTilt').value=-12;$('view').focus();};
  $('openCamera').onclick=()=>{
    const view=$('echoCamera').value;
    if(view==='all')return;
    $('cameraDepth').value=view;$('cameraDepth').dispatchEvent(new Event('change'));$('view').focus();
  };
  $('echoCamera').onchange=()=>{
    const view=$('echoCamera').value;
    for(const feed of $('cruiserCameras').querySelectorAll('canvas'))feed.parentElement.hidden=view!=='all'&&feed.dataset.camera!==view;
    $('openCamera').disabled=view==='all';
  };
  $('cameraKeelLamp').checked=$('keelLamp').checked;
  $('cameraKeelLamp').onchange=()=>$('keelLamp').click();
  $('keelLamp').addEventListener('change',()=>{$('cameraKeelLamp').checked=$('keelLamp').checked;});
  const aimKeys={ArrowLeft:['lampYaw',4],ArrowRight:['lampYaw',-4],ArrowUp:['lampTilt',3],ArrowDown:['lampTilt',-3]};
  on(window,'keydown',e=>{
    if(e.altKey||e.metaKey||e.target.isContentEditable||e.target.tagName==='TEXTAREA'||
        (e.target.tagName==='INPUT'&&!['checkbox','range','button'].includes(e.target.type)))return;
    const formControl=['INPUT','SELECT','BUTTON','SUMMARY'].includes(e.target.tagName);
    if(motor&&!animalId&&!formControl&&Object.hasOwn(aimKeys,e.code)){
      const [id,delta]=aimKeys[e.code],slider=$(id);
      slider.value=slider.valueAsNumber+delta*controlGain({fast:e.shiftKey,fine:e.ctrlKey});
      slider.dispatchEvent(new Event('input',{bubbles:true}));e.preventDefault();
    }
  });
  const sensorEye=sub && new T.PerspectiveCamera(64,320/238,.045,objectDrawRange);
  const sensorTarget=sub && new T.WebGLRenderTarget(320,238);
  if(sensorTarget)sensorTarget.texture.colorSpace=T.SRGBColorSpace;
  const sensorPixels=sub && new Uint8Array(320*238*4);
  const sensorImage=sensorCanvas?.createImageData(320,238);
  function placeSensor(eye){
    const q=sub.mesh.quaternion;
    eye.position.set(.592,0,.10).applyQuaternion(q).add(sub.mesh.position);
    eye.up.set(0,0,1).applyQuaternion(q);
    eye.lookAt(fpvForward.set(1,0,0).applyQuaternion(q).add(eye.position));
  }
  function placeDroneCamera(eye){
    const {position,quaternion}=drone.group;
    eye.position.set(.20,0,.035).applyQuaternion(quaternion).add(position);
    eye.up.set(0,0,1).applyQuaternion(quaternion);
    eye.lookAt(fpvForward.set(1,0,0).applyQuaternion(quaternion).add(eye.position));
  }
  function placeCruiserCamera(eye,id){
    const [position,look,up]=cruiserViews[id];
    eye.position.fromArray(position);motor.group.localToWorld(eye.position);
    if(up)eye.up.fromArray(up);else eye.up.set(0,0,1);
    eye.up.applyQuaternion(motor.group.quaternion);
    if(id==='motorCabin'){
      const yaw=.083+cabinLook.yaw,pitch=.13+cabinLook.pitch;
      fpvForward.set(position[0]+Math.cos(pitch)*Math.cos(yaw),position[1]+Math.cos(pitch)*Math.sin(yaw),position[2]+Math.sin(pitch));
    }else fpvForward.fromArray(look);
    eye.lookAt(motor.group.localToWorld(fpvForward));
  }
  // Render one active sensor per tick. The multiview display shares a GPU target
  // and independently retains the latest image from each camera.
  const feedWidth=256,feedHeight=144;
  const motorEye=motor&&new T.PerspectiveCamera(64,feedWidth/feedHeight,.045,objectDrawRange);
  const feedTarget=motor&&new T.WebGLRenderTarget(feedWidth,feedHeight);
  if(feedTarget){feedTarget.texture.colorSpace=T.SRGBColorSpace;motorEye.layers.enable(1);motorEye.layers.enable(3);}
  const feedPixels=motor&&new Uint8Array(feedWidth*feedHeight*4);
  const feeds=motor?[...$('cruiserCameras').querySelectorAll('canvas')].map(canvas=>{
    const ctx=canvas.getContext('2d');return {canvas,ctx,image:ctx.createImageData(feedWidth,feedHeight)};
  }):[];
  const coneToggle=$('cameraCones');
  let cones,coneEye;
  cleanup(()=>cones?.dispose());
  function drawCameraCones(view){
    if(animalId)return;
    cones??=cameraCones(T);
    coneEye??=new T.PerspectiveCamera(52,1);
    cones.clear();
    if(motor){
      const colors=[0x75eefa,0xffb568,0xff90ad,0xa4ed8d,0xbb9aff];
      feeds.forEach(({canvas},i)=>{
        const id=canvas.dataset.camera;
        if(id===view)return;
        placeCruiserCamera(motorEye,id);
        cones.perspective(id,motorEye,5,colors[i]);
      });
    }else if(sub?.active&&view!=='onboard'){
      placeSensor(sensorEye);cones.perspective('Piccard optical camera',sensorEye,7,0x75eefa);
    }else if(drone?.active&&view!=='fpv'){
      coneEye.aspect=camera.aspect;placeDroneCamera(coneEye);
      cones.perspective('RDD2 FPV camera',coneEye,6,0x75eefa);
    }else if(hasMastCameras&&!sub?.active&&!drone?.active){
      boat.cameraPorts.forEach((port,i)=>cones.mast('Mast lens '+(i+1),boat.group,port,i*Math.PI/2,3));
    }
    cones.draw(renderer,camera);
  }
  let feedIndex=0,lastFeed=-Infinity;
  function drawCruiserFeeds(now){
    if(!motor||animalId||!$('cruiserCameras').open||now-lastFeed<55)return;
    const view=$('echoCamera').value;
    const {canvas,ctx,image}=view==='all'?feeds[feedIndex++%feeds.length]:feeds.find(f=>f.canvas.dataset.camera===view);
    placeCruiserCamera(motorEye,canvas.dataset.camera);lastFeed=now;
    const fog=scene.fog,background=scene.background,dome=ocean.dome.visible,under=ocean.U.under.value,destination=renderer.getRenderTarget();
    const submerged=motorEye.position.z<ocean.sampleSurface(motorEye.position.x,motorEye.position.y);
    scene.fog=submerged?underwaterFog:null;scene.background=submerged?underwaterFog.color:null;
    ocean.dome.visible=!submerged;ocean.U.under.value=Number(submerged);
    renderer.setRenderTarget(feedTarget);
    if(submerged)renderBelow(scene,motorEye,true);else renderer.render(scene,motorEye);
    renderer.readRenderTargetPixels(feedTarget,0,0,feedWidth,feedHeight,feedPixels);
    renderer.setRenderTarget(destination);scene.fog=fog;scene.background=background;ocean.dome.visible=dome;ocean.U.under.value=under;
    const stride=4*feedWidth;
    for(let y=0;y<feedHeight;y++)image.data.set(feedPixels.subarray(y*stride,(y+1)*stride),(feedHeight-1-y)*stride);
    ctx.putImageData(image,0,0);
  }
  function drawSensors(now,onboard){
    const d=sub.frame?.dvl;
    if(d && d!==lastDvl){
      const ranges=Array.from(d.subarray?d.subarray(4,8):d.slice(4,8));
      const count=ranges.filter(r=>r>0).length;
      const locked=d[62]>.5;
      $('dvlLock').textContent='DVL · '+(locked?'Bottom lock':'No full lock')+' · '+count+'/4 beams';
      $('dvlSpeed').textContent='Fwd '+(locked?d[63].toFixed(2):'—')+' · Port '+(locked?d[64].toFixed(2):'—')+' m/s';
      $('dvlRanges').textContent='Beam ranges '+ranges.map(r=>r>0?r.toFixed(1):'—').join(' / ')+' m';
      lastDvl=d;
    }
    if(now-lastPreview<(onboard?100:200))return;
    lastPreview=now;
    if(onboard){
      // Copy the central sensor aperture from this very frame, before HTML instruments.
      const canvas=renderer.domElement,aspect=sensorEye.aspect;
      const w=Math.min(canvas.width,canvas.height*aspect),h=Math.min(canvas.height,canvas.width/aspect);
      sensorCanvas.drawImage(canvas,(canvas.width-w)/2,(canvas.height-h)/2,w,h,0,0,320,238);
      return;
    }
    sensorEye.layers.enable(1);
    placeSensor(sensorEye);
    const fog=scene.fog,background=scene.background,dome=ocean.dome.visible,under=ocean.U.under.value,map=sub.mapGroup.visible;
    const underwater=sensorEye.position.z<ocean.U.tide.value;
    sub.mapGroup.visible=false;scene.fog=underwater?underwaterFog:null;scene.background=underwater?underwaterFog.color:null;
    ocean.dome.visible=!underwater;ocean.U.under.value=Number(underwater);
    const destination=renderer.getRenderTarget();
    renderer.setRenderTarget(sensorTarget);
    if(underwater)renderBelow(scene,sensorEye,true);
    else renderer.render(scene,sensorEye);
    renderer.readRenderTargetPixels(sensorTarget,0,0,320,238,sensorPixels);
    renderer.setRenderTarget(destination);
    scene.fog=fog;scene.background=background;ocean.dome.visible=dome;ocean.U.under.value=under;sub.mapGroup.visible=map;
    const stride=320*4;
    for(let y=0;y<238;y++)sensorImage.data.set(sensorPixels.subarray(y*stride,(y+1)*stride),(237-y)*stride);
    sensorCanvas.putImageData(sensorImage,0,0);
  }
  const analog=new Map(),keyboard=keyboardSticks(),stickIndicators=[],pressedMotion=new Map();
  const fastControl=()=>keys.has('ShiftLeft')||keys.has('ShiftRight');
  const fineControl=()=>keys.has('ControlLeft')||keys.has('ControlRight');
  const motionGain=()=>controlGain({fast:fastControl(),fine:fineControl()});
  const clampAxis=value=>Math.max(-1,Math.min(1,value));
  const shaftLever=$('shaftLever');
  let shaftCommand=0,heldLever;
  function updateShaft(){
    if(!motor)return;
    const forward=(keys.has('KeyW')?keyboard.get('KeyW'):0)+(analog.get('KeyW')??0);
    const reverse=(keys.has('KeyS')?keyboard.get('KeyS'):0)+(analog.get('KeyS')??0);
    const command=animalId||document.hidden?0:clampAxis(heldLever??motionGain()*(forward-reverse));
    if(command!==shaftCommand){
      shaftCommand=command;
      shaftLever.value=String(Math.round(100*command));
      $('shaftPercent').value=shaftLever.value+'%';
    }
    world.set('throttleLever',command);
  }
  if(motor){
    shaftLever.value='0';$('shaftPercent').value='0%';
    shaftLever.oninput=()=>{heldLever=shaftLever.valueAsNumber/100;helm();};
    function releaseLever(){
      if(heldLever===undefined)return;
      heldLever=undefined;helm();
    }
    for(const event of ['blur','keyup'])shaftLever.addEventListener(event,releaseLever);
    for(const event of ['pointerup','pointercancel'])on(window,event,releaseLever);
  }
  const subMode=$('subMode');
  subMode.onchange=()=>{
    sub.mode=Number(subMode.value);
    keys.clear();keyboard.clear();touchControls();
  };
  let stickPreference=saved?.sticks,animalId,lastClaim=-Infinity,lastInput=-Infinity,rosterRevision=-1;
  const flyingGull=()=>gullIndex(animalId)>=0;
  const animalKind=()=>flyingGull()?'gull':remote.npc.animals.get(animalId)?.kind;
  const ownsAnimal=()=>Boolean(animalId&&remote.npc.seat(animalId)===remote.npc.self);
  const animalLabel=a=>(a.kind==='whale'?'Humpback whale':'Great white shark')+(a.id===a.kind?'':' '+a.id.split('-')[1]);
  const fleetRoster=$('fleetRoster'),fleetEntries=$('fleetEntries'),fleetCount=$('fleetCount');
  const fleetModels={...vesselNpcNames,gull:'Herring gull',whale:'Humpback whale',shark:'Great white shark'};
  function fleetModel(kind,id){
    const label=fleetModels[kind]??'—';
    const number=kind==='hobie'?remote.fleetNumber(id):undefined;
    return Number.isInteger(number)?label+' #'+number:label;
  }
  const racePanel=$('racePanel'),raceSidebar=racePanel.parentElement;
  const npcStage=['Prestart','Crossing start','Mark 1','Mark 2','Heading to finish','Finished'];
  const hostControls=$('roomHostControls'),hostTarget=$('hostTarget'),transferHost=$('transferHost');
  let fleetSignature='',hostTargets='',lastFleetReport=-Infinity;
  hostTarget.onchange=()=>{transferHost.disabled=!hostTarget.value;};
  transferHost.onclick=()=>{
    if(remote.npc.transferHost(hostTarget.value))hostControls.hidden=true;
  };
  $('restartRace').onclick=()=>{
    if(chatScope)remote.npc.restartRace(Math.floor(Date.now()/1000)+300);
  };
  function reportFleet(now){
    if(now-lastFleetReport<250)return;
    lastFleetReport=now;
    refreshCabinControls();
    const {animals,habitat,self,owner}=remote.npc,occupied=new Map(),npcs=[],health=new Map();
    for(let i=0;i<(encounterFrame?.[5].length??0);i+=2){
      const [id,hp]=encounterFrame[5].slice(i,i+2);
      if(id>0)health.set(id,Math.round(hp)+' HP');
    }
    const hpFor=id=>health.get(encounterId(id));
    if(encounterFrame?.[0][0])npcs.push([remote.npcName('breakwater'),'Great white shark']);
    function addAnimal(seat,kind,id){
      if(seat)occupied.set(seat,kind);
      else npcs.push([remote.npcName(id),fleetModels[kind],hpFor(id)]);
    }
    for(const [id,animal] of animals)addAnimal(animal.seat,animal.kind,id);
    for(let i=1;i<=habitat.gulls.length;i++){
      const id='gull-'+i;
      addAnimal(remote.npc.seat(id),'gull',id);
    }
    const selected=targetSelect.value,localModel=occupied.get(self)??animalKind()??(selected==='boat'?(cat?'hobie':'sloop'):selected);
    const name=remote.playerName(),peers=remote.players();
    hostControls.hidden=!chatScope||owner!==self;
    if(!hostControls.hidden){
      const options=peers.filter(peer=>remote.npc.canTransferTo(peer.id)).map(({id,name})=>[id,name]);
      const signature=JSON.stringify(options);
      if(signature!==hostTargets){
        hostTargets=signature;
        const selectedHost=hostTarget.value;
        hostTarget.replaceChildren(new Option('Select a player',''),...options.map(([id,name])=>new Option(name,id)));
        hostTarget.value=options.some(([id])=>id===selectedHost)?selectedHost:'';
        hostTarget.disabled=options.length===0;
        hostTarget.onchange();
      }
    }
    const players=[[name+' (you)',fleetModel(localModel),penaltyTurns?'Flag · '+turnCount(penaltyTurns):hpFor(self),remote.connected&&owner===self]];
    for(const peer of peers)players.push([peer.name,fleetModel(occupied.get(peer.id)??peer.model,peer.id),peer.penalty?'Flag · '+turnCount(peer.penalty):hpFor(peer.id),owner===peer.id]);
    for(const [i,row] of habitat.vessels.entries()){
      const id='npc-'+(i+1),status=npcTraffic?.raceStatus?.(id);
      const progress=status?.penalty?'Flag · '+turnCount(status.penalty)+(status.turnDegrees?' · '+Math.round(status.turnDegrees)+'°':''):status?.stage===5?`Finished ${lapClock(Math.round(status.lapTime*10))}`:npcStage[status?.stage];
      npcs.push([remote.npcName(id),fleetModel(row.kind,id),hpFor(id)??progress]);
    }
    const rows=[...players,...npcs],signature=JSON.stringify(rows);
    if(signature===fleetSignature)return;
    fleetSignature=signature;
    fleetCount.textContent=rows.length;
    fleetEntries.replaceChildren(...rows.map(([name,model,progress,host])=>{
      const row=document.createElement('tr'),participant=row.insertCell();
      participant.textContent=name;
      if(host){
        const label=document.createElement('small');
        label.textContent='Host';
        participant.append(label);
      }
      const cell=row.insertCell();
      cell.textContent=model;
      if(progress){
        const detail=document.createElement('small');
        detail.textContent=progress;
        cell.append(detail);
      }
      return row;
    }));
  }
  let gullViewCount=1;
  function syncGullViews(){
    const count=remote.npc.habitat.gulls.length,menu=$('cameraDepth');
    const first=menu.querySelector('[value="gull"]');
    if(first.hidden!==(count===0))first.hidden=count===0;
    if(first.disabled!==(count===0))first.disabled=count===0;
    if(first.selected&&count===0)menu.value='deck';
    while(gullViewCount<count){gullViewCount++;menu.add(new Option('Gull '+gullViewCount+' cam','gull-'+gullViewCount));}
    while(gullViewCount>Math.max(1,count)){
      const option=menu.querySelector('[value="gull-'+gullViewCount+'"]');
      if(option?.selected)menu.value=count?'gull':'deck';
      option?.remove();gullViewCount--;
    }
    const call=$('gullCall'),hideCall=!menu.value.startsWith('gull');
    if(call.hidden!==hideCall)call.hidden=hideCall;
  }
  let spawnFeedbackTimer;
  function showSpawnResult(state,message){
    const button=$('spawnAnimal');
    clearTimeout(spawnFeedbackTimer);
    button.dataset.state=state;
    $('spawnResult').textContent=message;
    spawnFeedbackTimer=setTimeout(()=>delete button.dataset.state,2000);
  }
  const npcSurface=(x,y)=>ocean.sampleSurface(x,y);
  function npcIncidentSea(){
    const tile=world?.get('boatWater.tile'),omega=world?.get('swellOmega');
    if(!tile||!Number.isFinite(omega))return undefined;
    let swell=world.get('swell');
    if(model){
      const [amplitude,phase,k,bearing,east,north]=model.getMany(['swellAmplitude','swellPhase','swellK','swellBearing','east','north']);
      const x=k*Math.cos(bearing),y=k*Math.sin(bearing);
      swell=[amplitude,phase-east*x-north*y,x,y];
    }
    return {tile,tide:world.get('boatWater.tide'),swell:[...swell,omega]};
  }
  const npcError=reason=>{if(!signal.aborted)showSpawnResult('error',reason.message);};
  function syncNpcVessels(rows){
    const menu=$('cameraDepth');
    if(rows.length&&!npcTraffic&&!npcTrafficLoad){
      npcTrafficLoad=import('./npc-vessels.mjs').then(({vesselTraffic})=>{
        if(signal.aborted)return;
        npcTraffic=vesselTraffic(T,scene,npcSurface,ocean.sampleWind,race,remote.npc,npcError,observeNpcFinish,npcIncidentSea,remote.fleetNumber);
      }).catch(reason=>{npcError(reason);npcTrafficLoad=undefined;});
    }
    while(npcCamCount>rows.length){
      const option=menu.querySelector('[value="npc-'+npcCamCount--+'"]');
      if(option?.selected)menu.value='deck';
      option?.remove();
    }
    for(let i=0;i<rows.length;i++){
      const id='npc-'+(i+1),name=vesselNpcNames[rows[i].kind]+' · '+remote.npcName(id);
      let option=menu.querySelector('[value="'+id+'"]');
      if(!option){option=new Option(name,id);menu.add(option);}
      else if(option.text!==name)option.text=name;
    }
    npcCamCount=rows.length;
    npcRows=rows.slice();
  }
  $('spawnAnimal').onclick=()=>{
    const kind=$('spawnKind').value;
    const pendingStart=remote.npc.habitat.raceStart??0;
    const boundary=kind==='hobie'?(pendingStart>race.get('utc')?pendingStart:race.get('nextStart')):undefined;
    const id=remote.npc.spawn(kind,remote.seaTime(world?.time??model.time,performance.now()),boundary,$('wind').valueAsNumber);
    if(!id)return;
    if(id.startsWith('gull-'))syncGullViews();
    if(id.startsWith('npc-'))syncNpcVessels(remote.npc.habitat.vessels);
    showSpawnResult('added',$('spawnKind').selectedOptions[0].text+' added');
  };
  $('animalFeed').onclick=()=>{if(ownsAnimal())remote.npc.feed(animalId);$('view').focus();};
  $('gullCall').onclick=()=>{
    const view=$('cameraDepth').value;
    if(flyingGull()&&ownsAnimal())remote.npc.gullCall(gullIndex(animalId));
    else if(view.startsWith('gull'))remote.npc.gullCall(view==='gull'?0:Number(view.slice(5))-1);
    $('view').focus();
  };
  let lastFishPing=-Infinity;
  const fishDisplay=fishFinder($('animalSonar'));
  $('animalBreach').onclick=()=>{if(ownsAnimal())remote.npc.breach(animalId);$('view').focus();};
  const axis=(a,b,gain=motionGain())=>clampAxis(gain*(keyboard.get(a)-keyboard.get(b)+(analog.get(a)||0)-(analog.get(b)||0)));
  const controlKind=()=>animalId?animalKind():sub?.active?'sub':drone?.active?'drone':motor?'motorboat':'boat';
  const panelSize=new ResizeObserver(([entry])=>document.body.style.setProperty('--panel-height',entry.target.offsetHeight+'px'));
  panelSize.observe(panel.parentElement);
  cleanup(()=>panelSize.disconnect());
  const manualSelected=()=>animalId?ownsAnimal():sub?.active?sub.manual:drone?.active?drone.manual:manual;
  function touchControls(){
    analog.clear();
    const pad=$('sticks'),gull=flyingGull(),swimming=!!animalId&&!gull,boatActive=hasBoat&&!animalId&&!sub?.active&&!drone?.active;
    const animalSensors=$('animalSensors'),motorSensors=$('motorSensors'),subSensors=$('subPanel');
    animalSensors.hidden=!swimming;motorSensors.hidden=!motor||!!animalId;
    $('subPanel').hidden=!!animalId||!sub?.active;
    $('subModeLabel').hidden=$('subPanel').hidden||Boolean(world&&!world.hasSubMode);
    subMode.disabled=!sub?.manual;
    const steerKeys=wasd()?'Q/E':'A/D',verticalKeys=wasd()?'R/F':'W/S';
    const foreAftKeys=wasd()?'W/S':'↑/↓',sideKeys=wasd()?'A/D':'←/→';
    $('sailKeys').textContent=steerKeys+' steer · W eases the sheets · S hauls them in'+(cat?' · Arrows adjust travelers · C releases the main traveler.':'.');
    $('motorKeys').textContent='W/S throttle · '+steerKeys+' helm · Arrows aim searchlight · Z/X lights · C wipers';
    if(sub?.active)$('subKeys').textContent=verticalKeys+' rise/dive · '+steerKeys+' yaw · '+foreAftKeys+
      (sub.mode===0?' forward/back':' pitch · '+sideKeys+' roll')+' · Z lamp · X sonar map · C DVL rays';
    $('animalPilot').hidden=!swimming;$('gullKeys').hidden=!gull;
    if(swimming)$('swimKeys').textContent='W/S swim effort · '+steerKeys+' turn · '+
      (wasd()?'R rise · F dive':animalKind()==='shark'?'↓ rise · ↑ dive':'↑ rise · ↓ dive')+
      ' · '+sideKeys+' roll · '+(wasd()?'X':'F or X')+' feed · C breach';
    $('helm').hidden=Boolean(animalId||motor);$('motorPanel').hidden=!motor||!!animalId;
    document.querySelectorAll('[data-boat]').forEach(el=>el.hidden=!boatActive);
    physicsVisibility();
    mastButton.hidden=!boatActive||!hasMastCameras;
    if(mastButton.hidden){mastPanel.hidden=true;mastButton.setAttribute('aria-expanded','false');}
    $('trampoline').hidden=$('hobieTrim').hidden=$('outhaulControl').hidden=!cat||!boatActive;
    $('easeTraveler').hidden=!cat||!boatActive||!manual;
    racePanel.hidden=Boolean(sub?.active||animalId||motor);
    const sensorPanel=[animalSensors,motorSensors,subSensors].find(panel=>!panel.hidden);
    const rosterPanel=sensorPanel??raceSidebar;
    if(fleetRoster.parentElement!==rosterPanel){
      if(sensorPanel)sensorPanel.prepend(fleetRoster);
      else racePanel.after(fleetRoster);
      fleetRoster.open=!sensorPanel;
    }
    raceSidebar.hidden=Boolean(sensorPanel);
    $('flightModeLabel').hidden=!drone?.active;
    $('flightMode').disabled=!drone?.manual;
    if(drone?.active){
      $('flightKeys').textContent=foreAftKeys+(flightControl.value==='0'?' forward/back · '+sideKeys+' strafe':' pitch · '+sideKeys+' roll')+
        ' · '+steerKeys+' yaw · '+verticalKeys+(flightControl.value==='0'?' climb/descend':' throttle')+
        ' · C or Space arm/disarm'+(flightControl.value==='2'?' · Release roll/pitch to stop rotating':'');
    }


    const hideCompass=Boolean(animalId||motor);
    $('showForces').hidden=hideCompass||Boolean(drone?.active);
    $('showCompass').hidden=hideCompass;
    $('dial').hidden=hideCompass||$('showCompass').getAttribute('aria-pressed')!=='true';
    covarianceVisibility();
    $('helm').textContent=sub?.active?(sub.manual?'Resume survey':'Take control'):(manualSelected()?'Engage race autopilot':'Take the helm');
    $('helm').setAttribute('aria-pressed',String(!manualSelected()));
    stickIndicators.length=0;
    const show=stickPreference??(mobile||Boolean(drone?.active));
    $('showSticks').setAttribute('aria-pressed',String(show));
    pad.replaceChildren();pad.hidden=!show || !manualSelected();
    helm();
    if(pad.hidden)return;
    const attitudeControl=drone?.active && flightControl.value!=='0';
    let leftLabel,rightLabel;
    if(animalId){
      leftLabel=gull?'Turn / flap or glide':'Turn / swim';
      rightLabel='Roll / pitch';
    }else if(drone?.active){
      leftLabel=attitudeControl?'Yaw / throttle':'Yaw / climb';rightLabel='Roll / pitch';
    }else if(sub?.active){
      leftLabel='Yaw / heave';rightLabel=sub.mode===0?'Surge':'Roll / pitch';
    }else{
      leftLabel=motor?'Helm / throttle':'Rudder / sheet';
    }
    const layout=[[leftLabel,'KeyD','KeyW']];
    if(rightLabel)layout.push([rightLabel,'ArrowRight','ArrowUp']);
    for(const [label,horizontal,vertical] of layout){
      const stick=document.createElement('div'),knob=document.createElement('span'),caption=document.createElement('small');
      stick.className='stick';knob.className='knob';caption.textContent=label;stick.setAttribute('aria-label',label);
      stick.append(knob,caption);pad.append(stick);
      const opposite={KeyD:'KeyA',KeyW:'KeyS',ArrowUp:'ArrowDown',ArrowRight:'ArrowLeft'};
      stickIndicators.push(()=>{
        const x=horizontal?axis(horizontal,opposite[horizontal]):0,y=motor&&!animalId?shaftCommand:vertical?axis(vertical,opposite[vertical]):0;
        knob.style.transform='translate('+x*25+'px,'+(-y*25)+'px)';
      });
      let finger=null;
      function move(e){
        const rect=stick.getBoundingClientRect(),half=rect.width/2;
        let x=horizontal?(e.clientX-rect.left-half)/(half*.73):0,y=vertical?(rect.top+half-e.clientY)/(half*.73):0;
        const scale=Math.max(1,Math.hypot(x,y));x/=scale;y/=scale;
        if(horizontal)analog.set(horizontal,x);
        if(vertical)analog.set(vertical,y);
        helm();
      }
      stick.onpointerdown=e=>{if(finger!==null)return;e.preventDefault();finger=e.pointerId;stick.setPointerCapture(finger);move(e);};
      stick.onpointermove=e=>{if(e.pointerId===finger)move(e);};
      stick.onlostpointercapture=e=>{if(e.pointerId!==finger)return;finger=null;analog.delete(horizontal);analog.delete(vertical);knob.style.transform='';helm();};
    }
  }
  $('showSticks').onclick=()=>{stickPreference=$('showSticks').getAttribute('aria-pressed')!=='true';touchControls();};
  const targetSelect=$('controlTarget');
  if(hasBoat&&!cat){
    targetSelect.querySelector('[value="boat"]').textContent='Pilothouse sloop';
    $('otherSailboat').value='hobie';$('otherSailboat').textContent='Hobie 16';
  }
  function changeVehicle(choice){
    if(choice==='onrt'){location.assign('./onrt.html');return;}
    if(signal.aborted)return;
    const link=vehicleLink(url,choice),online=$('multiplayer').getAttribute('aria-pressed')==='true';
    if(online)joinRoomLink(link,roomName);
    else link.searchParams.delete('join');
    const state=rememberSettings();
    // Camera defaults follow the newly selected model.
    state.view=undefined;state.orbit=undefined;
    if(choice==='hobie')delete state.toggles.showCompass;
    const keepCruiser=Boolean(cruiserRuntime&&encounterStarted&&controlsEncounter());
    restartViewer(link,state,keepCruiser);
  }
  function restartViewer(link,state,keepCruiser=false){
    const online=remote.connected;
    if(animalId)remote.npc.release(animalId);
    const phase=remote.seaTime(world?.time??model.time,performance.now());
    preserveCruiser=keepCruiser;
    if(preserveCruiser){
      const simulation=cruiserRuntime.world;
      simulation.setAfterAdvance(null);simulation.clearQueued();
      simulation.set('throttleLever',0);simulation.set('helmLever',0);
      if(simulation.hasLandingLoad)simulation.set('droneLandingLoad',noLandingLoad);
      Object.assign(cruiserRuntime,{started:encounterStarted,session:encounterSession,cabinLit,anchorLowered,
        radio,placeRadio,radioRequested,audio,lastImpact});
      if(motor){
        const degrees=Math.PI/180;
        cruiserRuntime.lamps=[Number(cruiserLampControls[0].checked),Number(cruiserLampControls[1].checked),
          degrees*$('lampYaw').value,-degrees*$('lampTilt').value];
      }
    }
    const carry={remote,npcTraffic,online,phase,cruiserRuntime:preserveCruiser?cruiserRuntime:null,chatOpen:chatPanel.open,
      chatMessages:[...chatLog.children].map(row=>row.cloneNode(true))};
    remote.detachView();
    lifetime.abort();
    history.replaceState(history.state,'',link);
    document.body.style.cssText=initialBodyStyle;
    for(const key of ['runtime','simTime','east'])delete document.body.dataset[key];
    document.body.replaceChildren(...viewerLayout.map(node=>node.cloneNode(true)));
    run(state,carry).catch(showStartupError);
  }
  function resetNpcs(roster){
    const boundary=roster.raceStart>race.get('utc')?roster.raceStart:Math.floor(race.get('nextStart'));
    return remote.npc.reseed(remote.seaTime(world?.time??model.time,performance.now()),boundary,$('wind').valueAsNumber,roster);
  }
  function restoreNpcRoster(){
    if(saved?.npcs){resetNpcs(saved.npcs);saved.npcs=null;}
  }
  function rememberSettings(){
    const fields=Object.fromEntries(settingsFields.map(id=>{
      const field=$(id);
      return [id,field.type==='checkbox'?field.checked:field.value];
    }));
    const active=id=>$(id).getAttribute('aria-pressed')==='true';
    return {fields,bearing:ocean.U.bearing.value,view:cameraMenu.value,sticks:stickPreference,
      audio:{sound:active('sound'),music:active('music')},
      toggles:Object.fromEntries(toggleSettings.map(id=>[id,active(id)])),
      panels:[...settingPanels()].map(panel=>panel.open),controls:!panel.hidden,settings:!setup.hidden,
      map:mapDialog.open,mast:!mastPanel.hidden,sonarTab:$('cruiserSonarPanel').dataset.view,
      orbit:{views:[...cameraOrbits],skipper,cabinLook,zoom:[...cameraZoom],pan:[...cameraPan].map(([view,offset])=>[view,offset.toArray()])},
      paused:!running};
  }
  let resetting=false;
  async function resetSimulation(roomSlot){
    if(resetting||signal.aborted)return;
    resetting=true;
    const state=rememberSettings();
    let slot=roomSlot;
    if(slot===undefined&&remote.npc.host){
      const npcReset=resetNpcs(remote.npc.roster());
      const fleetReset=remote.resetFleet();
      slot=fleetReset?.slot;
      await Promise.race([Promise.allSettled([npcReset,fleetReset?.sent]),
        new Promise(resolve=>setTimeout(resolve,800))]);
    }
    if(model||motor){
      const origin=model?sailingStart(cat):{launchEast:3,launchNorth:-15};
      if(slot!==undefined){
        const column=slot%5-2,row=Math.floor(slot/5);
        state.spawn={launchEast:origin.launchEast+18*column,launchNorth:origin.launchNorth-8-16*row};
      }else if(remote.hasPeers){
        const boats=remote.vessels(performance.now()).filter(v=>v.hull);
        for(let i=0;i<16&&!state.spawn;i++){
          const half=Math.ceil(i/2);
          const east=origin.launchEast+(i%2?1:-1)*half*18;
          const north=origin.launchNorth-(i>8?16:0);
          if(boats.every(v=>Math.hypot(east-v.x,north-v.y)>13))state.spawn={launchEast:east,launchNorth:north};
        }
      }
    }
    const target=targetSelect.value;
    const role=gullIndex(target)>=0?'gull':remote.npc.animals.get(target)?.kind??target;
    const link=role===selectedRole?url:vehicleLink(url,role==='boat'?(cat?'hobie':'sloop'):role);
    restartViewer(link,state);
  }
  let loadingDrone,droneScorer,scoredTime=0;
  const flightControl=$('flightMode');
  flightControl.onchange=()=>{
    if(!drone)return;
    drone.flightMode=Number(flightControl.value);
    touchControls();
    $('view').focus({preventScroll:true});
  };
  function loadDrone(){
    loadingDrone??=import('./drone.mjs').then(({surveyDrone})=>surveyDrone(T,scene,world)).then(async vehicle=>{
      if(mode!=='flight'){
        // Coupled development scenes keep scoring the sailboat independently.
        const [east,north]=vehicle.position;
        scoredTime=world?.time??model.time;
        droneScorer=await loadInstance('Regatta',{...startGate,externalCourse:1,coursePoints:raceCoursePoints(race),windBearing,east,north,utc:race.get('utc'),raceStart:remote.npc.habitat.raceStart??0});
      }
      drone=vehicle;
      if(wreckSurvey&&(fullWorld||!packaged))drone.manual=false;
    }).catch(error=>{loadingDrone=undefined;throw error;});
    return loadingDrone;
  }
  $('cutMotors').onclick=()=>{
    const cut=$('cutMotors').getAttribute('aria-pressed')!=='true';
    drone.cut(cut);$('cutMotors').setAttribute('aria-pressed',String(cut));
    $('cutMotors').textContent=cut?'Restore motors':'Cut motors';
  };
  let enteredSub=false,viewBeforeAnimal;
  async function selectTarget(){
    if(['hobie','sloop','onrt'].includes(targetSelect.value)){changeVehicle(targetSelect.value);return;}
    if(animalId&&animalId!==targetSelect.value){
      remote.npc.release(animalId);animalId=undefined;visitors.watch(null);
      $('cameraDepth').value=viewBeforeAnimal??'deck';
    }
    const gull=gullIndex(targetSelect.value);
    if(gull>=0||remote.npc.animals.has(targetSelect.value)||['whale','shark'].includes(targetSelect.value)){
      if(!animalId)viewBeforeAnimal=$('cameraDepth').value;
      showSkipperView(false);
      if(sub){sub.active=false;sub.mapGroup.visible=false;}
      drone?.select(false);
      $('cutMotors').hidden=$('flightKeys').hidden=true;
      animalId=targetSelect.value;remote.npc.select(animalId);visitors.watch(animalId);
      lastClaim=performance.now();lastInput=-Infinity;
      if(gull>=0){
        syncGullViews();$('cameraDepth').value=gull===0?'gull':'gull-'+(gull+1);
        document.querySelector('h1').textContent='Herring gull'+(gull===0?'':' '+(gull+1));
      }else{
        const animal=remote.npc.animals.get(animalId)??{id:animalId,kind:animalId};
        $('cameraDepth').value=animal.kind;document.querySelector('h1').textContent=animalLabel(animal);
      }
      keys.clear();keyboard.clear();touchControls();$('view').focus();return;
    }
    if((targetSelect.value==='motorboat'&&mode!=='motorboat')||((packaged&&!fullWorld||motor)&&targetSelect.value!==selectedRole)){
      changeVehicle(targetSelect.value==='boat'?'hobie':targetSelect.value);
      return;
    }
    keys.clear();keyboard.clear();analog.clear();helm();
    if(targetSelect.value==='drone'&&!drone){
      try{await loadDrone();}
      catch(error){
        if(targetSelect.value!=='drone')return;
        if(mode==='flight')throw error;
        targetSelect.title=error.message;targetSelect.value=sub?.active?'sub':'boat';
      }
      if(targetSelect.value!=='drone'&&drone)return;
    }
    if(sub)sub.active=targetSelect.value==='sub';
    if(sub?.active){
      if(!enteredSub){
        enteredSub=true;
        sub.manual=false;
        sub.mapVisible=$('sonarMap').checked;
        $('cameraDepth').value='onboard';
      }
    }
    if(!world && drone?.active && targetSelect.value!=='drone' && drone.manual){
      race.set('landingReaction',[0,0,0,0,0,0]);model.set('droneLoad',[0,0,0,0,0,0]);
    }
    drone?.select(targetSelect.value==='drone');
    const flying=Boolean(drone?.active);
    laps.select(flying?'RDD2':hasBoat?vessel:'Hobie16');
    $('view').focus({preventScroll:true});
    $('onboardOption').hidden=!sub?.active;
    $('droneFpvOption').hidden=!flying;
    showSkipperView(targetSelect.value==='boat');
    const viewSelect=$('cameraDepth');
    for(const option of viewSelect.options){
      if(option.value==='keel'||option.value==='line')option.hidden=flying;
      option.disabled=option.hidden;
    }
    if(viewSelect.selectedOptions[0]?.disabled){
      viewSelect.value='deck';
    }
    $('cutMotors').hidden=$('flightKeys').hidden=!flying;
    document.querySelector('h1').textContent=motor?'Inboard cabin cruiser':sub?.active?'Piccard Sub':flying?'RDD2 survey drone':(cat?'Hobie 16':'Sailboat');
    touchControls();
  }
  targetSelect.value=selectedRole;targetSelect.disabled=false;targetSelect.onchange=selectTarget;
  if(!joinRoomOnLoad)restoreNpcRoster();
  if(fullWorld||(!packaged&&wreckSurvey))loadDrone().catch(error=>{targetSelect.title=error.message;});
  if(directControls.includes(initialTarget)){
    targetSelect.value=initialTarget;
    await selectTarget();
    if(['drone','sub'].includes(initialTarget)&&targetSelect.value===initialTarget&&url.searchParams.get('view')==='fpv')$('cameraDepth').value=initialTarget==='sub'?'onboard':'fpv';
  }

  let lastDial=-Infinity;
  const requestedView=url.searchParams.get('view');
  if(targetSelect.value==='boat'){
    const useSkipper=skipperOption&&['ballast','trapeze-port','trapeze-starboard'].includes(requestedView);
    cameraMenu.value=useSkipper?skipperOption.value:'deck';
  }else if(Object.hasOwn(wildlifeDefaults,requestedView))cameraMenu.value=requestedView;

  function helm(){
    updateShaft();
    for(const draw of stickIndicators)draw();
    const fast=fastControl()&&!fineControl();
    drone?.input((a,b)=>axis(a,b,fast&&a.startsWith('Arrow')?1:motionGain()),fast);
    const atHelm=!animalId&&!drone?.active&&!sub?.active,stick=pilotSticks(axis);
    model?.set('rudderInput',atHelm?stick.yaw:0);model?.set('trimInput',atHelm?stick.throttle:0);
  }
  const mapDialog=$('harborMap');
  let localChart,lastChart=-Infinity;
  const focusGame=()=>$('view').focus({preventScroll:true});
  function toggleMap(){
    if(mapDialog.open){mapDialog.close();return;}
    localChart??=harborMap($('harborMapCanvas'),island.userData.chartTerrain,race,$('harborMapRoster'));
    lastChart=-Infinity;
    mapDialog.show();
    focusGame();
  }
  function openChat(){
    if(!chatScope)return;
    chatPanel.open=true;
    chatInput.focus({preventScroll:true});
  }
  $('harborMapButton').onclick=toggleMap;
  mapDialog.addEventListener('close',focusGame);
  chatButton.onclick=openChat;
  chatPanel.addEventListener('focusin',releaseControls);
  chatPanel.addEventListener('toggle',()=>{
    if(chatPanel.open){
      unread=0;chatBadge();
      chatLog.scrollTop=chatLog.scrollHeight;
    }else if(chatPanel.contains(document.activeElement))focusGame();
  });
  chatPanel.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!e.isComposing){
      e.preventDefault();
      chatPanel.open=false;
      focusGame();
    }
  });
  function cycleCamera(){
    const views=animalId?[]:sub?.active?['deck','onboard']:drone?.active?['deck','fpv']:
      motor?['deck',...Object.keys(cruiserViews)]:['deck','ballast','line','keel'];
    const candidates=views.filter(view=>[...cameraMenu.options].some(option=>option.value===view&&!option.hidden&&!option.disabled));
    if(candidates.length<2)return false;
    cameraMenu.value=candidates[(candidates.indexOf(cameraMenu.value)+1)%candidates.length];
    cameraMenu.dispatchEvent(new Event('change'));
    return true;
  }
  const chatSend=$('chatSend');
  chatInput.onkeydown=e=>{
    if(e.key==='Enter'&&!e.isComposing){
      e.preventDefault();
      if(!e.repeat)chatSend.requestSubmit();
    }
  };
  chatSend.onsubmit=async e=>{
    e.preventDefault();
    const draft=chatInput.value,message=draft.trim(),room=chatScope;
    if(!message||!room)return;
    chatInput.value='';
    if(await remote.sendChat(message)){
      if(chatScope===room){
        chatMessage(remote.playerName()+' (you)',message);
        $('chatStatus').value=remote.peerCount?'':chatWaiting;
      }
    }else if(chatScope===room){
      if(!chatInput.value)chatInput.value=draft;
      $('chatStatus').value=remote.peerCount?'Message could not be sent.':chatWaiting;
    }
  };
  on(window,'keydown',e=>{
    if(e.defaultPrevented||e.repeat||e.altKey||e.ctrlKey||e.metaKey||chatPanel.contains(e.target)||
      e.target.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    if(e.key==='Enter'&&chatScope&&e.target.tagName!=='BUTTON')openChat();
    else if(e.code==='KeyV'){if(!cycleCamera())return;}
    else if(e.code==='Home')recenterView();
    else if(e.code==='KeyM')toggleMap();
    else if(e.key==='Escape'&&mapDialog.open)mapDialog.close();
    else return;
    e.preventDefault();
  });
  on(window,'keydown',e=>{
    const formControl=['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName);
    if(!moveTraveler||chatPanel.contains(e.target)||targetSelect.value!=='boat'||!manual||
      e.altKey||e.metaKey||e.target.isContentEditable||formControl||!e.code.startsWith('Arrow'))return;
    e.preventDefault();
    moveTraveler(e.code,false,controlGain({fast:e.shiftKey,fine:e.ctrlKey}));
  });
  const modifierKey=code=>code.startsWith('Shift')||code.startsWith('Control');
  function auxiliaryControl(code){
    if(animalId){
      if(!ownsAnimal())return;
      if(flyingGull()){
        if(code==='KeyC'||code==='Space')return 'gullCall';
      }else{
        if(code==='KeyX'||code==='KeyF'&&!wasd())return 'animalFeed';
        if(code==='KeyC'||code==='Space')return 'animalBreach';
      }
    }else if(drone?.active){
      if(code==='KeyC'||code==='Space')return 'cutMotors';
    }else if(sub?.active){
      return {KeyZ:'subLamp',KeyX:'sonarMap',KeyC:'showDvlRays'}[code];
    }else if(motor){
      if(code==='KeyC'&&!world.hasWiper)return;
      return {KeyZ:'searchLamp',KeyX:'keelLamp',KeyC:'wiperSwitch'}[code];
    }else if(cat&&manual&&code==='KeyC')return 'easeTraveler';
  }
  on(window,'keydown',e=>{
    if(e.defaultPrevented||e.altKey||e.metaKey||chatPanel.contains(e.target)||e.target.isContentEditable||
      ['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    if(modifierKey(e.code)){
      keys.add(e.code);helm();return;
    }
    const auxiliary=e.ctrlKey||e.code==='Space'&&e.target.tagName==='BUTTON'?undefined:auxiliaryControl(e.code);
    if(auxiliary){
      e.preventDefault();
      if(!e.repeat)$(auxiliary).click();
      return;
    }
    if(!manualSelected())return;
    const code=keyboardAxisKey(e.code,keyLayout.value,controlKind());
    if(!code)return;
    e.preventDefault();
    pressedMotion.set(e.code,code);keys.add(code);
    keyboard.press(code,performance.now());helm();
  });
  on(window,'keyup',e=>{
    if(modifierKey(e.code)){keys.delete(e.code);helm();return;}
    const code=pressedMotion.get(e.code);
    if(!code)return;
    pressedMotion.delete(e.code);keys.delete(code);keyboard.release(code,performance.now());helm();
  });
  function releaseControls(){pressedMotion.clear();keys.clear();keyboard.clear();analog.clear();heldLever=undefined;helm();}
  keyLayout.onchange=()=>{
    releaseControls();touchControls();
    try{localStorage.setItem('ocean-key-layout',keyLayout.value);}catch{}
    focusGame();
  };
  on(window,'blur',releaseControls);

  $('helm').onclick=()=>{
    if(sub?.active)sub.manual=!sub.manual;
    else if(drone?.active){drone.manual=!drone.manual;world?.set('racePilot',Number(!drone.manual));}
    else{manual=!manual;model.set('manualHelm',Number(manual));}
    keys.clear();keyboard.clear();touchControls();
  };
  touchControls();
  for(const [id,input] of [['outhaul','outhaulInput'],['vang',cat?'downhaulInput':'vangInput']]){
    $(id).oninput=()=>{
      const value=$(id).valueAsNumber;
      $(id+'Set').value=value+'%';
      model?.set(input,value/100);
    };
    $(id).oninput();
  }
  const halyard=$('jibHalyard'),halyardControl=halyard.closest('.control-slider');
  halyardControl.hidden=!cat||!model.has('jibHalyardTension');
  halyard.oninput=()=>{
    $('jibHalyardSetting').textContent=halyard.value+'%';
    if(!halyardControl.hidden)model.set('jibHalyardInput',halyard.valueAsNumber/100);
  };
  halyard.oninput();
  $('resetSimulation').onclick=()=>resetSimulation();
  $('play').onclick=()=>{
    running=!running;
    acc=0;prev=physicsWall=performance.now();
    if(!running)world?.clearQueued();
    $('play').textContent=running?'Pause':'Resume';
  };
  function applyWind(){const w=+$('wind').value;if(world){world.set('windSpeed',w);world.set('windBearing',ocean.U.bearing.value);}else{windField.set('meanEast',w*Math.cos(ocean.U.bearing.value));windField.set('meanNorth',w*Math.sin(ocean.U.bearing.value));}ocean.U.wind.value=w;ocean.U.referenceWind.value=w;
    const knots=(w*knotsPerMetrePerSecond).toFixed(1)+' kn';
    $('windOut').value=knots;$('wind').setAttribute('aria-valuetext',knots);}
  $('wind').oninput=()=>{applyWind();remote.changeWeather('wind',Number($('wind').value));};
  function resize(){
    lastReflection=-Infinity;
    const renderRatio=upscaling?.ratio(pixelScale)??pixelScale;
    if(renderer.getPixelRatio()!==renderRatio)renderer.setPixelRatio(renderRatio);
    renderer.setSize(innerWidth,innerHeight,false);
    if(adaptiveWater())ocean.resizeCaptures(pixelScale/profile.ratio);
    camera.aspect=innerWidth/innerHeight;
    camera.updateProjectionMatrix();
  }
  upscaling=neuralUpscaling(T,renderer,$('neuralUpscaling'),$('neuralUpscalingStatus'),{
    signal,resize:()=>{
      resize();
      if(frameTest)finishTest('Test interrupted by an upscaling change.');
    }
  });
  resize();on(window,'resize',resize);
  const hullDisplay=displayPose(),flightDisplay=displayPose(),motorDisplay=motor?displayPose():null;
  prev=performance.now();
  function updatePlayback(){
    speedSelect.disabled=multiplayerButton.getAttribute('aria-pressed')==='true';
    const rate=world&&!speedSelect.disabled?Number(speedSelect.value):1;
    if(playbackRate===rate)return;
    playbackRate=rate;
    if(rate!==1)timedLap=false;
    physicsWall=performance.now();acc=0;world?.clearQueued();
    statsStart=undefined;
    if(frameTest)finishTest('Test interrupted by a simulation speed change.');
  }
  function advanceWorld(now){
    const elapsed=Math.max(0,(now-physicsWall)/1000);
    physicsWall=now;
    if(starting||!running||document.hidden)return;
    if(frameTest?.headroom){
      // Count the offline harbor as well as the vehicle. Limit the lead
      // so contact inputs and animal poses stay close to the world clock.
      if(frameTest.simStart===undefined)return;
      const harbor=remote.npc.clock;
      const lead=frameTest.withWildlife?(world.time-frameTest.simStart)-(harbor-frameTest.harborStart):0;
      world.advance(Math.max(0,Math.floor((.3-lead)*100)-world.scheduledSteps),true);
      return;
    }
    // Retain short foreground stalls and repay them through the fixed-step FMU.
    acc=Math.min(.25,acc+elapsed*playbackRate);
    acc=Math.max(0,acc-world.advance(Math.floor(acc/.01))*.01);
  }
  let frameCost=1000/30,lastQualityCheck=0;
  let lastEnvironment,lastThunder;
  function updateLight(time,roomTime){
    const sky=$('sky').value,storm=$('storm').checked,environment=sky+'-'+storm;
    const phase=sky==='Cycle'?roomTime/240:sky==='Sunset'?.055:sky==='Moonlit'?-1:.9;
    if(environment!==lastEnvironment||sky==='Cycle'){
      const z=Math.sin(phase),x=Math.cos(phase);
      ocean.U.sunDir.value.set(x,.32,z).normalize();
      ocean.U.moonDir.value.copy(ocean.U.sunDir.value).negate();
      ocean.U.storm.value=Number(storm);
      const day=Math.max(0,z);
      sun.position.copy(ocean.U.sunDir.value).multiplyScalar(30);
      sun.intensity=(.12+2.4*day)*(storm?.45:1);
      sun.color.set(sky==='Sunset'?0xffaf76:0xffe6b4);
      hemi.intensity=(.27+1.7*day)*(storm?.6:1);
      lastEnvironment=environment;
    }
    ocean.updateSky(renderer,time,environment);
  }
  const noGo=model?.get('noGo');
  const waterStamp=()=>model?model.get('waterStamp'):world.get('waterStamp');
  let meshTime,observedBoat,lastCruiserHull;
  const wavePresentation=waterPresentation(100), seaPresentation=waterPresentation(200);
  const windPresentation=waterPresentation(250);
  let opticalTime,observedWall,simulationRate=1,previousSwellPhase,swellRate=0;
  let lastHullHeight,lastFieldTick=-1,lastSurfaceTick=-1,previousSurface;
  const measureButton=$('measureFrames'),frameResult=$('frameResult'),runStats=$('runStats');
  function updateRunStats(now,time){
    if(statsStart===undefined || statsRunning!==running){
      statsStart=now;statsTime=time;statsFrames=0;statsRunning=running;
      runStats.textContent=running?'— FPS · —× real time':'— FPS · Paused';
      return;
    }
    statsFrames++;
    const seconds=(now-statsStart)/1000;
    if(seconds<1)return;
    const fps=(statsFrames/seconds).toFixed(1)+' FPS';
    runStats.textContent=fps+(running?' · '+((time-statsTime)/seconds).toFixed(2)+'× real time':' · Paused');
    statsStart=now;statsTime=time;statsFrames=0;
  }
  const headroomButton=$('headroom');
  headroomButton.hidden=!world;
  measureButton.disabled=false;
  function finishTest(message){
    if(frameTest?.headroom){
      world.setAfterAdvance(null);world.clearQueued();physicsWall=performance.now();acc=0;
    }
    frameTest=null;measureButton.disabled=false;headroomButton.disabled=false;frameResult.textContent=message;
  }
  measureButton.onclick=()=>{
    if(!running){finishTest('Resume the simulation to measure frame rate.');return;}
    headroomButton.disabled=true;frameTest={gaps:[],quality:selector.value};
    measureButton.disabled=true;frameResult.textContent='Measuring for 15 seconds…';
  };
  headroomButton.onclick=()=>{
    if(!running||$('multiplayer').getAttribute('aria-pressed')==='true'){
      finishTest('Run the headroom test in an active offline simulation.');return;
    }
    const withWildlife=remote.npc.hasWildlife;
    if(withWildlife&&remote.npc.clock===undefined){finishTest('Waiting for the first wildlife update.');return;}
    frameTest={gaps:[],quality:selector.value,headroom:true,withWildlife};
    headroomButton.disabled=true;measureButton.disabled=true;
    // Keep the two fixed-step workers supplied between display refreshes.
    world.setAfterAdvance(t=>{
      if(!running||document.hidden||!frameTest?.headroom)return;
      const now=performance.now();
      visitors.advanceHost(t,now);advanceWorld(now);
    });
    frameResult.textContent='Running the offline simulation at full speed for 15 seconds…';
  };
  let hiddenAt;
  on(document,'visibilitychange',()=>{
    prev=physicsWall=performance.now();acc=0;world?.clearQueued();
    statsStart=undefined;
    if(document.hidden){
      hiddenAt=Date.now();
      releaseControls();
      if(frameTest)finishTest('Test interrupted while the page was hidden.');
    }else{
      if(hiddenAt!==undefined&&Date.now()-hiddenAt>5000)remote.recover();
      hiddenAt=undefined;
    }
  });
  function measureFrame(now,t){
    const test=frameTest;
    if(!running || selector.value!==test.quality){finishTest('Test interrupted. Resume with one performance setting and try again.');return;}
    if(test.headroom&&$('multiplayer').getAttribute('aria-pressed')==='true'){
      finishTest('Headroom test ended when multiplayer started.');return;
    }
    if(test.headroom&&test.withWildlife!==remote.npc.hasWildlife){
      finishTest('Headroom test ended when the wildlife roster changed.');return;
    }
    if(test.start===undefined){
      test.start=test.last=now;test.simStart=t;test.harborStart=remote.npc.clock;return;
    }
    test.gaps.push(now-test.last);test.last=now;
    const elapsed=(now-test.start)/1000;
    if(elapsed<15)return;
    const gaps=test.gaps.sort((a,b)=>a-b);
    const p95=gaps[Math.ceil(.95*gaps.length)-1];
    if(test.headroom){
      const worldRate=(t-test.simStart)/elapsed;
      const harborRate=test.withWildlife?(remote.npc.clock-test.harborStart)/elapsed:worldRate;
      const rate=Math.min(worldRate,harborRate);
      const rates=test.withWildlife?` · vehicle ${worldRate.toFixed(2)}× · wildlife ${harborRate.toFixed(2)}×`:'';
      finishTest(`${rate.toFixed(2)}× simulation headroom · ${mobile?2:profile.target}× target${rates} · ${(gaps.length/elapsed).toFixed(1)} FPS · p95 ${p95.toFixed(1)} ms`);
      return;
    }
    const final=renderer.domElement,source=upscaling.size;
    const upscale=source?` · AI from ${source.width}×${source.height}`:'';
    finishTest(`${(gaps.length/elapsed).toFixed(1)} FPS · 95th percentile ${p95.toFixed(1)} ms · ${((t-test.simStart)/elapsed).toFixed(2)}× real time · ${test.quality} · ${final.width}×${final.height} final pixels${upscale}`);
  }
  speedSelect.onchange=()=>{
    url.searchParams.set('speed',speedSelect.value);history.replaceState(history.state,'',url);
    updatePlayback();
  };
  applyWind();
  if(saved){
    showControls(saved.controls);
    settings(saved.settings);
    [...settingPanels()].forEach((pane,i)=>{if(typeof saved.panels[i]==='boolean')pane.open=saved.panels[i];});
    for(const id of toggleSettings){
      const button=$(id);
      const available=id==='helm'?hasBoat||drone?.active||sub?.active:id==='cutMotors'?drone?.active:id==='cruiserChartFit'?motor:id!=='subLamp';
      const preference=saved.toggles[id];
      if(available&&typeof preference==='boolean'&&preference!==(button.getAttribute('aria-pressed')==='true'))button.click();
    }
    if(sub){
      $('subMode').onchange();
      $('sonarMap').onchange();
      if(sub.active&&saved.toggles.subLamp!==(lampButton.getAttribute('aria-pressed')==='true'))lampButton.click();
    }
    if(drone?.active)flightControl.onchange();
    if(motor){
      $('echoCamera').onchange();
      $('cruiserSonarRange').dispatchEvent(new Event('change'));
      $('cruiserSonarPanel').querySelector('[data-pane="'+(saved.sonarTab==='chart'?'chart':'sonar')+'"]').click();
    }
    if(saved.map)toggleMap();
    if(saved.mast&&hasMastCameras)mastButton.click();
    if(saved.paused)$('play').click();
    if(saved.orbit){
      const savedOrbit=saved.orbit;
      if(savedOrbit.views){
        for(const [key,orbit] of savedOrbit.views)cameraOrbits.set(key,orbit);
      }else if(Number.isFinite(savedOrbit.distance)){
        const {angle,tilt,distance}=savedOrbit;
        cameraOrbits.set(orbitKey(saved.view??'deck'),{angle,tilt,distance});
      }
      Object.assign(skipper,savedOrbit.skipper);
      Object.assign(cabinLook,savedOrbit.cabinLook);
      for(const [view,zoom] of saved.orbit.zoom)cameraZoom.set(view,zoom);
      for(const [key,offset] of saved.orbit.pan)cameraPan.set(savedOrbit.views?key:orbitKey(key),new T.Vector3().fromArray(offset));
    }
  }
  let savedView=saved?.view;
  function restoreCamera(){
    if(savedView&&[...cameraMenu.options].some(option=>option.value===savedView&&!option.disabled)){
      cameraMenu.value=savedView;savedView=null;
      syncGullViews();
    }
  }
  restoreCamera();
  let roomRequestedAt,roomOpenedAt;
  function joinForStartup(){
    roomRequestedAt=performance.now();
    void multiplayer(true).then(()=>{roomOpenedAt=performance.now();});
  }
  if(carried){
    remote.resumeClock(carried.phase-(world?.time??model.time));
    remote.attachView({scene,status:$('online'),weather,crew:$('crew'),laps,onImagingHit:playImagingHit,chat,onFinish:audio.finishGun});
    chatLog.append(...carried.chatMessages);
    if(chatScope)chatPanel.open=carried.chatOpen;
    npcTraffic?.attachView({scene,surface:npcSurface,windAt:ocean.sampleWind,race,incidentSea:npcIncidentSea,onError:npcError,onFinish:observeNpcFinish});
    if(carried.online&&!remote.connected)joinForStartup();
    else{
      multiplayerButton.setAttribute('aria-pressed',String(carried.online));
      $('invite').hidden=!carried.online;
      updatePlayback();
    }
  }else if(joinRoomOnLoad)joinForStartup();
  else updatePlayback();
  remote.setResetHandler(resetSimulation);
  if(motor){
    const lightTarget=new T.WebGLRenderTarget(4,4,{type:T.HalfFloatType});
    const previousFog=scene.fog;
    const bearing=T.MathUtils.degToRad($('lampYaw').valueAsNumber);
    const tilt=-T.MathUtils.degToRad($('lampTilt').valueAsNumber);
    try{
      reportStartup('Preparing cruiser lighting',.74);
      await motor.preloadLighting(bearing,tilt,async()=>{
        scene.fog=underwaterFog;
        await renderer.compileAsync(scene,camera);
        reportStartup('Preparing cruiser lighting',.76);
        renderer.setRenderTarget(lightTarget);
        try{
          await renderer.compileAsync(scene,camera);
          if(!profile.skipCaptures){scene.fog=null;await renderer.compileAsync(scene,camera);}
        }
        finally{renderer.setRenderTarget(null);}
        reportStartup('Preparing cruiser lighting',.79);
      });
      renderer.initTexture(motor.searchlight.light.map);
      await lampPass.preload();
    }finally{scene.fog=previousFog;lightTarget.dispose();}
  }
  let physicsTimer,courseTarget,drawDeadline,appliedRaceStart=0;
  let firstWarmFrame,lastWarmFrame;
  const warmIntervals=[];
  function finishStartup(){
    if(document.hidden)return;
    const now=performance.now();
    firstWarmFrame??=now;
    if(lastWarmFrame!==undefined){
      warmIntervals.push(now-lastWarmFrame);
      if(warmIntervals.length>5)warmIntervals.shift();
    }
    lastWarmFrame=now;

    // Wait for the next full scene renders, including water captures.
    const warm=now-firstWarmFrame>=1200 || (now-firstWarmFrame>=220&&warmIntervals.length===5&&
      Math.max(...warmIntervals)<=2*Math.min(...warmIntervals));
    // A new room may have no peers. Keep discovery running after the loading screen.
    const rosterReady=remote.npc.synchronized&&remote.visible>0&&(!npcTrafficLoad||npcTraffic);
    const joining=roomRequestedAt!==undefined&&now-roomRequestedAt<6500&&
      (roomOpenedAt===undefined||remote.connected&&now-roomOpenedAt<(remote.hasPeers?3200:1800)&&!rosterReady);
    if(joining){
      const wait=Math.min(1,(now-roomRequestedAt)/6500);
      reportStartup(remote.hasPeers?'Synchronizing multiplayer':'Joining multiplayer',.89+.10*wait);
    }else if(!warm){
      reportStartup('Preparing graphics',.79+.10*Math.min(1,(now-firstWarmFrame)/220));
    }else if(worker&&!waterFrame){
      reportStartup('Preparing water',.96);
    }else reportStartup('Ready',1);
    if(!warm||joining||worker&&!waterFrame)return;

    prev=physicsWall=now;acc=0;
    observedWall=now;opticalTime=undefined;
    statsStart=undefined;frameCost=renderInterval;lastQualityCheck=now;
    starting=false;
    startupScreen.hidden=true;
    for(const node of startupControls)node.inert=false;
    $('view').focus({preventScroll:true});
  }
  function draw(now){
    if(signal.aborted)return;
    if(cat)boat?.setSailNumber(remote.fleetNumber());
    // Keep a 30 Hz deadline across refresh rates. If a frame missed a
    // whole period, reset phase instead of rendering catch-up frames.
    drawDeadline??=now;
    if(now+.2<drawDeadline){requestAnimationFrame(draw);return;}
    drawDeadline+=renderInterval;
    if(drawDeadline<=now)drawDeadline=now+renderInterval;
    try{
      if(keyboard.active){keyboard.advance(now);helm();}
      if((model||motor)&&remote.needsTraffic(now>=raceTick)){
        let east,north,heading;
        if(motor)[east,north,,,,heading]=world.get('boatPose');
        else [east,north,heading]=model.getMany(['east','north','heading']);
        peerCollisionSamples=remote.contacts(east,north,heading);
        (motor?world:model).set('traffic',peerCollisionSamples);
        (motor?world:model).set('trafficTilt',remote.contactTilts);
      }
      if(now>=raceTick){
        raceTick=now+50;
        const start=remote.npc.habitat.raceStart??0;
        if(start!==appliedRaceStart){
          appliedRaceStart=start;
          if(world)world.set('raceStart',start);
          else race.set('raceStart',start);
          droneScorer?.set('raceStart',start);
          lastCountdown=null;
          if(model)resetPenalties();
        }
        if(droneScorer){
          const t=world?.time??model.time,dt=t-scoredTime;
          if(dt>=.049){
            const [east,north]=drone.position;
            droneScorer.set('coursePoints',raceCoursePoints(race));
            droneScorer.set('east',east);droneScorer.set('north',north);droneScorer.set('utc',race.get('utc'));
            droneScorer.advance(dt);scoredTime=t;
          }
        }
        if(drone?.active&&!drone.manual&&droneScorer)drone.station(...droneScorer.get('pilotTarget'));
        if(!world&&model&&!manual)model.set('raceGoal',[1,...race.get('pilotTarget')]);
        const scorer=drone?.active&&droneScorer?droneScorer:race;
        const left=Math.ceil(scorer.get('countdown')),stage=scorer.get('stage');
        if(lastCountdown!==null&&lastCountdown<5&&left>295)audio.signal();
        lastCountdown=left;const label=left>298&&stage>0?'START':Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
        const sceneryTime=world?.time??model.time;
        course.update(label,sceneryTime,ocean.sampleWind);$('countdown').textContent=label;
        const lap=scorer.get('lapTime');
        const tenths=Math.round(lap*10);
        const timer=lapClock(tenths);
        const raceClass=drone?.active?'RDD2':vessel;
        const normalSpeed=playbackRate===1&&!frameTest?.headroom;
        if(stage<2||!normalSpeed)timedLap=normalSpeed;
        observePenalties(stage);
        if(!sub?.active&&(hasBoat||drone?.active)&&!penaltyTurns)laps.observe(stage,lap,remote.playerName(),timedLap);
        const heat=scorer.has('heatStart')?scorer.get('heatStart'):undefined;
        const finished=stage===5&&scorer.has('finishUtc')?scorer.get('finishUtc'):0;
        if(hasBoat&&!animalId&&!sub?.active&&!drone?.active&&timedLap&&!penaltyTurns&&finished>lastReportedFinish){
          remote.recordFinish(heat,finished);lastReportedFinish=finished;
        }
        if(stage===5&&!penaltyTurns)lastLaps.set(raceClass,timer);
        const lastLap=lastLaps.get(raceClass);
        let cue=scorer.has('earlyStart')&&scorer.get('earlyStart')?'Over early · Return behind the start line':
          ['Wait for start','Cross upwind','Mark 1','Mark 2','Cross finish downwind','Finished'][stage];
        const racer=drone?.active?drone.estimatedPosition:model?[model.get('east'),model.get('north')]:null;
        courseTarget=racer?raceTarget(race,stage,racer[0],racer[1]):null;
        if(courseTarget && (drone?.active || stage===2 || stage===3)){
          cue+=' · '+courseTarget.bearing+' · '+Math.round(courseTarget.range)+' m';
        }
        $('raceCourse').textContent='TRI 1 · First leg '+firstLeg(race)+' · 1 & 2 to port';
        $('raceStatus').textContent=cue+(stage>=2?' · Lap '+timer:lastLap?' · Last lap '+lastLap:'');
        const winner=remote.raceWinner(heat);
        const winnerLine=$('raceWinner');
        const winnerLabel=winner?'First across · '+winner.name:'';
        if(winnerLine.textContent!==winnerLabel)winnerLine.textContent=winnerLabel;
        winnerLine.hidden=!winner;
      }
      frameCost=.94*frameCost+.06*Math.min(120,now-prev);
      const adaptive=adaptiveWater();
      const minRatio=adaptive?.6:profile.min;
      if(!starting&&minRatio<profile.ratio&&now-lastQualityCheck>(adaptive?1000:1500)){
        const change=adaptive?(frameCost>42?-.15:frameCost<35?.05:0):(frameCost>39?-.1:frameCost<23?.05:0);
        const next=Math.max(Math.min(devicePixelRatio,minRatio),Math.min(devicePixelRatio,profile.ratio,pixelScale+change));
        if(Math.abs(next-pixelScale)>.01){pixelScale=next;resize();}
        lastQualityCheck=now;
      }
      const frameSeconds=Math.max(0,Math.min(.22,(now-prev)/1000));prev=now;
      // Encode incoming fields against the surface at this draw time. At
      // lower frame rates, the preceding draw can be half a wake tick behind.
      ocean.U.spectrumBlend.value=wavePresentation.blend(now,running);
      ocean.U.windBlend.value=windPresentation.blend(now,running);
      if(world)ocean.U.spectrumDrift.value.lerpVectors(lastDrift,nextDrift,ocean.U.spectrumBlend.value);
      if(!starting&&!world&&running&&!document.hidden)acc+=frameSeconds;
      if(waterError)throw waterError;
      if(world){
        if(motor)world.set('helmLever',animalId?0:pilotSticks(axis).yaw);
        if(world.hasSeaClock){
          const phase=remote.seaTime(world.time,now);
          world.set('seaClockOffset',phase-world.time);
          if(world.hasWindAnchor)world.set('windAnchor',remote.windAnchor(phase,now,
            windField.get('gustEast'),windField.get('gustNorth'),windField.get('travelE'),windField.get('travelN')));
        }
        if(world.hasPeerWake){
          const shareWake=remote.wantsWakeSource && (!!motor || hasBoat && $('controlTarget').value==='boat');
          const drawWake=(hasBoat||motor)&&!omitWake;
          world.setWakeSourceRequested(shareWake||drawWake||Boolean(physicsEnabled&&model));
          const strips=world.get('waves.sourceStrips');
          const sources=remote.wakeSources(now,shareWake?strips:null,waterStamp());
          if(!omitWake)world.set('peerWake',visitors.wakes(sources));
        }
        if(drone?.hasRotorWake)drone.wakeSources(remote.rotorWakes(drone.position,now,npcTraffic?.droneWakes));
        if(drone?.hasDroneContact)drone.contactTraffic(remote.droneContacts(drone.position,now,npcTraffic?.droneContactRows));
        supplyDroneDecks(now);
        if(mode==='habitat'&&animalId){
          const frame=visitors.frame(animalId);
          if(frame){
            const offset=flyingGull()?0:animalKind()==='whale'?17:9;
            world.set('animalPosition',frame.slice(offset,offset+3));
          }
        }
        if(world.hasSwimmerWater&&(model||motor))world.set('swimmerWater',localSwimmerWater());
        if(world.hasAnimalTraffic){
          world.set('animalTraffic',visitors.contacts());
          if(world.hasAnimalJoints)world.set('animalJoints',visitors.animalJoints);
        }
        else if(world.hasAnimals){
          const rows=visitors.contacts();
          world.set('animals',[...rows.subarray(0,6),...rows.subarray(9,15)]);
        }
        advanceWorld(performance.now());
        const tick=Math.round(world.time*100),waveTick=waterStamp(),fieldTick=Math.floor(tick/25);
        const hullHeight=world.get('waves.height');
        if(hullHeight && hullHeight!==lastHullHeight){
          lastDrift.copy(ocean.U.spectrumDrift.value);
          nextDrift.set(world.get('waves.driftE'),world.get('waves.driftN'));
          if(!lastHullHeight || lastDrift.distanceToSquared(nextDrift)>16)lastDrift.copy(nextDrift);
          ocean.updateHullSpectrum(hullHeight,nextDrift.x,nextDrift.y,world.get('waves.period'),
            model||motor?world.get('bowHeight'):undefined,cat||motor?world.get('bowFoam'):undefined);
          if(!omitWake&&(model||motor)){
            const speed=world.get('bowSpeed')?.[0]??world.get('engine')?.[1]??model?.get('surge');
            ocean.updateHullFoam(world.get('waves.sourceStrips'),waveTick,speed,cat,Boolean(motor),
              world.get('bowSpray'),world.get('bowFrame'),world.get('sternFoamTrail'));
          }
          wavePresentation.sample(waveTick,now);
        }
        lastHullHeight=hullHeight;
        if(lastFieldTick!==fieldTick){
          ocean.updateWind(windField.get('field'));
          windPresentation.sample(fieldTick,now);
          ocean.U.cloudTravel.value.set(windField.get(world.hasWindAnchor?'gustEast':'travelE'),windField.get(world.hasWindAnchor?'gustNorth':'travelN'));
          ocean.U.lightning.value.set(windField.get('strikeBearing'),windField.get('strikeFlash'));
          const thunder=windField.get('thunderArrival');if($('storm').checked&&lastThunder!==undefined&&thunder>lastThunder)audio.thunder();
          lastThunder=thunder;lastFieldTick=fieldTick;
        }
        const surfaceTick=Math.floor(tick/20);
        if(surfaceTick!==lastSurfaceTick){
          const surface={tile:world.get('boatWater.tile'),tide:world.get('boatWater.tide'),wind:world.get('boatWater.wind')};
          ocean.update(previousSurface??surface,surface);seaPresentation.sample(surfaceTick,now);
          previousSurface=surface;lastSurfaceTick=surfaceTick;
        }
        ocean.U.blend.value=seaPresentation.blend(now,running);
        wakeTicks=tick;
      }
      // Keep complete 10 ms solver steps but yield between them for input and rendering.
      const deadline=performance.now()+8;
      if(!world)acc=Math.min(acc,.1);
      if(!world&&drone?.hasRotorWake)drone.wakeSources(remote.rotorWakes(drone.position,now,npcTraffic?.droneWakes));
      if(!world&&drone?.hasDroneContact)drone.contactTraffic(remote.droneContacts(drone.position,now,npcTraffic?.droneContactRows));
      if(!starting&&!world&&running&&drone)supplyDroneDecks(now);
      while(!starting&&running&&!world&&acc>=.01&&performance.now()<deadline){
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
          if($('storm').checked&&lastThunder!==undefined&&strike>lastThunder)audio.thunder();
          lastThunder=strike;
          ocean.U.lightning.value.set(bearing,flash);
          ocean.U.cloudTravel.value.set(travelE,travelN);
          if(drone){drone.wind(droneWind);if(!drone.active&&sub?.frame)drone.station(sub.frame.estimate[0],sub.frame.estimate[1]);}
          model.set('windEast',localEast);model.set('windNorth',localNorth);ocean.updateWind(field);
          windPresentation.sample(wakeTicks,now);
        }
        if(wakeTicks%10===0){
          lastWaveFrame=waterFrame;
          const {height,wake,incident,sections,strips,origin,period,load}=lastWaveFrame;
          waterFrame=null;
          race.set('wakeTile',height);race.set('driftEast',origin[0]);race.set('driftNorth',origin[1]);
          race.set('swellHeight',model.get('swellAmplitude'));
          race.set('mooringWind',windField.getMany(['meanEast','meanNorth']));
          race.set('mooringCurrent',model.getMany(['currentEast','currentNorth']));
          worker.postMessage({...waveInputs(),inspect:physicsEnabled,windEast:windField.get('meanEast'),windNorth:windField.get('meanNorth')});
          const swimmer=localSwimmerWater();
          for(let j=0;j<12;j++)sections[j]+=swimmer[j];
          model.set('useSectionWater',1);model.set('previousWater',lastSections??sections);
          model.set('sectionWater',sections);model.set('waterStamp',model.time);lastSections=sections;
          model.set('waveHeight',incident[0]+swimmer[12]);model.set('wavePitch',-Math.atan(-Math.tan(incident[1])+swimmer[13]));model.set('waveRoll',Math.atan(Math.tan(incident[2])+swimmer[14]));
          model.set('wakeEast',load[0]);model.set('wakeNorth',load[1]);model.set('wakeYaw',load[2]);
          ocean.updateSpectrum(height,...origin,period,omitWake?undefined:wake);
          if(!omitWake&&strips)ocean.updateHullFoam(strips,model.time,model.get('surge'),cat);
          wavePresentation.sample(wakeTicks,now);
        }
        wakeTicks++;
        model.advance(.01);
        if(wakeTicks%5===0){
          race.set('east',model.get('east'));race.set('north',model.get('north'));
          const [fx,fy,mz]=model.get('committeeReaction');
          const landing=drone?.deckReaction??[0,0,0,0,0,0];
          race.set('landingReaction',[landing[0]+fx,landing[1]+fy,landing[2],landing[3],landing[4],landing[5]+mz]);
          race.set('racerState',[1,...model.getMany(['heading','heel','pitch','heave','ve','vn','yawRate','vertical','rollRate','pitchRate'])]);
          race.set('utc',Date.now()/1000);race.advance(.05);
        }
        if(drone && (drone.active||!drone.manual)){drone.deck(race.get('deckState'));drone.sailDeck(model.get('landingDeck'),cat);drone.step(.005);drone.step(.005);}
        const impact=race.get('racerLoad');
        const traffic=visitors.contacts();
        if(contactModel&&traffic.some((v,i)=>i%9===0&&v>0)){
          const [x,y,z,roll,pitch,yaw,ve,vn,turn]=model.getMany(['east','north','heave','heel','pitch','heading','ve','vn','yawRate']);
          contactModel.set('traffic',traffic);contactModel.set('articulation',visitors.animalJoints);contactModel.set('pose',[x,y,z,roll,pitch,yaw]);contactModel.set('velocity',[ve,vn,turn]);
          const load=contactModel.get('wrench');for(let i=0;i<6;i++)impact[i]+=load[i];
        }
        if(drone&&(drone.active||!drone.manual)){const load=drone.sailReaction;model.set('droneLoad',impact.map((v,i)=>v+load[i]));}
        else model.set('droneLoad',impact);
        acc-=.01;
      }
      ocean.U.spectrumBlend.value=wavePresentation.blend(now,running);
      if(world)ocean.U.spectrumDrift.value.lerpVectors(lastDrift,nextDrift,ocean.U.spectrumBlend.value);
      ocean.U.windBlend.value=windPresentation.blend(now,running);
      const t=world?.time??model.time;
      if(model&&t!==meshTime){
        observedBoat=observeBoat(model);
        if(!observedBoat.every(Number.isFinite))throw Error('Non-finite FMI state at '+model.time);
      }
      const s=observedBoat,subFrame=sub?.frame;
      const wind=model?[model.get('windEast'),model.get('windNorth')]:[windField.get('localEast'),windField.get('localNorth')];
      const focus=s??world.get('focus');
      let extra,mastRotation;
      if(s){
        const [ballastX,ballastY,k,direction,amplitude,phase,mainCar,jibCar,ve,vn,yawRate,sag,vang]=model.getMany(
          ['ballastX','ballastY','swellK','swellBearing','swellAmplitude','swellPhase','mainCar','jibCar','ve','vn','yawRate','exposedSheetSag',cat?'downhaulTension':'vangTension']);
        const ballastZ=cat&&model.has('ballastZ')?model.get('ballastZ'):.52;
        const rightingSide=cat&&model.has('rightingSide')?model.get('rightingSide'):0;
        const ballast=cat?[ballastX,ballastY,ballastZ,rightingSide]:null;
        ocean.U.swellCenter.value.set(s[0],s[1]);
        ocean.U.swell.value.set(amplitude,phase,k*Math.cos(direction),k*Math.sin(direction));
        if(cat){
          $('weightPos').value='Actual ballast · '+positionText(Math.round(100*ballastX),'forward','aft')+' · '+
            positionText(Math.round(100*ballastY),'port','starboard')+(rightingSide?' · Righting':'');
          if(!$('setup').hidden){
            if(hasTraveler&&$('hobieTrim').open){
              const tension=Math.round(model.get('travelerTension'));
              const position=positionText(Math.round(mainCar*100),'port','starboard');
              const label=(tension?tension+' N':'Slack')+' · '+position;
              if($('travelerLoad').textContent!==label)$('travelerLoad').textContent=label;
            }
            if(hasJibTackle&&$('hobieTrim').open){
              const [port,starboard]=model.get('jibSheetLoads').map(Math.round);
              const label='Port '+port+' N · Starboard '+starboard+' N';
              if($('jibSheetLoad').textContent!==label)$('jibSheetLoad').textContent=label;
            }
            $('clewTravel').textContent=(100*model.get('mainClewOffset')).toFixed(1)+' cm';
            if(!halyardControl.hidden){
              const [rake,jibLoad,forestay]=model.getMany(['mastRake','jibHalyardTension','forestayTension']);
              $('jibHalyardLoad').textContent=`${Math.round(jibLoad)} N · ${(rake*180/Math.PI).toFixed(1)}° rake · Forestay ${forestay<5?'slack':Math.round(forestay)+' N'}`;
            }
            if(model.has('mainBlockClearance')){
              const clearance=model.get('mainBlockClearance');
              const bend=model.has('mastBend')?' · Mast bow '+(100*model.get('mastBend')).toFixed(1)+' cm':'';
              $('mainSheetStatus').textContent=`Mainsheet ${Math.round(model.get('mainTension'))} N · ${clearance<.002?'Block to block':(100*clearance).toFixed(1)+' cm between blocks'}${bend}`;
            }
          }
        }
        mastRotation=hasMastRotation?model.get('mastRotation'):undefined;
        extra=[cat?ballastX:0,cat?ballastY:0,mainCar,jibCar,ve,vn,yawRate,0];
        if(t!==meshTime){
          const geometry={mastRotation,travelerSag:hasTraveler?model.get('travelerSag'):0,
            jibSheetPins:hasJibTackle?model.get('jibSheetPins'):null,rig:hasRigGeometry?model.getMany(sailingRigFields):null,
            forestay:cat&&model.has('forestayPath')?model.get('forestayPath'):null,
            cloth:hasClothPanels?model.getMany(verticesFields):null};
          boat.update(s,ballast,cat?[mainCar,jibCar]:null,sag,cat?model.get('shroudTail'):null,
            cat?model.get('sailTail'):null,cat?model.get('stayPath'):null,t,geometry);
        }
        $('vangLoad').textContent=vang.toFixed(0)+' N';
        if(!drone?.active&&!sub?.active)$('readout').textContent='Speed '+(Math.hypot(ve,vn)*knotsPerMetrePerSecond).toFixed(1)+' kn';
      }else{
        ocean.U.swellCenter.value.set(0,0);
        ocean.U.swell.value.fromArray(world.get('swell'));
      }
      if(now-lastDial>=100&&(!$('dial').hidden||!covarianceOutput.hidden)){
        lastDial=now;
        if(!$('dial').hidden){
          if(drone?.active)drawDroneCompass($('dial'),drone.instruments(true),courseTarget);
          else if(s||subFrame){
            const flow=sub?.active&&subFrame?subFrame.flow:[model?.get('currentEast')??0,model?.get('currentNorth')??0];
            const apparent=Boolean(s&&!sub?.active&&compassWind.value==='apparent');
            const heading=sub?.active&&subFrame?subFrame.estimate[3]:s?.[2]??0;
            const measuredWind=s&&!apparent&&!sub?.active&&model.has('sailWind')?model.get('sailWind'):wind;
            const speed=apparent?model.get('cupSpeed'):Math.hypot(...measuredWind);
            const bearing=apparent?heading+s[30]+Math.PI:Math.atan2(measuredWind[1],measuredWind[0]);
            let noGoBearing=speed>.01?bearing:null;
            if(apparent){
              // Same wind estimate as the sailing pilot. Convert the measured
              // relative flow to true wind using the navigation velocity.
              const [course,east,north]=model.getMany(['courseEstimate','speedE','speedN']);
              const vaneFrom=course+s[30];
              const windEast=east-speed*Math.cos(vaneFrom),windNorth=north-speed*Math.sin(vaneFrom);
              noGoBearing=Math.hypot(windEast,windNorth)>.25?Math.atan2(windNorth,windEast):null;
            }
            drawCompass($('dial'),speed,bearing,flow,heading,sub?.active?'sub':'surface',noGo,courseTarget,
              extra?Math.hypot(extra[4],extra[5]):0,apparent,noGoBearing);
          }
        }
        if(!covarianceOutput.hidden){
          const {position,velocity,wind}=drone.covariance();
          const triplet=values=>values.map(v=>v.toFixed(3)).join(' / ');
          covarianceOutput.textContent='1σ East / North / Up\nPosition '+triplet(position)+' m\nVelocity '+triplet(velocity)+' m/s\nWind E/N '+wind.toFixed(2)+' m/s per axis';
        }
      }
      const roomTime=remote.seaTime(t,now);
      const vessels=remote.npc.habitat.vessels;
      if(vessels.length!==(npcRows?.length??0)||vessels.some((v,i)=>v.kind!==npcRows[i].kind||v.started!==npcRows[i].started))
        syncNpcVessels(vessels);
      if(npcTraffic){
        if(running||npcRaceUtc===undefined){
          npcRaceUtc=race.get('utc');
          // The itinerary is continuous in UTC, even when Modelica snapshots
          // arrive in batches. Keep scoring on the committed snapshot.
          npcDisplayUtc=Date.now()/1000;
        }
        const nearby=remote.vessels(now).filter(v=>v.hull);
        if(model){
          const [x,y,z,yaw,heel,pitch,ve,vn,yawRate]=model.getMany(['east','north','heave','heading','heel','pitch','ve','vn','yawRate']);
          nearby.push({id:'local',x,y,z,yaw,heel,pitch,ve,vn,yawRate,hull:cat?1:2});
        }else if(motor){
          const [x,y,z,heel,pitch,yaw]=world.get('boatPose'),speed=world.get('engine')[1];
          nearby.push({id:'local',x,y,z,yaw,heel,pitch,ve:speed*Math.cos(yaw),vn:speed*Math.sin(yaw),hull:3});
        }
        npcTraffic.draw(vessels,roomTime,npcRaceUtc,npcDisplayUtc,nearby,drone?.hasVesselDecks);
        if(world&&(model||motor)){
          world.set('npcVessels',npcTraffic.contacts);
          world.set('npcTilt',npcTraffic.tilts);
        }else if(model){
          const [z,roll,pitch]=race.get('launchPose');
          const traffic=new Float64Array(54),tilt=new Float64Array(12);
          traffic.set(npcTraffic.contacts);tilt.set(npcTraffic.tilts);
          const deck=race.get('deckState');
          traffic.set([1,deck[0],deck[1],deck[3],deck[6],deck[7],deck[11],z,3],45);
          tilt.set([roll,-pitch],10);
          model.set('sceneTraffic',traffic);model.set('sceneTilt',tilt);
        }
      }
      let motorState;
      if(motor){
        checkCruiserPower(world,motor);
        const pose=world.get('boatPose'),engine=world.get('engine'),rad=Math.PI/180;
        motor.starterRemaining=Math.max(0,world.get('starterRemaining'));
        const idle=world.get('engineIdleTime'),idleLimit=world.get('engineOffAfter');
        motor.engineRunning=idle!==undefined&&idleLimit!==undefined?
          idle<idleLimit-1e-7&&motor.starterRemaining<1e-6:undefined;
        $('yawDegrees').value=$('lampYaw').value+'°';$('tiltDegrees').value=$('lampTilt').value+'°';
        motor.group.position.fromArray(pose);motor.group.rotation.set(pose[3],pose[4],pose[5],'ZYX');
        motorState=[engine[0],engine[3],Number(!cruiserPowerLost&&$('searchLamp').checked),Number(!cruiserPowerLost&&$('keelLamp').checked),rad*$('lampYaw').value,-rad*$('lampTilt').value,motor.starterRemaining,motor.engineRunning];
        motor.update(t,...motorState.slice(0,2),motorState.slice(2,6),roomTime);
        motor.setWiper(world.get('wiperAngle')??0);
        motor.setHelmSwitch('search',Boolean(motorState[2]));
        motor.setHelmSwitch('underwater',Boolean(motorState[3]));
        motor.setHelmSwitch('wipers',world.hasWiper&&wiperSwitch.checked);
        motor.setHelmSwitch('anchor',anchorLowered);
        const anchor=world.get('anchorState');
        motor.setAnchor(anchor);
        if(anchor)anchorReadout.textContent=anchor[10]<.22?'Anchor stowed':
          `${anchor[11]>.5?'Anchor on seabed':anchorLowered?'Lowering anchor':'Raising anchor'} · ${anchor[10].toFixed(1)} m of rode`;
        if(imagingActive())imagingPing(now,pose,ocean.sampleSurface,visitors.fish,visitors.contacts);
        if(!animalId)$('readout').textContent=motor.starterRemaining>1e-6?'Starting engine…':Math.round(engine[0])+' rpm · '+(knotsPerMetrePerSecond*engine[1]).toFixed(1)+' kn';
      }
      remote.frame(now,s,cat,extra,sub?.mesh,drone?.group,animalId?selectedRole:targetSelect.value,lamp?.visible,drone,motor?.group,motorState,roomTime,mastRotation);
      if(!starting)updateEncounter(now,t,roomTime,running);
      reportFleet(now);
      if(motor)motorDisplay.apply(motor.group,t,now,running);
      const litBoats=[...remote.cruisers],lighting=ocean.U;
      if(backgroundCruiser?.group.visible)litBoats.push(backgroundCruiser);
      if(remoteEncounterCruiser?.group.visible)litBoats.push(remoteEncounterCruiser);
      let litCount=0;
      for(let i=motor?-1:0;i<litBoats.length&&litCount<5;i++){
        const cruiser=i<0?motor:litBoats[i],lamp=cruiser.searchlight,downlights=cruiser.underwaterLamps[0].intensity>0;
        const base=4*litCount++,p=cruiser.group.position;
        lighting.cruiserPose.value.set([p.x,p.y,p.z,cruiser.group.rotation.z],base);
        lighting.cruiserTilt.value.set([cruiser.group.rotation.x,cruiser.group.rotation.y],base/2);
        lighting.cruiserAim.value.set([lamp.swivel.rotation.z,lamp.swivel.rotation.y,Number(lamp.light.intensity>0),Number(downlights)],base);
      }
      lighting.cruiserCount.value=litCount;
      document.body.dataset.visiblePeers=remote.visible;
      // Advance optical phase every display frame. Synchronize gently to the
      // physics clock so a late worker packet cannot snap all the ripples.
      const swell=ocean.U.swell.value,origin=ocean.U.swellCenter.value;
      const phase=swell.y-origin.x*swell.z-origin.y*swell.w;
      const localPos=drone?.active?drone.position:sub?.active?(sub.frame?.position??focus):focus;
      if(rosterRevision!==remote.npc.revision){
        rosterRevision=remote.npc.revision;
        if(!world&&remote.npc.animals.size){
          contactLoad??=loadInstance('HullWildlife',{hullClass:cat?1:2}).then(model=>{contactModel=model;}).catch(console.error);
        }
        const cameraSelect=$('cameraDepth');
        for(const kind of ['whale','shark']){
          const option=cameraSelect.querySelector('[value="'+kind+'"]');
          const hide=!remote.npc.animals.has(kind)&&animalId!==kind&&animalKind()!==kind;
          if(option.hidden!==hide)option.hidden=hide;
          if(option.disabled!==hide)option.disabled=hide;
          if(option.selected&&option.disabled)cameraSelect.value='deck';
        }
        const gulls=remote.npc.habitat.gulls;
        targetSelect.querySelector('[value="gull"]').disabled=Boolean(remote.npc.seat('gull')&&remote.npc.seat('gull')!==remote.npc.self);
        for(const option of [...targetSelect.options]){
          if(option.dataset.spawn&&!remote.npc.animals.has(option.value))option.remove();
          if(option.dataset.gull&&gullIndex(option.value)>=gulls.length)option.remove();
        }
        for(let i=1;i<gulls.length;i++){
          const id='gull-'+(i+1);
          let option=targetSelect.querySelector('[value="'+id+'"]');
          if(!option){option=new Option('Herring gull '+(i+1),id);option.dataset.gull='1';targetSelect.add(option);}
          option.disabled=Boolean(remote.npc.seat(id)&&remote.npc.seat(id)!==remote.npc.self);
        }
        for(const a of remote.npc.animals.values()){
          let option=[...targetSelect.options].find(o=>o.value===a.id);
          if(!option){option=new Option(animalLabel(a),a.id);option.dataset.spawn='1';targetSelect.add(option);}
          option.disabled=!!a.seat&&a.seat!==remote.npc.self;
        }
        if(animalId)touchControls();
      }
      syncGullViews();
      restoreCamera();
      $('spawnAnimal').disabled=!remote.npc.canSpawn($('spawnKind').value);
      $('wildlifeSpawn').hidden=!remote.npc.host;
      if(animalId){
        const a=remote.npc.animals.get(animalId),own=ownsAnimal();
        const seat=remote.npc.seat(animalId);
        if(!seat&&now-lastClaim>=900){remote.npc.select(animalId);lastClaim=now;}
        if(own&&now-lastInput>=(flyingGull()?(remote.npc.host?30:60):100)){
          const stick=animalSticks(axis,animalKind());
          remote.npc.steer(animalId,[stick.yaw,stick.pitch,stick.throttle],stick.roll);lastInput=now;
        }
        const state=visitors.frame(animalId);
        if(flyingGull()){
          const afloat=(state?.[22]??Number(state?.[19]>.45))>0;
          const status=own?(afloat?'Swimming':'Manual flight'):seat?'Piloted by another player':'Waiting for gull';
          const motion=state&&(afloat?Math.abs(state[21]).toFixed(1)+' m/s through water':
            (state[2]-ocean.U.tide.value).toFixed(1)+' m altitude · '+(state[20]??state[4]).toFixed(1)+' m/s airspeed');
          $('readout').textContent=motion?status+' · '+motion:status;
          const gullKeys=$('gullKeys');
          const hint=afloat?(mobile?'Left stick forward to paddle · Left forward + right back to take off':wasd()?
            'W paddle · Q/E turn · Hold W + R to take off · C call':'W paddle · A/D turn · Hold W + ↓ to take off · C call'):
            wasd()?'R pull up · F push down · A/D bank · Q/E turn · W flap · S glide · C call':
              '↓ pull up · ↑ push down · ←/→ bank · A/D turn · W flap · S glide · C call';
          if(gullKeys.textContent!==hint)gullKeys.textContent=hint;
          const left=$('sticks').firstElementChild;
          if(left){
            const label=afloat?'Turn / paddle':'Turn / flap';
            if(left.lastElementChild.textContent!==label){
              left.lastElementChild.textContent=label;left.setAttribute('aria-label',label);
            }
          }
        }
        const breaching=own&&a?.breachAt!=null;
        $('animalBreach').disabled=!own||breaching;
        if(a&&state){
          const w=a.kind==='whale';
          const feedKey=wasd()?' (X)':' (F or X)';
          $('animalFeed').textContent=(w?'Engulf fish':'Bite')+feedKey;
          $('animalFeed').disabled=!own||(a.feedAt!=null&&state[0]-a.feedAt<(w?3.2:1.2));
          $('fishCaught').textContent=(a.caught??0)+' fish caught';
          if(now-lastFishPing>=200){
            fishDisplay(visitors.ping(a),remote.npc.habitat.restock,remote.npc.latest?.frame[0]??0);
            lastFishPing=now;
          }
          let status=own?'Manual swim':a.seat?'Piloted by another player':'Autopilot';
          if(breaching){
            const elapsed=state[0]-a.breachAt;
            status=elapsed<(w?15.8:5)?'Breach · Building speed':elapsed<(w?22:8)?'Breach · Climbing':'Breach · Recovering';
          }
          $('readout').textContent=status+' · '+Math.max(0,state[23]-state[w?19:11]).toFixed(1)+' m deep · '+Math.hypot(state[w?27:65]??0,state[w?28:66]??0).toFixed(1)+' m/s';
        }
      }
      let localHull;
      if(s)localHull={id:'local-hull',local:true,kind:'boat',hull:cat?1:2,x:s[0],y:s[1],z:s[3],yaw:s[2],heel:s[4],pitch:s[5],ve:extra[4],vn:extra[5],yawRate:extra[6]};
      else if(motor){
        const [x,y,z,heel,pitch,yaw]=world.get('boatPose'),speed=world.get('engine')[1];
        if(lastCruiserHull?.time!==t){
          const dt=t-(lastCruiserHull?.time??t),sampled=dt>.001&&dt<.5;
          const angle=yaw-(lastCruiserHull?.yaw??yaw);
          lastCruiserHull={id:'local-hull',local:true,kind:'motorboat',hull:3,time:t,x,y,z,heel,pitch,yaw,
            ve:sampled?(x-lastCruiserHull.x)/dt:speed*Math.cos(yaw),vn:sampled?(y-lastCruiserHull.y)/dt:speed*Math.sin(yaw),
            yawRate:sampled?Math.atan2(Math.sin(angle),Math.cos(angle))/dt:0};
        }
        localHull=lastCruiserHull;
      }
      visitors.update(t,now,wind,ocean.U.tide.value,{id:'local',player:true,local:true,kind:targetSelect.value,
        x:localPos[0],y:localPos[1],z:targetSelect.value==='boat'?localPos[3]:localPos[2],
        ve:targetSelect.value==='boat'?extra[4]:0,vn:targetSelect.value==='boat'?extra[5]:0},
        model?[model.get('currentEast'),model.get('currentNorth')]:[.2,.04],localHull);
      visitors.surfaceWakes(ocean.swimmerWater,now);
      if(mapDialog.open&&now-lastChart>=120){
        lastChart=now;
        const controlled=animalId&&visitors.cameraSubject(animalId)?.position;
        localChart.draw(controlled?.x??localPos[0],controlled?.y??localPos[1]);
      }
      const opticalRateLimit=playbackRate+.5;
      if(t!==meshTime){
        if(meshTime!==undefined && t>meshTime && now>observedWall){
          const elapsed=(now-observedWall)/1000;
          const gain=1-Math.exp(-elapsed/.35);
          simulationRate+=gain*(Math.min(opticalRateLimit,(t-meshTime)/elapsed)-simulationRate);
          swellRate=(phase-previousSwellPhase)/(t-meshTime);
        }
        observedWall=now;previousSwellPhase=phase;
        life(t);seabedTime.value=t;meshTime=t;
      }
      if(opticalTime===undefined||starting||!running||Math.abs(t-opticalTime)>.4)opticalTime=t;
      else opticalTime=Math.min(t+.05,opticalTime+frameSeconds*Math.max(0,Math.min(opticalRateLimit,simulationRate+4*(t-opticalTime))));
      island.userData.updatePalms(opticalTime,ocean.sampleWind);
      ocean.U.tm.value=opticalTime;ocean.drawSpray(opticalTime);
      swell.y+=Math.max(-.08,Math.min(.08,opticalTime-t))*Math.max(-3,Math.min(3,swellRate));
      let hullBlend=1;
      if(s){
        if(world)hullBlend=hullDisplay.apply(boat.group,t,now,running);
        ocean.U.boat.value.set(boat.group.position.x,boat.group.position.y,boat.group.rotation.z,s[10]);
        boat.group.localToWorld(orbitCenter.copy(helmSeat));
      }else{
        if(motor){orbitCenter.copy(motor.group.position);orbitCenter.z+=.85;}
        else orbitCenter.fromArray(focus);
        ocean.U.boat.value.set(orbitCenter.x,orbitCenter.y,motor?motor.group.rotation.z:0,0);
      }
      const viewMode=$('cameraDepth').value;
      const {angle,distance,tilt}=orbitFor(viewMode);
      const skipperView=viewMode==='ballast'&&boat?.ballastPosition;
      const baseFov=skipperView?60:viewMode==='motorCabin'?75:viewMode==='motorHelm'?62:(viewMode==='onboard'||Object.hasOwn(cruiserUnderwaterViews,viewMode))?64:52;
      const lens=fixedView(viewMode)?cameraZoom.get(viewMode)??1:1;
      const fov=lens===1?baseFov:T.MathUtils.radToDeg(2*Math.atan(lens*Math.tan(T.MathUtils.degToRad(baseFov/2))));
      if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();lastReflection=-Infinity;}
      camera.up.set(0,0,1);
      if(skipperView){
        const orientation=boat.group.quaternion;
        const horizontalLook=Math.cos(skipper.pitch);
        camera.position.copy(boat.ballastPosition);
        camera.position.z+=.72;
        boat.group.localToWorld(camera.position);
        fpvForward.set(horizontalLook*Math.cos(skipper.yaw),horizontalLook*Math.sin(skipper.yaw),Math.sin(skipper.pitch));
        camera.lookAt(fpvForward.applyQuaternion(orientation).add(camera.position));
      }else{
        const inspectionOrbit=physicsEnabled&&boat&&!animalId&&!sub?.active&&!drone?.active&&viewMode==='deck';
        if(inspectionOrbit)orbitCenter.z+=cat?2.2:.7;
        const orbitDistance=inspectionOrbit?distance*1.22:distance;
        const horizontal=orbitDistance*Math.cos(tilt);
        camera.position.set(horizontal*Math.cos(angle),horizontal*Math.sin(angle),orbitDistance*Math.sin(tilt)).add(orbitCenter);
        if(viewMode==='line')camera.position.z=ocean.sampleSurface(camera.position.x,camera.position.y,true);
        camera.position.z=Math.max(-13.1,camera.position.z);
        camera.lookAt(orbitCenter);
      }
      const flightHud=$('flightHud');
      const droneFpv=drone?.active && $('cameraDepth').value==='fpv';
      const video=$('fpvVideo');
      if(droneFpv && !video.style.getPropertyValue('--fpv-grain')){
        const grain=document.createElement('canvas');grain.width=grain.height=96;
        const ctx=grain.getContext('2d'),noise=ctx.createImageData(96,96);
        for(let i=0;i<noise.data.length;i+=4){
          noise.data[i]=noise.data[i+1]=noise.data[i+2]=Math.random()*255;
          noise.data[i+3]=255;
        }
        ctx.putImageData(noise,0,0);
        video.style.setProperty('--fpv-grain','url('+grain.toDataURL()+')');
      }
      if(video.hidden===Boolean(droneFpv))video.hidden=!droneFpv;
      const subFpv=sub?.active && $('cameraDepth').value==='onboard' && sub.frame?.estimate;
      flightHud.hidden=Boolean(animalId)||!(droneFpv||subFpv);
      if(droneFpv)drawInstruments(drone.instruments(),camera.fov,renderer.domElement.clientHeight,courseTarget);
      if(subFpv){
        const e=sub.frame.estimate;
        drawInstruments({sub:true,roll:e[6],pitch:e[7],yaw:e[3],speed:Math.hypot(e[4],e[5]),level:-e[2]},camera.fov,renderer.domElement.clientHeight);
      }
      if(drone){
        drone.draw();
        if(world)flightDisplay.apply(drone.group,t,now,running);
        if(drone.active){
          const {position}=drone.group;
          if($('cameraDepth').value==='fpv'){
            placeDroneCamera(camera);
          }else{
            camera.position.set(distance*.6*Math.cos(angle),distance*.6*Math.sin(angle),distance*.6*Math.sin(tilt)).add(position);
            camera.lookAt(position);
          }
        }
      }
      const showSensorImage=!animalId&&sub?.active && $('subSensors').open;
      const showDvl=!animalId&&sub?.active&&$('showDvlRays').checked&&$('cameraDepth').value==='deck';
      if(running)sub?.update(t,axis,ocean.U.wind.value,ocean.U.bearing.value,showSensorImage,showDvl);
      sub?.drawDvl(showDvl,now);
      if(sub?.active){
        const p=sub.mesh.position;
        if($('cameraDepth').value==='onboard'){
          placeSensor(camera);sub.mapGroup.visible=false;
        }else{
          camera.position.set(p.x+.6*distance*Math.cos(angle),p.y+.6*distance*Math.sin(angle),p.z+.6*distance*Math.sin(tilt));camera.lookAt(p);
        }

      }
      if(motor&&cruiserViews[$('cameraDepth').value])placeCruiserCamera(camera,$('cameraDepth').value);
      const view=$('cameraDepth').value;
      const npcSubject=npcTraffic?.subject(view);
      const subject=npcSubject??visitors.cameraSubject(!flyingGull()&&animalId&&view===animalKind()?animalId:view);
      const gullSubject=gullIndex(view)>=0?subject:null;
      if(gullSubject){
        const {x,y,z}=gullSubject.position;
        if(followedGull!==gullSubject||!running)gullCameraTarget.set(x,y,z);
        else {
          const steady=gullCameraTarget.z+(z-gullCameraTarget.z)*(1-Math.exp(-frameSeconds/.16));
          gullCameraTarget.set(x,y,T.MathUtils.clamp(steady,z-.26,z+.26));
        }
      }
      followedGull=gullSubject;
      if(subject){
        const target=gullSubject?gullCameraTarget:subject.position;
        const subjectTilt=npcSubject?Math.max(.16,tilt):tilt;
        const subjectDistance=npcSubject?npcSubject.userData.orbitDistance*(cameraZoom.get(view)??1):distance;
        const range=subjectDistance*Math.cos(subjectTilt);
        camera.position.copy(target);
        camera.position.x+=range*Math.cos(angle);
        camera.position.y+=range*Math.sin(angle);
        camera.position.z=Math.max(-13.1,target.z+subjectDistance*Math.sin(subjectTilt));
        camera.up.set(0,0,1);
        camera.lookAt(target);
      }
      const panPivot=subject?.position??(drone?.active?drone.group.position:sub?.active?sub.mesh.position:orbitCenter);
      panDistance=fixedView(view)?3.5:Math.max(2,camera.position.distanceTo(panPivot));
      const panOffset=cameraPan.get(orbitKey(view));
      if(panOffset)camera.position.add(panOffset);
      drawForces(!drone?.active&&$('showForces').getAttribute('aria-pressed')==='true',s,subFrame,!!sub?.active,t,hullBlend,hullDisplay.previous);
      const waterCenter=subject?.position??boat?.group.position??motor?.group.position;
      ocean.dome.position.copy(camera.position);ocean.water.position.set(waterCenter?.x??focus[0],waterCenter?.y??focus[1],0);updateLight(t,roomTime);
      // Only the 34 cm dome port can straddle the interface. The extra margin
      // covers neighbouring wave slopes and the local vessel's pressure wave.
      const eyeX=camera.position.x,eyeY=camera.position.y;
      const hullDistance=Math.hypot(eyeX-ocean.U.boat.value.x,eyeY-ocean.U.boat.value.y);
      const nearHull=hullDistance<5;
      const surfaceBand=nearHull?.92:.60;
      const eyeHeight=camera.position.z-ocean.sampleSurface(eyeX,eyeY,true);
      if(eyeHeight>=-surfaceBand)ocean.updateWhitecaps(renderer,now,eyeX,eyeY,
        model?.get('currentEast')??.2,model?.get('currentNorth')??.04);
      caustics.update(opticalTime,!omitWake);
      const storm=$('storm').checked;
      const cloudFog=clouds(ocean.U.cloudTravel.value,camera.position,storm,ocean.U);
      rain.visible=false; // Optical reflection and refraction targets exclude foreground streaks.
      // The underwater shader computes the view through the surface from the sky.
      // Its opaque submerged pass never samples the planar capture targets.
      // The transmitted hull must match the pose and camera of this frame.
      // The separate reflection can reuse its own projection between updates.
      if(!profile.skipCaptures&&eyeHeight>=-surfaceBand){
        const reflectionInterval=adaptive?1000/15:profile.captureInterval;
        const refreshReflection=now-lastReflection>=reflectionInterval-.5 ||
          camera.position.distanceToSquared(reflectionEye)>.04 ||
          Math.abs(camera.quaternion.dot(reflectionOrientation))<.9998;
        ocean.capture(renderer,camera,submergedScenery,refreshReflection);
        if(refreshReflection){
          lastReflection=now;
          reflectionEye.copy(camera.position);reflectionOrientation.copy(camera.quaternion);
        }
      }else lastReflection=-Infinity;
      rain.visible=storm && eyeHeight>=-surfaceBand;
      if(rain.visible)rain.material.uniforms.rainWind.value.set(...wind);
      const radioCruiser=motor??backgroundCruiser;
      if(radio&&!radio.paused&&radioCruiser?.group.visible)placeRadio(radioCruiser.cabinObjects.get('radio'),camera);
      const engineBoats=npcTraffic?.cruisers.length?[...litBoats,...npcTraffic.cruisers]:litBoats;
      audio.motorSound(motor,engineBoats,camera,eyeHeight<0,running,shaftCommand,playbackRate);
      audio.droneSound(drone,remote.drones,camera,eyeHeight<0,running);
      if(audio.enabled){
        const singer=eyeHeight<0&&running&&audio.audible?visitors.nearestHumpback(camera.position,70):undefined;
        if(singer){
          whaleDirection.subVectors(singer,camera.position);
          const range=whaleDirection.length();
          const pan=range>0?Math.max(-1,Math.min(1,whaleDirection.dot(listenerRight.set(1,0,0).applyQuaternion(camera.quaternion))/range)):0;
          audio.whaleSong(range,pan,-eyeHeight,running);
        }else audio.whaleSong(Infinity,0,0,false);
      }
      if(audio.audible){
        const sailLuff=running&&cat&&s&&targetSelect.value==='boat'?model.get('sailLuff'):null;
        audio.update(model?.get('cupSpeed')??Math.hypot(...wind),storm,camera.position.z-ocean.U.tide.value,
          sailLuff,s,t,playbackRate);
        const ownHull=!subject&&!animalId&&!sub?.active&&!drone?.active;
        const waterSpeed=ownHull?(motor?world.get('engine')[1]:s?.[10]):undefined;
        audio.water(running&&!document.hidden?ocean.sampleSurface:null,opticalTime,eyeX,eyeY,
          ocean.U.tide.value,eyeHeight,!omitWake,waterSpeed,hullDistance);
      }
      const floodedCabin=motor&&view==='motorCabin'&&!animalId&&
        motor.group.worldToLocal(cabinEye.copy(camera.position)).z<motor.cabinWaterLevel;
      const waterFog=floodedCabin?cabinWaterFog:underwaterFog;
      upscaling.begin();
      const pictureSize=upscaling.size;
      if(Math.abs(eyeHeight)<=surfaceBand){split(renderer,scene,camera,ocean,waterFog,renderBelow,pictureSize);}
      else{
        const submerged=eyeHeight<0;
        scene.fog=submerged?waterFog:cloudFog;scene.background=submerged?waterFog.color:null;
        ocean.U.under.value=Number(submerged);ocean.dome.visible=!submerged;
        if(submerged)renderBelow(scene,camera,false,pictureSize);else renderer.render(scene,camera);
      }
      if(coneToggle.checked)drawCameraCones(view);
      if(collisionToggle.checked)drawCollisions();
      if(inertiaToggle.checked)drawInertia();
      upscaling.present();
      if(physicsEnabled){
        const inspected=subject??(sub?.active?sub.mesh:drone?.active?drone.group:
          animalId?visitors.cameraSubject(animalId):motor?.group??boat?.group);
        const swimmer=inspected?.userData.swimmer;
        const sailing=inspected&&inspected===boat?.group;
        const kind=sailing?'boat':inspected===sub?.mesh?'sub':inspected===drone?.group?'drone':
          inspected===motor?.group?'motorboat':swimmer?.kind??animalKind()??view.split('-')[0];
        const showHulls=$('physicsHulls').checked;
        const showRig=$('physicsRig').checked,rig=sailing?boat.inspection:null;
        if(rig&&showRig&&cat&&!hasClothPanels&&!rig.battens&&battenInspectionFields.every(name=>model.has(name))){
          const data=model.getMany(battenInspectionFields);
          rig.battens=[data.slice(0,4),data.slice(4,8)];
        }
        if(sailing&&(showHulls||cat&&waveGrids.checked)&&(!inspectionHull||inspectionTime!==t)){
          if(hullInspectionFields.every(name=>model.has(name))){
            const [stations,fractions,separation,volume,heights]=model.getMany(hullInspectionFields);
            const [fineStations,fineVolume]=cat&&refinedHullInspectionFields.every(name=>model.has(name))?
              model.getMany(refinedHullInspectionFields):[];
            inspectionHull={stations:fineStations??stations,fractions,separation,volume:fineVolume??volume,heights};
            inspectionTime=t;
          }
        }
        if(inspected){
          const body={group:inspected,kind,rig,thrust:kind==='sub'?subFrame?.thrust:null,
            strips:showHulls&&kind==='motorboat'&&motor?cruiserInspectionFields.map(name=>world.get(name)):null};
          if(airflowToggle.checked&&(sailing||kind==='drone'&&inspected===drone?.group)){
            if(!airflowLoad)airflowLoad=loadInstance('AirflowProbe',{}).then(instance=>{airflowModel=instance;})
              .catch(error=>{airflowFailure=error;console.warn('Airflow probes',error);});
            if(airflowModel){
              const rotor=kind==='drone';
              const heightOffset=rotor?0:cat?2.6:1.1;
              if(!airflowFrame||airflowFrame.rotor!==rotor||now-airflowAt>=airflowInterval){
                previousAirflow=airflowFrame?.rotor===rotor?airflowFrame:null;
                if(rotor&&drone.wakeGeometry){
                  const position=drone.position;
                  const ambient=world?.get('wind.droneWind')??windField.get('droneWind');
                  airflowFrame=sampleAirflow(airflowModel,position,ambient,{rotors:{...drone.wakeGeometry,
                    traffic:remote.rotorWakes(position,now,npcTraffic?.droneWakes),source:drone.wakeSource()}});
                }else if(sailing){
                  const [east,north,yaw,heave]=s;
                  airflowFrame=sampleAirflow(airflowModel,[east,north,heave+heightOffset],[...wind,0],{
                    sailPeers:peerCollisionSamples,sailNpcs:npcTraffic?.contacts,catamaran:cat,
                    sailSource:[1,east,north,yaw,extra[4],extra[5],extra[6],heave,Number(cat)]
                  });
                }
                airflowAt=now;
              }
              if(airflowFrame?.rotor===rotor){
                const {x,y,z}=inspected.position;
                body.airflow={...airflowFrame,previous:previousAirflow,blend:Math.min(1,(now-airflowAt)/airflowInterval),
                  anchor:[x,y,z+heightOffset]};
              }
              else body.airflowMessage='Airflow samples unavailable for this vehicle';
            }else body.airflowMessage=airflowFailure?'Airflow samples unavailable':'Loading airflow samples';
          }
          const probes=cat&&sailing?world?.get('hydroSurfaceProbes'):null;
          if(probes?.length){
            const stamp=world.get('sectionStamp');
            const points=stamp===undefined?probes:pontoonTrace(probes,stamp,now,running);
            body.probes={points,sections:points.length/6};
          }
          if(waveGrids.checked){
            const water=body.water={tide:previousSurface?.tide??ocean.U.tide.value,
              surfaceAt:(east,north)=>ocean.sampleSurface(east,north,true)};
            if(body.probes)water.pontoons=body.probes;
            if(swimmer){
              water.swimmerKind=swimmer.kind;
              water.swimmer=ocean.swimmerWater.inspection(swimmer.kind,swimmer.id);
            }
            if(previousSurface?.tile)water.wind={values:previousSurface.tile,length:64};
            if(world&&lastHullHeight){
              const drift=ocean.U.spectrumDrift.value;
              water.wake={values:lastHullHeight,length:world.get('waves.period'),east:drift.x,north:drift.y};
              const localHull=sailing||inspected===motor?.group;
              const showBowGrid=waveLayer.value==='near'||waveLayer.value==='all';
              if(localHull&&showBowGrid&&ocean.U.bowAvailable.value){
                hullGridSamples??=new Float32Array(32*32);
                ocean.readBowGrid(hullGridSamples);
                const {x:east,y:north,z:heading}=ocean.U.boat.value;
                const cos=Math.cos(heading),sin=Math.sin(heading);
                water.near={values:hullGridSamples,east,north,cos,sin,length:8,local:true,
                  height:ocean.sampleSurface(east,north),sources:world.get('bowSources')};
              }
            }else if(!world&&lastWaveFrame){
              const {height,wake,origin:[east,north],period:length}=lastWaveFrame;
              water.wind={values:height,subtract:wake,east,north,length,advected:true};
              if(wake&&!omitWake)water.wake={values:wake,east,north,length};
            }
          }
          if(!body.probes&&showHulls&&sailing&&inspectionHull?.heights){
            const strips=world?.get('waves.sourceStrips')??lastWaveFrame?.strips;
            if(strips)body.probes={strips,heights:inspectionHull.heights,count:inspectionHull.separation>0?12:6};
          }
          if(body.strips?.[0]){
            body.stripWater=world.get('panelSea');
            body.stripPose=world.get('cruiserStripPose');
          }
          inspector.draw(camera,body,{hulls:showHulls,rig:showRig,water:waveGrids.checked,waveLayer:waveLayer.value},sailing?inspectionHull:null);
        }else{
          physicsCanvas.getContext('2d').clearRect(0,0,physicsCanvas.width,physicsCanvas.height);
          $('physicsStatus').textContent='';
        }
      }
      if(!mastPanel.hidden&&now-lastMastPreview>=250){
        fromMast(rig=>rig.preview(Number($('mastPort').value),$('mastImage')));
        lastMastPreview=now;
      }
      drawCruiserFeeds(now);
      if(showSensorImage)drawSensors(now,$('cameraDepth').value==='onboard');
      if(world){
        if(boat)hullDisplay.restore(boat.group);
        if(drone)flightDisplay.restore(drone.group);
        if(motor)motorDisplay.restore(motor.group);
      }
      if(!starting)updateRunStats(now,t);
      if(frameTest)measureFrame(now,t);
      document.body.dataset.eyeDepth=camera.position.z.toFixed(2);
      if(drone?.active){
        const [e,n,z]=drone.position;
        const telemetry=['E '+e.toFixed(1)+' m','N '+n.toFixed(1)+' m','Altitude '+z.toFixed(2)+' m','Drag '+Math.hypot(...drone.drag).toFixed(2)+' N'];
        if(drone.manual&&flightControl.value!=='0')telemetry.push('Throttle '+Math.round(100*drone.throttle)+'%');
        const wash=physicsEnabled?drone.wakeLoad():null;
        if(wash){
          const [wind,wrench]=wash;
          telemetry.push('Rotor wake '+Math.hypot(...wind).toFixed(1)+' m/s','Thrust loss '+Math.hypot(...wrench.slice(0,3)).toFixed(1)+' N');
        }
        $('readout').textContent=telemetry.join(' · ');
      }
      if(sub?.active){
        const f=sub.frame;
        if(sub.error || !f?.estimate){
          $('readout').textContent=sub.error||'Starting underwater navigation…';
        }else{
          const estimate=f.estimate;
          const readout=[
            f.time.toFixed(2)+' s',
            'Est. depth '+(-estimate[2]).toFixed(2)+' m',
            estimate[15]+' features',
            estimate[16]+' matches',
            estimate[12]+' keyframe'+(estimate[12]===1?'':'s')
          ];
          const closures=estimate[13];
          if(closures)readout.push(closures+' loop closure'+(closures===1?'':'s'));
          if(f.surveyDone)readout.push('Survey complete');
          else if(f.waypoint)readout.push('Waypoint '+f.waypoint+'/'+f.waypointCount);
          $('readout').textContent=readout.join(' · ');
        }
      }
      document.body.dataset.runtime=mode??'fleet';document.body.dataset.simTime=t;document.body.dataset.east=focus[0];
      if(starting)finishStartup();
      requestAnimationFrame(draw);
    }catch(error){clearInterval(physicsTimer);showStartupError(error);}
  }
  if(world){
    // A slow GPU can leave the solver idle for several batches between frames.
    physicsTimer=setInterval(()=>{
      const now=performance.now();
      if(!starting&&running&&!document.hidden&&now-physicsWall>=25){
        try{advanceWorld(now);}catch{clearInterval(physicsTimer);} // draw reports worker faults
      }
    },25);
    cleanup(()=>clearInterval(physicsTimer));
  }
  requestAnimationFrame(draw);
}
function showStartupError(error){
  $('readout').textContent=error.message;
  if(!$('startupScreen').hidden){
    $('startupTitle').textContent='Unable to start simulator';
    $('startupStatus').textContent=error.message;
    $('startupProgress').hidden=true;
    const retry=$('startupRetry');
    retry.hidden=false;
    retry.onclick=()=>location.reload();
    retry.focus();
  }
  console.error(error);
}
run().catch(showStartupError);
