import {inboardMixer} from './inboard-audio.mjs';
import {courseMarkerLayer,showInLowWaterCapture} from './render-layers.mjs';

// Compass bearing clockwise from true north in the east/north world frame.
export function trueBearing(east,north){
  const degrees=(Math.round(Math.atan2(east,north)*180/Math.PI)+360)%360;
  return String(degrees).padStart(3,'0')+'°T';
}
export function firstLeg(race){
  const e=race.get('markEast')[0]-(race.get('committeeEast')+race.get('pinEast'))/2;
  const n=race.get('markNorth')[0]-(race.get('committeeNorth')+race.get('pinNorth'))/2;
  return trueBearing(e,n);
}
// The line midpoint gives a single course-to-steer reference for an open gate.
export function raceTarget(race,stage,east,north){
  let x,y,label;
  if(stage===2 || stage===3){
    x=race.get('markEast')[stage-2];y=race.get('markNorth')[stage-2];
    label='Mark '+(stage-1);
  }else if(stage===0 || stage===1 || stage===4){
    x=(race.get('committeeEast')+race.get('pinEast'))/2;
    y=(race.get('committeeNorth')+race.get('pinNorth'))/2;
    label=stage===4?'Finish':'Start';
  }else return null;
  const de=x-east,dn=y-north,range=Math.hypot(de,dn);
  if(range<.01 || !Number.isFinite(range))return null;
  return {label,range,angle:Math.atan2(dn,de),bearing:trueBearing(de,dn)};
}
// Z-up committee launch and inflatable marks. Dimensions are in metres.
export function courseScene(T,scene,race){
  const group=new T.Group();scene.add(group);
  const mat=(color,roughness=.55)=>new T.MeshStandardMaterial({color,roughness});
  const white=mat(0xf1ede0),navy=mat(0x152c36),metal=mat(0xb7c0bc,.27),orange=mat(0xff5908);
  const mesh=(parent,geometry,material,x,y,z)=>{
    const o=new T.Mesh(geometry,material);o.position.set(x,y,z);parent.add(o);return o;
  };
  function rod(parent,a,b,r,material){
    const v=new T.Vector3(...a),w=new T.Vector3(...b),d=w.clone().sub(v);
    const o=mesh(parent,new T.CylinderGeometry(r,r,d.length(),8),material,0,0,0);
    o.position.copy(v).lerp(w,.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;
  }
  const boat=new T.Group();boat.position.set(race.get('committeeEast'),race.get('committeeNorth'),0);boat.rotation.order='ZYX';boat.rotation.z=race.get('windBearing')+Math.PI;group.add(boat);
  const vertices=[],indices=[];
  const stations=[[-3,.88],[-2.7,1.02],[-.7,1.10],[1,1.01],[2.1,.72],[3.2,.025]];
  for(const [x,w] of stations){
    const rise=Math.max(0,x-1)*.12;
    for(const [y,z] of [[w,.78],[w*.91,.24],[w*.58,-.13],[0,-.30],[-w*.58,-.13],[-w*.91,.24],[-w,.78]])vertices.push(x,y,z+rise);
  }
  for(let i=0;i<stations.length-1;i++){
    for(let j=0;j<7;j++){const a=7*i+j,b=7*i+(j+1)%7;indices.push(a,b,b+7,a,b+7,a+7);}
  }
  for(const end of [0,35])for(let i=1;i<6;i++)indices.push(end,end+i,end+i+1);
  const hull=new T.BufferGeometry();hull.setAttribute('position',new T.Float32BufferAttribute(vertices,3));hull.setIndex(indices);hull.computeVertexNormals();
  white.side=T.DoubleSide;mesh(boat,hull,white,0,0,0);
  for(const sign of [-1,1])for(let i=1;i<stations.length;i++){
    const rim=([x,w])=>[x,sign*w,.76+Math.max(0,x-1)*.12];
    rod(boat,rim(stations[i-1]),rim(stations[i]),.032,navy);
  }
  mesh(boat,new T.BoxGeometry(.95,.76,.86),white,0,0,1.16);
  const glass=mat(0x64808a);mesh(boat,new T.BoxGeometry(.06,.78,.42),glass,.40,0,1.80);
  for(const x of [-.75,.55])for(const y of [-.53,.53])rod(boat,[x,y,.79],[x,y,2.32],.027,metal);
  mesh(boat,new T.BoxGeometry(1.85,1.45,.08),white,0,0,2.32);
  mesh(boat,new T.BoxGeometry(.52,.48,.68),navy,-3.13,0,.58);
  rod(boat,[0,0,2.34],[0,0,4],.033,metal);
  // Aft landing pad shares the height and extent of the Modelica deck.
  mesh(boat,new T.BoxGeometry(1.45,1.3,.012),navy,-1.98,0,.777);
  for(const y of [-.22,.22])mesh(boat,new T.BoxGeometry(.65,.065,.008),white,-1.98,y,.786);
  mesh(boat,new T.BoxGeometry(.065,.47,.008),white,-1.98,0,.786);
  batchScenery(T,boat);
  boat.children.forEach(showInLowWaterCapture);
  // Keep the hoist attached to the mast while the free edge streams downwind.
  const cloth=new T.PlaneGeometry(.98,.72,12,3),flagMaterial=mat(0xff671a);flagMaterial.side=T.DoubleSide;
  const flag=mesh(boat,cloth,flagMaterial,0,0,3.60);flag.name='Committee wind flag';showInLowWaterCapture(flag);
  const uv=cloth.attributes.uv,verticesFlag=cloth.attributes.position,localWind=new T.Vector2();
  cloth.boundingSphere=new T.Sphere(new T.Vector3(),1.4);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=168;
  const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);
  const boardMaterial=new T.MeshBasicMaterial({map:texture});
  for(const side of [-1,1]){
    const board=mesh(boat,new T.PlaneGeometry(2.2,.82),boardMaterial,-.28,side*.57,1.83);
    board.rotation.order='ZXY';board.rotation.x=Math.PI/2;board.rotation.z=side<0?0:Math.PI;
  }
  const marks=[];
  function mark(x,y){
    const body=new T.Group();group.add(body);marks.push(body);body.position.set(x,y,0);x=0;y=0;
    const buoy=mesh(body,new T.ConeGeometry(.85,1.75,3,1),orange,x,y,.77);buoy.rotation.x=Math.PI/2;
    const collar=mesh(body,new T.CylinderGeometry(.76,.81,.14,3),navy,x,y,.04);collar.rotation.x=Math.PI/2;
    showInLowWaterCapture(buoy);showInLowWaterCapture(collar);
  }
  mark(race.get('pinEast'),race.get('pinNorth'));
  race.get('markEast').forEach((x,i)=>mark(x,race.get('markNorth')[i]));
  const markers=[['RC',boat,4.7],['PIN',marks[0],3.2],['1',marks[1],3.2],['2',marks[2],3.2]].map(([label,subject,height])=>{
    const plate=document.createElement('canvas');plate.width=128;plate.height=64;
    const ink=plate.getContext('2d');
    const width=label.length===1?48:label.length===2?76:108;
    const x=(plate.width-width)/2;
    ink.fillStyle='#102532';ink.fillRect(x,4,width,47);
    ink.lineWidth=4;ink.strokeStyle='#ffac57';ink.strokeRect(x+2,6,width-4,43);
    ink.fillStyle='#fff4d9';ink.textAlign='center';ink.textBaseline='middle';
    ink.font='bold 35px sans-serif';ink.fillText(label,64,29);
    ink.fillStyle='#ffac57';ink.beginPath();ink.moveTo(56,51);ink.lineTo(72,51);ink.lineTo(64,62);ink.fill();
    const map=new T.CanvasTexture(plate);map.colorSpace=T.SRGBColorSpace;
    const marker=new T.Sprite(new T.SpriteMaterial({map,sizeAttenuation:false,depthTest:false,depthWrite:false,
      fog:false,toneMapped:false,transparent:true}));
    marker.name='Course marker '+label;marker.layers.set(courseMarkerLayer);marker.renderOrder=3;
    marker.visible=false;group.add(marker);
    return {marker,subject,height};
  });
  function positionMarkers(eye,viewportHeight,aboveWater){
    const scale=44*Math.tan(eye.fov*Math.PI/360)/Math.max(1,viewportHeight);
    for(const {marker,subject,height} of markers){
      const {x,y,z}=subject.position,range=Math.hypot(x-eye.position.x,y-eye.position.y);
      const opacity=T.MathUtils.smoothstep(range,65,110);
      marker.visible=aboveWater&&opacity>0;
      if(!marker.visible)continue;
      marker.position.set(x,y,z+height);
      marker.scale.set(2*scale,scale,1);
      marker.material.opacity=opacity;
    }
  }
  let previous;
  function update(label,time=0,sampleWind){
    const [heave,roll,pitch]=race.get('launchPose');
    boat.position.z=heave;boat.rotation.x=roll;boat.rotation.y=-pitch;
    if(sampleWind){
      sampleWind(boat.position.x,boat.position.y,localWind);
      const speed=localWind.length(),tension=1-Math.exp(-speed/3);
      flag.rotation.z=Math.atan2(localWind.y,localWind.x)-boat.rotation.z;
      for(let i=0;i<uv.count;i++){
        const u=uv.getX(i),v=uv.getY(i),phase=time*(4+.32*speed)-8*u+.75*v;
        verticesFlag.setXYZ(i,u*(.10+.88*tension),.14*u*tension*(Math.sin(phase)+.30*Math.sin(1.7*phase)),
          .72*(v-.5)-.61*(1-tension)*u+.04*u*tension*Math.cos(phase));
      }
      verticesFlag.needsUpdate=true;cloth.computeVertexNormals();
    }
    const poses=race.get('markPose');
    const east=race.get('markEast'),north=race.get('markNorth');
    marks.forEach((mark,i)=>{
      mark.position.set(i?east[i-1]:race.get('pinEast'),i?north[i-1]:race.get('pinNorth'),poses[3*i]);
      mark.rotation.set(poses[3*i+1],-poses[3*i+2],0,'ZYX');
    });
    const bearing=firstLeg(race),key=label+bearing;
    if(previous===key)return;previous=key;ctx.fillStyle='#101d23';ctx.fillRect(0,0,512,168);
    ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 48px monospace';
    ctx.fillText('TRI 1   '+bearing,256,49);
    ctx.font='bold 35px monospace';ctx.fillText('S – 1p – 2p – F',256,99);
    ctx.fillStyle='#ffbe52';ctx.font='bold 43px monospace';ctx.fillText(label,256,151);texture.needsUpdate=true;
  }
  return {update,positionMarkers};
}
export function sailFlapRate(){
  const sampleRate=32,windowSize=96,firstFrequency=.5,frequencyStep=.25,binCount=47;
  const main=new Float64Array(windowSize),jib=new Float64Array(windowSize);
  const weightedMain=new Float64Array(windowSize),weightedJib=new Float64Array(windowSize);
  const taper=Float64Array.from(main,(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(windowSize-1)));
  const middle=(windowSize-1)/2,taperSum=taper.reduce((sum,w)=>sum+w,0);
  const slopeScale=taper.reduce((sum,w,i)=>sum+w*(i-middle)**2,0);
  const bins=Float64Array.from({length:binCount},(_,i)=>2*Math.cos(2*Math.PI*(firstFrequency+frequencyStep*i)/sampleRate));
  const powers=new Float64Array(binCount);
  let count=0,write=0,lastTime,nextSample,lastWall,lastMain,lastJib,analysisTime,frameInterval;
  let clockTime,clockWall,wallRate,dominant;

  function reset(){
    count=0;write=0;lastTime=undefined;dominant=undefined;
  }
  function prepare(samples,weighted){
    // Remove the changing mean camber and trim before looking for a flap.
    let sum=0,moment=0;
    for(let i=0;i<windowSize;i++){
      const value=taper[i]*samples[(write+i)%windowSize];
      sum+=value;moment+=value*(i-middle);
    }
    const mean=sum/taperSum,slope=moment/slopeScale;
    let energy=0;
    for(let i=0;i<windowSize;i++){
      const y=(samples[(write+i)%windowSize]-mean-slope*(i-middle))*taper[i];
      weighted[i]=y;energy+=y*y;
    }
    return energy;
  }
  function powerAt(samples,coefficient){
    let previous=0,previous2=0;
    for(const value of samples){
      const next=value+coefficient*previous-previous2;
      previous2=previous;previous=next;
    }
    return Math.max(0,previous*previous+previous2*previous2-coefficient*previous*previous2);
  }
  function analyze(mainLuff,jibLuff){
    const energy=mainLuff*prepare(main,weightedMain)+jibLuff*prepare(jib,weightedJib);
    // Use only bands the incoming snapshots can resolve. Interpolation aligns
    // the samples for analysis and cannot recover above their Nyquist limit.
    const limit=Math.min(binCount-1,Math.floor((.40/frameInterval-firstFrequency)/frequencyStep));
    if(energy<.001||limit<1)return undefined;
    let peak=0;
    for(let i=0;i<=limit;i++){
      powers[i]=mainLuff*powerAt(weightedMain,bins[i])+jibLuff*powerAt(weightedJib,bins[i]);
      if(powers[i]>powers[peak])peak=i;
    }
    if(powers[peak]<.10*windowSize*energy)return undefined;
    let offset=0;
    if(peak>0&&peak<limit){
      const left=powers[peak-1],right=powers[peak+1],top=powers[peak];
      const curvature=2*(2*top-left-right);
      if(curvature>1e-9)offset=(right-left)/curvature;
    }
    return firstFrequency+(peak+offset)*frequencyStep;
  }
  function append(mainY,jibY){
    main[write]=mainY;jib[write]=jibY;
    write=(write+1)%windowSize;count=Math.min(count+1,windowSize);
  }
  function sample(time,wall,mainY,jibY,mainLuff,jibLuff,playbackRate){
    if(time===lastTime)return wall-lastWall<.35;
    if(!Number.isFinite(mainY)||!Number.isFinite(jibY)){reset();return false;}
    const dt=time-lastTime;
    if(!(dt>0)||dt>.20||wall-lastWall>.4){
      reset();
      clockTime=time;clockWall=wall;wallRate=playbackRate;
      frameInterval=1/sampleRate;analysisTime=time;
      nextSample=time+1/sampleRate;
      append(mainY,jibY);
    }else{
      frameInterval=Math.max(dt,.90*frameInterval+.10*dt);
      while(nextSample<=time+1e-8){
        const fraction=Math.min(1,(nextSample-lastTime)/dt);
        append(lastMain+fraction*(mainY-lastMain),lastJib+fraction*(jibY-lastJib));
        nextSample+=1/sampleRate;
      }
      if(wall-clockWall>=.5){
        const rate=(time-clockTime)/(wall-clockWall);
        wallRate+=.5*(Math.min(playbackRate*1.25,rate)-wallRate);
        clockTime=time;clockWall=wall;
      }
      if(count===windowSize&&time-analysisTime>=.25){
        const measured=analyze(mainLuff,jibLuff);
        dominant=measured===undefined||dominant===undefined?measured:dominant+.55*(measured-dominant);
        analysisTime=time;
      }
    }
    lastTime=time;lastWall=wall;lastMain=mainY;lastJib=jibY;
    return true;
  }
  return {sample,reset,get dominant(){return dominant;},
    get audibleHz(){return (dominant??1.8)*(wallRate??1);}};
}

