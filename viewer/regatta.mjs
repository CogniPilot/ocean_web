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
  const boat=new T.Group();boat.position.set(race.get('committeeEast'),race.get('committeeNorth'),0);boat.rotation.z=race.get('windBearing')+Math.PI;group.add(boat);
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
    if(previous===label)return;previous=label;ctx.fillStyle='#101d23';ctx.fillRect(0,0,512,168);
    ctx.fillStyle='#ffbe52';ctx.font='bold 127px monospace';ctx.textAlign='center';ctx.fillText(label,256,127);texture.needsUpdate=true;
  };
}
export function raceAudio(){
  let audio,wind,filter,noise,enabled=false;
  async function toggle(){
    if(!audio){
      audio=new AudioContext();noise=audio.createBuffer(1,2*audio.sampleRate,audio.sampleRate);
      const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=2*Math.random()-1;
      const blower=audio.createBufferSource();blower.buffer=noise;blower.loop=true;
      filter=audio.createBiquadFilter();filter.type='lowpass';wind=audio.createGain();wind.gain.value=0;
      blower.connect(filter).connect(wind).connect(audio.destination);blower.start();
    }
    if(enabled)await audio.suspend();else await audio.resume();
    enabled=audio.state==='running';return enabled;
  }
  function update(speed){
    if(!enabled)return;
    filter.frequency.setTargetAtTime(180+Math.min(30,speed)*53,audio.currentTime,.4);
    wind.gain.setTargetAtTime(Math.min(.28,.009*speed),audio.currentTime,.35);
  }
  function signal(){
    if(!enabled)return;const src=audio.createBufferSource(),gain=audio.createGain(),t=audio.currentTime;
    src.buffer=noise;gain.gain.setValueAtTime(.8,t);gain.gain.exponentialRampToValueAtTime(.0003,t+.52);
    src.connect(gain).connect(audio.destination);src.onended=()=>{src.disconnect();gain.disconnect();};src.start();src.stop(t+.53);
  }
  return {toggle,update,signal};
}
