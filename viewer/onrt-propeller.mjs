import {volumeGeometry} from './onrt-volume.mjs';
import {installOrbit} from './onrt-orbit.mjs';
const T=window.THREE, el=id=>document.getElementById(id);
async function loadComparison(){
  const response=await fetch(new URL('./assets/onrt/open-water.json',import.meta.url));
  if(!response.ok)throw Error('Open-water comparison unavailable');
  const cases=await response.json(),menu=el('loadCase');
  for(const run of cases)menu.add(new Option(run.J.toFixed(1),String(run.J)));
  function show(){
    const run=cases[menu.selectedIndex],body=el('loads');
    body.replaceChildren();
    for(const [key,label] of [['KT','Thrust Kₜ'],['KQ','Torque Kq'],['eta','Efficiency']]){
      const row=body.insertRow(),name=document.createElement('th');
      name.scope='row';name.textContent=label;row.append(name);
      for(const source of ['IIHR','OpenFOAM','Rumoca'])row.insertCell().textContent=run[source][key].toFixed(3);
    }
  }
  menu.onchange=show;
  show();
}
loadComparison().catch(error=>{el('loadComparison').querySelector('summary').textContent=error.message;});

async function load(){
  const query=new URLSearchParams(location.search),requested=query.get('solver');
  const solver=requested==='openfoam'?'openfoam':'rumoca',lattice=solver==='rumoca';
  el('solver').value=solver;
  el('solver').onchange=e=>{const url=new URL(location.href);url.searchParams.set('solver',e.target.value);location.assign(url);};
  const base='./assets/onrt/'+(lattice?'blade-normal/':'propeller/');
  const version=new URL(import.meta.url).search;
  const [m,buf,volumeBuffer]=await Promise.all([fetch(base+'flow.json'+version).then(r=>r.json()),fetch(base+'flow.bin'+version).then(r=>r.arrayBuffer()),fetch(base+'volume.bin'+version).then(r=>r.arrayBuffer())]);
  // Clip legend limits at the saved 99th percentiles to preserve contrast.
  const speedScale=m.speedLimit,pressureScale=m.pressureLimit;
  const field=(name,type=Float32Array)=>new type(buf,...m.arrays[name]);
  const canvas=document.querySelector('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(2,devicePixelRatio));
  const scene=new T.Scene();scene.background=new T.Color(0xe3eceb);
  const camera=new T.PerspectiveCamera(36,1,.01,40);camera.up.set(0,0,1);
  function ramp(v,stops){
    const t=Math.max(0,Math.min(1,v))*2,i=Math.min(1,Math.floor(t));
    return new T.Color(stops[i]).lerp(new T.Color(stops[i+1]),t-i);
  }
  const blade=new T.BufferGeometry(),pressure=field('pressure');
  blade.setAttribute('position',new T.BufferAttribute(field('blade'),3));
  blade.setIndex(new T.BufferAttribute(field('indices',Uint32Array),1));
  const colors=new Float32Array(pressure.length*3);
  pressure.forEach((p,i)=>ramp(.5+.5*p/pressureScale,[0x204477,0xe5ebd8,0xb33220]).toArray(colors,3*i));
  blade.setAttribute('color',new T.BufferAttribute(colors,3));
  const rotor=new T.Mesh(blade,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide}));
  scene.add(rotor);
  // The port shaft turns about -X with the hub at the origin in all three exports.
  const shaftOmega=-2*Math.PI*m.rpm/60;
  const segments=field('lines');
  const traces=new T.BufferGeometry();traces.setAttribute('position',new T.BufferAttribute(segments,3));
  const pathColors=new Float32Array(segments.length),travel=field('travelSeconds'),pathEnds=field('pathEnds',Uint32Array);
  let nextPath=0,previousTime=0;
  for(let i=0;i<travel.length;i++){
    const j=6*i,length=Math.hypot(segments[j+3]-segments[j],segments[j+4]-segments[j+1],segments[j+5]-segments[j+2]);
    const speed=length*m.diameter_m/(travel[i]-previousTime);
    const color=ramp(speed/speedScale,[0x182952,0x289790,0xefc54a]);
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
  const dotsPerPath=4,positions=new Float32Array(ends.length*dotsPerPath*3);
  const particleGeometry=new T.BufferGeometry(),particlePositions=new T.BufferAttribute(positions,3);
  particlePositions.setUsage(T.DynamicDrawUsage);
  particleGeometry.setAttribute('position',particlePositions);
  const particles=new T.Points(particleGeometry,new T.PointsMaterial({color:0x163d50,size:.019}));
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
  const quantities={velocity:['Speed','m/s'],fluidPressure:['Flow pressure','kPa'],
    vorticity:['Vorticity magnitude','s⁻¹'],turbulenceK:['Modeled turbulence energy','m²/s²']};
  for(const key of Object.keys(grid.fields))el('quantity').add(new Option(quantities[key][0],key));
  if(Object.hasOwn(grid.fields,query.get('field')))el('quantity').value=query.get('field');
  const colorStops=[0x182952,0x289790,0xefc54a],pressureStops=[0x204477,0xe5ebd8,0xb33220];
  const iso=new T.Mesh(new T.BufferGeometry(),new T.MeshPhongMaterial({side:T.DoubleSide,transparent:true,opacity:.43,depthWrite:false}));
  const cloud=new T.Points(new T.BufferGeometry(),new T.PointsMaterial({size:.028,vertexColors:true,transparent:true,opacity:.70,depthWrite:false}));
  scene.add(iso,cloud,new T.HemisphereLight(0xffffff,0x83969f,1.5));
  const light=new T.DirectionalLight(0xffffff,1.4);light.position.set(1,-2,3);scene.add(light);
  let scalar,descriptor,pressureField=false;
  const color=new T.Color(),sequential=colorStops.map(v=>new T.Color(v)),diverging=pressureStops.map(v=>new T.Color(v));
  function tint(value){
    const stops=pressureField?diverging:sequential;
    const fraction=pressureField ? .5+.5*value/descriptor.colorLimit : value/descriptor.colorLimit;
    const t=2*Math.max(0,Math.min(1,fraction)),i=Math.min(1,Math.floor(t));
    return color.copy(stops[i]).lerp(stops[i+1],t-i);
  }
  function updateVolume(){
    const threshold=Number(el('threshold').value),mode=el('volumeMode').value;
    iso.visible=mode==='surface';cloud.visible=mode==='samples';
    el('thresholdPanel').hidden=mode==='off';
    el('level').textContent=threshold.toPrecision(3)+' '+quantities[el('quantity').value][1];
    if(!iso.visible&&!cloud.visible)return;
    const object=iso.visible?iso:cloud;
    object.geometry.dispose();
    object.geometry=volumeGeometry(T,grid,scalar,threshold,cloud.visible,tint);
    if(iso.visible)iso.material.color.copy(tint(threshold));
    el('emptyField').hidden=object.geometry.attributes.position.count>0;
  }
  function selectField(){
    const key=el('quantity').value;
    pressureField=key==='fluidPressure';
    descriptor=grid.fields[key];
    const packed=new Uint16Array(volumeBuffer,descriptor.offset,count);
    scalar=Float32Array.from(packed,v=>v===0?NaN:descriptor.min+(v-1)*descriptor.step);
    const slider=el('threshold');
    slider.min=descriptor.min;slider.max=descriptor.max;slider.step=(descriptor.max-descriptor.min)/2000;
    slider.value=descriptor.initial;
    el('fieldTicks').replaceChildren();
    const limit=descriptor.colorLimit;
    ticks('fieldTicks',key==='fluidPressure'?[-limit,0,limit]:[0,limit/2,limit]);
    el('fieldScale').style.background=key==='fluidPressure'?'linear-gradient(90deg,#204477,#e5ebd8,#b33220)':'linear-gradient(90deg,#182952,#289790,#efc54a)';
    el('fieldUnit').textContent=quantities[key][1];
    const notes={velocity:'Magnitude of the tank-frame velocity.',fluidPressure:lattice?'Lattice pressure perturbation.':'Gauge pressure relative to the outlet.',
      vorticity:'Magnitude of the curl of velocity. Swirl can also occur in laminar flow.',
      turbulenceK:'Turbulent kinetic energy from the steady k–ω SST model. Transition location is unresolved.'};
    el('fieldNote').textContent=notes[key];
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
    rotor.material.vertexColors=el('bladePressure').checked;rotor.material.needsUpdate=true;
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
  for(const id of ['station','paths','cut','tracers','bladePressure'])el(id).oninput=()=>{update();draw();};
  el('quantity').oninput=()=>{
    const url=new URL(location.href);url.searchParams.set('field',el('quantity').value);
    history.replaceState(null,'',url);selectField();update();draw();
  };
  for(const id of ['threshold','volumeMode'])el(id).oninput=()=>{updateVolume();draw();};
  el('pressureLabel').textContent=lattice?'Grid pressure at blade surface':'Blade pressure relative to outlet';
  const method=lattice?'Rumoca · '+m.revolutions.toFixed(1)+' turns · '+m.cellsPerDiameter+' cells/D':'OpenFOAM · iteration '+m.iteration;
  el('metrics').innerText=method+' · '+m.cells.toLocaleString()+' cells'+'\n'+m.rpm+' rpm · J '+m.J.toFixed(2)+' · Kₜ '+m.kt.toFixed(3)+' · Kq '+m.kq.toFixed(3)+(m.J===.8?'\nIIHR port · Kₜ 0.351 · Kq 0.091':'')+(m.J===.8&&m.kt<0?'\nPredicted thrust reverses the measured direction':'');
  function ticks(id,values){for(const value of values){const s=document.createElement('span');s.textContent=value===0?'0':Number(value.toPrecision(3)).toString();el(id).append(s);}}
  ticks('pressureTicks',[-pressureScale,0,pressureScale]);ticks('speedTicks',[0,.5*speedScale,speedScale]);
  const pan=new T.Vector3();
  let theta=-1.98,phi=.34,radius=5.7;
  function draw(){

    camera.position.set(.82+radius*Math.cos(phi)*Math.cos(theta),radius*Math.cos(phi)*Math.sin(theta),radius*Math.sin(phi));
    camera.position.add(pan);camera.lookAt(.82+pan.x,pan.y,pan.z);renderer.render(scene,camera);
  }
  installOrbit(canvas,camera,pan,()=>radius,(dx,dy)=>{
    theta-=dx*.008;phi=Math.max(-1.52,Math.min(1.52,phi+dy*.008));
  },factor=>{radius=Math.min(10,Math.max(.65,radius*factor));},draw);
  el('recenter').onclick=()=>{pan.set(0,0,0);theta=-1.98;phi=.34;radius=5.7;draw();};
  const animate=el('animate'),rate=el('rate');
  animate.checked=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let elapsed=0,lastFrame,scheduled;
  function tick(now){
    scheduled=undefined;
    if(lastFrame!==undefined)elapsed+=(now-lastFrame)*.001*Number(rate.value);
    lastFrame=now;
    rotor.rotation.x=el('spin').checked?(shaftOmega*elapsed)%(2*Math.PI):0;
    if(particles.visible)placeTracers(elapsed);
    draw();
    scheduled=requestAnimationFrame(tick);
  }
  function playback(){
    cancelAnimationFrame(scheduled);lastFrame=undefined;
    if(animate.checked&&!document.hidden)scheduled=requestAnimationFrame(tick);
  }
  el('spin').onchange=()=>{
    rotor.rotation.x=el('spin').checked?(shaftOmega*elapsed)%(2*Math.PI):0;
    draw();
  };
  animate.onchange=playback;document.addEventListener('visibilitychange',playback);
  function resize(){
    renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;
    camera.updateProjectionMatrix();draw();
  }
  selectField();update();placeTracers(0);window.addEventListener('resize',resize);resize();playback();
}
load().catch(e=>{el('metrics').textContent='Could not load the flow field · '+e.message;});
