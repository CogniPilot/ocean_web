import {sailingStart,windBearing,windSpeed} from './sailing-start.mjs';
import {wreckCaustics} from './caustics.mjs';
import {loadVehicleShells} from './vehicle-assets.mjs';
import {loadInstance} from './fmi3/instance.mjs?api=2';
import {sailboatMesh,observeBoat} from './board/boat.mjs';
import {splitCamera} from "./waterline.mjs";
import {drawCompass} from './compass.mjs';
import {forceDisplay} from './instrumentation.mjs';
import {submarine} from './submarine.mjs';
import {surveyDrone} from "./drone.mjs";
import {mastCamera} from "./mast-camera.mjs";
import {courseScene,raceAudio,firstLeg,trueBearing} from "./regatta.mjs";
import {fleet} from "./fleet.mjs";
const T=window.THREE,$=id=>document.getElementById(id);
async function run(){
  const url=new URL(location.href);
  const requestedHull=url.searchParams.get('boat');
  const runtime=url.searchParams.get('runtime')??document.body.dataset.defaultRuntime;
  const integrated=runtime==='world'&&requestedHull!=='Sailboat';
  const world=integrated?await (await import('./world-view.mjs')).openWorld():null;
  const cat=integrated||requestedHull==='Hobie16';
  const vessel=cat?'Hobie16':'Sailboat';
  $('vessel').value=vessel;
  $('vessel').onchange=()=>{url.searchParams.set('boat',$('vessel').value);if($('vessel').value!=='Hobie16')url.searchParams.delete('runtime');location.assign(url);};
  document.querySelector('h1').textContent=cat?'Hobie 16':'Sailboat';
  $('trampoline').hidden=!cat;$('vangControl').hidden=false;
  $('luffControlName').textContent=cat?'Downhaul':'Vang';
  // Start at the default loaded waterline for each hull.
  const inputs={...sailingStart(cat),launchHeight:cat ? .20 : .069,windEast:windSpeed*Math.cos(windBearing),windNorth:windSpeed*Math.sin(windBearing),currentEast:.2,currentNorth:.04,waveHeight:0,waveRoll:0,wavePitch:0,[cat?'downhaulInput':'vangInput']:.5,manualHelm:1,rudderInput:0,trimInput:0};
  const [model]=await Promise.all([world?.boat??loadInstance(vessel,inputs),loadVehicleShells()]);
  const worker=world?null:new Worker(new URL('./wave-worker.mjs',import.meta.url),{type:'module'});
  let waterFrame,waterError;
  if(worker){
    worker.onmessage=({data})=>{if(data.error)waterError=Error(data.error);else waterFrame=data;};
    worker.onerror=event=>{waterError=Error(event.message);};
    addEventListener('pagehide',()=>worker.terminate(),{once:true});
  }
  function waveInputs(){
    const [east,north,heading,heel,pitch,volume]=model.getMany(['east','north','heading','heel','pitch','sectionVolume']);
    return {seaAmplitude:Number($('seaState').value),east,north,heading,heel,pitch,volume};
  }
  worker?.postMessage({init:{...waveInputs(),currentEast:inputs.currentEast,currentNorth:inputs.currentNorth,
    beamHalf:model.get('beamHalf'),stations:model.get('stationX'),separation:model.get('halfSpacing'),
    windEast:inputs.windEast,windNorth:inputs.windNorth}});
  let wakeTicks=0,lastSections;
  const mobile=matchMedia('(pointer: coarse)').matches;
  function settings(open){$('setup').hidden=!open;$('settings').setAttribute('aria-expanded',String(open));}
  settings(!mobile);$('settings').onclick=()=>settings($('setup').hidden);
  const renderer=new T.WebGLRenderer({canvas:$('view'),antialias:!mobile});
  renderer.setPixelRatio(Math.min(mobile ? .8 : 1,devicePixelRatio));renderer.toneMapping=T.ACESFilmicToneMapping;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(52,1,.045,550);camera.up.set(0,0,1);
  const boat=sailboatMesh(T,cat,model.get("foilX")[0]);scene.add(boat.group);coast(T,scene);
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
  const remote=fleet(T,scene,roomName,$('online'));camera.layers.enable(1);
  function multiplayer(on){
    if(on)remote.join();else remote.leave();
    $('multiplayer').setAttribute('aria-pressed',String(on));$('invite').hidden=!on;
  }
  $('multiplayer').onclick=()=>multiplayer($('multiplayer').getAttribute('aria-pressed')!=='true');
  if(url.searchParams.has('room'))multiplayer(true);
  addEventListener('pagehide',remote.leave);
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
  if(mobile)ocean.setCaptureScale(.5);
  ocean.update(sea,sea);ocean.U.under.value=0;ocean.U.sunDir.value.copy(sun.position).normalize();
  ocean.U.moonDir.value.set(-.8,-.4,-.5);ocean.U.bearing.value=Math.atan2(inputs.windNorth,inputs.windEast);
  const rain=stormRain(T,scene,ocean,mobile);
  const caustics=wreckCaustics(T,renderer,ocean,mobile);
  const materials=seabedMaterials(T,caustics.uniforms);const bottom=new T.Mesh(new T.PlaneGeometry(500,500),materials.sand);bottom.position.z=-13.71;scene.add(bottom);
  const wreckVisual=batchScenery(T,makeWreck(T,materials));scene.add(wreckVisual);caustics.setWreck(wreckVisual);const life=marineLife(T,scene);
  const underwaterFog=new T.FogExp2(0x124759,.075),split=splitCamera(T);
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
  $('seaState').onchange=()=>world?world.set('seaState',Number($('seaState').value)):model.set('swellAmplitude',.30*Number($('seaState').value));
  const keys=new Set();let drone;
  const sub=submarine(T,scene,world), sensorCanvas=$('sensorCam').getContext('2d');
  const drawForces=forceDisplay(T,scene,sub.mesh,boat.group,cat,model);
  $('sonarMap').onchange=()=>{sub.mapVisible=$('sonarMap').checked;};
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
  const manualSelected=()=>sub.active?sub.manual:drone?.active?drone.manual:manual;
  function touchControls(){
    analog.clear();
    const pad=$('sticks'),boatActive=!sub.active&&!drone?.active;
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
  surveyDrone(T,scene,world).then(vehicle=>{
    drone=vehicle;$('controlTarget').disabled=false;
    $('cutMotors').onclick=()=>{const cut=$('cutMotors').getAttribute('aria-pressed')!=='true';drone.cut(cut);$('cutMotors').setAttribute('aria-pressed',String(cut));$('cutMotors').textContent=cut?'Restore motors':'Cut motors';};
    $('controlTarget').onchange=()=>{
      if($('controlTarget').value==='sub'){angle=Math.PI-.48;tilt=.32;}
      keys.clear();$('view').focus({preventScroll:true});sub.active=$('controlTarget').value==='sub';$('onboardOption').hidden=!sub.active;if(!sub.active&&$('cameraDepth').value==='onboard')$('cameraDepth').value='deck';$('subPanel').hidden=!sub.active;drone.select($('controlTarget').value==='drone');helm();touchControls();
      $('cutMotors').hidden=!drone.active;$('flightKeys').hidden=!drone.active;document.querySelector('h1').textContent=sub.active?'Survey submarine':drone.active?'RDD2 survey drone':(cat?'Hobie 16':'Sailboat');
    };
    const wreckSurvey=url.searchParams.get('demo')==='wreck';
    const target=wreckSurvey?'sub':url.searchParams.get('control');
    if(wreckSurvey){
      sub.manual=false;
      drone.manual=false;
      $('sonarMap').checked=true;
      sub.mapVisible=true;
    }
    if(target==='drone'||target==='sub'){
      $('controlTarget').value=target;
      $('controlTarget').onchange();
    }
  }).catch(e=>{$('controlTarget').title=e.message;});

  function helm(){drone?.input(axis);if(drone?.active||sub.active){model.set('rudderInput',0);model.set('trimInput',0);return;}model.set('rudderInput',axis('KeyA','KeyD'));model.set('trimInput',axis('KeyW','KeyS'));}
  addEventListener('keydown',e=>{if(manualSelected()&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){keys.add(e.code);helm();}});
  addEventListener('keyup',e=>{keys.delete(e.code);helm();});addEventListener('blur',()=>{keys.clear();analog.clear();helm();});
  $('helm').onclick=()=>{
    if(sub.active)sub.manual=!sub.manual;
    else if(drone?.active)drone.manual=!drone.manual;
    else{manual=!manual;model.set('manualHelm',Number(manual));}
    keys.clear();touchControls();
  };
  touchControls();
  $('vang').oninput=()=>model.set(cat?'downhaulInput':'vangInput',Number($('vang').value)/100);
  $('play').onclick=()=>{running=!running;if(!running)world?.clearQueued();$('play').textContent=running?'Pause':'Resume';};
  $('wind').oninput=()=>{const w=+$('wind').value;if(world){world.set('windSpeed',w);world.set('windBearing',ocean.U.bearing.value);}else{windField.set('meanEast',w*Math.cos(ocean.U.bearing.value));windField.set('meanNorth',w*Math.sin(ocean.U.bearing.value));}ocean.U.wind.value=w;$('windOut').textContent=w+' m/s';};
  function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  resize();addEventListener('resize',resize);
  $('luff').onclick=()=>{
    // Swing the wind onto the current bow. The wind stays at that bearing as the boat turns.
    ocean.U.bearing.value=model.get('heading')+Math.PI;
    $('wind').oninput();
    if(!manual)$('helm').click();
    keys.clear();helm();
    // Haul the boom amidships to feather the rig in the headwind.
    model.set('trimInput',-1);
  };
  const capturePosition=new T.Vector3(),captureRotation=new T.Quaternion();
  let captureTime=-Infinity,captureSky,captureSea,captureAspect;
  let prev=performance.now(),acc=0,lastCapture=-Infinity;
  let frameCost=1000/30,lastQualityCheck=0,pixelScale=mobile?.8:1;
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
      if(mobile&&now-lastQualityCheck>1500){
        const next=Math.max(.5,Math.min(1,pixelScale+(frameCost>39?-.1:frameCost<23?.05:0)));
        if(Math.abs(next-pixelScale)>.01){pixelScale=next;renderer.setPixelRatio(pixelScale);resize();}
        lastQualityCheck=now;
      }
      if(running)acc+=Math.max(0,Math.min(.22,(now-prev)/1000));prev=now;
      if(waterError)throw waterError;
      if(world){
        const steps=Math.min(5,Math.floor(acc/.01));acc=Math.min(.1,acc);
        if(running)acc=Math.max(0,acc-world.advance(steps)*.01);
        const tick=Math.round(world.time*100),waveTick=model.get('waterStamp'),fieldTick=Math.floor(tick/25);
        if(lastWorldTick!==waveTick){
          ocean.updateSpectrum(world.get('waves.height'),world.get('waves.driftE'),world.get('waves.driftN'),world.get('waves.period'));
          lastWorldTick=waveTick;
        }
        if(lastFieldTick!==fieldTick){
          ocean.updateWind(windField.get('field'));
          ocean.U.cloudTravel.value.set(windField.get('travelE'),windField.get('travelN'));
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
      while(!world&&acc>=.01){
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
          if(drone){drone.wind(droneWind);if(sub.frame)drone.station(sub.frame.estimate[0],sub.frame.estimate[1]);}
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
        if(drone){drone.step(.005);drone.step(.005);}acc-=.01;
      }
      ocean.U.spectrumBlend.value=world?model.get('waterFraction'):Math.min(1,((wakeTicks===0?0:(wakeTicks-1)%10+1)+acc/.01)/10);
      if(model.time!==meshTime){
        observedBoat=observeBoat(model);
        if(!observedBoat.every(Number.isFinite))throw Error('Non-finite FMI state at '+model.time);
      }
      const s=observedBoat;
      const subFrame=sub.frame;
      if(!$('dial').hidden)drawCompass($('dial'),Math.hypot(model.get('windEast'),model.get('windNorth')),Math.atan2(model.get('windNorth'),model.get('windEast')),sub.active&&subFrame?subFrame.flow:[model.get('currentEast'),model.get('currentNorth')],sub.active&&subFrame?subFrame.estimate[3]:s[2],sub.active?'sub':'surface',noGo);
      drawForces(!drone?.active&&$('showForces').getAttribute('aria-pressed')==='true',s,subFrame,sub.active);
      const [ballastX,ballastY,k,direction,amplitude,phase,mainCar,jibCar,ve,vn,yawRate,sag,vang,leech,tension]=model.getMany(
        ['ballastX','ballastY','swellK','swellBearing','swellAmplitude','swellPhase','mainCar','jibCar','ve','vn','yawRate','exposedSheetSag',cat?'downhaulTension':'vangTension','leechSpeed','mainTension']);
      const ballast=cat?[ballastX,ballastY]:null;
      {
        ocean.U.swellCenter.value.set(s[0],s[1]);
        ocean.U.swell.value.set(amplitude,phase,k*Math.cos(direction),k*Math.sin(direction));
      }
      if(cat)$('weightPos').textContent='X '+ballast[0].toFixed(2)+' m · Y '+ballast[1].toFixed(2)+' m';
      remote.frame(now,s,cat,[...(ballast||[0,0]),mainCar,jibCar,ve,vn,yawRate,0],sub.mesh,drone?.group);
      document.body.dataset.visiblePeers=remote.visible;
      const t=model.time;
      if(t!==meshTime){
        boat.update(s,ballast,cat?[mainCar,jibCar]:null,sag,cat?model.get('shroudTail'):null,cat?model.get('sailTail'):null,cat?model.get('stayPath'):null);
        life(t);causticTime.value=t;meshTime=t;
      }
      ocean.U.tm.value=t;ocean.U.boat.value.set(s[0],s[1],s[2],s[10]);
      boat.group.localToWorld(orbitCenter.copy(helmSeat));
      const horizontal=distance*Math.cos(tilt);
      camera.up.set(0,0,1);
      camera.position.set(horizontal*Math.cos(angle),horizontal*Math.sin(angle),distance*Math.sin(tilt)).add(orbitCenter);
      if($('cameraDepth').value==='line')camera.position.z=0;
      camera.position.z=Math.max(-13.1,camera.position.z);
      camera.lookAt(orbitCenter);
      if(drone){
        drone.draw();
        if(drone.active){const [x,y,z]=drone.position;
          camera.position.set(x+distance*.6*Math.cos(angle),y+distance*.6*Math.sin(angle),z+distance*.6*Math.sin(tilt));camera.lookAt(x,y,z);}
      }
      if(running)sub.update(t,axis,ocean.U.wind.value,ocean.U.bearing.value);
      if(sub.active){
        const p=sub.mesh.position;
        if($('cameraDepth').value==='onboard'){
          const q=sub.mesh.quaternion;
          camera.position.set(.70,0,.09).applyQuaternion(q).add(p);
          camera.up.set(0,0,1).applyQuaternion(q);
          camera.lookAt(new T.Vector3(1,0,0).applyQuaternion(q).add(camera.position));
        }else{
          camera.position.set(p.x+.6*distance*Math.cos(angle),p.y+.6*distance*Math.sin(angle),p.z+.6*distance*Math.sin(tilt));camera.lookAt(p);
        }
        drawFeatures(sub.frame);
      }
      ocean.dome.position.copy(camera.position);ocean.water.position.set(s[0],s[1],0);updateLight(t);caustics.update(t);
      const surfaceBand=.55+1.8*Number($('seaState').value)+Math.abs(ocean.U.swell.value.x);
      const storm=$('sky').value==='Storm';
      rain.visible=false; // Optical reflection and refraction targets exclude foreground streaks.
      // The underwater shader computes the view through the surface from the sky.
      // Its opaque submerged pass never samples the planar capture targets.
      if(camera.position.z<=-surfaceBand)lastCapture=-Infinity;
      else if(now-lastCapture>=(mobile?65:0) && (lastCapture===-Infinity ||
        t!==captureTime || camera.aspect!==captureAspect || remote.visible || captureSky!==$('sky').value || captureSea!==$('seaState').value ||
        !capturePosition.equals(camera.position) || !captureRotation.equals(camera.quaternion))){
        capturePosition.copy(camera.position);captureRotation.copy(camera.quaternion);
        captureTime=t;captureAspect=camera.aspect;captureSky=$('sky').value;captureSea=$('seaState').value;
        ocean.capture(renderer,camera);lastCapture=now;
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
      document.body.dataset.eyeDepth=camera.position.z.toFixed(2);
      $('vangLoad').textContent=vang.toFixed(0)+' N';
      $('readout').textContent=t.toFixed(1)+' s · '+Math.hypot(s[34],s[35]).toFixed(2)+' m/s · waypoint '+s[8]+' · main leech '+leech[0].toFixed(2)+' m/s · sheet '+(tension<.1?'slack':tension.toFixed(0)+' N');
      if(drone?.active){const [e,n,z]=drone.position;$('readout').textContent='E '+e.toFixed(1)+' m · N '+n.toFixed(1)+' m · Altitude '+z.toFixed(2)+' m · Drag '+Math.hypot(...drone.drag).toFixed(2)+' N';}
      if(sub.active){
        const f=sub.frame;
        $('readout').textContent=sub.error||(!f?'Starting underwater navigation…':f.time.toFixed(2)+' s · Depth '+(-f.position[2]).toFixed(2)+' m · '+f.estimate[15]+' features · '+f.estimate[16]+' matches · '+f.estimate[12]+' keyframes'+(f.surveyDone?' · Survey complete':f.waypoint?' · Waypoint '+f.waypoint+'/'+f.waypointCount:''));
      }
      document.body.dataset.runtime=world?'world':'fleet';document.body.dataset.simTime=t;document.body.dataset.east=s[0];requestAnimationFrame(draw);
    }catch(e){$('readout').textContent=e.message;console.error(e);}
  }
  requestAnimationFrame(draw);
}
run().catch(e=>{document.getElementById('readout').textContent=e.message;console.error(e);});
