import {installShaftLoads} from './onrt-shaft-loads.mjs';
import {loadRecording} from './onrt-recording.mjs';
import {nativeMesh} from './onrt-mesh.mjs';
import {volumeGeometry} from './onrt-volume.mjs';
import {installOrbit} from './onrt-orbit.mjs';
const T=window.THREE, el=id=>document.getElementById(id);
const metadataCache=new Map();
const selection=new URLSearchParams(location.search).get('recording');
const steady=selection==='steady',startup=!steady && selection!=='reference';
function assetBase(solver,startup){
  if(steady && !startup && solver==='rumoca')return './assets/onrt/periodic-rumoca/';
  return './assets/onrt/'+(startup?'startup-'+solver:solver==='rumoca'?'blade-normal':'propeller')+'/';
}
function solverMetadata(solver,startup){
  const path=assetBase(solver,startup)+'flow.json'+new URL(import.meta.url).search;
  if(!metadataCache.has(path)) metadataCache.set(path,fetch(path).then(response=>{
    if(!response.ok)throw Error(path+' · HTTP '+response.status);
    return response.json();
  }));
  return metadataCache.get(path);
}
async function loadComparison(){
  const response=await fetch(new URL('./assets/onrt/open-water.json',import.meta.url));
  if(!response.ok)throw Error('Open-water comparison unavailable');
  const cases=await response.json(),menu=el('loadCase');
  for(const source of ['OpenFOAM','Rumoca']){
    const {J,kt,kq,computeDevice,solveWallSeconds}=await solverMetadata(source.toLowerCase(),true);
    if(source==='OpenFOAM' && computeDevice && solveWallSeconds>0)
      el('foamGpuFull').textContent=Math.round(solveWallSeconds)+' s';
    if(startup || steady){
      const result=steady ? await solverMetadata(source.toLowerCase(),false) : {J,kt,kq};
      const run=cases.find(c=>c.J===result.J);
      run[source]={KT:result.kt,KQ:result.kq,eta:result.J*result.kt/(2*Math.PI*result.kq)};
      run.fromRest=startup;
      run.periodic=steady;
    }
  }
  for(const run of cases)menu.add(new Option(run.J.toFixed(1),String(run.J)));
  const metrics=[['KT','Thrust Kₜ'],['KQ','Torque Kq'],['eta','Efficiency']];
  const sources=['OpenFOAM','Rumoca'];
  const error=(run,source,key)=>100*(run[source][key]-run.IIHR[key])/run.IIHR[key];
  const extent=10*Math.ceil(Math.max(...cases.flatMap(run=>metrics.flatMap(([key])=>
    sources.map(source=>Math.abs(error(run,source,key))))))/10);
  function show(){
    const run=cases[menu.selectedIndex],body=el('loads'),plot=el('errorPlot'),value=el('errorValue');
    el('loadBasis').textContent=run.periodic?'Rumoca loads are means over a repeating shaft revolution. OpenFOAM loads come from the steady rotating-frame solve.':run.fromRest?'Both computed loads are averages over the final shaft revolution of the startup recordings.':
      'Reference runs use steady OpenFOAM and the 16-cell/D Rumoca blade-normal model. The 3D view shows J = 0.8.';
    body.replaceChildren();plot.replaceChildren();
    value.textContent='Hover, tap or focus a bar for the values.';
    const axis=document.createElement('div');axis.className='error-axis';
    axis.innerHTML='<span></span><div><span>−'+extent+'%</span><span>0%</span><span>+'+extent+'%</span></div>';
    plot.append(axis);
    for(const [key,label] of metrics){
      const row=body.insertRow(),name=document.createElement('th');
      name.scope='row';name.textContent=label;row.append(name);
      for(const source of ['IIHR',...sources])row.insertCell().textContent=run[source][key].toFixed(3);
      const title=document.createElement('h4');title.textContent=label;plot.append(title);
      for(const source of sources){
        const delta=error(run,source,key),bar=document.createElement('button');
        const detail=label+' · '+source+' '+run[source][key].toFixed(4)+' · IIHR '+run.IIHR[key].toFixed(4)+
          ' · '+(delta>=0?'+':'')+delta.toFixed(1)+'%';
        bar.type='button';bar.className='error-series'+(source==='OpenFOAM'?' foam':'');
        bar.setAttribute('aria-label',detail);
        const track=document.createElement('span'),fill=document.createElement('i');
        track.className='bar-track';track.setAttribute('aria-hidden','true');
        fill.style.left=(50+Math.min(0,delta)*50/extent)+'%';fill.style.width=Math.abs(delta)*50/extent+'%';
        track.append(fill);bar.append(document.createTextNode(source),track);plot.append(bar);
        bar.onpointerenter=bar.onfocus=bar.onclick=()=>{value.textContent=detail;};
      }
    }
  }
  menu.onchange=show;
  show();
}
loadComparison().catch(error=>{el('loadComparison').querySelector('summary').textContent=error.message;});

