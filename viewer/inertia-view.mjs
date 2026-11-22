import {collisionOverlay} from './collision-view.mjs';
import {loadInstance} from './fmi3/instance.mjs?api=2';

export const boatInertiaFields=['mass','rollInertia','pitchInertia','yawInertia','centerMassX',
  'ballastMass','ballastX','ballastY','ballastZ','ballastRollInertia','ballastPitchInertia','ballastYawInertia','podMass','podZ','footX'];
export const subInertiaFields=['dryMass','body.r_CM','body.I_11','body.I_22','body.I_33','body.I_21','body.I_31','body.I_32'];
export const droneInertiaFields=['mass','inertia'].map(name=>'aircraft.dynamics.physicalParameters.'+name);
export const cruiserInertiaFields=['rollInertia','pitchInertia','floatX'];
const zero=[0,0,0];
const axisColors=['#ffad7a','#a5ef92','#89c9ff'];

export function sailingInertia(model){
  if(!boatInertiaFields.every(name=>model.has(name)))return;
  const [mass,roll,pitch,yaw,cx,crew,x,y,z,crewRoll,crewPitch,crewYaw,pod,podZ,[footX]]=model.getMany(boatInertiaFields);
  const stations=model.has('mastStations')?model.get('mastStations'):null;
  const [px,py,pz]=stations?Array.from(stations).slice(-3):[footX,0,podZ];
  const total=mass+pod;
  return {mass:total,center:[(mass*cx+crew*x+pod*px)/total,(crew*y+pod*py)/total,(crew*z+pod*pz)/total],
    moments:[roll+crewRoll+pod*podZ**2,pitch+crewPitch+pod*(podZ**2+footX**2),yaw+crewYaw]};
}

export function subInertia(read){
  const [mass,center,xx,yy,zz,xy,xz,yz]=subInertiaFields.map(name=>read(name));
  return {mass,center,tensor:[xx,xy,xz,xy,yy,yz,xz,yz,zz]};
}

export function droneInertia(read){
  const [mass,tensor]=droneInertiaFields.map(name=>read(name));
  return {mass,tensor};
}

export function cruiserInertia(read){
  const [roll,pitch,floatX]=cruiserInertiaFields.map(name=>read(name));
  if(![roll,pitch,floatX].every(Number.isFinite))return;
  // The plant specifies displacement and yaw response as literal coefficients.
  return {mass:3250,moments:[roll,pitch,14000],ringCenters:[zero,[floatX,0,0],zero]};
}

async function wildlifeInertia(model){
  const read=await loadInstance(model,{});
  if(model==='HerringGull'){
    const [mass,roll,pitch]=read.getMany(['mass','rollInertia','pitchInertia']);
    return {gull:{mass,moments:[roll,pitch]}};
  }
  const [mass,tailMass,pitch,tailPitch,bx,tx]=read.getMany(['mb','mt','ib','it','bx','tx'].map(name=>'swimmer.'+name));
  const [sharkMass,yaw]=read.getMany(['whiteShark.mass','whiteShark.yawInertia']);
  return {whale:{mass,moments:[0,pitch],tail:{mass:tailMass,moments:[0,tailPitch]},bx,tx},
    shark:{mass:sharkMass,moments:[190,720,yaw]}};
}

// Orthogonalize a symmetric inertia tensor in its body coordinates.
function principalAxes(tensor){
  const a=Array.from(tensor),v=[1,0,0,0,1,0,0,0,1];
  for(let sweep=0;sweep<12;sweep++){
    let p=0,q=1;
    for(const [i,j] of [[0,2],[1,2]])if(Math.abs(a[3*i+j])>Math.abs(a[3*p+q])){p=i;q=j;}
    if(Math.abs(a[3*p+q])<1e-12)break;
    const angle=.5*Math.atan2(2*a[3*p+q],a[3*q+q]-a[3*p+p]);
    const c=Math.cos(angle),s=Math.sin(angle);
    for(let k=0;k<3;k++){
      const x=a[3*k+p],y=a[3*k+q],u=v[3*k+p],w=v[3*k+q];
      a[3*k+p]=c*x-s*y;a[3*k+q]=s*x+c*y;
      v[3*k+p]=c*u-s*w;v[3*k+q]=s*u+c*w;
    }
    for(let k=0;k<3;k++){
      const x=a[3*p+k],y=a[3*q+k];
      a[3*p+k]=c*x-s*y;a[3*q+k]=s*x+c*y;
    }
  }
  return {moments:[a[0],a[4],a[8]],axes:[[v[0],v[3],v[6]],[v[1],v[4],v[7]],[v[2],v[5],v[8]]]};
}

