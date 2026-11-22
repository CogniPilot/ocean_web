import {inboardMixer} from './inboard-audio.mjs';
import {showInLowWaterCapture} from './render-layers.mjs';

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
  let previous;
  return (label,time=0,sampleWind)=>{
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
  };
}
export function raceAudio(){
  let engines,audio,wind,filter,noise,rain,weather,enabled=false,lastMix=-Infinity;
  let submerged,surface,effects,luffGain,level=.15;
  function setVolume(value){
    level=value;
    if(effects)effects.gain.setTargetAtTime(level,audio.currentTime,.025);
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
      surface=audio.createGain();surface.gain.value=0;surface.connect(effects);
      const blower=audio.createBufferSource();blower.buffer=noise;blower.loop=true;
      filter=audio.createBiquadFilter();filter.type='lowpass';wind=audio.createGain();wind.gain.value=0;
      const rainfall=audio.createBufferSource(),rainFilter=audio.createBiquadFilter();
      rainfall.buffer=noise;rainfall.loop=true;rainfall.playbackRate.value=1.19;
      rainFilter.type="highpass";rainFilter.frequency.value=1350;
      weather=audio.createGain();weather.gain.value=0;rain=audio.createGain();rain.gain.value=.16;
      rainfall.connect(rainFilter).connect(rain).connect(weather).connect(effects);rainfall.start();
      blower.connect(filter).connect(wind).connect(effects);blower.start();
    }
    if(on)await audio.resume();else await audio.suspend();
    enabled=audio.state==='running';return enabled;
  }
  function luffing(amount,exposure){
    if(!luffGain&&amount>0&&exposure>0){
      const seconds=3.2,flap=audio.createBuffer(1,Math.round(seconds*audio.sampleRate),audio.sampleRate);
      const data=flap.getChannelData(0);
      let body=0,crackle=0;
      for(let i=0;i<data.length;i++){
        const phase=i/data.length*2*Math.PI;
        const hit=Math.max(0,Math.sin(19*phase+.75*Math.sin(4*phase)))**7;
        const flutter=.25+.75*(.5+.5*Math.sin(11*phase+Math.sin(3*phase)))**2;
        const white=2*Math.random()-1;
        body+=.074*(white-body);crackle+=.32*(white-crackle);
        data[i]=(body*2.8+.7*(white-crackle))*hit*flutter;
      }
      const source=audio.createBufferSource();
      source.buffer=flap;source.loop=true;
      const band=audio.createBiquadFilter();band.type='highpass';band.frequency.value=105;
      luffGain=audio.createGain();luffGain.gain.value=0;
      source.connect(band).connect(luffGain).connect(effects);
      source.start();
    }
    luffGain?.gain.setTargetAtTime(.82*exposure*amount,audio.currentTime,.10);
  }
  function update(speed,storm,height,seaState,luff=0){
    if(!enabled || audio.currentTime-lastMix<.05)return;
    lastMix=audio.currentTime;
    const exposure=Math.max(0,Math.min(1,(height+.35)/.7));
    luffing(luff,exposure);
    if(exposure<1)startAmbience('deep_rumble.mp3',submerged);
    const calm=1-Math.min(1,seaState/1.1);
    const surfaceLevel=storm?0:.44*exposure*calm/(1+Math.max(0,height)/16);
    if(surfaceLevel>0)startAmbience('calm-waves.mp3',surface);
    surface.gain.setTargetAtTime(surfaceLevel,lastMix,.45);
    submerged.gain.setTargetAtTime(.36*(1-exposure),lastMix,.35);
    weather.gain.setTargetAtTime(storm?exposure:0,lastMix,.20);
    filter.frequency.setTargetAtTime(180+Math.min(30,speed)*53,audio.currentTime,.4);
    wind.gain.setTargetAtTime(exposure*Math.min(.28,.009*speed),audio.currentTime,.35);
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
  return {get enabled(){return enabled;},setEnabled,update,signal,thunder,setVolume,wildlife,imagingHit,motorSound};
}
