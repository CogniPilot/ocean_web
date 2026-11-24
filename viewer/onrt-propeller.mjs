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
  const requested=new URLSearchParams(location.search).get('solver');
  const solver=requested==='openfoam'?'openfoam':'rumoca',lattice=solver==='rumoca';
  el('solver').value=solver;
  el('solver').onchange=e=>{const url=new URL(location.href);url.searchParams.set('solver',e.target.value);location.assign(url);};
  const base='./assets/onrt/'+(lattice?'blade-normal/':'propeller/');
  const version=new URL(import.meta.url).search;
  const [m,buf]=await Promise.all([fetch(base+'flow.json'+version).then(r=>r.json()),fetch(base+'flow.bin'+version).then(r=>r.arrayBuffer())]);
  // One physical scale for all three fields at this operating point.
  const speedScale=Math.PI*m.diameter_m*m.rpm/60,pressureScale=.5*m.rho_kg_m3*speedScale**2/1000;
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
  const paths=new T.LineSegments(traces,new T.LineBasicMaterial({color:0x157a75,transparent:true,opacity:.45}));
  scene.add(paths);
  // Each segment end has its own travel time from the integration of ds / |U|.
  // Keep tracers inside their own streamline when they return to the inlet.
  const times=field('travelSeconds'),ends=field('pathEnds',Uint32Array);
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
  const plane=new T.BufferGeometry(),n=m.samples,N=n*n;
  const vertices=new Float32Array(3*N),tints=new Float32Array(3*N),indices=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*n+i;vertices[3*k+1]=m.sliceHalfWidth*(2*i/(n-1)-1);vertices[3*k+2]=m.sliceHalfWidth*(2*j/(n-1)-1);
  }
  plane.setAttribute('position',new T.BufferAttribute(vertices,3));plane.setAttribute('color',new T.BufferAttribute(tints,3));
  const section=new T.Mesh(plane,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.86}));
  scene.add(section);const speeds=field('speed');
  function update(){
    particles.visible=el('tracers').checked;
    paths.visible=el('paths').checked;section.visible=el('cut').checked;el('section').hidden=!section.visible;
    const frame=+el('station').value;section.position.x=m.sliceOffsets[frame];el('x').value=section.position.x+' D';
    indices.length=0;
    for(let k=0;k<N;k++){
      const idx=frame*N+k;
      ramp(speeds[idx]/speedScale,[0x182952,0x289790,0xefc54a]).toArray(tints,k*3);
      if(k%n<n-1 && k<N-n && [idx,idx+1,idx+n,idx+n+1].every(i=>speeds[i]>=0))indices.push(k,k+1,k+n,k+1,k+n+1,k+n);
    }
    plane.setIndex(indices);plane.attributes.color.needsUpdate=true;
  }
  for(const id of ['station','paths','cut','tracers'])el(id).oninput=()=>{update();draw();};
  el('pressureLabel').textContent=lattice?'Grid pressure at blade surface':'Blade pressure relative to outlet';
  const method=lattice?'Rumoca · '+m.revolutions.toFixed(1)+' turns · '+m.cellsPerDiameter+' cells/D':'OpenFOAM · iteration '+m.iteration;
  el('metrics').innerText=method+' · '+m.cells.toLocaleString()+' cells'+'\n'+m.rpm+' rpm · J '+m.J.toFixed(2)+' · Kₜ '+m.kt.toFixed(3)+' · Kq '+m.kq.toFixed(3)+(m.J===.8?'\nIIHR port · Kₜ 0.351 · Kq 0.091':'')+(m.J===.8&&m.kt<0?'\nPredicted thrust reverses the measured direction':'');
  function ticks(id,values){for(const value of values){const s=document.createElement('span');s.textContent=value.toFixed(2);el(id).append(s);}}
  ticks('pressureTicks',[-pressureScale,0,pressureScale]);ticks('speedTicks',[0,.5*speedScale,speedScale]);
  const pan=new T.Vector3();
  let theta=-.72,phi=.29,radius=3.5;
  function draw(){

    camera.position.set(.25+radius*Math.cos(phi)*Math.cos(theta),radius*Math.cos(phi)*Math.sin(theta),radius*Math.sin(phi));
    camera.position.add(pan);camera.lookAt(.25+pan.x,pan.y,pan.z);renderer.render(scene,camera);
  }
  installOrbit(canvas,camera,pan,()=>radius,(dx,dy)=>{
    theta-=dx*.008;phi=Math.max(-1.52,Math.min(1.52,phi+dy*.008));
  },factor=>{radius=Math.min(10,Math.max(.65,radius*factor));},draw);
  el('recenter').onclick=()=>{pan.set(0,0,0);theta=-.72;phi=.29;radius=3.5;draw();};
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
  update();placeTracers(0);window.addEventListener('resize',resize);resize();playback();
}
load().catch(e=>{el('metrics').textContent='Could not load the flow field · '+e.message;});
