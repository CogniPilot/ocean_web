import {wreckCaustics} from './caustics.mjs';
import {loadVehicleShells} from './vehicle-assets.mjs';
import {loadInstance} from './fmi3/instance.mjs';
import {sailboatMesh,observeBoat} from './board/boat.mjs';
import {splitCamera} from "./waterline.mjs";
import {drawCompass} from './compass.mjs';
import {forceDisplay} from './instrumentation.mjs';
import {submarine} from './submarine.mjs';
import {surveyDrone} from "./drone.mjs";
import {mastCamera} from "./mast-camera.mjs";
import {courseScene,raceAudio} from "./regatta.mjs";
import {fleet} from "./fleet.mjs";
const T=window.THREE,$=id=>document.getElementById(id);
async function run(){
  const url=new URL(location.href),cat=url.searchParams.get('boat')==='Hobie16';
  const vessel=cat?'Hobie16':'Sailboat';
  $('vessel').value=vessel;
  $('vessel').onchange=()=>{url.searchParams.set('boat',$('vessel').value);location.assign(url);};
  document.querySelector('h1').textContent=cat?'Hobie 16':'Sailboat';
  $('trampoline').hidden=!cat;$('vangControl').hidden=false;
  // Start at the default loaded waterline for each hull.
  const inputs={launchHeight:cat ? .20 : .069,windEast:10,windNorth:4,currentEast:.2,currentNorth:.04,waveHeight:0,waveRoll:0,wavePitch:0,vangInput:.5,manualHelm:0,rudderInput:0,trimInput:0};
  const [model]=await Promise.all([loadInstance(vessel,inputs),loadVehicleShells()]);
  const worker=new Worker(new URL('./wave-worker.mjs',import.meta.url),{type:'module'});
  let waterFrame,waterError;
  worker.onmessage=({data})=>{if(data.error)waterError=Error(data.error);else waterFrame=data;};
  worker.onerror=event=>{waterError=Error(event.message);};
  addEventListener('pagehide',()=>worker.terminate(),{once:true});
  function waveInputs(){
    return {seaAmplitude:Number($('seaState').value),east:model.get('east'),north:model.get('north'),heading:model.get('heading'),
      heel:model.get('heel'),pitch:model.get('pitch'),volume:model.get('sectionVolume')};
  }
  worker.postMessage({init:{...waveInputs(),currentEast:inputs.currentEast,currentNorth:inputs.currentNorth,
    beamHalf:model.get('beamHalf'),stations:model.get('stationX'),separation:model.get('halfSpacing'),
    windEast:inputs.windEast,windNorth:inputs.windNorth}});
  let wakeTicks=0;
  const mobile=matchMedia('(pointer: coarse)').matches;
  function settings(open){$('setup').hidden=!open;$('settings').setAttribute('aria-expanded',String(open));}
  settings(!mobile);$('settings').onclick=()=>settings($('setup').hidden);
  const renderer=new T.WebGLRenderer({canvas:$('view'),antialias:!mobile});
  renderer.setPixelRatio(Math.min(mobile ? .8 : 1,devicePixelRatio));renderer.toneMapping=T.ACESFilmicToneMapping;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(52,1,.045,550);camera.up.set(0,0,1);
  const boat=sailboatMesh(T,cat);scene.add(boat.group);coast(T,scene);
  const race=await loadInstance('Regatta',{east:model.get('east'),north:model.get('north'),utc:Date.now()/1000});
  const windField=await loadInstance('MarineWind',{meanEast:inputs.windEast,meanNorth:inputs.windNorth,east:model.get('east'),north:model.get('north')});
  let captureMast;
  $('mastCapture').onclick=()=>{
    captureMast??=mastCamera(T,renderer,scene,boat,cat);
    const shot=captureMast(),file={...shot,vehicle:vessel,simulationTime:model.time,positionENU:[model.get('east'),model.get('north'),model.get('heave')],rollPitchYaw:[model.get('heel'),model.get('pitch'),model.get('heading')],vaneRad:model.get('vane'),windTile:{sampleTime:windField.time,periodM:96,shape:[48,48,3],components:['east','north','roughness'],data:windField.get('field')}};
    const a=document.createElement('a'),href=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:'application/json'}));a.href=href;a.download='mast-'+model.time.toFixed(2)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),10000);
  };
  const boardClock=courseScene(T,scene,race),audio=raceAudio();
  let lastCountdown=null,raceTick=0;
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
  $('sound').onclick=async()=>{try{$('sound').setAttribute('aria-pressed',String(await audio.toggle()));}catch(e){$('online').textContent=e.message;}};
  const hemi=new T.HemisphereLight(0xe5f8fb,0x767266,1.8);hemi.position.z=1;scene.add(hemi);
  const sun=new T.DirectionalLight(0xffe6b4,2.5);sun.position.set(15,10,20);scene.add(sun);
  const ocean=atmosphere(scene),sea={tile:new Float32Array(1024),wind:Math.hypot(inputs.windEast,inputs.windNorth),tide:0};
  if(mobile)ocean.setCaptureScale(.5);
  ocean.update(sea,sea);ocean.U.under.value=0;ocean.U.sunDir.value.copy(sun.position).normalize();
  ocean.U.moonDir.value.set(-.8,-.4,-.5);ocean.U.bearing.value=Math.atan2(inputs.windNorth,inputs.windEast);
  const caustics=wreckCaustics(T,renderer,ocean,mobile);
  const materials=seabedMaterials(T,caustics.uniforms);const bottom=new T.Mesh(new T.PlaneGeometry(500,500),materials.sand);bottom.position.z=-13.71;scene.add(bottom);
  const hull=makeWreck(T,materials);const wreckVisual=batchScenery(T,hull.clone(true));scene.add(wreckVisual);caustics.setWreck(wreckVisual);const life=marineLife(T,scene);
  const underwaterFog=new T.FogExp2(0x124759,.075),split=splitCamera(T);
  let angle=-.8,distance=cat?14:5.7,tilt=.16,drag=null,running=true,manual=false;
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
  $('seaState').onchange=()=>model.set('swellAmplitude',.30*Number($('seaState').value));
  const keys=new Set();let drone;
  const sub=submarine(T,scene,renderer,hull), sensorCanvas=$('sensorCam').getContext('2d');
  const drawForces=forceDisplay(T,scene,sub.mesh,boat.group,cat);
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
  function touchControls(){
    const pad=$('touchHelm');pad.replaceChildren();pad.hidden=sub.active?!sub.manual:!manual&&!drone?.active;
    if(!mobile||pad.hidden)return;
    const labels=(drone?.active||sub.active)?
      [['W','Forward'],['S','Back'],['A','Left'],['D','Right'],['Q','Yaw left'],['E','Yaw right'],['R','Climb'],['F','Descend']]:
      [['A','Rudder left'],['D','Rudder right'],['W','Sheet in'],['S','Sheet out']];
    for(const [key,label] of labels){
      const button=document.createElement('button');button.textContent=label;button.type='button';
      button.setAttribute('aria-pressed','false');
      button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add('Key'+key);button.setAttribute('aria-pressed','true');helm();};
      button.onlostpointercapture=()=>{keys.delete('Key'+key);button.setAttribute('aria-pressed','false');helm();};
      pad.append(button);
    }
  }
  surveyDrone(T,scene).then(vehicle=>{
    drone=vehicle;$('controlTarget').disabled=false;
    $('cutMotors').onclick=()=>{const cut=$('cutMotors').getAttribute('aria-pressed')!=='true';drone.cut(cut);$('cutMotors').setAttribute('aria-pressed',String(cut));$('cutMotors').textContent=cut?'Restore motors':'Cut motors';};
    $('controlTarget').onchange=()=>{
      if($('controlTarget').value==='sub'){angle=Math.PI-.48;tilt=.32;}
      keys.clear();$('view').focus({preventScroll:true});sub.active=$('controlTarget').value==='sub';$('onboardOption').hidden=!sub.active;if(!sub.active&&$('cameraDepth').value==='onboard')$('cameraDepth').value='deck';$('subPanel').hidden=!sub.active;drone.select($('controlTarget').value==='drone');helm();touchControls();
      $('cutMotors').hidden=!drone.active;$('flightKeys').hidden=!drone.active;$('helm').textContent=(sub.active?sub.manual:manual)?'Manual helm':'Autopilot';document.querySelector('h1').textContent=sub.active?'Survey submarine':drone.active?'RDD2 survey drone':(cat?'Hobie 16':'Sailboat');
    };
    if(['drone','sub'].includes(url.searchParams.get('control'))){$('controlTarget').value=url.searchParams.get('control');$('controlTarget').onchange();}
  }).catch(e=>{$('controlTarget').title=e.message;});

  function helm(){drone?.input(keys);if(drone?.active||sub.active){model.set('rudderInput',0);model.set('trimInput',0);return;}model.set('rudderInput',Number(keys.has('KeyA'))-Number(keys.has('KeyD')));model.set('trimInput',Number(keys.has('KeyS'))-Number(keys.has('KeyW')));}
  addEventListener('keydown',e=>{if((manual||drone?.active||sub.active&&sub.manual)&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){keys.add(e.code);helm();}});
  addEventListener('keyup',e=>{keys.delete(e.code);helm();});addEventListener('blur',()=>{keys.clear();helm();});
  $('helm').onclick=()=>{if(sub.active){sub.manual=!sub.manual;keys.clear();$('helm').textContent=sub.manual?'Manual helm':'Autopilot';touchControls();return;}manual=!manual;model.set('manualHelm',Number(manual));keys.clear();helm();$('helm').textContent=manual?'Manual helm':'Autopilot';touchControls();};
  $('vang').oninput=()=>model.set('vangInput',Number($('vang').value)/100);
  $('play').onclick=()=>{running=!running;$('play').textContent=running?'Pause':'Resume';};
  $('wind').oninput=()=>{const w=+$('wind').value;windField.set('meanEast',w*Math.cos(ocean.U.bearing.value));windField.set('meanNorth',w*Math.sin(ocean.U.bearing.value));ocean.U.wind.value=w;$('windOut').textContent=w+' m/s';};
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
  let prev=performance.now(),acc=0,lastCapture=-Infinity;
  let frameCost=1000/30,lastQualityCheck=0,pixelScale=mobile?.8:1;
  let lastEnvironment;
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
  function draw(now){
    try{
      if(now>=raceTick){
        raceTick=now+50;race.set('east',model.get('east'));race.set('north',model.get('north'));race.set('utc',Date.now()/1000);race.advance(.05);
        const left=Math.ceil(race.get('countdown')),stage=race.get('stage');
        if(lastCountdown!==null&&lastCountdown<5&&left>295)audio.signal();
        lastCountdown=left;const label=left>298?'START':Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
        boardClock(label);$('countdown').textContent=label;
        $('raceStatus').textContent=['Prestart','Cross the line','Mark 1','Mark 2','Cross finish','Finished'][stage]+(stage>=2?' · '+race.get('elapsed').toFixed(1)+' s':'');
        audio.update(model.get('cupSpeed'));model.set('traffic',remote.contacts(model.get('east'),model.get('north')));
      }
      frameCost=.94*frameCost+.06*Math.min(120,now-prev);
      if(mobile&&now-lastQualityCheck>1500){
        const next=Math.max(.5,Math.min(1,pixelScale+(frameCost>39?-.1:frameCost<23?.05:0)));
        if(Math.abs(next-pixelScale)>.01){pixelScale=next;renderer.setPixelRatio(pixelScale);resize();}
        lastQualityCheck=now;
      }
      if(running)acc+=Math.min(.22,(now-prev)/1000);prev=now;
      if(waterError)throw waterError;
      while(acc>=.01){
        // One in-flight step. A slower device can display and accept controls
        // while the worker finishes, without dropping or reordering hull samples.
        if(wakeTicks%10===0 && !waterFrame){acc=Math.min(acc,.1);break;}
        if(wakeTicks%25===0){
          if(drone){
            const [east,north]=drone.position;
            windField.set('droneEast',east);windField.set('droneNorth',north);
          }
          windField.set('east',model.get('east'));windField.set('north',model.get('north'));windField.advance(.25);
          if(drone){drone.wind(windField.get('droneWind'));if(sub.frame)drone.station(sub.frame.estimate[0],sub.frame.estimate[1]);}
          model.set('windEast',windField.get('localEast'));model.set('windNorth',windField.get('localNorth'));ocean.updateWind(windField.get('field'));
        }
        if(wakeTicks%10===0){
          const {height,incident,origin,period,load}=waterFrame;
          waterFrame=null;
          worker.postMessage({...waveInputs(),windEast:windField.get('meanEast'),windNorth:windField.get('meanNorth')});
          model.set('waveHeight',incident[0]);model.set('wavePitch',incident[1]);model.set('waveRoll',incident[2]);
          model.set('wakeEast',load[0]);model.set('wakeNorth',load[1]);model.set('wakeYaw',load[2]);
          ocean.updateSpectrum(height,...origin,period);
        }
        wakeTicks++;
        model.advance(.01);if(drone){drone.step(.005);drone.step(.005);}acc-=.01;
      }
      ocean.U.spectrumBlend.value=Math.min(1,((wakeTicks+9)%10+acc/.01)/10);
      const s=observeBoat(model);
      if(!s.every(Number.isFinite))throw Error('Non-finite FMI state at '+model.time);
      const subFrame=sub.frame;
      if(!$('dial').hidden)drawCompass($('dial'),Math.hypot(model.get('windEast'),model.get('windNorth')),Math.atan2(model.get('windNorth'),model.get('windEast')),sub.active&&subFrame?subFrame.flow:[model.get('currentEast'),model.get('currentNorth')],sub.active&&subFrame?subFrame.estimate[3]:s[2],sub.active?'sub':'surface');
      drawForces($('showForces').getAttribute('aria-pressed')==='true',s,subFrame,model);
      const ballast=cat?[model.get('ballastX'),model.get('ballastY')]:null;
      {
        ocean.U.swellCenter.value.set(s[0],s[1]);
        const k=model.get('swellK'),direction=model.get('swellBearing');
        ocean.U.swell.value.set(model.get('swellAmplitude'),model.get('swellPhase'),k*Math.cos(direction),k*Math.sin(direction));
      }
      if(cat)$('weightPos').textContent='X '+ballast[0].toFixed(2)+' m · Y '+ballast[1].toFixed(2)+' m';
      remote.frame(now,s,cat,[...(ballast||[0,0]),model.get('mainCar'),model.get('jibCar'),model.get('ve'),model.get('vn'),model.get('yawRate'),0],sub.mesh,drone?.group);
      document.body.dataset.visiblePeers=remote.visible;
      boat.update(s,ballast,cat?[model.get('mainCar'),model.get('jibCar')]:null,model.get('linePaid'));const t=model.time;life(t);causticTime.value=t;
      ocean.U.tm.value=t;ocean.U.boat.value.set(s[0],s[1],s[2],s[10]);
      camera.up.set(0,0,1);camera.position.set(s[0]+distance*Math.cos(angle),s[1]+distance*Math.sin(angle),s[3]+(cat?3:.9)+distance*Math.sin(tilt));if($('cameraDepth').value==='line')camera.position.z=0;
      camera.position.z=Math.max(-13.1,camera.position.z);
      camera.lookAt(s[0],s[1],camera.position.z<.4?s[3]:s[3]+(cat?3.8:1.1));
      if(drone){
        drone.draw();
        if(drone.active){const [x,y,z]=drone.position;
          camera.position.set(x+distance*.6*Math.cos(angle),y+distance*.6*Math.sin(angle),z+distance*.6*Math.sin(tilt));camera.lookAt(x,y,z);}
      }
      if(running)sub.update(t,keys,ocean.U.wind.value,ocean.U.bearing.value);
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
      if(now-lastCapture>=(mobile?65:0)){
        ocean.capture(renderer,camera);lastCapture=now;
      }
      const surfaceBand=.55+1.8*Number($('seaState').value)+Math.abs(ocean.U.swell.value.x);
      if(Math.abs(camera.position.z)<surfaceBand){split(renderer,scene,camera,ocean,underwaterFog);}
      else{
        const submerged=camera.position.z<0;
        scene.fog=submerged?underwaterFog:null;scene.background=submerged?underwaterFog.color:null;
        ocean.U.under.value=Number(submerged);ocean.dome.visible=!submerged;renderer.render(scene,camera);
      }
      document.body.dataset.eyeDepth=camera.position.z.toFixed(2);
      $('vangLoad').textContent=model.get('vangTension').toFixed(0)+' N';
      $('readout').textContent=t.toFixed(1)+' s · '+Math.hypot(s[34],s[35]).toFixed(2)+' m/s · waypoint '+s[8]+' · main leech '+model.get('leechSpeed')[0].toFixed(2)+' m/s · sheet '+(model.get('mainTension')<.1?'slack':model.get('mainTension').toFixed(0)+' N');
      if(drone?.active){const [e,n,z]=drone.position;$('readout').textContent='E '+e.toFixed(1)+' m · N '+n.toFixed(1)+' m · Altitude '+z.toFixed(2)+' m · Drag '+Math.hypot(...drone.drag).toFixed(2)+' N';}
      if(sub.active){
        const f=sub.frame;
        $('readout').textContent=sub.error||(!f?'Starting underwater navigation…':f.time.toFixed(2)+' s · Depth '+(-f.position[2]).toFixed(2)+' m · '+f.estimate[15]+' features · '+f.estimate[16]+' matches · '+f.estimate[12]+' keyframes'+(f.surveyDone?' · Survey complete':f.waypoint?' · Waypoint '+f.waypoint+'/'+f.waypointCount:''));
      }
      document.body.dataset.simTime=t;document.body.dataset.east=s[0];requestAnimationFrame(draw);
    }catch(e){$('readout').textContent=e.message;console.error(e);}
  }
  requestAnimationFrame(draw);
}
run().catch(e=>{document.getElementById('readout').textContent=e.message;console.error(e);});