// The 6-by-4 mesh is expressed in the boom frame, starting at the tack.
// Compare the trailing and anchored leading nodes at two middle rows.
function leechDeflection(state,offset){
  return .65*(state[offset+34]-state[offset+25])+.35*(state[offset+46]-state[offset+37]);
}

export function waveAmbience(){
  const spacing=2.3,offsets=[[0,0],[spacing,0],[-spacing,0],[0,spacing],[0,-spacing]];
  const incident=new Float64Array(offsets.length),wake=new Float64Array(offsets.length);
  const mix={swell:0,crest:0,wake:0};
  let anchorEast,anchorNorth,lastTime,lastWake;
  function silence(){mix.swell=mix.crest=mix.wake=0;return mix;}
  function reset(){lastTime=undefined;silence();}
  function slope(values){
    let sum=0;
    for(let i=1;i<values.length;i++)sum+=Math.abs(values[i]-values[0]);
    return sum/(spacing*(values.length-1));
  }
  function sample(surface,time,east,north,tide,includeWake){
    const moved=lastTime===undefined||(east-anchorEast)**2+(north-anchorNorth)**2>36;
    if(moved){anchorEast=east;anchorNorth=north;}
    const dt=time-lastTime;
    if(!moved&&dt===0&&includeWake===lastWake)return mix;
    // Initialize the new probe coordinates before taking differences.
    const continuous=!moved&&dt>0&&dt<.32;
    const continuousWake=continuous&&includeWake&&lastWake;
    let motion=0,fallingMotion=0,wakeMotion=0;
    for(let i=0;i<offsets.length;i++){
      const x=anchorEast+offsets[i][0],y=anchorNorth+offsets[i][1];
      const h=surface(x,y,false),sea=h-tide;
      const localWake=includeWake?surface(x,y,true)-h:0;
      if(continuous){
        const delta=sea-incident[i];
        motion+=delta*delta;
        if(delta<0)fallingMotion+=delta*delta;
      }
      if(continuousWake)wakeMotion+=(localWake-wake[i])**2;
      incident[i]=sea;wake[i]=localWake;
    }
    lastTime=time;lastWake=includeWake;
    if(!continuous)return silence();
    const rmsSpeed=energy=>Math.max(0,Math.sqrt(energy/offsets.length)/dt-.004);
    const moving=rmsSpeed(motion),falling=rmsSpeed(fallingMotion),radiating=rmsSpeed(wakeMotion);
    const seaSlope=slope(incident),wakeSlope=slope(wake);
    mix.swell=.62*moving/(.16+moving);
    mix.crest=.48*falling/(.22+falling)*seaSlope/(.045+seaSlope);
    mix.wake=.42*radiating/(.13+radiating)*wakeSlope/(.02+wakeSlope);
    return mix;
  }
  return {sample,reset};
}

