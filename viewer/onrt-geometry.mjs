import {installOrbit} from './onrt-orbit.mjs';

export async function inspectGeometry(){
  const T=window.THREE, byId=id=>document.getElementById(id);
  const root=new URL('./assets/onrt/geometry/',import.meta.url);
  const panes=[],offset=new T.Vector3(),initial={yaw:-2.74,pitch:.26,radius:.175};
  const view={...initial}, edges=byId('showMesh');
  byId('solver').parentElement.hidden=true;
  byId('animate').parentElement.hidden=true;
  byId('meshLink').hidden=true;
  for(const section of document.querySelectorAll('aside>details'))
    section.hidden=!section.contains(byId('recenter'));
  edges.checked=true;
  edges.parentElement.lastChild.textContent=' Show surface edges';
  const draw=()=>{for(const pane of panes)pane();};
  edges.onchange=draw;
  byId('recenter').onclick=()=>{Object.assign(view,initial);offset.set(0,0,0);draw();};
  async function fetchFile(name){
    const response=await fetch(new URL(name,root));
    if(!response.ok)throw Error(name+' · HTTP '+response.status);
    return response;
  }
  const stats=await (await fetchFile('geometry.json')).json();
  await Promise.all([['wall','Modelica mesh'],['cad','CAD-derived reference']].map(async ([key,title],slot)=>{
    const panel=document.createElement('section'),canvas=document.createElement('canvas');
    panel.className='flow-pane';panel.style.order=slot;
    canvas.tabIndex=0;canvas.setAttribute('aria-label',title);
    const caption=document.createElement('div'),name=document.createElement('strong');
    caption.className='pane-caption';name.textContent=title;
    caption.append(name,stats[key].faces.toLocaleString()+' faces · one closed wall');
    panel.append(canvas,caption);byId('flowViews').append(panel);
    const response=await fetchFile(key+'.bin.gz');
    const data=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const [n,nt,ne]=new Uint32Array(data,0,3);
    const pos=new T.BufferAttribute(new Float32Array(data,12,3*n),3);
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',pos);
    geometry.setIndex(new T.BufferAttribute(new Uint32Array(data,12+12*n,nt),1));
    geometry.computeVertexNormals();
    const lines=new T.BufferGeometry();lines.setAttribute('position',pos);
    lines.setIndex(new T.BufferAttribute(new Uint32Array(data,12+12*n+4*nt,ne),1));
    const surface=new T.Mesh(geometry,new T.MeshStandardMaterial({color:0xaec6cd,metalness:.08,roughness:.48,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
    const wire=new T.LineSegments(lines,new T.LineBasicMaterial({color:0x487d85,transparent:true,opacity:.47}));
    const renderer=new T.WebGLRenderer({canvas,antialias:true});
    renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.setClearColor(0x071d27);
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.001,3);
    camera.up.set(0,0,1);
    const keyLight=new T.DirectionalLight(0xfff2da,1.8);keyLight.position.set(-1,-2,3);
    scene.add(surface,wire,keyLight,new T.HemisphereLight(0xf0faff,0x8aa9bf,2.1));
    panes.push(()=>{
      const w=panel.clientWidth,h=panel.clientHeight;if(!w||!h)return;
      const {yaw,pitch,radius}=view;
      camera.aspect=w/h;camera.updateProjectionMatrix();
      const distance=radius/Math.min(1,camera.aspect);
      camera.position.set(Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)).multiplyScalar(distance).add(offset);
      camera.lookAt(offset);wire.visible=edges.checked;renderer.render(scene,camera);
    });
    installOrbit(canvas,camera,offset,()=>camera.position.distanceTo(offset),(dx,dy)=>{
      view.yaw+=dx*.008;view.pitch=Math.max(-1.52,Math.min(1.52,view.pitch+dy*.008));
    },factor=>{view.radius=Math.max(.035,Math.min(.8,view.radius*factor));},draw);
    new ResizeObserver(()=>{renderer.setSize(panel.clientWidth,panel.clientHeight,false);draw();}).observe(panel);
  }));
  const error=field=>new Intl.NumberFormat('en',{style:'percent',signDisplay:'always',maximumFractionDigits:1}).format(stats.wall[field]/stats.cad[field]-1);
  byId('metrics').textContent='Wall vs CAD-derived input · area '+error('area_cm2')+' · volume '+error('volume_cm3');
  byId('meshStatus').textContent='Geometry inspection only. The steady CFD recording uses the earlier meshes.';
  draw();
}
