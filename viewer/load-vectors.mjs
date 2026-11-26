// Diagnostics use SI vectors from the simulation. Force arrows follow the force
// direction. The right-hand curl of an arc shows the sign of an applied couple.
export function loadVectors(T,scene,canvas,probe,signal){
  const overlay=new T.Group();overlay.name='Forces and moments';scene.add(overlay);
  const forceColor=0x68e6ea,momentColor=0xff87c6;
  const colors={weight:0xffa263,buoyancy:0x83dec6,bladder:0xbbf35a,drag:0x64bcff};
  const zero=[0,0,0],world=new T.Quaternion(),axis=new T.Vector3(),origin=new T.Vector3(),screen=new T.Vector3();
  const z=new T.Vector3(0,0,1),pool=[],joints=new WeakMap();
  let count=0,pointer,frameCamera,scale=1;
  const point=e=>{pointer=[e.clientX,e.clientY];};
  canvas.addEventListener('pointermove',point,{signal});
  canvas.addEventListener('pointerdown',point,{signal});
  canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')pointer=null;},{signal});
  const arcPoints=[];
  for(let i=0;i<=28;i++){const t=i/28*1.6*Math.PI;arcPoints.push(new T.Vector3(Math.cos(t),Math.sin(t),0));}
  const arcGeometry=new T.BufferGeometry().setFromPoints(arcPoints),end=arcPoints.at(-1);
  const arcMaterial=new T.LineBasicMaterial({color:momentColor,depthTest:false,depthWrite:false});
  function glyph(index,moment){
    let pair=pool[index];
    if(!pair){
      const force=new T.ArrowHelper(z,origin,1,forceColor),arc=new T.Group();
      const line=new T.Line(arcGeometry,arcMaterial),tip=new T.ArrowHelper(new T.Vector3(-end.y,end.x,0),end,.32,momentColor,.30,.21);
      arc.add(line,tip);overlay.add(force,arc);
      for(const obj of [force,arc])obj.traverse(n=>{n.layers.set(14);n.renderOrder=13;if(n.material){n.material.depthWrite=false;n.material.depthTest=false;}});
      pair=pool[index]={force,arc,tip:new T.Vector3()};
    }
    pair.force.visible=!moment;pair.arc.visible=moment;
    return moment?pair.arc:pair.force;
  }
  function draw(label,moment,point,vector,color=forceColor){
    const magnitude=vector.length();
    if(!Number.isFinite(magnitude)||magnitude<.025)return;
    const length=scale*Math.min(3,.17*Math.log1p(magnitude)+.055);
    const item=glyph(count,moment),entry=pool[count++];
    entry.text=label+' · '+magnitude.toLocaleString(undefined,{maximumFractionDigits:magnitude<10?2:1})+(moment?' N·m':' N');
    item.name=entry.text;item.position.copy(point);
    axis.copy(vector).normalize();
    if(moment){
      item.quaternion.setFromUnitVectors(z,axis);item.scale.setScalar(.35*length);
      entry.tip.copy(end).multiplyScalar(item.scale.x).applyQuaternion(item.quaternion).add(point);
    }else{
      item.setColor(color);item.setDirection(axis);item.setLength(length,Math.min(.12,.30*length),Math.min(.07,.18*length));
      entry.tip.copy(axis).multiplyScalar(length).add(point);
    }
  }
  function load(frame,label,moment,p,v,worldAxes=false,color=forceColor){
    if(!frame||!v)return;
    origin.fromArray(p??zero);frame.localToWorld(origin);
    axis.fromArray(v);
    if(!worldAxes)axis.applyQuaternion(frame.getWorldQuaternion(world));
    draw(label,moment,origin,axis,color);
  }
  function jointMap(group){
    if(!joints.has(group)){
      const map=new Map();
      group.traverse(f=>{if(f.userData.physicsJoint)map.set(f.userData.physicsJoint.label,f);});
      joints.set(group,map);
    }
    return joints.get(group);
  }
  function shaft(group,label,value,source='actuator'){
    const frame=jointMap(group).get(label);
    if(frame&&Number.isFinite(value))load(frame,label+' · '+source,true,zero,frame.userData.physicsJoint.axis.map(v=>v*value));
  }
  const links=[0,2,3,5,6,7,9,10,12,13,14];
  const siteBody=[0,0,0,0,1,2,3,4,5,6,7,8,9,10];
  const rootSite=['Torso','Head','Cylinder','BCD bladder'];
  const cw=new T.Vector3(),cb=new T.Vector3(),drag=new T.Vector3(),dragMoment=new T.Vector3();
  const pos=new T.Vector3(),f=new T.Vector3(),m=new T.Vector3(),lever=new T.Vector3();
  function diver(group,v,mode,part){
    const bodies=group.userData.physicsBodies??[];
    const overview=mode==='overview'&&!part,all=mode==='all'||(mode==='overview'&&part);
    const matchesBody=b=>!part||(part.kind==='body'&&part.frame===b?.frame);
    const weights=v.linkWeights,sites=v.siteLoads;
    let weight=0,buoyancy=0;
    scale=.63;cw.set(0,0,0);cb.set(0,0,0);drag.set(0,0,0);dragMoment.set(0,0,0);
    bodies.forEach((body,i)=>{
      if(!weights||!matchesBody(body))return;
      const k=4*links[i],w=weights[k+3];
      pos.fromArray(weights,k);body.frame.localToWorld(pos);
      if(overview){cw.addScaledVector(pos,w);weight+=w;}
      else if(all||mode==='weight')draw(body.label+' · weight',false,pos,f.set(0,0,w),colors.weight);
    });
    if(overview&&weight){cw.divideScalar(weight);draw('Whole diver · weight at centre of mass',false,cw,f.set(0,0,weight),colors.weight);}
    for(let i=0;sites&&i<siteBody.length;i++){
      const body=bodies[siteBody[i]],k=13*i;
      if(!body||!matchesBody(body))continue;
      const label=rootSite[i]??body.label,bladder=i===3,lift=sites[k+6];
      pos.fromArray(sites,k+3);body.frame.localToWorld(pos);
      if(overview&&!bladder){cb.addScaledVector(pos,lift);buoyancy+=lift;}
      else if(overview||all||mode==='buoyancy')draw(label+(bladder?' · variable lift':' · buoyancy'),false,pos,f.set(0,0,lift),bladder?colors.bladder:colors.buoyancy);
      pos.fromArray(sites,k);body.frame.localToWorld(pos);
      f.fromArray(sites,k+7);m.fromArray(sites,k+10);
      if(overview){
        drag.add(f);dragMoment.add(m).add(lever.subVectors(pos,cw).cross(f));
      }else if(all||mode==='drag'){
        draw(label+' · hydrodynamic drag',false,pos,f,colors.drag);
        draw(label+' · drag moment at site centre',true,pos,m);
      }
    }
    if(overview){
      if(buoyancy){cb.divideScalar(buoyancy);draw('Body and equipment · buoyancy',false,cb,f.set(0,0,buoyancy),colors.buoyancy);}
      draw('Whole diver · passive drag at centre of mass',false,cw,drag,colors.drag);
      draw('Whole diver · passive drag moment about centre of mass',true,cw,dragMoment);
    }
    const selectedJoint=part?.kind==='joint'?part.label:null;
    function showJoint(label){
      if(selectedJoint)return selectedJoint===label;
      if(!part)return true;
      // Co-located sweep/flexion and ankle/cant axes use virtual parent frames.
      const joint=jointMap(group).get(label);
      const at=part.frame;
      return joint===at||(joint&&joint.getWorldPosition(pos).distanceToSquared(at.getWorldPosition(f))<1e-9);
    }
    for(let i=0;i<2;i++){
      const side=i?'Right ':'Left ';
      if(mode==='joints'||all){
        ['hip flexion','knee','ankle','shoulder','elbow'].forEach((name,j)=>{
          const label=side+name,k=5*i+j;
          if(!showJoint(label))return;
          shaft(group,label,v.jointTorque?.[k]);
          shaft(group,label,v.stopMoment?.[k],'joint stop');
          shaft(group,label,v.selfContactTorque?.[k],'self-contact');
        });
        ['hip sweep','fin cant'].forEach((name,j)=>{if(showJoint(side+name))shaft(group,side+name,v.lateralTorque?.[2*i+j]);});
      }
      const foot=bodies[3+5*i];
      if((all||mode==='contact')&&matchesBody(foot))load(foot?.frame,side+'foot · ground reaction',false,zero,v.groundForce?.slice(3*i,3*i+3),true);
    }
    if((all||mode==='contact')&&v.contactForce>0&&v.contactMomentArm&&v.contact){
      const hit=bodies[links.indexOf(v.contactLink-1)];
      if(matchesBody(hit)){
        group.getWorldPosition(pos);pos.add(f.fromArray(v.contactMomentArm));
        draw((hit?.label??'Diver')+' · obstacle contact',false,pos,f.fromArray(v.contact).multiplyScalar(v.contactForce));
      }
    }
    if(all||mode==='strokes'){
      ['Left fin','Right fin','Left hand','Right hand'].forEach((name,i)=>{
        if(matchesBody(bodies[[3,8,5,10][i]])&&v.positionBody&&v.limbForces)
          load(group,name+' · stroke',false,v.positionBody.slice(3*i,3*i+3),v.limbForces.slice(3*i,3*i+3),true);
      });
    }
  }
  function wildlife(group,kind,v,mode='overview',part=null){
    if(!group||!v)return;
    const bodies=group.userData.physicsBodies??[];
    if(kind==='diver'){
      diver(group,v,mode,part);
    }else if(kind==='manta'){
      for(let i=0;i<2;i++){
        const name=i?'Starboard wing':'Port wing',point=v.site?.slice(3*i,3*i+3);
        load(group,name+' · fluid force',false,point,v.wingForce?.slice(3*i,3*i+3));
        if(v.foreMoment)load(group,name+' · pressure couple',true,point,[0,-v.foreMoment[i],0]);
        if(v.hingeTorque)load(group,name+' · hinge',true,[0,i?-.48:.48,0],[(i?-1:1)*v.hingeTorque[i],0,0]);
      }
    }else if(kind==='gull'){
      ['Port shoulder','Port wrist','Starboard shoulder','Starboard wrist','Port leg','Starboard leg'].forEach((label,i)=>shaft(group,label,v.shaftTorque?.[i]));
      shaft(group,'Tail incidence',v.tailMuscles?.[0]);shaft(group,'Tail cant',v.tailMuscles?.[1]);
      if(v.tailUp!==undefined&&v.wingExposed!==undefined)load(bodies.at(-1)?.frame,'Tail fan · upward aerodynamic load',false,bodies.at(-1)?.center,[0,0,v.tailUp*v.wingExposed],true);
    }else{
      const shark=kind==='shark',tail=group.getObjectByName('Tail');
      if(tail){
        tail.getWorldPosition(origin);
        axis.set(shark?v['whiteShark.tailX']:v['swimmer.tailThrust'],shark?v['whiteShark.tailY']:0,0).applyQuaternion(group.getWorldQuaternion(world));
        draw(shark?'Caudal fin · fluid force':'Flukes · axial thrust',false,origin,axis);
      }
      const label=shark?'Peduncle sweep':'Tail bend · rear';
      shaft(group,label,shark?v['whiteShark.peduncleTorque']:v['swimmer.torque']);
    }
  }
  function begin(camera){frameCamera=camera;count=0;scale=1;}
  function endFrame(){
    for(let i=count;i<pool.length;i++){pool[i].force.visible=false;pool[i].arc.visible=false;}
    probe.hidden=true;
    if(!pointer||!count)return;
    const box=canvas.getBoundingClientRect();
    let best=24,selected;
    for(let i=0;i<count;i++){
      const entry=pool[i],item=entry.arc.visible?entry.arc:entry.force;
      // Pick along the arrow as well as at its origin, especially on touch.
      const segments=entry.arc.visible?14:6;
      for(let j=0;j<=segments;j++){
        if(entry.arc.visible)screen.copy(arcPoints[2*j]).multiplyScalar(item.scale.x).applyQuaternion(item.quaternion).add(item.position);
        else screen.lerpVectors(item.position,entry.tip,j/segments);
        screen.project(frameCamera);
        if(Math.abs(screen.z)>1)continue;
        const x=box.left+(screen.x+1)*box.width/2,y=box.top+(1-screen.y)*box.height/2;
        const d=Math.hypot(pointer[0]-x,pointer[1]-y);
        if(d<best){best=d;selected=entry;}
      }
    }
    if(selected){
      probe.textContent=selected.text;probe.hidden=false;
      probe.style.left=Math.max(2,Math.min(innerWidth-probe.offsetWidth-4,pointer[0]+12))+'px';
      probe.style.top=Math.max(2,Math.min(innerHeight-probe.offsetHeight-4,pointer[1]+12))+'px';
    }
  }
  signal.addEventListener('abort',()=>{overlay.removeFromParent();arcGeometry.dispose();arcMaterial.dispose();for(const p of pool){p.force.dispose();p.arc.children[1].dispose();}},{once:true});
  return {begin,end:endFrame,load,wildlife};
}