export function raceAudio(){
  let engines,audio,wind,filter,noise,rain,weather,enabled=false,lastMix=-Infinity;
  let submerged,effects,luffGain,flapOscillator,flapRate,level=.15;
  let waves,waveGains,lastWaveMix=-Infinity,lastWaveTime,waveTimeWall,wavesActive=false;
  function silenceLuff(){
    flapRate?.reset();
    if(luffGain)luffGain.gain.setTargetAtTime(0,audio.currentTime,.06);
  }
  function silenceWaves(){
    if(!wavesActive)return;
    wavesActive=false;
    waves?.reset();
    for(const gain of waveGains??[])gain.gain.setTargetAtTime(0,audio.currentTime,.15);
  }
  function setVolume(value){
    level=value;
    if(effects)effects.gain.setTargetAtTime(level,audio.currentTime,.025);
    if(!level){silenceLuff();silenceWaves();}
  }
  const loading=new Set();
  function startAmbience(file,destination){
    if(loading.has(file))return;
    loading.add(file);
    fetch(new URL('./assets/audio/'+file,import.meta.url))
      .then(response=>{
        if(!response.ok)throw Error('Ambience HTTP '+response.status);
        return response.arrayBuffer();
      })
      .then(bytes=>audio.decodeAudioData(bytes))
      .then(buffer=>{
        const source=audio.createBufferSource();
        source.buffer=buffer;source.loop=true;
        source.connect(destination);source.start();
      }).catch(error=>console.warn('Ambience unavailable',file,error));
  }
  function imagingHit(distance,underwater){
    if(!enabled||audio.state!=='running'||distance>32)return;
    const tone=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime;
    const level=(underwater?.20:.55)/(1+distance/5);
    tone.frequency.setValueAtTime(underwater?830:1370,t);
    tone.frequency.exponentialRampToValueAtTime(underwater?420:780,t+.13);
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.linearRampToValueAtTime(level,t+.007);
    gain.gain.exponentialRampToValueAtTime(.0001,t+.15);
    tone.connect(gain).connect(effects);
    tone.onended=()=>{tone.disconnect();gain.disconnect();};
    tone.start(t);tone.stop(t+.16);
  }
  async function setEnabled(on){
    if(!audio && !on)return;
    if(!audio){
      audio=new AudioContext();noise=audio.createBuffer(1,2*audio.sampleRate,audio.sampleRate);
      const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=2*Math.random()-1;
      effects=audio.createGain();effects.gain.value=level;effects.connect(audio.destination);
      submerged=audio.createGain();submerged.gain.value=0;submerged.connect(effects);
      const blower=audio.createBufferSource();blower.buffer=noise;blower.loop=true;
      filter=audio.createBiquadFilter();filter.type='lowpass';wind=audio.createGain();wind.gain.value=0;
      const rainfall=audio.createBufferSource(),rainFilter=audio.createBiquadFilter();
      rainfall.buffer=noise;rainfall.loop=true;rainfall.playbackRate.value=1.19;
      rainFilter.type="highpass";rainFilter.frequency.value=1350;
      weather=audio.createGain();weather.gain.value=0;rain=audio.createGain();rain.gain.value=.16;
      rainfall.connect(rainFilter).connect(rain).connect(weather).connect(effects);rainfall.start();
      blower.connect(filter).connect(wind).connect(effects);blower.start();
    }
    if(on)await audio.resume();
    else{
      silenceLuff();
      silenceWaves();
      await audio.suspend();
    }
    enabled=audio.state==='running';return enabled;
  }
  function startLuff(){
    const source=audio.createBufferSource(),low=audio.createBiquadFilter(),high=audio.createBiquadFilter();
    const flutter=audio.createGain(),envelope=audio.createWaveShaper();
    source.buffer=noise;source.loop=true;
    low.type='lowpass';low.frequency.value=380;low.Q.value=.6;
    high.type='highpass';high.frequency.value=72;high.Q.value=.55;
    envelope.curve=Float32Array.from({length:129},(_,i)=>.035+.965*(i/128)**2.5);
    flapOscillator=audio.createOscillator();flapOscillator.frequency.value=1.8;
    flutter.gain.value=0;
    luffGain=audio.createGain();luffGain.gain.value=0;
    source.connect(high).connect(low).connect(flutter).connect(luffGain).connect(effects);
    // The oscillator shapes the gain of the cloth noise. Its signal never
    // reaches the output as a tone.
    flapOscillator.connect(envelope).connect(flutter.gain);
    source.start();flapOscillator.start();
  }
  function update(speed,storm,height,sailLuff,state,time,playbackRate){
    if(!enabled||!level)return;
    const wall=audio.currentTime;
    const exposure=Math.max(0,Math.min(1,(height+.35)/.7));
    let luff=0;
    if(sailLuff&&state&&exposure>0){
      const main=.74*sailLuff[0],jib=.45*sailLuff[1];
      luff=Math.min(1,main+jib);
      if(luff>.015||flapRate){
        flapRate??=sailFlapRate();
        // Hull, load and instrument fields occupy the first 42 entries.
        const vertices=42,verticesPerSail=72;
        if(!flapRate.sample(time,wall,leechDeflection(state,vertices),
          leechDeflection(state,vertices+verticesPerSail),main,jib,playbackRate))luff=0;
      }
    }else flapRate?.reset();
    if(wall-lastMix<.05)return;
    lastMix=wall;
    if(!luffGain&&luff>.015)startLuff();
    if(luffGain){
      const rate=Math.max(.35,Math.min(16,flapRate.audibleHz));
      flapOscillator.frequency.setTargetAtTime(rate,wall,.15);
      luffGain.gain.setTargetAtTime(1.1*exposure*luff,wall,.09);
    }
    if(exposure<1)startAmbience('deep_rumble.mp3',submerged);
    submerged.gain.setTargetAtTime(.36*(1-exposure),lastMix,.35);
    weather.gain.setTargetAtTime(storm?exposure:0,lastMix,.20);
    filter.frequency.setTargetAtTime(180+Math.min(30,speed)*53,audio.currentTime,.4);
    wind.gain.setTargetAtTime(exposure*Math.min(.28,.009*speed),audio.currentTime,.35);
  }
  function startWaves(){
    const source=audio.createBufferSource();
    source.buffer=noise;source.loop=true;
    const gains=[['lowpass',520,.60],['bandpass',1420,.70],['bandpass',860,.65]].map(([type,frequency,q])=>{
      const band=audio.createBiquadFilter(),gain=audio.createGain();
      band.type=type;band.frequency.value=frequency;band.Q.value=q;
      gain.gain.value=0;
      source.connect(band).connect(gain).connect(effects);
      return gain;
    });
    source.start();
    return gains;
  }
  function water(surface,time,east,north,tide,height,includeWake){
    if(!enabled||!level)return;
    if(!surface||height<=-.35){silenceWaves();return;}
    const wall=audio.currentTime;
    if(time!==lastWaveTime){lastWaveTime=time;waveTimeWall=wall;}
    else if(wall-waveTimeWall>.3){silenceWaves();return;}
    if(wall-lastWaveMix<.07)return;
    lastWaveMix=wall;wavesActive=true;
    waves??=waveAmbience();
    const {swell,crest,wake}=waves.sample(surface,time,east,north,tide,includeWake);
    if(!waveGains&&swell+crest+wake<.002)return;
    waveGains??=startWaves();
    const exposure=Math.min(1,(height+.35)/.7)/(1+Math.max(0,height)/16);
    waveGains[0].gain.setTargetAtTime(swell*exposure,wall,.22);
    waveGains[1].gain.setTargetAtTime(crest*exposure,wall,.09);
    waveGains[2].gain.setTargetAtTime(wake*exposure,wall,.12);
  }
  function signal(){
    if(!enabled)return;const src=audio.createBufferSource(),gain=audio.createGain(),t=audio.currentTime;
    src.buffer=noise;gain.gain.setValueAtTime(.8,t);gain.gain.exponentialRampToValueAtTime(.0003,t+.52);
    src.connect(gain).connect(effects);src.onended=()=>{src.disconnect();gain.disconnect();};src.start();src.stop(t+.53);
  }
  function thunder(){
    if(!enabled)return;
    const src=audio.createBufferSource(),low=audio.createBiquadFilter(),gain=audio.createGain(),t=audio.currentTime;
    src.buffer=noise;src.loop=true;low.type='lowpass';
    low.frequency.setValueAtTime(210,t);low.frequency.exponentialRampToValueAtTime(57,t+2.6);
    gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(1.2,t+.10);
    gain.gain.exponentialRampToValueAtTime(.28,t+.6);gain.gain.linearRampToValueAtTime(.51,t+.95);
    gain.gain.exponentialRampToValueAtTime(.001,t+3.5);
    src.connect(low).connect(gain).connect(weather);src.onended=()=>{src.disconnect();low.disconnect();gain.disconnect();};
    src.start(t);src.stop(t+3.6);
  }
  function wildlife(kind,distance,pan,underwater,strength){
    if(!enabled||audio.state!=='running'||distance>240)return;
    if(kind==='gull'){
      const t=audio.currentTime,stereo=audio.createStereoPanner();stereo.pan.value=pan;stereo.connect(effects);
      for(const [i,delay] of [0,.24,.53].entries()){
        const osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter(),start=t+delay;
        osc.type='sawtooth';osc.frequency.setValueAtTime(1120-i*75,start);
        osc.frequency.exponentialRampToValueAtTime(1690-i*100,start+.045);osc.frequency.exponentialRampToValueAtTime(770,start+.20);
        filter.type='lowpass';filter.frequency.value=underwater?720:3650;
        gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.001,.19*strength/(1+distance/22)),start+.024);
        gain.gain.exponentialRampToValueAtTime(.0001,start+.21);
        osc.connect(filter).connect(gain).connect(stereo);osc.onended=()=>{osc.disconnect();gain.disconnect();filter.disconnect();if(i===2)stereo.disconnect();};
        osc.start(start);osc.stop(start+.22);
      }
      return;
    }
    const t=audio.currentTime,impact=kind==='impact',length=impact?2.35:1.05;
    const src=audio.createBufferSource(),band=audio.createBiquadFilter(),gain=audio.createGain(),stereo=audio.createStereoPanner();
    src.buffer=noise;src.loop=true;band.type=impact?'lowpass':'bandpass';
    const cutoff=(impact?1600:2300)*(underwater?.32:1);
    band.frequency.setValueAtTime(cutoff,t);band.frequency.exponentialRampToValueAtTime(cutoff*(impact?.16:.48),t+length);
    band.Q.value=impact?.68:.86;stereo.pan.value=pan;
    const peak=strength*(impact?1.65:.95)/(1+distance/18);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.001,peak),t+(impact?.055:.09));
    gain.gain.exponentialRampToValueAtTime(.0001,t+length);
    src.connect(band).connect(gain).connect(stereo).connect(effects);
    src.onended=()=>{for(const n of [src,band,gain,stereo])n.disconnect();};
    src.start(t);src.stop(t+length);
  }
  function motorSound(local,peers,camera,underwater,running){
    if(!enabled||(!engines&&!local&&!peers.length))return;
    engines??=inboardMixer(audio,effects,noise);
    engines(local,peers,camera,underwater,running);
  }
  return {get enabled(){return enabled;},get audible(){return enabled&&level>0;},
    setEnabled,update,water,signal,thunder,setVolume,wildlife,imagingHit,motorSound};
}
