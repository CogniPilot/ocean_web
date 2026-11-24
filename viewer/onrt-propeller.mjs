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
  const solver=['volume','openfoam'].includes(requested)?requested:'rumoca',lattice=solver!=='openfoam';
  el('solver').value=solver;
  el('solver').onchange=e=>{const url=new URL(location.href);url.searchParams.set('solver',e.target.value);location.assign(url);};
  const base='./assets/onrt/'+({rumoca:'blade-normal/',volume:'lattice/',openfoam:'propeller/'}[solver]);
  const [m,buf]=await Promise.all([fetch(base+'flow.json').then(r=>r.json()),fetch(base+'flow.bin').then(r=>r.arrayBuffer())]);
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
  scene.add(new T.Mesh(blade,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide})));
  const traces=new T.BufferGeometry();traces.setAttribute('position',new T.BufferAttribute(field('lines'),3));
  const paths=new T.LineSegments(traces,new T.LineBasicMaterial({color:0x157a75,transparent:true,opacity:.45}));
  scene.add(paths);
  const plane=new T.BufferGeometry(),n=m.samples,N=n*n;
  const vertices=new Float32Array(3*N),tints=new Float32Array(3*N),indices=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=j*n+i;vertices[3*k+1]=m.sliceHalfWidth*(2*i/(n-1)-1);vertices[3*k+2]=m.sliceHalfWidth*(2*j/(n-1)-1);
  }
  plane.setAttribute('position',new T.BufferAttribute(vertices,3));plane.setAttribute('color',new T.BufferAttribute(tints,3));
  const section=new T.Mesh(plane,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.86}));
  scene.add(section);const speeds=field('speed');
  function update(){
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
  for(const id of ['station','paths','cut'])el(id).oninput=()=>{update();draw();};
  el('pressureLabel').textContent=lattice?'Grid pressure at blade surface':'Blade pressure relative to outlet';
  const method=lattice?'Rumoca · '+m.revolutions.toFixed(1)+' turns · '+m.cellsPerDiameter+' cells/D':'OpenFOAM · iteration '+m.iteration;
  el('metrics').innerText=method+' · '+m.cells.toLocaleString()+' cells'+'\n'+m.rpm+' rpm · J '+m.J.toFixed(2)+' · Kₜ '+m.kt.toFixed(3)+' · Kq '+m.kq.toFixed(3)+(m.J===.8?'\nIIHR port · Kₜ 0.351 · Kq 0.091':'')+(m.J===.8&&m.kt<0?'\nPredicted thrust reverses the measured direction':'');
  function ticks(id,values){for(const value of values){const s=document.createElement('span');s.textContent=value.toFixed(2);el(id).append(s);}}
  ticks('pressureTicks',[-pressureScale,0,pressureScale]);ticks('speedTicks',[0,.5*speedScale,speedScale]);
  let theta=-.72,phi=.29,radius=3.5;
  function draw(){
    renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    camera.position.set(.25+radius*Math.cos(phi)*Math.cos(theta),radius*Math.cos(phi)*Math.sin(theta),radius*Math.sin(phi));
    camera.lookAt(.25,0,0);renderer.render(scene,camera);
  }
  let last;
  canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);last=[e.clientX,e.clientY];};
  canvas.onlostpointercapture=()=>{last=null;};
  canvas.onpointermove=e=>{if(last){theta-=(e.clientX-last[0])*.008;phi=Math.max(-1.52,Math.min(1.52,phi+(e.clientY-last[1])*.008));last=[e.clientX,e.clientY];draw();}};
  canvas.onwheel=e=>{e.preventDefault();radius=Math.min(10,Math.max(.65,radius*Math.exp(.001*e.deltaY)));draw();};
  update();window.addEventListener('resize',draw);draw();
}
load().catch(e=>{el('metrics').textContent='Could not load the flow field · '+e.message;});