async function readSolver(solver,startup){
  const lattice=solver==='rumoca';
  const base=assetBase(solver,startup);
  const version=new URL(import.meta.url).search;
  async function readAsset(file){
    const response=await fetch(base+file+version);
    if(!response.ok)throw Error(file+' · HTTP '+response.status);
    return response;
  }
  const m=await solverMetadata(solver,startup),seq=m.sequence;
  async function binary(file){
    if(!m.binaryCompression)return (await readAsset(file)).arrayBuffer();
    const response=await readAsset(file+'.gz');
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  const [buf,volumeBuffer,recording,loadBuffer]=await Promise.all([binary('flow.bin'),seq?null:binary('volume.bin'),loadRecording(m,binary),m.shaftLoadSamples?binary('shaft-loads.bin'):null]);
  const loads=loadBuffer?new Float32Array(loadBuffer):null;
  if(loads && loads.length!==4*m.shaftLoadSamples)throw Error('Incomplete shaft loads');
  return {m,buf,seq,volumeBuffer,recording,lattice,solver,loads};
}

// Interpolate unwrapped shaft turns, including the acceleration from rest.
function shaftTurns(data, time){
  const rows = data.loads;
  if(!rows) return null;
  let lo=0, hi=rows.length/4-1;
  while(hi-lo>1){
    const mid=(lo+hi)>>>1;
    if(rows[4*mid]<=time) lo=mid; else hi=mid;
  }
  const a=4*lo,b=4*hi;
  const fraction=Math.max(0,Math.min(1,(time-rows[a])/(rows[b]-rows[a])));
  return rows[a+3]+fraction*(rows[b+3]-rows[a+3]);
}

async function load(){
  const query=new URLSearchParams(location.search),requested=query.get('solver');
  const mode=['rumoca','openfoam'].includes(requested)?requested:'compare';
  const solvers=mode==='compare'?['rumoca','openfoam']:[mode];
  const finalTurn=query.get('recording')==='final-turn';
  el('recording').value=steady?'steady':finalTurn?'final-turn':startup?'startup':'reference';
  el('recording').onchange=e=>{const url=new URL(location.href);url.searchParams.set('recording',e.target.value);location.assign(url);};
  el('solver').value=mode;
  el('solver').onchange=e=>{const url=new URL(location.href);url.searchParams.set('solver',e.target.value);location.assign(url);};
  document.body.classList.toggle('compare',mode==='compare');
  const data=await Promise.all(solvers.map(solver=>readSolver(solver,startup)));
  if(data.length===2){
    const [a,b]=data.map(d=>d.m);
    if(a.J!==b.J||a.rpm!==b.rpm||a.diameter_m!==b.diameter_m||
      ['origin','dims','spacing'].some(key=>JSON.stringify(a.volumeGrid[key])!==JSON.stringify(b.volumeGrid[key])))
      throw Error('Comparison requires matched operating points and sample grids.');
  }
  const sharedKeys=Object.keys(data[0].m.volumeGrid.fields).filter(key=>data.every(d=>key in d.m.volumeGrid.fields));
  const scaleCases=await Promise.all(['rumoca','openfoam'].map(solver=>solverMetadata(solver,startup)));
  const speedScale=Math.max(...scaleCases.map(m=>m.volumeGrid.fields.velocity.colorLimit));
  if([...el('bladeRange').options].some(o=>o.value===query.get('pressureRange'))) el('bladeRange').value=query.get('pressureRange');
  const quantities={velocity:['Speed','m/s'],fluidPressure:['Flow pressure','kPa'],
    vorticity:['Vorticity magnitude','s⁻¹'],turbulenceK:['Modeled turbulence energy','m²/s²']};
  for(const key of sharedKeys)el('quantity').add(new Option(quantities[key][0],key));
  if(sharedKeys.includes(query.get('field')))el('quantity').value=query.get('field');
  const orbit={theta:-1.98,phi:.34,radius:5.7,pan:new T.Vector3()};
  const panes=[];
  function drawAll(){for(const pane of panes)pane.draw();}
  for(const solution of data)panes.push(createPane(solution));
  const sequence=data.filter(d=>d.recording).sort((a,b)=>a.recording.duration-b.recording.duration)[0],slider=el('phase'),animate=el('animate');
  const updateShaftLoads=installShaftLoads(el('shaftLoads'),data,scaleCases);
  const firstFrame=finalTurn ? sequence.recording.frameAt(sequence.recording.duration-60/sequence.m.rpm,false) : 0;
  const startOffset=sequence ? sequence.seq.frames[firstFrame].time-sequence.recording.start : 0;
  const playDuration=sequence ? sequence.recording.duration-startOffset : 0;
  let elapsed=startOffset,lastFrame,scheduled,selectedFrame;
  function paintTime(){
    const index=selectedFrame??sequence?.recording.frameAt(elapsed,!startup);
    const frame=sequence?.seq.frames[index];
    const time=selectedFrame!==undefined ? frame.time : sequence
      ? sequence.recording.start+elapsed%sequence.recording.duration : elapsed;
    const turns=sequence ? shaftTurns(sequence,time)??frame.turns : 0;
    updateShaftLoads(time);
    const angle=sequence ? -2*Math.PI*(turns-sequence.m.revolutions) : undefined;
    if(frame){
      slider.value=index;
      el('phaseLabel').value=(time*1000).toFixed(1)+' ms · '+Math.round(360*(turns-sequence.seq.frames[0].turns))+'°';
    }
    for(const [i,pane] of panes.entries()){
      const recording=data[i].recording;
      const sample=startup&&recording?recording.frameAt(frame.time-recording.start,false):index;
      const nativeTurns=data[i]===sequence ? turns : shaftTurns(data[i],time);
      const rotorAngle=recording && nativeTurns!=null ? -2*Math.PI*(nativeTurns-data[i].m.revolutions) : angle;
      pane.time(elapsed,sample,rotorAngle);
    }
    drawAll();
  }
  let meshRequest=0;
  async function changeMesh(){
    const request=++meshRequest,enabled=el('showMesh').checked;
    el('meshOptions').hidden=!enabled;
    el('meshStatus').textContent=enabled?'Loading native mesh…':'';
    try{
      await Promise.all(panes.map(p=>p.mesh.select(enabled?el('meshMode').value:null)));
      if(request===meshRequest)el('meshStatus').textContent='';
    }catch(error){
      if(request===meshRequest)el('meshStatus').textContent=error.message;
    }
    drawAll();
  }
  el('showMesh').onchange=changeMesh;el('meshMode').onchange=changeMesh;
  let fieldRequest=0;
  async function fieldChanged(){
    const request=++fieldRequest;
    const key=el('quantity').value;
    const available=scaleCases.filter(m=>key in m.volumeGrid.fields);
    const descriptors=available.map(m=>m.volumeGrid.fields[key]);
    await Promise.all(data.map(d=>d.recording?.ensureField(key)));
    if(request!==fieldRequest)return;
    const limits=available.flatMap((m,i)=>m.sequence?m.sequence.fields[key]:[descriptors[i]]);
    const slider=el('threshold');
    slider.min=Math.min(...limits.map(d=>d.min));slider.max=Math.max(...limits.map(d=>d.max));
    slider.step=(slider.max-slider.min)/2000||'any';slider.value=descriptors[0].initial;
    const limit=key==='fluidPressure'?Number(el('bladeRange').value):Math.max(...descriptors.map(d=>d.colorLimit));
    for(const pane of panes)pane.selectField(key,limit);
    el('fieldTicks').replaceChildren();ticks('fieldTicks',key==='fluidPressure'?[-limit,0,limit]:[0,limit/2,limit]);
    el('fieldScale').style.background=key==='fluidPressure'?'linear-gradient(90deg,#204477,#e5ebd8,#b33220)':'linear-gradient(90deg,#4485ad,#289790,#efc54a)';
    el('fieldUnit').textContent=quantities[key][1];
    el('fieldNote').textContent=({velocity:'Magnitude of the tank-frame velocity.',fluidPressure:'Rumoca reports lattice pressure perturbation. OpenFOAM reports gauge pressure relative to the outlet.',vorticity:'Magnitude of the curl of velocity.',turbulenceK:'Turbulent kinetic energy from the k–ω SST model.'})[key];
    paintTime();
  }
  el('quantity').oninput=()=>{const url=new URL(location.href);url.searchParams.set('field',el('quantity').value);history.replaceState(null,'',url);fieldChanged().catch(e=>{el('fieldNote').textContent=e.message;});};
  for(const id of ['threshold','volumeMode'])el(id).oninput=()=>{for(const p of panes)p.volume();drawAll();};
  for(const id of ['station','paths','cut','tracers','bladePressure'])el(id).oninput=()=>{for(const p of panes)p.update();drawAll();};
  el('pressureLabel').textContent=mode==='rumoca'?'Grid pressure at blade surface':'Blade surface pressure';
  el('phaseControl').hidden=!sequence;el('spinControl').hidden=!!sequence||steady;
  if(steady)el('spin').checked=false;
  if(sequence){slider.min=firstFrame;slider.max=sequence.seq.frames.length-1;}
  el('fieldClock').textContent=steady?'Matched blade angle at 538 rpm. Rumoca shows one phase of the repeating wake. OpenFOAM shows the steady rotating-frame solution. Velocity is displayed in the tank frame.':finalTurn?'Final shaft revolution at full speed, sampled in the tank frame.':startup?'Tank-frame solver output. Shaft and inflow ramp together from rest. Side by side plays the time range both solvers recorded.':mode==='compare'?'Rumoca replays a recorded revolution. The OpenFOAM field is steady; the blade follows the displayed shaft angle.':sequence?'Recorded Rumoca flow · one shaft revolution.':'Steady OpenFOAM field · tracers follow the streamlines.';
  el('metrics').textContent=data[0].m.rpm+' rpm · J '+data[0].m.J.toFixed(2)+' · port propeller';
  el('bladeRange').onchange=()=>{
    const scale=Number(el('bladeRange').value);
    el('pressureTicks').replaceChildren();ticks('pressureTicks',[-scale,0,scale]);
    const url=new URL(location.href);
    url.searchParams.set('pressureRange',el('bladeRange').value);history.replaceState(null,'',url);
    for(const p of panes)p.colorBlade();
    if(el('quantity').value==='fluidPressure' && el('fieldUnit').textContent==='kPa'){
      for(const p of panes)p.selectField('fluidPressure',scale);
      el('fieldTicks').replaceChildren();ticks('fieldTicks',[-scale,0,scale]);
    }
    drawAll();
  };
  const pressureLimit=Number(el('bladeRange').value);
  ticks('pressureTicks',[-pressureLimit,0,pressureLimit]);ticks('speedTicks',[0,.5*speedScale,speedScale]);
  function ticks(id,values){for(const v of values){const t=document.createElement('span');t.textContent=Number(v.toPrecision(3));el(id).append(t);}}
  el('recenter').onclick=()=>{orbit.pan.set(0,0,0);Object.assign(orbit,{theta:-1.98,phi:.34,radius:5.7});drawAll();};
  function tick(now){if(lastFrame!==undefined)elapsed+=(now-lastFrame)*.001*Number(el('rate').value);
    lastFrame=now;
    if(startup && sequence) elapsed=startOffset+(elapsed-startOffset)%playDuration;
    paintTime();scheduled=requestAnimationFrame(tick);}
  function playback(){
    cancelAnimationFrame(scheduled);lastFrame=undefined;
    if(animate.checked&&!document.hidden){
      selectedFrame=undefined;
      scheduled=requestAnimationFrame(tick);
    }
  }
  slider.oninput=()=>{
    animate.checked=false;playback();selectedFrame=Number(slider.value);
    elapsed=sequence.seq.frames[selectedFrame].time-sequence.recording.start;
    paintTime();
  };
  el('spin').onchange=paintTime;animate.checked=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  animate.onchange=playback;document.addEventListener('visibilitychange',playback);
  function resize(){for(const pane of panes)pane.resize();drawAll();}
  await fieldChanged();
  const layoutObserver=new ResizeObserver(resize);
  layoutObserver.observe(el('flowViews'));
  resize();playback();
  function createPane({m,buf,seq,volumeBuffer,recording,lattice,solver}){
    const panel=document.createElement('section'),caption=document.createElement('div'),canvas=document.createElement('canvas');
    panel.className='flow-pane';canvas.tabIndex=0;canvas.setAttribute('aria-label',solver+' propeller flow');
    caption.className='pane-caption';
    const title=document.createElement('strong');title.textContent=lattice?'Rumoca':'OpenFOAM';caption.append(title);
    caption.append((m.periodicInitialization?'Periodic lattice · blade-normal slip':lattice?'Transient lattice · blade-normal slip':startup?'Transient RANS · no-slip wall':'Steady RANS · no-slip wall')+' · '+m.cells.toLocaleString()+' cells · '+(startup?'final-revolution ':'')+'Kₜ '+m.kt.toFixed(3)+' · Kq '+m.kq.toFixed(3)+(m.kt<0?' · reversed thrust':''));
    if(m.computeDevice) caption.append(' · '+m.computeDevice.replace('NVIDIA GeForce ','')+(lattice?' lattice':' velocity & turbulence'));
    const clock=document.createElement('span');clock.className='pane-clock';caption.append(clock);
    if(m.periodicInitialization)clock.textContent='One-turn lattice residual '+(100*m.periodicInitialization.populationResidual).toFixed(2)+'%';
    panel.append(canvas,caption);el('flowViews').append(panel);

    const field=(name,type=Float32Array)=>new type(buf,...m.arrays[name]);
    const renderer=new T.WebGLRenderer({canvas,antialias:true});
    renderer.setPixelRatio(Math.min(2,devicePixelRatio));
    const scene=new T.Scene();scene.background=new T.Color(0x071d27);
    const mesh=nativeMesh(T,scene,m,startup);
    const camera=new T.PerspectiveCamera(36,1,.01,40);camera.up.set(0,0,1);
    function ramp(v,stops){
      const t=Math.max(0,Math.min(1,v))*2,i=Math.min(1,Math.floor(t));
      return new T.Color(stops[i]).lerp(new T.Color(stops[i+1]),t-i);
    }
    const blade=new T.BufferGeometry(),pressure=field('pressure');
    blade.setAttribute('position',new T.BufferAttribute(field('blade'),3));
    blade.setIndex(new T.BufferAttribute(field('indices',Uint32Array),1));
    const colors=new Float32Array(pressure.length*3);
    let bladeValues=pressure;
    blade.setAttribute('color',new T.BufferAttribute(colors,3));
    const rotor=new T.Mesh(blade,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide}));
    scene.add(rotor);
    // The port shaft turns about -X with the hub at the origin in all three exports.
    const shaftOmega=-2*Math.PI*m.rpm/60;
    const segments=field('lines');
    const traces=new T.BufferGeometry();traces.setAttribute('position',new T.BufferAttribute(segments,3));
    const needed=seq?6*seq.paths*(seq.verticesPerPath-1):segments.length;
    if(seq)traces.setAttribute('position',new T.BufferAttribute(new Float32Array(needed),3));
    const pathColors=new Float32Array(needed),travel=field('travelSeconds'),pathEnds=field('pathEnds',Uint32Array);
    let nextPath=0,previousTime=0;
    for(let i=0;!seq && i<travel.length;i++){
      const j=6*i,length=Math.hypot(segments[j+3]-segments[j],segments[j+4]-segments[j+1],segments[j+5]-segments[j+2]);
      const speed=length*m.diameter_m/(travel[i]-previousTime);
      const color=ramp(speed/speedScale,[0x4485ad,0x289790,0xefc54a]);
      color.toArray(pathColors,j);color.toArray(pathColors,j+3);
      previousTime=travel[i];
      if(i+1===pathEnds[nextPath]){nextPath++;previousTime=0;}
    }
    traces.setAttribute('color',new T.BufferAttribute(pathColors,3));
    const paths=new T.LineSegments(traces,new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8}));
    scene.add(paths);
    // Each segment end has its own travel time from the integration of ds / |U|.
    // Keep tracers inside their own streamline when they return to the inlet.
    const times=travel,ends=pathEnds;
    const dotsPerPath=4,positions=new Float32Array((seq?.tracers??ends.length*dotsPerPath)*3);
    const particleGeometry=new T.BufferGeometry(),particlePositions=new T.BufferAttribute(positions,3);
    particlePositions.setUsage(T.DynamicDrawUsage);
    particleGeometry.setAttribute('position',particlePositions);
    const particles=new T.Points(particleGeometry,new T.PointsMaterial({color:0xa9deed,size:.019}));
    particles.frustumCulled=false;scene.add(particles);
    function placeTracers(seconds){
      let first=0,offset=0;
      for(let path=0;path<ends.length;path++){
        const end=ends[path],duration=times[end-1];
        for(let dot=0;dot<dotsPerPath;dot++){
          const t=(seconds+duration*(dot/dotsPerPath+(path*.618)%1))%duration;
          let lo=first,hi=end-1;
          while(lo<hi){
            const mid=(lo+hi)>>>1;
            if(times[mid]<t)lo=mid+1;else hi=mid;
          }
          const startTime=lo===first?0:times[lo-1],mix=(t-startTime)/(times[lo]-startTime);
          for(let axis=0;axis<3;axis++){
            const i=lo*6+axis;
            positions[offset++]=segments[i]+mix*(segments[i+3]-segments[i]);
          }
        }
        first=end;
      }
      particlePositions.needsUpdate=true;
    }
    const grid=m.volumeGrid,count=grid.dims.reduce((a,b)=>a*b);
    const colorStops=[0x4485ad,0x289790,0xefc54a],pressureStops=[0x204477,0xe5ebd8,0xb33220];
    const iso=new T.Mesh(new T.BufferGeometry(),new T.MeshPhongMaterial({side:T.DoubleSide,transparent:true,opacity:.43,depthWrite:false}));
    const cloud=new T.Points(new T.BufferGeometry(),new T.PointsMaterial({size:.028,vertexColors:true,transparent:true,opacity:.70,depthWrite:false}));
    scene.add(iso,cloud,new T.HemisphereLight(0xffffff,0x83969f,1.5));
    const light=new T.DirectionalLight(0xffffff,1.4);light.position.set(1,-2,3);scene.add(light);
    let scalar=new Float32Array(count),descriptor,colorLimit,pressureField=false,frameIndex=-1;
    const geometries=new Map();
    let cacheBytes=0;
    function clearVolumeCache(){
      for(const g of geometries.values())g.dispose();
      geometries.clear();cacheBytes=0;
    }
    const color=new T.Color(),sequential=colorStops.map(v=>new T.Color(v)),diverging=pressureStops.map(v=>new T.Color(v));
    function tint(value){
      const stops=pressureField?diverging:sequential;
      const fraction=pressureField ? .5+.5*value/colorLimit : value/colorLimit;
      const t=2*Math.max(0,Math.min(1,fraction)),i=Math.min(1,Math.floor(t));
      return color.copy(stops[i]).lerp(stops[i+1],t-i);
    }
    function updateVolume(){
      const threshold=Number(el('threshold').value),mode=el('volumeMode').value;
      iso.visible=mode==='surface';cloud.visible=mode==='samples';
      el('thresholdPanel').hidden=mode==='off';
      el('level').textContent=threshold.toPrecision(3)+' '+quantities[fieldKey][1];
      if(!iso.visible&&!cloud.visible){panel.classList.remove('empty');return;}
      const object=iso.visible?iso:cloud;
      let g=geometries.get(frameIndex);
      if(!g){
        g=volumeGeometry(T,grid,scalar,threshold,cloud.visible,tint);
        const bytes=Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0);
        if(cacheBytes+bytes>64*1024*1024)clearVolumeCache();
        geometries.set(frameIndex,g);cacheBytes+=bytes;
      }
      object.geometry=g;
      if(iso.visible)iso.material.color.copy(tint(threshold));
      panel.classList.toggle('empty',!object.geometry.attributes.position.count);
    }
    let fieldKey;
    function selectField(key,limit){
      fieldKey=key;
      colorLimit=limit;
      pressureField=key==='fluidPressure';
      descriptor=grid.fields[key];
      clearVolumeCache();
      if(recording)recording.decode(key,Math.max(0,frameIndex),scalar);
      else{
        const packed=new Uint16Array(volumeBuffer,descriptor.offset,count);
        scalar=Float32Array.from(packed,v=>v===0?NaN:descriptor.min+(v-1)*descriptor.step);
      }
      updateVolume();
    }
    const [nx,ny,nz]=grid.dims;
    const plane=new T.BufferGeometry(),vertices=new Float32Array(3*ny*nz),tints=new Float32Array(vertices.length);
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){
      const i=3*(z*ny+y);vertices[i+1]=grid.origin[1]+y*grid.spacing;vertices[i+2]=grid.origin[2]+z*grid.spacing;
    }
    plane.setAttribute('position',new T.BufferAttribute(vertices,3));plane.setAttribute('color',new T.BufferAttribute(tints,3));
    const section=new T.Mesh(plane,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.86}));
    scene.add(section);el('station').max=nx-1;el('station').value=Math.round((.5-grid.origin[0])/grid.spacing);
    function update(){
      particles.visible=el('tracers').checked;paths.visible=el('paths').checked;
      section.visible=el('cut').checked;el('section').hidden=!section.visible;
      if(rotor.material.vertexColors!==el('bladePressure').checked){
        rotor.material.vertexColors=el('bladePressure').checked;rotor.material.needsUpdate=true;
      }
      rotor.material.color.set(rotor.material.vertexColors?0xffffff:0x6b787d);
      if(!section.visible)return;
      const x=Number(el('station').value),indices=[];
      section.position.x=grid.origin[0]+x*grid.spacing;el('x').value=section.position.x.toFixed(2)+' D';
      for(let k=0;k<ny*nz;k++){
        const i=x+k*nx;
        if(!Number.isFinite(scalar[i]))continue;
        tint(scalar[i]).toArray(tints,3*k);
        if(k%ny<ny-1 && k<ny*(nz-1) && [1,ny,ny+1].every(s=>Number.isFinite(scalar[i+s*nx])))
          indices.push(k,k+1,k+ny,k+1,k+ny+1,k+ny);
      }
      plane.setIndex(indices);plane.attributes.color.needsUpdate=true;
    }
    function draw(){

      const {theta,phi,radius,pan}=orbit;
      camera.position.set(.82+radius*Math.cos(phi)*Math.cos(theta),radius*Math.cos(phi)*Math.sin(theta),radius*Math.sin(phi));
      camera.position.add(pan);camera.lookAt(.82+pan.x,pan.y,pan.z);renderer.render(scene,camera);
    }
    installOrbit(canvas,camera,orbit.pan,()=>orbit.radius,(dx,dy)=>{
      orbit.theta+=dx*.008;orbit.phi=Math.max(-1.52,Math.min(1.52,orbit.phi+dy*.008));
    },factor=>{orbit.radius=Math.min(10,Math.max(.65,orbit.radius*factor));},drawAll);
    const palette=(stops)=>Array.from({length:256},(_,i)=>ramp(i/255,stops));
    const speedPalette=palette(colorStops),bladePalette=palette(pressureStops);
    const lookup=(v)=>Math.min(255,Math.max(0,Math.round(v*255)));
    function colorBlade(){
      const limit=Number(el('bladeRange').value);
      bladeValues.forEach((p,i)=>bladePalette[lookup(.5+.5*p/limit)].toArray(colors,3*i));
      blade.attributes.color.needsUpdate=true;
    }
    colorBlade();
    function showFrame(index){
      if(!fieldKey || index===frameIndex)return;
      frameIndex=index;
      const {pressure,tracer,lines}=recording.geometryAt(index);
      recording.decode(fieldKey,index,scalar);

      bladeValues=pressure; colorBlade();
      positions.set(tracer);particlePositions.needsUpdate=true;
      const xyz=traces.attributes.position.array;
      let n=0;
      for(let path=0;path<seq.paths;path++)for(let j=1;j<seq.verticesPerPath;j++){
        const end=(path*seq.verticesPerPath+j)*4;
        if(!lines[end+3]||!lines[end-1])break;
        for(const i of [end-4,end]){
          xyz[n]=lines[i]/8192;xyz[n+1]=lines[i+1]/8192;xyz[n+2]=lines[i+2]/8192;
          speedPalette[lookup(.001*lines[i+3]/speedScale)].toArray(pathColors,n);n+=3;
        }
      }
      traces.setDrawRange(0,n/3);traces.attributes.position.needsUpdate=true;traces.attributes.color.needsUpdate=true;
      paths.frustumCulled=false;
      updateVolume();update();
    }
    return {mesh,draw,update,colorBlade,selectField(key,limit){selectField(key,limit);update();},
      volume(){clearVolumeCache();updateVolume();},
      time(seconds,index,angle){
        if(recording){
          clock.textContent=seq.frames[index].time.toFixed(3)+' s';
          rotor.rotation.x=angle??(-2*Math.PI*(seq.frames[index].turns-m.revolutions));
          mesh.setAngle(rotor.rotation.x-2*Math.PI*m.revolutions);
          showFrame(index);return;
        }
        rotor.rotation.x=angle??(el('spin').checked?shaftOmega*seconds:0);
        if(particles.visible)placeTracers(seconds);
      },
      resize(){const width=canvas.clientWidth,height=canvas.clientHeight;
        renderer.setSize(width,height,false);camera.aspect=width/Math.max(1,height);
        camera.fov=2*Math.atan(Math.tan(Math.PI/10)/Math.min(1,camera.aspect))*180/Math.PI;camera.updateProjectionMatrix();}
    };
  }
}
load().catch(e=>{el('metrics').textContent='Could not load the flow field · '+e.message;});