export function inertiaOverlay(T){
  const painter=collisionOverlay(T,'Inertia shapes',1024);
  const cyan='#8df2ff',massMarker='#f4ffff',principal={matrixWorld:new T.Matrix4()},tailFrame={matrixWorld:new T.Matrix4()};
  const basis=new T.Matrix4(),axes=Array.from({length:3},()=>new T.Vector3()),pos=new T.Vector3(),euler=new T.Euler();
  const wildlife={},requested=new Set();
  let standaloneSub,subRequested=false;

  function draw(group,properties){
    if(!group?.visible||!(properties?.mass>0))return;
    group.updateWorldMatrix(true,false);
    shape(group,properties);
  }
  function shape(frame,{mass,center=zero,moments,tensor,ringCenters}){
    let aligned=frame,origin=center;
    if(tensor){
      const principalData=principalAxes(tensor);
      moments=principalData.moments;
      basis.makeBasis(...principalData.axes.map((axis,i)=>axes[i].fromArray(axis)));
      basis.setPosition(...center);
      principal.matrixWorld.multiplyMatrices(frame.matrixWorld,basis);
      aligned=principal;origin=zero;
    }
    // Ixx = m(b²+c²)/5 for a uniform ellipsoid, with the other axes cyclic.
    const squared=moments?.map(i=>2.5*(moments[0]+moments[1]+moments[2]-2*i)/mass);
    if(!ringCenters&&squared?.length===3&&moments.every(i=>i>0)&&squared.every(r=>r>0)){
      painter.ellipsoid(aligned,origin,squared.map(Math.sqrt),cyan);
    }else for(const [axis,moment] of (moments??[]).entries()){
      if(moment>0)painter.circle(aligned,ringCenters?.[axis]??origin,axis,Math.sqrt(moment/mass),axisColors[axis]);
    }
    painter.points(frame,center,massMarker);
  }

  function drawWildlife(group,kind){
    if(!group?.visible)return;
    const model=kind==='gull'?'HerringGull':'HarborTraffic';
    if(!requested.has(model)){
      requested.add(model);
      wildlifeInertia(model).then(data=>Object.assign(wildlife,data)).catch(error=>console.warn('Inertia shapes',error));
    }
    const props=wildlife[kind];
    draw(group,props);
    const pose=group.userData.contactPose;
    if(!props?.tail||!pose)return;
    const [body,tail,heading]=[pose[29],pose[31],pose[20]];
    const offset=props.bx*Math.cos(body)-props.tx*Math.cos(tail);
    pos.copy(group.position).add(axes[0].set(offset*Math.cos(heading),offset*Math.sin(heading),
      props.bx*Math.sin(body)-props.tx*Math.sin(tail)));
    tailFrame.matrixWorld.makeRotationFromEuler(euler.set(0,-tail,heading,'ZYX')).setPosition(pos);
    shape(tailFrame,props.tail);
  }
  function drawStandaloneSub(group){
    if(!group?.visible)return;
    if(!subRequested){
      subRequested=true;
      loadInstance('Wreck_Plant',{}).then(model=>{standaloneSub=subInertia(model.get);})
        .catch(error=>console.warn('Inertia shapes',error));
    }
    draw(group,standaloneSub);
  }
  return {begin:painter.begin,draw,drawWildlife,drawStandaloneSub,render:painter.render};
}
