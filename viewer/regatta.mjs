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
  mesh(boat,new T.BoxGeometry(.96,.03,.73),orange,-.48,0,3.6);
  batchScenery(T,boat);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=168;
  const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);
  const board=mesh(boat,new T.BoxGeometry(.06,1.72,.56),new T.MeshBasicMaterial({map:texture}),-.82,0,1.9);
  board.rotation.z=Math.PI/2;
  function mark(x,y){
    const buoy=mesh(group,new T.ConeGeometry(.85,1.75,3,1),orange,x,y,.77);buoy.rotation.x=Math.PI/2;
    const collar=mesh(group,new T.CylinderGeometry(.76,.81,.14,3),navy,x,y,.04);collar.rotation.x=Math.PI/2;
  }
  mark(race.get('pinEast'),race.get('pinNorth'));
  race.get('markEast').forEach((x,i)=>mark(x,race.get('markNorth')[i]));
  let previous;
  return label=>{
    const [heave,roll,pitch]=race.get('launchPose');
    boat.position.z=heave;boat.rotation.x=roll;boat.rotation.y=-pitch;
    if(previous===label)return;previous=label;ctx.fillStyle='#101d23';ctx.fillRect(0,0,512,168);
    ctx.fillStyle='#ffbe52';ctx.font='bold 127px monospace';ctx.textAlign='center';ctx.fillText(label,256,127);texture.needsUpdate=true;
  };
}
export function raceAudio(){
  let audio,wind,filter,noise,rain,weather,enabled=false,lastMix=-Infinity;
  let submerged,surface,effects,level=.25;
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
  async function toggle(){
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
    if(enabled)await audio.suspend();else await audio.resume();
    enabled=audio.state==='running';return enabled;
  }
  function update(speed,storm,height,seaState){
    if(!enabled || audio.currentTime-lastMix<.05)return;
    lastMix=audio.currentTime;
    const exposure=Math.max(0,Math.min(1,(height+.35)/.7));
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
  return {toggle,update,signal,thunder,setVolume};
}
