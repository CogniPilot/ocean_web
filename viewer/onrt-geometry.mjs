import {installOrbit} from './onrt-orbit.mjs';

export async function inspectGeometry(){
  const T=window.THREE, byId=id=>document.getElementById(id);
  const root=new URL('./assets/onrt/geometry/',import.meta.url);
  const panes=[],offset=new T.Vector3(),initial={yaw:-2.96,pitch:.14,radius:.193};
  const view={...initial},edges=byId('showMesh'),select=byId('studyMesh');
  byId('solver').parentElement.hidden=true;
  byId('animate').parentElement.hidden=true;
  byId('studyMeshControl').hidden=false;
  byId('meshLink').hidden=true;
  for(const section of document.querySelectorAll('aside>details'))
    section.hidden=!section.contains(byId('recenter'));
  edges.checked=true;
  edges.parentElement.lastChild.textContent=' Show surface edges';
  const draw=()=>{for(const pane of panes)pane.draw();};
  edges.onchange=draw;
  byId('recenter').onclick=()=>{Object.assign(view,initial);offset.set(0,0,0);draw();};
  async function fetchFile(name){
    const response=await fetch(new URL(name,root));
    if(!response.ok)throw Error(name+' · HTTP '+response.status);
    return response;
  }
  const stats=await (await fetchFile('geometry.json')).json();
  function createPane(){
    const panel=document.createElement('section'),canvas=document.createElement('canvas');
    panel.className='flow-pane';canvas.tabIndex=0;
    const caption=document.createElement('div'),name=document.createElement('strong');
    const counts=document.createTextNode('');
    caption.className='pane-caption';caption.append(name,counts);
    panel.append(canvas,caption);byId('flowViews').append(panel);
    const renderer=new T.WebGLRenderer({canvas,antialias:true});
    renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.setClearColor(0x071d27);
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.001,3);
    camera.up.set(0,0,1);
    const keyLight=new T.DirectionalLight(0xfff2da,1.8);keyLight.position.set(-1,-2,3);
    const surface=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({
      color:0xaec6cd,metalness:.08,roughness:.48,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
    const wire=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x487d85,transparent:true,opacity:.47}));
    scene.add(surface,wire,keyLight,new T.HemisphereLight(0xf0faff,0x8aa9bf,2.1));
    let request=0;
    const pane={
      async load(key,title){
        const version=++request;
        name.textContent=title;counts.textContent='Loading mesh…';canvas.setAttribute('aria-label',title);
        surface.visible=false;wire.visible=false;draw();
        const response=await fetchFile(key+'.bin.gz');
        const data=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        if(version!==request)return;
        const [n,nt,ne]=new Uint32Array(data,0,3);
        const pos=new T.BufferAttribute(new Float32Array(data,12,3*n),3);
        for(const [object,start,count] of [[surface,12+12*n,nt],[wire,12+12*n+4*nt,ne]]){
          object.geometry.dispose();
          object.geometry=new T.BufferGeometry();
          object.geometry.setAttribute('position',pos);
          object.geometry.setIndex(new T.BufferAttribute(new Uint32Array(data,start,count),1));
        }
        surface.geometry.computeVertexNormals();surface.visible=true;
        const {faces,components}=stats[key];
        counts.textContent=faces.toLocaleString()+' wall faces · '+components+' connected shell'+(components===1?'':'s');
        draw();
      },
      draw(){
        const w=panel.clientWidth,h=panel.clientHeight;if(!w||!h)return;
        const {yaw,pitch,radius}=view;
        camera.aspect=w/h;camera.updateProjectionMatrix();
        const distance=radius/Math.min(1,camera.aspect);
        camera.position.set(Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)).multiplyScalar(distance).add(offset);
        camera.lookAt(offset);wire.visible=surface.visible&&edges.checked;renderer.render(scene,camera);
      }
    };
    panes.push(pane);
    installOrbit(canvas,camera,offset,()=>camera.position.distanceTo(offset),(dx,dy)=>{
      view.yaw+=dx*.008;view.pitch=Math.max(-1.52,Math.min(1.52,view.pitch+dy*.008));
    },factor=>{view.radius=Math.max(.035,Math.min(.8,view.radius*factor));},draw);
    new ResizeObserver(()=>{renderer.setSize(panel.clientWidth,panel.clientHeight,false);draw();}).observe(panel);
    return pane;
  }
  const candidate=createPane(),reference=createPane();
  const url=new URL(location.href),requested=url.searchParams.get('mesh');
  if(Array.from(select.options).some(o=>o.value===requested))select.value=requested;
  async function update(){
    const key=select.value;
    const error=field=>new Intl.NumberFormat('en',{style:'percent',signDisplay:'exceptZero',maximumFractionDigits:2}).format(stats[key][field]/stats.cad[field]-1);
    byId('metrics').textContent='Wall vs reference · area '+error('area_cm2')+' · volume '+error('volume_cm3');
    byId('meshStatus').textContent=key==='prism'?'Original wall triangles bound three prism layers. Only the innermost surface is displayed.':
      'Each pane shows the boundary of the solid. Both cameras move together.';
    if(key==='cadSeeded'){
      const section=document.createElement('a');
      section.href=new URL('cad-seeded-section.png',root);
      section.textContent='View section through the fluid cells';
      byId('meshStatus').replaceChildren('512,392 fluid cells · ',section);
    }
    await candidate.load(key,select.selectedOptions[0].textContent);
  }
  select.onchange=()=>{
    url.searchParams.set('mesh',select.value);history.replaceState(null,'',url);
    update().catch(error=>{byId('metrics').textContent=error.message;});
  };
  await Promise.all([update(),reference.load('cad','CAD-derived reference')]);
}
