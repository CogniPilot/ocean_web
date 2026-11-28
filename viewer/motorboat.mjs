import {boatAnchorView} from './boat-anchor.mjs';
import {liftMechanism,liftX,hingeY,davitReach,tipZ,bridleHeight} from './stern-lift.mjs';
import {showInLowWaterCapture} from './render-layers.mjs';
import {sonarMount} from './cruiser-sonar-view.mjs';
import {loadVehicleShell,vehicleShell} from './vehicle-assets.mjs';

const cruiserWindshield='cabin-cruiser-windshield',cruiserCockpit='sea-ray-sundancer-320-cockpit';
let windshieldReady=false,cockpitReady=false;
export async function preloadCruiserWindshield(){
  const results=await Promise.allSettled([
    Promise.resolve(loadVehicleShell(cruiserWindshield)).then(()=>{windshieldReady=true;}),
    Promise.resolve(loadVehicleShell(cruiserCockpit)).then(()=>{cockpitReady=true;}),
  ]);
  const failures=results.filter(result=>result.status==='rejected').map(result=>result.reason);
  if(failures.length)throw new AggregateError(failures,'Sea Ray Sundancer 320 asset load');
}

// Shore.cruiserVertices uses these same hull dimensions and 21° bottom face.
// Body frame is bow +X, port +Y, up +Z.
const hullSections=[[-3.74,1.22,.80,-.49],[-3.53,1.38,.82,-.56],[-2.75,1.55,.87,-.67],
  [-1.55,1.615,.92,-.73],[-.20,1.61,.96,-.76],[1.05,1.55,1.02,-.72],[2.10,1.42,1.11,-.61],
  [2.85,1.29,1.17,-.55],[3.52,1.11,1.22,-.45],[4.30,.83,1.27,-.25],[4.94,.51,1.31,.02],[5.48,.015,1.35,.32]];
const hullPlating=[[1,1],[.972,.65],[.85,.23],[0,0]];
const deadriseTangent=Math.tan(21*Math.PI/180),CHINE=.23;
const bowX=hullSections.at(-1)[0],sternX=hullSections[0][0];
const stemRake=x=>1.18*Math.max(0,(x-1.5)/(bowX-1.5))**2;
const transomCurve=x=>.14*Math.max(0,(-3.39-x)/.35);
const chineHeight=(half,keel)=>keel+.85*half*deadriseTangent;
const interpolate=(a,b,t)=>a+(b-a)*t;
function hullSection(x){
  const index=hullSections.findIndex((row,i)=>i&&row[0]>=x);
  if(index<0)return hullSections.at(-1);
  const prev=hullSections[index-1],next=hullSections[index];
  const t=Math.max(0,(x-prev[0])/(next[0]-prev[0]));
  return [x,...prev.slice(1).map((value,j)=>interpolate(value,next[j+1],t))];
}
function hullPoint([x,half,top,keel],side,fraction,t){
  const chine=chineHeight(half,keel);
  return [x-stemRake(x)*(1-t)+transomCurve(x)*fraction*fraction,side*half*fraction,
    t<CHINE?interpolate(keel,chine,t/CHINE):interpolate(chine,top,(t-CHINE)/(1-CHINE))];
}
function bottomFixture(station,fraction,clearance){
  const [x,y,z]=hullPoint(hullSection(station),1,fraction,CHINE*fraction/.85);
  return [x,y,z-clearance];
}
// Lens faces are set just below the bottom plating.
export const hullLamps=[-1,1].flatMap(side=>[
  [-3.58,.63],[-2.75,.65],[-.20,.63],[1.59,.57],[3.66,.44]
].map(([station,fraction])=>{
  const [x,y,z]=bottomFixture(station,fraction,.023);return [x,side*y,z];
}));
const [bowLensX,bowLensY,bowLensZ]=bottomFixture(3.82,.24,.034);
const [sideLensX,sideLensY,sideLensZ]=bottomFixture(-.38,.79,.048);
export const cruiserUnderwaterViews={
  motorBow:[[bowLensX,-bowLensY,bowLensZ],[8.63,-bowLensY,-2.901]],
  // The stern lens sits on centreline between the two drives.
  motorStern:[[-3.805,.03,-.426],[-9.98,.03,-3.02]],
  motorPort:[[sideLensX,sideLensY,sideLensZ],[-.38,7.4,-3.20]],
  motorStarboard:[[sideLensX,-sideLensY,sideLensZ],[-.38,-7.4,-3.20]],
  motorKeel:[[.45,0,-.88],[.45,0,-2],[1,0,0]]
};
// Overlapping underwater illumination from the twin lamp rows.
export const hullGlowLobes=[-1,1].flatMap(side=>[
  {center:[-3.02,side*.90,-.86],radius:[1.52,1.36,.95],weight:.61},
  {center:[-.70,side*.99,-.95],radius:[1.55,1.29,.96],weight:.34},
  {center:[2.00,side*.79,-.76],radius:[1.46,1.16,.82],weight:.27}
]);
export const searchlightHeight=2.74;
// Opaque surfaces that block the searchlight. Each has z=base+slope*x.
const deckPanels=[
  [2.22,0,-1.43,.91,1.06,.92],[2.51,-.728,1.19,1.83,.85,.65],
  [.953,.079,1.18,2.85,1.52,1.19],[1.003,.064,2.85,4.30,1.19,.75],
  [.99,.065,4.30,5.48,.75,.01],[.54,0,-3.70,1.18,1.06,1.12],[.203,0,-4.53,-3.57,1.04,1.24]
];
function deckHit(origin,d,range){
  let distance=range;
  for(const [base,slope,x0,x1,w0,w1] of deckPanels){
    const denom=d.z-slope*d.x;
    if(Math.abs(denom)<.0001)continue;
    const t=(base+slope*origin.x-origin.z)/denom;
    if(t<=0||t>=distance)continue;
    const x=origin.x+t*d.x;
    if(x>=x0&&x<=x1&&Math.abs(origin.y+t*d.y)<w0+(w1-w0)*(x-x0)/(x1-x0))distance=t;
  }
  return distance;
}
const glslFloat=n=>Number.isInteger(n)?n.toFixed(1):String(n);
const cabinPorts={stations:[1.64,2.15],height:.69,radiusX:.157,radiusZ:.118};
// Use an inset of the same stations as the render hull to exclude the
// exterior water surface from the sealed hull and recessed cockpit.
export const cruiserHullGLSL=`
 uniform vec2 cruiserTilt[5];uniform int cruiserCount;uniform vec4 cruiserPose[5],cruiserAim[5];
 vec3 cruiserLocal(vec3 surface,vec4 pose,vec2 tilt){
   vec2 forward=vec2(cos(pose.w),sin(pose.w)),delta=surface.xy-pose.xy;
   vec2 horizontal=vec2(dot(delta,forward),dot(delta,vec2(-forward.y,forward.x)));
   float dz=surface.z-pose.z;
   float unpitchedZ=sin(tilt.y)*horizontal.x+cos(tilt.y)*dz;
   return vec3(cos(tilt.y)*horizontal.x-sin(tilt.y)*dz,
               cos(tilt.x)*horizontal.y+sin(tilt.x)*unpitchedZ,
               -sin(tilt.x)*horizontal.y+cos(tilt.x)*unpitchedZ);
 }
 vec3 cruiserSectionAt(float station){
   ${hullSections.slice(1).map(([end,...right],i)=>{
     const [start,...left]=hullSections[i];
     return `${i?'else ':''}if(station<=${glslFloat(end)})return mix(vec3(${left.map(glslFloat).join(',')}),vec3(${right.map(glslFloat).join(',')}),clamp((station-(${glslFloat(start)}))/${glslFloat(end-start)},0.,1.));`;
   }).join('\n')}
   return vec3(.015,1.35,.32);
 }
 float cruiserHeightFraction(float z,vec3 section){
   float chine=section.z+.85*section.x*${glslFloat(deadriseTangent)};
   if(z<chine)return ${CHINE}*(z-section.z)/(chine-section.z);
   return ${CHINE}+${1-CHINE}*(z-chine)/(section.y-chine);
 }
 float cruiserStemX(float station,float z,vec3 section){
   float rake=1.18*pow(max(0.,(station-1.5)/${bowX-1.5}),2.);
   return station-rake*(1.-clamp(cruiserHeightFraction(z,section),0.,1.));
 }
 float cruiserHalfFraction(float t){
   if(t<.23)return .85*t/.23;
   if(t<.65)return mix(.85,.972,(t-.23)/.42);
   return mix(.972,1.,(t-.65)/.35);
 }
 bool cruiserWaterExcluded(vec3 world){
   for(int i=0;i<5;i++){
     if(i>=cruiserCount)break;
     vec4 pose=cruiserPose[i];
     vec2 d=world.xy-pose.xy;
     if(dot(d,d)>34.)continue;
     vec3 p=cruiserLocal(world,pose,cruiserTilt[i]);
     if(p.x < ${sternX} || p.x > ${bowX} || abs(p.y)>1.62 || p.z < -.77 || p.z > 1.36)continue;
     float station=p.x;
     if(p.x>1.5){
       if(p.x>=cruiserStemX(${bowX},p.z,cruiserSectionAt(${bowX}))-.006)continue;
       float lo=p.x,hi=${bowX};
       for(int stepIndex=0;stepIndex<8;stepIndex++){
         float mid=(lo+hi)*.5;
         if(cruiserStemX(mid,p.z,cruiserSectionAt(mid))<p.x)lo=mid;
         else hi=mid;
       }
       station=(lo+hi)*.5;
     }
     vec3 section=cruiserSectionAt(station);
     float transom=${sternX}+.14*pow(min(1.,abs(p.y)/1.22),2.);
     if(p.x<transom+.004 || p.z<=section.z || p.z>=section.y+.025)continue;
     float width=section.x*cruiserHalfFraction(cruiserHeightFraction(p.z,section));
     if(abs(p.y)<width-.018)return true;
   }
   return false;
 }`;
export const cruiserBeamGLSL=`
 bool crossesDeck(vec3 origin,vec3 delta,float base,float slope,vec2 ends,vec2 widths){
   float denom=delta.z-slope*delta.x;
   if(abs(denom)<.0001)return false;
   float t=(base+slope*origin.x-origin.z)/denom;
   if(t<=0.||t>=.999)return false;
   vec2 hit=origin.xy+t*delta.xy;
   return hit.x>=ends.x&&hit.x<=ends.y&&abs(hit.y)<mix(widths.x,widths.y,(hit.x-ends.x)/(ends.y-ends.x));
 }
 bool cruiserBlocksBeam(vec3 origin,vec3 point){
   vec3 d=point-origin;
   return ${deckPanels.map(([base,slope,x0,x1,w0,w1])=>
     `crossesDeck(origin,d,${glslFloat(base)},${glslFloat(slope)},vec2(${glslFloat(x0)},${glslFloat(x1)}),vec2(${glslFloat(w0)},${glslFloat(w1)}))`).join('||')};
 }`;

// The cruiser projection stores the first deck hit rather than a colour cookie.
// Compare in the standard material lighting path so the deck still receives
// light up to that surface, while the beam and geometry beyond it stay dark.
function installSearchlightDepth(T){
  const original='directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;';
  if(!T.ShaderChunk.lights_fragment_begin.includes(original))return;
  T.ShaderChunk.lights_fragment_begin=T.ShaderChunk.lights_fragment_begin.replace(original,`
    if(inSpotLightMap){
      if(spotColor.a>.0015&&spotColor.a<.006){
        float blocker=48.*dot(spotColor.rg,vec2(65280.,255.))/65535.;
        directLight.color*=1.-smoothstep(blocker+.035,blocker+.10,length(spotLight.position-geometryPosition));
      }else directLight.color*=spotColor.rgb;
    }`);
}
const defaultDriveGeometry=[.40,.58,-3.74,-.84,.37];
function foilLoft(T,sections,point){
  const samples=18,positions=[],indices=[];
  for(let section=0;section<sections;section++){
    for(let index=0;index<samples;index++){
      const angle=2*Math.PI*index/samples;
      const u=.5*(1-Math.cos(angle));
      const thickness=5*(.2969*Math.sqrt(u)-.126*u-.3516*u*u+.2843*u**3-.1036*u**4);
      positions.push(...point(section,u,Math.sign(Math.sin(angle))*thickness));
    }
  }
  for(let section=0;section<sections-1;section++)for(let index=0;index<samples;index++){
    const a=section*samples+index,b=section*samples+(index+1)%samples;
    indices.push(a,b,a+samples,b,b+samples,a+samples);
  }
  for(let i=1;i<samples-1;i++){
    const tip=(sections-1)*samples;
    indices.push(0,i+1,i,tip,tip+i,tip+i+1);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function cruiserDrive(T,group,geometry,collectPart,addBatch){
  const [diameter,halfSpacing,transom,shaftZ,axleOffset]=geometry?.length===5?geometry:defaultDriveGeometry;
  const cast=new T.MeshStandardMaterial({color:0x1f2529,metalness:.31,roughness:.44,side:T.DoubleSide});
  const rubber=new T.MeshStandardMaterial({color:0x252727,roughness:.78});
  const steel=new T.MeshStandardMaterial({color:0x9ea8aa,metalness:.65,roughness:.29});
  const propellerMetal=new T.MeshStandardMaterial({color:0xb1b7ba,metalness:.77,roughness:.31,side:T.DoubleSide});
  const propellers=[],drives=[],firstFixture=group.children.length;
  const v3=(x,y,z)=>new T.Vector3(x,y,z);
  function mesh(parent,geometry,material,position){
    const item=new T.Mesh(geometry,material);
    if(position)item.position.set(...position);
    parent.add(item);return item;
  }
  function rod(parent,start,end,radius,material){
    const a=v3(...start),delta=v3(...end).sub(a);
    const item=mesh(parent,new T.CylinderGeometry(radius,radius,delta.length(),12),material);
    item.position.copy(a).addScaledVector(delta,.5);
    item.quaternion.setFromUnitVectors(v3(0,1,0),delta.normalize());
    return item;
  }
  const hubGeometry=new T.LatheGeometry(
    [[-.066,.023],[-.052,.039],[.040,.046],[.054,.026]].map(([x,r])=>new T.Vector2(r,x)),18);
  const radius=diameter/2;
  // Adjustable propeller planes straddle the single effective disk used by
  // TwinSterndrive. The leading and trailing propellers counter-rotate.
  const bladeGeometries=[1,-1].map(hand=>foilLoft(T,17,(row,u,t)=>{
    const v=row/16,r=radius*(.22+.78*v),width=radius*(.15+.97*v)*Math.sqrt(1.012-v*v);
    const beta=Math.atan(.94*diameter/(2*Math.PI*r)),chord=(.43-u)*width;
    const normal=.18*width*t,theta=hand*(-.50*v*v+(Math.cos(beta)*chord-Math.sin(beta)*normal)/r);
    return [Math.sin(beta)*chord+Math.cos(beta)*normal-.10*radius*v*v,r*Math.cos(theta),r*Math.sin(theta)];
  }));
  for(const [side,name] of [[1,'Port'],[-1,'Starboard']]){
    const y=side*halfSpacing;
    mesh(group,new T.BoxGeometry(.15,.30,.43),cast,[transom+.015,y,-.085]);
    rod(group,[transom-.073,y,-.166],[transom+.006,y,-.166],.116,rubber);
    for(const dx of [-.066,-.045,-.024]){
      const rib=mesh(group,new T.TorusGeometry(.107,.009,6,16),rubber,[transom+dx,y,-.166]);
      rib.rotation.y=Math.PI/2;
    }
    for(const dy of [-.113,.113])for(const z of [-.234,.075]){
      const fastener=mesh(group,new T.CylinderGeometry(.016,.016,.021,6),steel,[transom-.068,y+dy,z]);
      fastener.rotation.z=Math.PI/2;
    }
    const drive=new T.Group();drive.name=name+' sterndrive';drive.position.set(transom,y,shaftZ);
    drive.userData.physicsJoint={axis:[0,0,1],label:name+' sterndrive steering axis'};
    group.add(drive);drives.push(drive);

    const stations=[
      [-.148,-axleOffset+.068,.104,.032],[-.06,-axleOffset+.061,.218,.068],
      [.03,-axleOffset+.085,.258,.095],[.24,-axleOffset+.111,.291,.090],
      [.43,-axleOffset+.119,.318,.101],[.66,-axleOffset+.147,.324,.118],
      [.762,-axleOffset+.169,.262,.110],[.842,-axleOffset+.174,.220,.082]
    ];
    mesh(drive,foilLoft(T,stations.length,(row,u,t)=>{
      const [z,x,chord,half]=stations[row];
      return [x+(.54-u)*chord,11*half*t,z];
    }),cast);
    mesh(drive,new T.BoxGeometry(.414,.312,.025),cast,[-axleOffset+.080,0,.252]);
    mesh(drive,new T.BoxGeometry(.306,.241,.020),cast,[-axleOffset+.094,0,.445]);
    rod(drive,[-axleOffset-.071,0,0],[-axleOffset+.139,0,0],.042,cast);
    for(const sign of [-1,1]){
      rod(drive,[-.017,sign*.135,.565],[-axleOffset+.122,sign*.105,.428],.017,steel);
      rod(drive,[-axleOffset+.160,sign*.114,.454],[-.011,sign*.138,.575],.031,cast);
    }
    const disk=new T.Group();
    disk.name=name+' propeller disk';disk.position.set(-axleOffset,0,0);drive.add(disk);
    for(const [index,direction] of [[0,1],[1,-1]]){
      const rotor=new T.Group();
      rotor.name=name+(index?' aft propeller':' forward propeller');
      rotor.position.x=index?-.047:.037;
      rotor.scale.setScalar(index?.91:1);
      if(index)rotor.rotation.x=Math.PI/3;
      rotor.userData.physicsJoint={axis:[1,0,0],label:rotor.name};
      disk.add(rotor);propellers.push({rotor,direction});
      const hub=mesh(rotor,hubGeometry,propellerMetal);hub.rotation.z=-Math.PI/2;
      for(let i=0;i<3;i++){
        mesh(rotor,bladeGeometries[index],propellerMetal).rotation.x=2*Math.PI*i/3;
      }
    }
  }
  // Keep each drive pivot and propeller shaft independent while batching
  // their rigid fittings for repeated fleet views.
  const discarded=new Set();
  function batchFixtures(parent,fixtures){
    const materials=new Map();
    for(const item of fixtures.filter(child=>child.isMesh)){
      item.updateMatrix();
      collectPart(item.geometry.clone(),0xffffff,item.matrix,item.material,materials);
      discarded.add(item.geometry);item.removeFromParent();
    }
    for(const [material,batch] of materials)showInLowWaterCapture(addBatch(parent,material,batch));
  }
  batchFixtures(group,group.children.slice(firstFixture));
  for(const drive of drives)batchFixtures(drive,drive.children);
  for(const {rotor} of propellers)batchFixtures(rotor,rotor.children);
  for(const geometry of discarded)geometry.dispose();
  return {propellers,drives};
}

function portHoist(T,hull,{fittings,collectPart,addBatch,metal,steel}){
  const {box,rod}=fittings(),alloy=0xb3bdbf,paint=0x48565c,rubber=0x293130,lineColor=0x75878b;
  // A bolted socket and an exterior doubler share the port gunwale frame.
  box(liftX,hingeY,.817,.23,.195,.034,paint);
  box(liftX,1.271,.68,.19,.032,.26,paint,new T.Euler(-.055,0,0));
  for(const dx of [-.075,.075]){
    for(const dy of [-.06,.06])rod([liftX+dx,hingeY+dy,.831],[liftX+dx,hingeY+dy,.846],.012,steel);
    for(const z of [.59,.76])rod([liftX+dx,1.264,z],[liftX+dx,1.293,z],.012,steel);
  }
  rod([liftX,hingeY,.831],[liftX,hingeY,1.84],.051,alloy);
  for(const z of [.864,1.45,1.80])rod([liftX,hingeY,z],[liftX,hingeY,z+.034],.069,paint);
  // Two padded crossbearers span the engine hatch on four cockpit sole feet.
  for(const x of [liftX-.265,liftX+.215]){
    box(x,.0175,.611,.065,.905,.032,alloy);
    box(x,.13,.6335,.060,.325,.013,rubber);
    for(const y of [-.408,.443]){
      box(x,y,.565,.09,.065,.06,paint);
      box(x,y,.541,.11,.085,.012,alloy);
    }
  }
  const jib=new T.Group(),bins=new Map();
  jib.name='Slewing davit jib';jib.position.set(liftX,hingeY,0);hull.add(jib);
  const ax=new T.Vector3(0,1,0);
  function part(geometry,color,pos,q){
    const matrix=new T.Matrix4().compose(new T.Vector3(...pos),q??new T.Quaternion(),new T.Vector3(1,1,1));
    collectPart(geometry,color,matrix,metal,bins);
  }
  function tube(from,to,width,depth,color){
    const a=new T.Vector3(...from),b=new T.Vector3(...to),delta=b.clone().sub(a);
    part(new T.BoxGeometry(width,delta.length(),depth),color,a.lerp(b,.5).toArray(),
      new T.Quaternion().setFromUnitVectors(ax,delta.normalize()));
  }
  function wheel(x,y,z,r,length,color){
    part(new T.CylinderGeometry(r,r,length,20),color,[x,y,z],new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2));
  }
  tube([0,0,1.84],[0,davitReach,tipZ],.073,.09,alloy);
  tube([0,0,1.48],[0,.64,2.01],.055,.060,paint);
  for(const x of [-.044,.044])tube([x,.97,2.075],[x,1.075,2.135],.018,.10,paint);
  wheel(0,davitReach,tipZ,.055,.062,paint);wheel(.053,davitReach,tipZ,.014,.022,steel);
  // The line winds onto a transverse drum and passes up the jib to the head sheave.
  for(const x of [-.066,.066])tube([x,-.035,1.48],[x,-.035,1.65],.018,.10,paint);
  wheel(0,-.04,1.615,.056,.12,paint);
  for(let i=-4;i<=4;i++)wheel(.011*i,-.04,1.615,.059,.011,lineColor);
  for(const x of [-.065,.065])wheel(x,-.04,1.615,.071,.014,alloy);
  tube([.072,-.04,1.615],[.072,-.12,1.565],.013,.014,paint);
  wheel(.10,-.12,1.565,.012,.057,rubber);
  tube([0,-.07,1.657],[0,-.035,1.88],.006,.006,lineColor);
  tube([0,-.035,1.88],[0,1.038,2.171],.006,.006,lineColor);
  for(const [mat,batch] of bins)showInLowWaterCapture(addBatch(jib,mat,batch));

  const ropeMat=new T.MeshStandardMaterial({color:lineColor,roughness:.6,metalness:.2});
  const segments=8,line=new T.InstancedMesh(new T.CylinderGeometry(.0045,.0045,1,6),ropeMat,segments);
  line.name='Davit winch line';line.frustumCulled=false;hull.add(showInLowWaterCapture(line));
  // The electromagnet face is the solver attachment point, with the cable
  // entering the potted coil through its insulated gland on top.
  const magnet=new T.Group();magnet.name='Davit electromagnet';hull.add(magnet);
  const bright=new T.MeshStandardMaterial({color:0xaab7b6,roughness:.38,metalness:.5});
  const coil=new T.MeshStandardMaterial({color:0x39484f,roughness:.62,metalness:.25});
  function disc(name,radius,height,z,material){
    const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,height,20),material);
    mesh.name=name;mesh.rotation.x=Math.PI/2;mesh.position.z=z;magnet.add(mesh);
  }
  disc('Magnet landing face',.0335,.003,.0015,bright);
  disc('Potted magnet winding',.034,.028,.017,coil);
  disc('Magnet cover',.029,.004,.033,bright);
  disc('Cable strain relief',.007,.014,.042,coil);
  const magnetLight=new T.MeshStandardMaterial({color:0x27312b,emissive:0x37c565,emissiveIntensity:0});
  disc('Magnet energized indicator',.006,.002,.036,magnetLight);magnet.children.at(-1).position.x=.016;
  // Folding hook keeper stands on the forward saddle when the empty cable is parked.
  const keeper=new T.Group();keeper.name='Folding magnet keeper';
  const parked=liftMechanism(1);
  keeper.position.set(liftX+.215,parked.padY,.645);
  const socket=new T.Vector3(-.215,0,parked.padZ+bridleHeight-.645);
  const stalk=new T.Mesh(new T.CylinderGeometry(.006,.009,socket.length(),7),bright);
  stalk.position.copy(socket).multiplyScalar(.5);
  stalk.quaternion.setFromUnitVectors(ax,socket.clone().normalize());
  const clip=new T.Mesh(new T.CylinderGeometry(.030,.02,.005,12),bright);
  clip.rotation.x=Math.PI/2;clip.position.copy(socket);clip.position.z-=.0025;
  keeper.add(stalk,clip);hull.add(keeper);
  const tip=new T.Vector3(),load=new T.Vector3(),bulge=new T.Vector3(),v=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3();
  const section=new T.Object3D(),inverse=new T.Quaternion(),origin=new T.Vector3(),frame=new T.Euler(0,0,0,'ZYX');
  const localUp=new T.Vector3(),cableEnd=new T.Vector3(),upAxis=new T.Vector3(0,0,1);
  function setLift(level,cable,carrier,occupied=false,riderPose,goal=level){
    const m=liftMechanism(level);jib.rotation.z=m.slew;hull.userData.portLiftLevel=level;
    let paid=m.paid;
    if(cable?.length===8&&carrier){
      inverse.setFromEuler(frame.set(carrier.heel,carrier.pitch,carrier.yaw,'ZYX')).invert();
      origin.set(carrier.x,carrier.y,carrier.z);
      tip.fromArray(cable).sub(origin).applyQuaternion(inverse);
      load.fromArray(cable,3).sub(origin).applyQuaternion(inverse);paid=cable[6];
      if(riderPose?.length===15)localUp.fromArray(riderPose,9).applyQuaternion(inverse).normalize();
      else localUp.copy(upAxis);
    }else{
      localUp.copy(upAxis);tip.set(m.padX,m.padY,tipZ);load.set(m.padX,m.padY,m.padZ+bridleHeight);
    }
    keeper.visible=!occupied&&level>.995&&Math.hypot(load.x-parked.padX,load.y-parked.padY,load.z-parked.padZ-bridleHeight)<.04;
    magnetLight.emissiveIntensity=occupied&&(level<.99999||goal===0)?1.2:0;
    magnet.position.copy(load);magnet.quaternion.setFromUnitVectors(upAxis,localUp);
    cableEnd.copy(load).addScaledVector(localUp,.049);a.copy(tip);
    const chord=tip.distanceTo(load),sag=Math.min(.16,Math.sqrt(Math.max(0,paid-chord)*Math.max(.02,chord)*.375));
    // Sag perpendicular to a sloped span; a nearly vertical slack fall bows
    // away from the hull. A taut span reduces to exactly its two endpoints.
    v.copy(load).sub(tip).normalize();bulge.set(0,0,-1).addScaledVector(v,v.z);
    if(bulge.lengthSq()<.01)bulge.set(0,1,0);
    bulge.normalize().multiplyScalar(sag);
    for(let i=0;i<segments;i++){
      const f=(i+1)/segments;b.lerpVectors(tip,cableEnd,f).addScaledVector(bulge,4*f*(1-f));
      section.position.copy(a).lerp(b,.5);v.subVectors(b,a);section.scale.set(1,v.length(),1);
      section.quaternion.setFromUnitVectors(ax,v.normalize());section.updateMatrix();
      line.setMatrixAt(i,section.matrix);a.copy(b);
    }
    line.instanceMatrix.needsUpdate=true;
  }
  setLift(1);return setLift;
}

export function cabinCruiser(T,sonarCanvas,chartCanvas,driveGeometry){
  // Keep local light counts fixed so toggle changes are uniform updates.
  // Remote cruisers add lights only when they actually illuminate the scene.
  const fixedLightCount=Boolean(sonarCanvas);
  function switchFixture(fixture,on){
    fixture.userData.ratedIntensity??=fixture.intensity;
    fixture.visible=fixedLightCount||on;
    fixture.intensity=on?fixture.userData.ratedIntensity:0;
  }
  const group=new T.Group();group.name='Sea Ray Sundancer 320';group.rotation.order='ZYX';
  const ivory=0xe7e9df,white=0xf4f4eb,wood=0x966943,plank=0xae865d,trim=0x253b40,
    steel=0xb8c9c8,brass=0xb29255,upholstery=0xdfddca;
  const solid=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.62}),
    metal=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.33,metalness:.35}),
    glass=new T.MeshPhongMaterial({color:0x6e9da2,transparent:true,opacity:.32,specular:0xccdfe4,
      shininess:85,side:T.DoubleSide,depthWrite:false});
  const panelCentres=[-2.56,-.25,2.10,-2.56,-.25,2.10];
  const damage=panelCentres.map(x=>({
    condition:{value:100},radius:{value:0},centre:{value:new T.Vector2(x,-.30)},
  }));
  const panelMaterials=damage.map(({condition,radius,centre},index)=>{
    const material=solid.clone();
    material.name='Hull panel '+(index+1);
    material.onBeforeCompile=shader=>{
      shader.uniforms.panelCondition=condition;
      shader.uniforms.holeRadius=radius;
      shader.uniforms.holeCentre=centre;
      shader.uniforms.fractureSeed={value:5.23+index*13.61};
      shader.vertexShader='varying vec3 hullPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n hullPoint=position;');
      shader.fragmentShader=`varying vec3 hullPoint;
        uniform float panelCondition,holeRadius,fractureSeed;
        uniform vec2 holeCentre;
        float hashFracture(float x){return fract(sin(x*43.853)*2517.31);}
      `+shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          vec2 portSize=vec2(${cabinPorts.radiusX},${cabinPorts.radiusZ});
          vec2 portA=(hullPoint.xz-vec2(${cabinPorts.stations[0]},${cabinPorts.height}))/portSize;
          vec2 portB=(hullPoint.xz-vec2(${cabinPorts.stations[1]},${cabinPorts.height}))/portSize;
          if(abs(hullPoint.y)>.54&&min(dot(portA,portA),dot(portB,portB))<1.)discard;

          float wear=clamp(1.-panelCondition/100.,0.,1.);
          float roughFibreglass=0.;
          diffuseColor.rgb*=mix(vec3(1.),vec3(.75,.69,.57),wear*.42);
          if(holeRadius>.002){
            vec2 rel=hullPoint.xz-holeCentre;
            float range=length(rel);
            if(range<holeRadius*1.4+.14){
              float angle=atan(rel.y,rel.x);
              float sector=24.*(angle/6.283185307+.5);
              float tooth=hashFracture(mod(floor(sector),24.)+fractureSeed);
              float next=hashFracture(mod(floor(sector)+1.,24.)+fractureSeed);
              float torn=mix(tooth,next,fract(sector))-.5;
              float subSector=sector*3.+fractureSeed;
              float splinter=(1.-abs(2.*fract(subSector)-1.))
                *hashFracture(mod(floor(subSector),72.)+fractureSeed);
              float edge=holeRadius*(1.+.112*sin(3.*angle+fractureSeed)
                +.076*cos(7.*angle-fractureSeed)+.28*torn+.047*splinter);
              float lip=range-edge;
              if(lip<0.)discard;

              // The innermost strip is dark wet resin. The torn laminate
              // outside it catches light in short radial strands.
              float width=clamp(holeRadius*.57,.023,.074)*mix(.65,1.2,tooth);
              float chip=1.-smoothstep(.62*width,width,lip);
              float layer=smoothstep(.002,.22*width,lip);
              float grainSlot=floor(sector*12.+fractureSeed);
              float strand=hashFracture(grainSlot+tooth*17.);
              vec2 chips=floor(hullPoint.xz*420.);
              float speckle=hashFracture(dot(chips,vec2(3.31,11.9))+fractureSeed);
              float fibers=(.14+.60*smoothstep(.39,.75,strand)+.26*speckle)
                *(1.-smoothstep(.36*width,.98*width,lip));
              float wetSide=.52+.48*smoothstep(-.9,.72,cos(angle+.77));
              vec3 resin=vec3(.049,.041,.031)*wetSide;
              vec3 laminate=mix(vec3(.30,.238,.163),vec3(.88,.82,.69),fibers);
              diffuseColor.rgb=mix(diffuseColor.rgb,mix(resin,laminate,layer),chip);

              // Thin cracks spread into the gelcoat past the exposed layers.
              float crackCount=31.*(angle/6.283185307+.5);
              float crackId=floor(crackCount);
              float fleck=hashFracture(crackId+fractureSeed*2.);
              float crackLine=abs(fract(crackCount+fleck*.41+lip*(.72-fleck))- .46);
              float crackMask=(1.-smoothstep(.018,.056,crackLine))
                *(1.-smoothstep(width,width+.10*fleck,lip))*step(.59,fleck);
              diffuseColor.rgb*=1.-.41*crackMask;
              roughFibreglass=max(chip,.56*crackMask);
            }
          }
        `).replace('#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,.96,roughFibreglass);');
    };
    return material;
  });
  // Hull, pilothouse and fittings are fixed relative to one another. Bake them
  // by surface finish so a distant peer's grab rails take a single draw call.
  const batches=new Map(),v3=(x,y,z)=>new T.Vector3(x,y,z);
  function collectPart(geometry,color,matrix,material,collection){
    geometry.applyMatrix4(matrix);
    let batch=collection.get(material);
    if(!batch){
      batch={attributes:{position:[],normal:[],color:[]},indices:[]};
      if(material.map)batch.attributes.uv=[];
      collection.set(material,batch);
    }
    const positions=geometry.attributes.position,offset=batch.attributes.position.length/3;
    const rgb=new T.Color(color);
    for(const [name,data] of Object.entries(batch.attributes)){
      if(name==='color'){
        for(let i=0;i<positions.count;i++)data.push(rgb.r,rgb.g,rgb.b);
      }else{
        const source=geometry.attributes[name];
        for(let i=0;i<source.array.length;i++)data.push(source.array[i]);
      }
    }
    const index=geometry.index;
    for(let i=0;i<(index?.count??positions.count);i++)batch.indices.push(offset+(index?index.getX(i):i));
    geometry.dispose();
  }
  function addBatch(parent,material,batch){
    const geometry=new T.BufferGeometry();
    for(const [name,data] of Object.entries(batch.attributes))
      geometry.setAttribute(name,new T.Float32BufferAttribute(data,name==='uv'?2:3));
    geometry.setIndex(batch.indices);
    const mesh=new T.Mesh(geometry,material);
    parent.add(mesh);
    return mesh;
  }
  function fittings(frame){
    function part(geometry,color,pos,rot,scale,material=solid){
      const matrix=new T.Matrix4().compose(v3(...(pos??[0,0,0])),
        new T.Quaternion().setFromEuler(rot??new T.Euler()),v3(...(scale??[1,1,1])));
      if(frame)matrix.premultiply(frame);
      collectPart(geometry,color,matrix,material,batches);
    }
    function box(x,y,z,l,w,h,color,rotation){
      part(new T.BoxGeometry(l,w,h),color,[x,y,z],rotation);
    }
    function rod(a,b,r,color,material=metal){
      const start=v3(...a),end=v3(...b),dir=end.clone().sub(start);
      const rot=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(v3(0,1,0),dir.clone().normalize()));
      part(new T.CylinderGeometry(r,r,dir.length(),8),color,start.lerp(end,.5).toArray(),rot,null,material);
    }
    return {part,box,rod};
  }
  const {part,box,rod}=fittings();
  const interior=cockpitReady?vehicleShell(cruiserCockpit):null;
  if(interior){
    interior.name='Sundancer 320 cockpit';
    interior.traverse(showInLowWaterCapture);
    group.add(interior);
  }
  function pad(x,y,z,l,w,h,color,material=solid){
    part(new T.SphereGeometry(1,16,10),color,[x,y,z],null,[l,w,h],material);
  }
  function roundedSeat(l,w,h){
    const r=Math.min(.075,l*.18,w*.18),c=new T.Shape();
    c.moveTo(-l/2+r,-w/2);c.lineTo(l/2-r,-w/2);c.quadraticCurveTo(l/2,-w/2,l/2,-w/2+r);
    c.lineTo(l/2,w/2-r);c.quadraticCurveTo(l/2,w/2,l/2-r,w/2);
    c.lineTo(-l/2+r,w/2);c.quadraticCurveTo(-l/2,w/2,-l/2,w/2-r);
    c.lineTo(-l/2,-w/2+r);c.quadraticCurveTo(-l/2,-w/2,-l/2+r,-w/2);
    return new T.ExtrudeGeometry(c,{depth:h,bevelSize:.015,bevelThickness:.015,bevelSegments:3});
  }
  function cushion(x,y,z,l,w,h,color){
    part(roundedSeat(l,w,h),color,[x,y,z]);
  }
  function surface(rows,color,material=solid){
    const g=new T.BufferGeometry(),n=rows[0].length,indices=[];
    for(let i=1;i<rows.length;i++)for(let j=1;j<n;j++){
      const a=(i-1)*n+j-1,b=a+n;indices.push(a,b,a+1,a+1,b,b+1);
    }
    g.setAttribute('position',new T.Float32BufferAttribute(rows.flat(2),3));
    g.setIndex(indices);g.computeVertexNormals();part(g,color,null,null,null,material);
  }
  // The render loft samples the same stations and cross-sections as the
  // collision hull, with subdivisions for the raked forefoot and curved transom.
  const stations=hullSections.flatMap(([x],index)=>{
    if(index===hullSections.length-1)return [x];
    const next=hullSections[index+1][0],segments=Math.ceil((next-x)/.20);
    return Array.from({length:segments},(_,i)=>interpolate(x,next,i/segments));
  });
  const sections=stations.map(x=>{
    const dimensions=hullSection(x),[,w,top,k]=dimensions;
    return {x,w,top,k,point:(side,f,t)=>hullPoint(dimensions,side,f,t)};
  });
  const blue=0x153e60,ivoryBottom=0xf2f1e8,glassBand=0x16242d;
  function heightFraction(section,z){
    const {w,top,k}=section,chine=chineHeight(w,k);
    return T.MathUtils.clamp(z<chine?CHINE*(z-k)/(chine-k):CHINE+(1-CHINE)*(z-chine)/(top-chine),0,1);
  }
  function beamFraction(t){
    if(t<CHINE)return .85*t/CHINE;
    if(t<.65)return interpolate(.85,.972,(t-CHINE)/(.65-CHINE));
    return interpolate(.972,1,(t-.65)/.35);
  }
  function platingPoint(section,side,t,offset=0){
    if(!offset)return section.point(side,beamFraction(t),t);
    const point=section.point(side,beamFraction(t),t);
    point[1]+=side*offset;
    return point;
  }
  const splits=[0,sections.findIndex(k=>k.x>=-1.40),sections.findIndex(k=>k.x>=.95),sections.length-1];
  for(const side of [-1,1]){
    for(let i=0;i<3;i++){
      const span=sections.slice(splits[i],splits[i+1]+1),material=panelMaterials[i+(side>0?0:3)];
      surface(span.map(k=>hullPlating.map(([,t])=>platingPoint(k,side,Math.max(t,heightFraction(k,.044))))),blue,material);
      surface(span.map(k=>hullPlating.map(([,t])=>platingPoint(k,side,Math.min(t,heightFraction(k,.018))))),ivoryBottom,material);
      surface(span.map(k=>[.044,.018].map(z=>platingPoint(k,side,heightFraction(k,z)))),white,material);
    }
    // The stainless insert caps the dark sheer-side rub rail.
    surface(sections.map(k=>[.999,.982].map(t=>platingPoint(k,side,t,.006))),trim);
    surface(sections.map(k=>[.996,.990].map(t=>platingPoint(k,side,t,.009))),steel,metal);

    // The strakes break away with the surrounding fiberglass.
    for(let i=0;i<3;i++){
      const run=sections.slice(splits[i],splits[i+1]+1).filter(k=>k.x<3.80);
      const material=panelMaterials[i+(side>0?0:3)];
      for(const fraction of [.27,.56]){
        surface(run.map(k=>{
          const fade=T.MathUtils.clamp((3.80-k.x)/1.58,0,1),span=.060*fade;
          const outer=k.point(side,fraction+span,CHINE*(fraction+span)/.85);
          const root=k.point(side,fraction,CHINE*fraction/.85);
          return [root,[outer[0],outer[1],outer[2]-.026*fade],outer];
        }),ivoryBottom,material);
      }
    }
    // The black hull window band lies over the port openings and shares their
    // clip material, so the cabin views and flooding can still see through.
    const window=sections.filter(k=>k.x>.97&&k.x<3.39);
    surface(window.map((k,i)=>{
      const u=i/(window.length-1);
      const span=.151*Math.pow(Math.max(0,Math.sin(Math.PI*u)),.61),center=.713+.074*u;
      return [center+span,center-span].map(z=>platingPoint(k,side,heightFraction(k,z),.003));
    }),glassBand,panelMaterials[2+(side>0?0:3)]);
  }
  const stern=sections[0],stem=sections.at(-1);
  for(const end of [stern,stem]){
    const boot=heightFraction(end,.042);
    for(const [color,above] of [[ivoryBottom,false],[blue,true]]){
      if(above?boot>=1:boot<=0)continue;
      surface(hullPlating.map(([,height])=>{
        const t=above?Math.max(boot,height):Math.min(boot,height);
        return Array.from({length:13},(_,i)=>{
          const across=(i-6)/6;
          return end.point(Math.sign(across),Math.abs(across)*beamFraction(t),t);
        });
      }),color);
    }
  }
  const [sonarX,sonarY,sonarZ]=sonarMount;
  const [, , , sonarKeel]=hullSection(sonarX);
  rod([sonarX,sonarY,sonarKeel+.02],[sonarX-.04,sonarY,sonarZ+.024],.058,trim);
  pad(sonarX-.06,sonarY,sonarZ+.029,.17,.095,.047,trim);

  // The cockpit sole stays at the CAD assembly's mounting datum. Wider
  // outboard gunwales meet the molded coamings along a separate inner line.
  const cockpit=sections.filter(k=>k.x<1.27);
  function wellHalf(k){return Math.min(1.10,.89*k.w);}
  surface(cockpit.map(k=>[-1,1].map(side=>{
    const p=k.point(side,wellHalf(k)/k.w,heightFraction(k,.535));p[2]=.535;return p;
  })),interior?0xddddda:plank);
  if(!interior)for(let i=-8;i<=8;i++)box(-2.24,i*.12,.537,2.48,.009,.004,wood);
  for(const side of [-1,1]){
    surface(cockpit.map(k=>[k.point(side,1,1),k.point(side,wellHalf(k)/k.w,1)]),white);
    surface(cockpit.map(k=>{
      const top=k.point(side,wellHalf(k)/k.w,1),base=k.point(side,wellHalf(k)/k.w,heightFraction(k,.535));
      base[2]=.535;return [top,base];
    }),ivory);
  }
  // Aft ends of the cockpit lining meet the forward face of the transom.
  surface(Array.from({length:15},(_,i)=>{
    const f=(i-7)/7*wellHalf(stern)/stern.w;
    const point=t=>stern.point(Math.sign(f),Math.abs(f),t);
    return [point(1),point(heightFraction(stern,.535))];
  }),ivory);
  for(const x of [-3.31,-2.91]){
    const k=hullSection(x),top=k[2];
    rod([x,-1.12,top],[x+.015,-1.12,top+.14],.021,steel);
  }
  rod([-3.31,-1.12,hullSection(-3.31)[2]+.141],[-2.89,-1.12,hullSection(-2.91)[2]+.141],.022,steel);

  // The forward lounge sits in a molded foredeck well. Its two access
  // walkways retain the sheer height all the way to the bow roller.
  const foredeck=sections.filter(k=>k.x>1.15);
  surface(foredeck.map(k=>{
    const recess=T.MathUtils.clamp(Math.min((k.x-2.72)/.48,(4.69-k.x)/.46),0,1);
    const edge=k.w*(.56+.16*recess),z=k.top-.11*recess,shoulder=Math.min(.98*k.w,edge+.053);
    return [[k.x,k.w,k.top],[k.x,shoulder,k.top+.007],[k.x,edge,z],
      [k.x,-edge,z],[k.x,-shoulder,k.top+.007],[k.x,-k.w,k.top]];
  }),ivory);
  box(3.24,0,1.157,1.23,1.31,.095,ivory);
  for(const y of [-.45,0,.45]){
    cushion(3.35,y,1.203,1.270,.417,.084,upholstery);
    part(roundedSeat(.173,.424,.386),upholstery,[2.614,y,1.182],new T.Euler(0,-.29,0));
    part(roundedSeat(.124,.354,.128),white,[2.527,y,1.521],new T.Euler(0,-.29,0));
  }
  for(const side of [-1,1]){
    cushion(3.05,side*.705,1.265,.71,.103,.067,upholstery);
    const [x,y,z]=hullPoint(hullSection(4.02),side,.73,1);
    pad(x,y,z+.014,.053,.049,.015,steel,metal);
    pad(x,y,z+.021,.031,.030,.010,trim);
  }
  rod([5.07,0,1.341],[5.46,0,1.371],.056,steel);
  for(const side of [-1,1]){
    rod([5.32,side*.095,1.369],[5.51,side*.040,1.381],.019,steel);
  }
  // The flush engine access hatch sits under the Piccard cradle.
  box(-2.45,0,.540,1.40,.91,.012,trim);
  box(-2.45,0,.546,1.365,.876,.012,ivory);
  if(!interior){
    box(-2.52,-.84,.68,1.70,.43,.24,ivory);
    for(const x of [-2.94,-2.11])cushion(x,-.84,.80,.79,.43,.076,upholstery);
    cushion(-2.53,-1.045,.87,1.64,.09,.16,upholstery);
    box(-3.38,0,.68,.36,1.17,.24,ivory);
    cushion(-3.38,0,.80,.36,1.17,.076,upholstery);
  }
  const setLift=portHoist(T,group,{fittings,collectPart,addBatch,metal,steel});
  // Integral swim platform with a recessed four-step ladder and a
  // starboard walk-through beside the raised transom seat back.
  const platform=new T.Shape();
  platform.moveTo(-3.55,-1.23);platform.lineTo(-4.29,-1.22);
  platform.quadraticCurveTo(-4.51,-1.18,-4.51,-.99);platform.lineTo(-4.51,.99);
  platform.quadraticCurveTo(-4.51,1.18,-4.29,1.22);platform.lineTo(-3.55,1.23);platform.closePath();
  part(new T.ExtrudeGeometry(platform,{depth:.076,bevelEnabled:true,bevelSize:.020,bevelThickness:.014,
    bevelSegments:3}),white,[0,0,.111]);
  part(roundedSeat(.694,1.73,.006),0xbcb9ac,[-4.062,.15,.204]);
  for(let i=-5;i<=6;i++)box(-4.062,.15+i*.13,.212,.635,.007,.002,0x9d998c);
  part(roundedSeat(.355,.289,.008),trim,[-4.223,-.835,.206]);
  for(let i=0;i<4;i++)rod([-4.34+i*.075,-.962,.227],[-4.34+i*.075,-.711,.227],.013,steel);
  for(const y of [-.973,-.698])rod([-4.365,y,.224],[-4.080,y,.224],.014,steel);
  surface([[[-3.788,-.56,.195],[-3.785,1.08,.195]],
    [[-3.778,-.56,.535],[-3.772,1.07,.535]],
    [[-3.756,-.56,.805],[-3.751,1.07,.805]],
    [[-3.628,-.54,.916],[-3.592,1.014,.916]]],ivory);
  for(const y of [-.272,.270,.804]){
    box(-3.772,y,.379,.030,.477,.311,0xb0b5b1,new T.Euler(0,-.12,0));
    box(-3.788,y,.380,.032,.453,.282,white,new T.Euler(0,-.12,0));
    rod([-3.817,y-.057,.492],[-3.817,y+.057,.492],.013,steel);
  }
  for(const y of [-1.086,-.618])rod([-3.798,y,.213],[-3.674,y,.780],.021,steel);
  surface([[[-3.794,-1.069,.222],[-3.792,-.631,.222]],
    [[-3.678,-1.069,.764],[-3.674,-.631,.764]]],0x747d79);
  rod([-3.690,-.924,.739],[-3.681,-.758,.739],.018,steel);
  for(const side of [-1,1]){
    const y=side*1.13;
    rod([-4.11,y,.213],[-4.01,y,.358],.018,steel);
    rod([-3.80,y,.213],[-3.75,y,.358],.018,steel);
    rod([-4.01,y,.358],[-3.75,y,.358],.019,steel);
  }
  const windshield=windshieldReady?vehicleShell(cruiserWindshield):null;
  if(windshield){
    windshield.name='Pilothouse glazing';
    windshield.traverse(showInLowWaterCapture);
    group.add(windshield);
  }
  // The pilothouse is open aft. Sloping solid quarter panels carry the roof,
  // while the wheelhouse side windows and two raked screens remain see-through.
  for(const s of [-1,1]){
    surface([[[-1.85,s*1.06,.77],[-1.75,s*1.04,1.02],[-1.63,s*1.01,1.14]],
      [[-1.18,s*1.05,.79],[-1.18,s*1.01,1.42],[-1.12,s*.99,1.24]],
      [[-.83,s*1.05,.82],[-.83,s*1.005,1.24],[-.83,s*1.00,1.34]]],white);
    // The molded shoulder covers the dash and joins the lower glass frame.
    surface([[[-.84,s*1.05,.82],[-.83,s*1.022,1.34],[-.83,s*1.00,1.34]],
      [[-.24,s*1.058,.875],[-.24,s*1.038,1.455],[-.24,s*.956,1.431]],
      [[.27,s*1.036,.923],[.27,s*1.024,1.632],[.27,s*.921,1.512]],
      [[.54,s*1.009,.944],[.54,s*.991,1.634],[.54,s*.902,1.55]],
      [[1.26,s*.88,1.0],[1.19,s*.862,1.65],[1.19,s*.85,1.65]],
      [[1.82,s*.65,1.10],[1.83,s*.649,1.19],[1.83,s*.64,1.19]]],white);
    if(!windshield){
      const A=[-.83,s*1.00,1.34],B=[1.19,s*.85,1.65],C=[.63,s*.83,2.09],D=[-.35,s*.89,2.14];
      surface([[A,D],[B,C]],0xffffff,glass);
      for(const [u,v] of [[A,D],[A,B],[C,D],[B,C],[[.27,s*.92,1.51],[-.08,s*.866,2.13]]])rod(u,v,.029,trim);
      rod(A,D,.021,steel);
    }
    surface([[[-1.82,s*1.035,.93],[-1.54,s*1.035,1.07]],
      [[-1.57,s*1.01,1.28],[-1.31,s*1.01,1.38]],
      [[-1.33,s*.97,1.68],[-1.09,s*.97,1.74]],
      [[-1.17,s*.93,2.01],[-.94,s*.93,2.02]],
      [[-1.21,s*.90,2.13],[-.96,s*.90,2.14]]],white);
    rod([-1.56,s*1.02,1.10],[.51,s*.86,2.12],.016,steel);
    for(const x of [.74,1.34]){
      const y=x<1?.957:.847,z=1.225;
      pad(x,s*y,z,.158,.027,.058,steel,metal);pad(x,s*(y+.025),z,.123,.015,.038,trim);
    }
    // The hull rail follows the broader side deck around the bow lounge.
    const forward=sections.filter((k,i)=>k.x>1.05&&(i%2===0||i===sections.length-1));
    const rail=forward.map(k=>[k.x,s*k.w*.94,k.top+.37]);
    rail.forEach((a,i)=>{
      if(i)rod(rail[i-1],a,.017,steel);
      if(i%3!==0&&i!==rail.length-2)return;
      const base=[a[0]-.036,a[1],a[2]-.37];
      pad(...base,.041,.032,.012,steel,metal);rod(base,a,.014,steel);
    });
    rod([-.75,s*.82,2.24],[.48,s*.77,2.23],.019,steel);
    for(const x of [-.75,.48])rod([x,s*.80,2.16],[x,s*.80,2.24],.015,steel);
  }
  if(!windshield){
    const B=[1.19,-.85,1.65],C=[.63,-.83,2.09],D=[.63,.83,2.09],A=[1.19,.85,1.65];
    surface([[B,C],[A,D]],0xffffff,glass);
    for(const [u,v] of [[B,A],[A,D],[D,C],[C,B],[[1.19,0,1.65],[.63,0,2.09]]])rod(u,v,.030,trim);
  }
  surface([[[1.19,-.85,1.65],[1.19,.85,1.65]],[[1.83,-.65,1.19],[1.83,.65,1.19]],[[2.04,-.48,1.10],[2.04,.48,1.10]]],ivory);
  // Rounded fiberglass hardtop with a dark retractable canvas insert.
  const rim=new T.Shape();
  rim.moveTo(-1.43,-.78);rim.quadraticCurveTo(-1.43,-1.08,-1.12,-1.08);
  rim.lineTo(.66,-.92);rim.quadraticCurveTo(.91,-.90,.91,-.67);rim.lineTo(.91,.67);
  rim.quadraticCurveTo(.91,.90,.66,.92);rim.lineTo(-1.12,1.08);
  rim.quadraticCurveTo(-1.43,1.08,-1.43,.78);rim.closePath();
  for(const [z,color,depth] of [[2.115,trim,.022],[2.144,white,.059]]){
    part(new T.ExtrudeGeometry(rim,{depth,bevelEnabled:true,bevelSegments:3,bevelSize:.022,bevelThickness:.016}),
      color,[0,0,z]);
  }
  part(roundedSeat(1.51,1.45,.019),0x3c4449,[-.236,0,2.204]);
  part(roundedSeat(1.438,1.38,.012),0x252d35,[-.231,0,2.230]);
  for(const x of [-.67,-.22,.21])box(x,0,2.243,.010,1.34,.004,0x3e444a);
  for(const side of [-1,1]){
    const s=side;
    surface([[[-1.78,s*1.045,1.00],[-1.62,s*1.044,1.09]],
      [[-1.33,s*.981,1.68],[-1.10,s*.982,1.77]],[[-1.16,s*.945,2.119],[-.954,s*.944,2.119]]],0x436073);
  }
  if(!interior){
    // Visible interior, including the companionway and the starboard helm.
    box(.39,0,.97,.68,1.79,.83,ivory);
    box(.33,-.39,1.40,.37,1.00,.21,trim);
    // Twin recessed helm displays face the seated operator. Draw bezel, chart,
    // sonar trace and separate switch bank on a single instrument face.
    const consoleTilt=new T.Euler(0,-.26,0);
    if(!sonarCanvas)for(const y of [-.61,-.19]){
      box(.101,y,1.54,.048,.39,.245,trim,consoleTilt);
      box(.064,y,1.54,.012,.342,.195,y<-.5?0x1d393d:0x427487,consoleTilt);
      for(let i=0;i<6;i++){
        const yy=y-.14+.050*i,zz=y<-.5?1.50+.03*Math.sin(i*1.7):1.49+.01*i;
        box(.052,yy,zz,.010,.04,.017,y<-.5?0xd9ad64:0x99ac70,consoleTilt);
      }
    }
    box(.025,-.48,1.26,.065,.87,.16,trim);
    box(.013,-.02,1.28,.06,.04,.20,wood);
    box(.00,-.90,1.18,.33,.18,.105,ivory);
    pad(-.01,-.90,1.238,.12,.061,.043,steel,metal);
    rod([.06,-.51,1.30],[-.11,-.51,1.37],.045,trim);
    for(const s of [-1,1]){
      rod([-.62,s*.53,.54],[-.62,s*.53,.90],.055,steel);
      cushion(-.63,s*.53,.90,.49,.44,.09,upholstery);cushion(-.83,s*.53,1.00,.11,.44,.22,upholstery);
      box(-1.06,s*.923,1.34,.23,.05,.092,wood);
    }
  }
  rod([-.28,.18,2.22],[-.47,.18,3.00],.018,steel);
  rod([-.45,.18,2.87],[-.49,.18,3.18],.007,steel);
  rod([.09,-.51,2.22],[-.20,-.51,3.64],.009,steel);
  pad(-.96,0,2.226,.18,.16,.049,white);
  rod([-.96,0,2.235],[-.96,0,2.36],.066,white);
  const domeProfile=[[0,0],[.164,0],[.193,.026],[.193,.108],[.181,.137],[.149,.151],[0,.159]];
  const radome=new T.LatheGeometry(domeProfile.map(([radius,height])=>new T.Vector2(radius,height)),28);
  radome.rotateX(Math.PI/2);
  const radar=showInLowWaterCapture(new T.Mesh(radome,new T.MeshStandardMaterial({color:white,roughness:.38})));
  radar.name='Marine radar dome';radar.position.set(-.96,0,2.354);group.add(radar);
  for(const s of [-1,1]){pad(.67,s*.91,2.14,.083,.027,.038,s>0?0x9a2926:0x277e50);}
  const {propellers,drives}=cruiserDrive(T,group,driveGeometry,collectPart,addBatch);
  const fixed=(geometry,color,parent=group,basic=false)=>{
    const material=basic?new T.MeshBasicMaterial({color}):new T.MeshStandardMaterial({color,roughness:.44});
    const m=new T.Mesh(geometry,material);parent.add(m);return m;
  };
  function fallbackHelmPivot(name,center){
    const pivot=new T.Group();pivot.name=name;pivot.position.set(...center);group.add(pivot);
    return pivot;
  }
  const wheelName='Steering_wheel_pivot';
  const steeringWheel=interior?.getObjectByName(wheelName)??fallbackHelmPivot(wheelName,[-.11,-.51,1.37]);
  const throttleLevers=['port','starboard'].map((side,index)=>{
    const name='Throttle_'+side+'_pivot';
    return interior?.getObjectByName(name)??fallbackHelmPivot(name,[-.01,-.86-index*.072,1.238]);
  });
  const wheelAxis=interior?v3(-.981625,.190822,0).normalize():v3(-1,0,0);
  if(!interior){
    const rim=showInLowWaterCapture(fixed(new T.TorusGeometry(.143,.013,8,40),trim,steeringWheel));
    rim.rotation.y=Math.PI/2;
    const hub=showInLowWaterCapture(fixed(new T.SphereGeometry(.041,16,8),steel,steeringWheel));
    hub.scale.x=.58;
    for(let i=0;i<3;i++){
      const angle=i*2*Math.PI/3;
      const spoke=showInLowWaterCapture(fixed(new T.BoxGeometry(.013,.124,.016),steel,steeringWheel));
      spoke.rotation.x=angle;
      spoke.position.set(0,.071*Math.cos(angle),.071*Math.sin(angle));
    }
    for(const lever of throttleLevers){
      const arm=showInLowWaterCapture(fixed(new T.CylinderGeometry(.014,.014,.141,12),steel,lever));
      arm.rotation.x=Math.PI/2;arm.position.z=.07;
      const grip=showInLowWaterCapture(fixed(new T.SphereGeometry(1,12,8),trim,lever));
      grip.position.z=.144;grip.scale.set(.038,.032,.025);
    }
  }
  const helmTravel=T.MathUtils.degToRad(150),leverTravel=T.MathUtils.degToRad(55);
  function setSteeringWheel(rudderAngle){
    steeringWheel.quaternion.setFromAxisAngle(wheelAxis,T.MathUtils.clamp(-rudderAngle/.52,-1,1)*helmTravel);
  }
  function setHelmControls(portThrottle,rudderAngle,starboardThrottle=portThrottle){
    const portTravel=T.MathUtils.clamp(portThrottle,-1,1)*leverTravel;
    const starboardTravel=T.MathUtils.clamp(starboardThrottle,-1,1)*leverTravel;
    if(interior){
      throttleLevers[0].rotation.z=-portTravel;
      throttleLevers[1].rotation.z=-starboardTravel;
    }else{
      throttleLevers[0].rotation.y=portTravel;
      throttleLevers[1].rotation.y=starboardTravel;
    }
    setSteeringWheel(rudderAngle);
  }
  const cabin=new T.Group();cabin.name='Forward cabin';group.add(cabin);
  const cabinObjects=new Map();
  let electricalPower=true;
  function cabinPart(g,color,position,parent=cabin,basic=false){
    const piece=fixed(g,color,parent,basic);
    piece.position.set(...position);return piece;
  }
  const deckObjects=new Map(),helmIndicators=new Map(),wiperPivots=[];
  const companionway=new T.Group();companionway.name='Companionway door';
  companionway.position.set(-.020,.42,1.02);group.add(companionway);
  cabinPart(new T.BoxGeometry(.055,.63,.61),interior?0x3b4141:0x4c3a2b,[0,0,0],companionway);
  cabinPart(new T.BoxGeometry(.025,.59,.565),interior?0xe7e6df:0x8f724e,[-.036,0,0],companionway);
  if(!interior)for(let i=0;i<4;i++)cabinPart(new T.BoxGeometry(.008,.54,.005),0x6b5139,
    [-.050,0,-.173+i*.106],companionway);
  const latch=cabinPart(new T.CylinderGeometry(.013,.013,.105,10),0xbac5c5,[-.069,.15,.072],companionway);
  latch.rotation.x=Math.PI/2;deckObjects.set('cabin',companionway);
  for(const [i,id] of ['search','underwater','wipers','anchor','bilge'].entries()){
    const mount=new T.Group();
    mount.name=id+' switch';mount.position.set(-.034,interior?-.448+i*.074:-.62+i*.101,1.272);group.add(mount);
    cabinPart(new T.BoxGeometry(.020,.066,.061),0x293d40,[0,0,0],mount);
    const rocker=cabinPart(new T.BoxGeometry(.016,.043,.038),id==='bilge'?0x8a4631:0x5b6765,[-.014,0,0],mount);
    const light=cabinPart(new T.BoxGeometry(.009,.022,.009),0x61726a,[-.024,0,.012],mount);
    if(id==='bilge'&&sonarCanvas){
      const labelCanvas=document.createElement('canvas');labelCanvas.width=128;labelCanvas.height=36;
      const ctx=labelCanvas.getContext('2d');
      ctx.fillStyle='#253230';ctx.fillRect(0,0,128,36);
      ctx.font='bold 27px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle='#f1ede0';ctx.fillText('BILGE',64,20);
      const labelTexture=new T.CanvasTexture(labelCanvas);labelTexture.colorSpace=T.SRGBColorSpace;
      const label=cabinPart(new T.PlaneGeometry(.062,.018),0xffffff,[-.022,0,-.042],mount);
      label.material.map=labelTexture;
      label.rotation.set(Math.PI/2,0,-Math.PI/2,'ZXY');
    }
    helmIndicators.set(id,{rocker,light});deckObjects.set(id,mount);
  }
  function setHelmSwitch(id,on){
    const {rocker,light}=helmIndicators.get(id);
    rocker.rotation.y=on?.23:-.23;
    light.material.emissive.setHex(on&&electricalPower?0x44e7a9:0);
    light.material.emissiveIntensity=on&&electricalPower?.85:0;
  }
  const upWindshield=v3(-.56,0,.44).normalize(),acrossWindshield=v3(0,1,0);
  const glassFrame=new T.Matrix4().makeBasis(acrossWindshield,upWindshield,
    v3(0,0,0).crossVectors(acrossWindshield,upWindshield));
  for(const side of [-1,1]){
    const mount=new T.Group();mount.position.set(1.176,side*.43,1.676);
    mount.quaternion.setFromRotationMatrix(glassFrame);group.add(mount);
    cabinPart(new T.CylinderGeometry(.031,.031,.025,14),trim,[0,0,0],mount).rotation.x=Math.PI/2;
    const pivot=new T.Group();pivot.name='Windshield wiper';mount.add(pivot);wiperPivots.push(pivot);
    cabinPart(new T.BoxGeometry(.012,.24,.015),trim,[0,.122,.014],pivot);
    cabinPart(new T.BoxGeometry(.020,.31,.015),0x121416,[.018,.287,.005],pivot);
  }
  function setWiper(angle){for(const pivot of wiperPivots)pivot.rotation.z=angle-.68;}
  setWiper(0);
  const setAnchor=boatAnchorView(T,group);
  // Intersect the rendered plating triangles so fittings and joinery follow
  // both the narrowing bow in plan and the V of the lower hull in section.
  const bowPlating=sections.filter(section=>section.x>1)
    .map(section=>hullPlating.map(([f,t])=>v3(...section.point(1,f,t))));
  const mouldRay=new T.Ray(v3(0,2,0),v3(0,-1,0)),mouldHit=v3(0,0,0);
  function bowHalfBeam(x,z){
    mouldRay.origin.set(x,2,z);
    for(let i=1;i<bowPlating.length;i++){
      const aft=bowPlating[i-1],forward=bowPlating[i];
      if(x<aft.at(-1).x||x>forward[0].x)continue;
      for(let j=1;j<aft.length;j++){
        if(mouldRay.intersectTriangle(aft[j-1],forward[j-1],aft[j],false,mouldHit)||
           mouldRay.intersectTriangle(aft[j],forward[j-1],forward[j],false,mouldHit))return mouldHit.y;
      }
    }
    return 0;
  }
  const cabinWood=0x805538,ivoryLining=0xe9e1cd;
  const cabinAft=1.19,cabinFore=2.80,cabinSole=.23,cabinInset=.052;
  const cabinRoof=x=>.963+.118*(x-cabinAft);
  const innerBeam=(x,z)=>bowHalfBeam(x,z)-cabinInset;
  function cabinSurface(geometry,color,name,place){
    const points=geometry.attributes.position;
    for(let i=0;i<points.count;i++)points.setXYZ(i,...place(points.getX(i),points.getY(i),points.getZ(i)));
    geometry.computeVertexNormals();
    const mesh=cabinPart(geometry,color,[0,0,0]);
    mesh.name=name;mesh.material.side=T.DoubleSide;
    return mesh;
  }
  for(const [name,height,color] of [['Cabin sole',()=>cabinSole,0xa17e5b],['Cabin ceiling',cabinRoof,ivoryLining]]){
    cabinSurface(new T.PlaneGeometry(cabinFore-cabinAft,2,24,1),color,name,(u,v)=>{
      const x=u+(cabinAft+cabinFore)/2,z=height(x);
      return [x,v*innerBeam(x,z),z];
    });
  }
  for(let i=-5;i<=5;i++){
    cabinSurface(new T.PlaneGeometry(cabinFore-cabinAft,.004,24,1),0x624a35,'Cabin sole seam',(u,v)=>{
      const x=u+(cabinAft+cabinFore)/2;
      return [x,i*.175*innerBeam(x,cabinSole)+v,cabinSole+.0015];
    });
  }
  cabinSurface(new T.PlaneGeometry(2,1,1,16),cabinWood,'Cabin forward bulkhead',(u,v)=>{
    const z=T.MathUtils.lerp(cabinSole,cabinRoof(cabinFore),v+.5);
    return [cabinFore,u*innerBeam(cabinFore,z),z];
  });
  const {stations:portStations,height:portHeight,radiusX,radiusZ}=cabinPorts;
  const portRim=.013;
  for(const side of [-1,1]){
    const lining=new T.Shape();
    lining.moveTo(cabinAft,cabinSole);lining.lineTo(cabinFore,cabinSole);
    lining.lineTo(cabinFore,cabinRoof(cabinFore));lining.lineTo(cabinAft,cabinRoof(cabinAft));lining.closePath();
    for(const x of portStations){
      const hole=new T.Path();hole.absellipse(x,portHeight,radiusX,radiusZ,0,2*Math.PI,true);lining.holes.push(hole);
    }
    cabinSurface(new T.ShapeGeometry(lining,24),ivoryLining,'Cabin side liner',
      (x,z)=>[x,side*innerBeam(x,z),z]);
    for(const station of portStations){
      for(const [name,offset] of [['Cabin inner port rim',-cabinInset-.004],['Cabin outer port rim',.003]]){
        const rim=cabinSurface(new T.TorusGeometry(radiusX,portRim,10,36),0xa6a9a2,name,(u,v,w)=>{
          const x=station+u,z=portHeight+v*radiusZ/radiusX;
          return [x,side*(bowHalfBeam(x,z)+offset+w),z];
        });
        rim.material.metalness=.62;
      }
      const pane=cabinSurface(new T.CircleGeometry(radiusX,36),0xa6d4e0,'Cabin port glass',(u,v)=>{
        const x=station+u,z=portHeight+v*radiusZ/radiusX;
        return [x,side*(bowHalfBeam(x,z)-cabinInset/2),z];
      });
      pane.material.dispose();pane.material=glass.clone();pane.material.opacity=.18;
    }
  }
  // Port settee and a drop-leaf table leave a narrow central aisle.
  const oatCloth=0xd3c9b0,piping=0xa99479,cabinetEdge=0x573925;
  cabinPart(new T.BoxGeometry(.97,.30,.148),cabinWood,[2.08,.431,.305]);
  for(const x of [1.78,2.08,2.38]){
    cabinPart(roundedSeat(.271,.277,.044),oatCloth,[x,.434,.384]).material.roughness=.88;
    cabinPart(roundedSeat(.271,.199,.037),oatCloth,[x,.556,.487]).rotation.x=Math.PI/2;
    cabinPart(new T.BoxGeometry(.242,.005,.009),piping,[x,.281,.423]);
  }
  const table=cabinPart(roundedSeat(.48,.235,.020),0xdbceae,[1.99,.205,.568]);
  table.material.roughness=.54;
  const tableLeg=cabinPart(new T.CylinderGeometry(.015,.020,.307,16),steel,[2.05,.208,.394]);
  tableLeg.rotation.x=Math.PI/2;tableLeg.material.metalness=.62;

  // Starboard galley. The pale worktop and steel rim catch the cabin light.
  cabinPart(new T.BoxGeometry(.88,.305,.319),cabinWood,[2.10,-.437,.390]).material.roughness=.33;
  cabinPart(roundedSeat(.858,.305,.025),0xe2d9bf,[2.10,-.438,.553]).material.roughness=.41;
  for(const x of [1.81,2.10,2.39]){
    cabinPart(new T.BoxGeometry(.251,.018,.230),cabinetEdge,[x,-.277,.388]);
    cabinPart(new T.BoxGeometry(.230,.018,.204),cabinWood,[x,-.269,.388]).material.roughness=.34;
    cabinPart(new T.SphereGeometry(.014,12,8),steel,[x+.077,-.250,.450]).material.metalness=.69;
  }
  const sink=cabinPart(new T.SphereGeometry(1,20,12),0x525956,[2.26,-.447,.578]);
  sink.scale.set(.119,.093,.007);sink.material.roughness=.30;sink.material.metalness=.66;
  const sinkRim=cabinPart(new T.TorusGeometry(.119,.009,8,36),0xc0c8c2,[2.26,-.447,.580]);
  sinkRim.scale.y=.80;sinkRim.material.metalness=.72;sinkRim.material.roughness=.28;
  const faucet=new T.CubicBezierCurve3(v3(2.27,-.555,.582),v3(2.27,-.556,.745),
    v3(2.24,-.412,.741),v3(2.23,-.430,.647));
  const tap=cabinPart(new T.TubeGeometry(faucet,16,.009,8,false),steel,[0,0,0]);
  tap.material.metalness=.78;tap.material.roughness=.26;
  cabinPart(new T.BoxGeometry(.22,.164,.016),0x252828,[1.88,-.447,.584]).material.roughness=.25;
  for(const x of [1.83,1.93]){
    cabinPart(new T.TorusGeometry(.033,.003,6,24),0x596360,[x,-.45,.594]);
  }
  cabinPart(new T.BoxGeometry(.27,.155,.243),cabinWood,[2.60,-.420,.829]).material.roughness=.34;
  cabinPart(new T.BoxGeometry(.244,.015,.217),cabinetEdge,[2.60,-.335,.828]);
  cabinPart(new T.BoxGeometry(.227,.015,.201),cabinWood,[2.60,-.326,.828]);
  cabinPart(new T.SphereGeometry(.013,12,8),steel,[2.52,-.307,.790]).material.metalness=.69;
  // Corner trim and two companionway treads hug the lining.
  for(const [x,z] of [[1.34,.296],[1.25,.431]]){
    cabinPart(roundedSeat(.111,.288,.024),cabinWood,[x,.454,z]);
    cabinPart(new T.BoxGeometry(.041,.257,.005),0xc1b19b,[x,.454,z+.041]);
  }
  for(const x of [1.50,2.70]){
    const z=cabinRoof(x)-.012;
    cabinPart(new T.BoxGeometry(.024,2*innerBeam(x,z)-.018,.022),ivoryLining,[x,0,z]);
  }
  const radio=new T.Group();radio.name='Cabin radio';radio.position.set(2.46,.15,.75);cabin.add(radio);
  cabinPart(roundedSeat(.245,.428,.019),cabinetEdge,[2.49,.15,.608]);
  cabinPart(new T.BoxGeometry(.20,.39,.23),0x332924,[0,0,0],radio);
  cabinPart(new T.BoxGeometry(.013,.354,.197),0x795739,[-.106,0,0],radio);
  for(let i=-3;i<=3;i++)cabinPart(new T.BoxGeometry(.006,.102,.007),0x322e2a,[-.114,.099,.019*i],radio);
  const display=cabinPart(new T.BoxGeometry(.012,.12,.068),0x465150,[-.116,-.074,.037],radio);
  const dial=cabinPart(new T.CylinderGeometry(.039,.039,.026,18),0xc0b58e,[-.119,-.083,-.042],radio);
  dial.rotation.z=Math.PI/2;
  const radioHitArea=cabinPart(new T.BoxGeometry(.245,.46,.28),0x332924,[-.016,0,0],radio);
  radioHitArea.visible=false;
  cabinObjects.set('radio',radio);
  const dome=new T.Group();dome.name='Cabin lamp';dome.position.set(2.05,-.11,cabinRoof(2.05)-.02);cabin.add(dome);
  const bezelCabin=cabinPart(new T.CylinderGeometry(.12,.126,.032,32),0x9d8e71,[0,0,0],dome);
  bezelCabin.rotation.x=Math.PI/2;
  const filament=cabinPart(new T.SphereGeometry(1,24,12),0xbdb69d,[0,0,-.022],dome);
  filament.scale.set(.106,.106,.040);
  const cabinLamp=new T.PointLight(0xffdfbc,1.9,2.6,2);
  cabinLamp.name='Cabin lamp emitter';cabinLamp.position.copy(dome.position);cabinLamp.position.z-=.14;
  switchFixture(cabinLamp,false);cabin.add(cabinLamp);
  cabinObjects.set('light',dome);
  function setCabinLight(on){
    on=on&&electricalPower;
    switchFixture(cabinLamp,on);filament.material.emissive.setHex(on?0xffc77a:0);filament.material.emissiveIntensity=on?.8:0;
  }
  function setRadio(on){display.material.emissive.setHex(on&&electricalPower?0x6dcc91:0);}
  const grainSize=128,grainPixels=new Uint8Array(grainSize*grainSize*4);
  for(let y=0;y<grainSize;y++)for(let x=0;x<grainSize;x++){
    const u=2*Math.PI*x/grainSize,v=2*Math.PI*y/grainSize;
    const rings=45*v+.65*Math.sin(u)+.27*Math.sin(2*u+3*v);
    const tone=224+13*Math.sin(rings)+8*Math.sin(2*rings+.7)+7*Math.cos(3*v+u);
    grainPixels.set([tone,tone,tone,255],4*(y*grainSize+x));
  }
  const woodGrain=new T.DataTexture(grainPixels,grainSize,grainSize);
  woodGrain.colorSpace=T.SRGBColorSpace;woodGrain.generateMipmaps=true;
  woodGrain.minFilter=T.LinearMipmapLinearFilter;woodGrain.magFilter=T.LinearFilter;
  woodGrain.needsUpdate=true;
  cabin.traverse(part=>{
    const color=part.material?.color?.getHex();
    if(color===cabinWood||color===cabinetEdge||color===0xa17e5b){
      part.material.map=woodGrain;
    }
  });
  // Furniture and lining share finishes. Keep the transparent ports and
  // interactive fixtures as separate objects for sorting and picking.
  const cabinFinishes=new Map(),cabinBatches=new Map();
  for(const piece of [...cabin.children]){
    const material=piece.material;
    if(!material?.isMeshStandardMaterial||material.transparent||piece.name==='Cabin outer port rim')continue;
    const finish=[material.side,material.roughness,material.metalness,material.map?.uuid].join('/');
    let shared=cabinFinishes.get(finish);
    if(!shared){
      shared=material.clone();
      shared.color.set(0xffffff);shared.vertexColors=true;
      cabinFinishes.set(finish,shared);
    }
    piece.updateMatrix();
    collectPart(piece.geometry,material.color,piece.matrix,shared,cabinBatches);
    cabin.remove(piece);material.dispose();
  }
  for(const [material,batch] of cabinBatches)addBatch(cabin,material,batch);
  const cabinWaterSegments=24;
  const cabinWater=cabinPart(new T.PlaneGeometry(1,2,cabinWaterSegments,1),0x4d9eac,[0,0,0],group);
  cabinWater.name='Cabin flood surface';
  cabinWater.frustumCulled=false;
  cabinWater.material.side=T.DoubleSide;
  cabinWater.material.transparent=true;
  cabinWater.material.opacity=.58;
  cabinWater.material.depthWrite=false;
  const cabinWaterPositions=cabinWater.geometry.attributes.position;
  let cabinWaterLevel=-Infinity;
  function setCabinWater(level){
    if(level===cabinWaterLevel)return;
    cabinWaterLevel=level;
    cabinWater.visible=level>cabinSole&&level<cabinRoof(cabinFore);
    if(!cabinWater.visible)return;
    const aft=Math.max(cabinAft,cabinAft+(level-cabinRoof(cabinAft))/.118);
    for(let i=0;i<=cabinWaterSegments;i++){
      const x=T.MathUtils.lerp(aft,cabinFore,i/cabinWaterSegments),y=Math.max(0,innerBeam(x,level)-.01);
      cabinWaterPositions.setXYZ(i,x,y,level);
      cabinWaterPositions.setXYZ(i+cabinWaterSegments+1,x,-y,level);
    }
    cabinWaterPositions.needsUpdate=true;
  }
  cabinWater.visible=false;
  const floodingEffects=panelCentres.map((x,index)=>{
    const sign=index<3?1:-1,particles=new Float32Array(60*3),geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(particles,3).setUsage(T.DynamicDrawUsage));
    const spray=new T.Points(geometry,new T.PointsMaterial({color:0x8ad4e7,size:.061,transparent:true,
      opacity:.72,depthWrite:false}));
    spray.name='Flood inflow '+(index+1);spray.frustumCulled=false;spray.visible=false;group.add(spray);
    const level=cabinPart(new T.PlaneGeometry(2.18,.94),0x4d9eac,[x,sign*.46,-.65],group);
    level.material.transparent=true;level.material.opacity=.58;level.material.depthWrite=false;level.visible=false;
    return {sign,spray,particles,level};
  });
  function updateDamage(health,flood,panels,time){
    setCabinWater(.5*(flood[13]+flood[28]));
    for(let i=0;i<floodingEffects.length;i++){
      const {sign,spray,particles,level}=floodingEffects[i],rate=flood[5*i+1],o=3*i;
      const panel=damage[i],holeArea=Math.max(0,flood[5*i+2]);
      panel.condition.value=health[i];
      panel.radius.value=Math.sqrt(holeArea/Math.PI);
      if(holeArea&&sign*panels[o+1]>0)panel.centre.value.set(panels[o],panels[o+2]);
      level.position.z=flood[5*i+3];
      level.visible=flood[5*i]>.025&&(i%3!==2||level.position.z<cabinSole);
      spray.visible=rate>.002&&(i%3!==2||cabinWaterLevel<cabinRoof(cabinFore));
      if(!spray.visible)continue;
      const originX=holeArea?panel.centre.value.x:panels[o],dims=hullSection(originX);
      const [,w,top,keel]=dims;
      const originZ=holeArea?panel.centre.value.y:top-.025;
      const throughHull=sign*w*beamFraction(heightFraction({w,top,k:keel},originZ));
      for(let k=0;k<60;k++){
        const u=(k/60+time*(1.0+rate*1.7))%1,splay=Math.sin(k*2.3);
        particles[3*k]=originX+splay*(.022+.20*u);
        particles[3*k+1]=throughHull-sign*.68*u;
        particles[3*k+2]=originZ+.05*u*Math.sin(k*8.2)-.47*u*u;
      }
      spray.geometry.attributes.position.needsUpdate=true;
      spray.material.opacity=Math.min(.82,.25+rate*8);
    }
  }
  // Round, flush-mounted downlights. The lens face, opaque-scene light and
  // optical scattering use the same position and boat-frame negative Z axis.
  const bezel=new T.CylinderGeometry(.081,.081,.025,16);bezel.rotateX(Math.PI/2);
  const disk=new T.CircleGeometry(.063,16);disk.rotateY(Math.PI);
  const emitters=new T.InstancedMesh(disk,new T.MeshBasicMaterial({color:0xffd38a}),hullLamps.length);
  emitters.name='Underwater downlight lenses';emitters.visible=false;group.add(emitters);
  const underwaterLamps=hullLamps.map(([x,y,z],i)=>{
    const zone=x<sections[splits[1]].x?0:x<sections[splits[2]].x?1:2;
    part(bezel.clone(),steel,[x,y,z+.015],null,null,panelMaterials[zone+(y>0?0:3)]);
    emitters.setMatrixAt(i,new T.Matrix4().makeTranslation(x,y,z));
    const flood=i===1||i===8;
    const led=new T.SpotLight(0xffc476,flood?122:62,flood?22:11,.91,.89,1.25);
    led.name='Hull downlight '+(i+1);switchFixture(led,false);
    led.userData.scatterGain=.24;led.userData.diffuseHullOnly=!flood;
    if(!flood)led.layers.set(31); // Overlapping hull glow carries these fixtures in the water.
    led.position.set(x,y,z-.002);led.target.position.set(x,y,z-1.002);
    group.add(led,led.target);return led;
  });
  bezel.dispose();
  // Bake each housing into the existing hull batches. Keep its glass just
  // behind the feed origin so the sensor can see out across its whole field.
  for(const [id,[position,target]] of Object.entries(cruiserUnderwaterViews)){
    const lensCentre=v3(...position),axis=v3(...target).sub(lensCentre).normalize();
    const behind=distance=>lensCentre.clone().addScaledVector(axis,-distance).toArray();
    if(id==='motorBow'){
      // Recess the rear of the port in the rising forefoot. Only the bezel
      // and the tapered nose protrude below the plating.
      const aft=v3(...behind(.12)),front=v3(...behind(.022));
      const shell=new T.CylinderGeometry(.037,.054,aft.distanceTo(front),16);
      shell.applyQuaternion(new T.Quaternion().setFromUnitVectors(v3(0,1,0),axis));
      part(shell,trim,aft.lerp(front,.5).toArray(),null,null,metal);
      rod(behind(.025),behind(.006),.038,steel);
      rod(behind(.006),behind(.003),.031,0x234450);
      continue;
    }
    // The side camera mounts are part of the two midship hull plates.
    const cameraMaterial=id==='motorPort'?panelMaterials[1]:
      id==='motorStarboard'?panelMaterials[4]:metal;
    if(id!=='motorKeel' && id!=='motorStern'){
      const [x,y,z]=behind(.18);
      rod([x,y,-.16],[x,y,z],.041,steel,cameraMaterial);
    }
    rod(behind(.23),behind(.022),.067,trim,cameraMaterial);
    rod(behind(.025),behind(.006),.069,steel,cameraMaterial);
    rod(behind(.006),behind(.003),.052,0x234450,cameraMaterial);
  }
  const swivel=new T.Group();swivel.name='Roof searchlight';swivel.userData.physicsJoint={axis:[0,0,1],label:'Searchlight swivel'};swivel.position.set(.56,0,searchlightHeight);group.add(swivel);
  rod([.56,0,2.18],[.56,0,searchlightHeight-.035],.043,steel);
  const housing=fixed(new T.CylinderGeometry(.116,.129,.18,18),steel,swivel);
  housing.rotation.z=-Math.PI/2;
  const lens=fixed(new T.CircleGeometry(.11,20),0xfff1c6,swivel,true);
  lens.rotation.y=Math.PI/2;lens.position.x=.096;
  const light=new T.SpotLight(0xffedcd,125,48,.21,.65,1.25);light.position.set(.097,0,0);
  light.name='Roof searchlight emitter';switchFixture(light,false);lens.visible=false;
  light.target.position.set(1,0,0);swivel.add(light,light.target);
  installSearchlightDepth(T);
  const resolution=64,depthPixels=new Uint8Array(4*resolution*resolution);
  const depthMap=new T.DataTexture(depthPixels,resolution,resolution);light.map=depthMap;light.shadow.camera.near=.055;
  const worldOrigin=new T.Vector3(),direction=new T.Vector3(),inverseBody=new T.Quaternion();
  let lastBearing,lastTilt;
  function updateSearchDepth(){
    light.updateWorldMatrix(true,false);light.target.updateWorldMatrix(true,false);
    group.getWorldQuaternion(inverseBody);light.shadow.camera.up.set(0,0,1).applyQuaternion(inverseBody);
    light.shadow.updateMatrices(light);
    if(lastBearing===swivel.rotation.z&&lastTilt===swivel.rotation.y)return;
    lastBearing=swivel.rotation.z;lastTilt=swivel.rotation.y;inverseBody.invert();
    light.getWorldPosition(worldOrigin);
    const origin=beam.material.uniforms.lensInHull.value;
    for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
      direction.set((2*x+1)/resolution-1,(2*y+1)/resolution-1,.5).unproject(light.shadow.camera)
        .sub(worldOrigin).normalize().applyQuaternion(inverseBody);
      const depth=Math.round(65535*deckHit(origin,direction,48)/48),k=4*(y*resolution+x);
      depthPixels[k]=depth>>8;depthPixels[k+1]=depth&255;depthPixels[k+3]=1;
    }
    depthMap.needsUpdate=true;
  }
  const beam=new T.Mesh(new T.ConeGeometry(1,1,24,1,true),new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.FrontSide,
    uniforms:{beamToHull:{value:new T.Matrix4()},lensInHull:{value:new T.Vector3()}},
    vertexShader:'uniform mat4 beamToHull;varying vec3 localPoint;varying vec2 v;void main(){v=uv;localPoint=(beamToHull*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`${cruiserBeamGLSL}
     uniform vec3 lensInHull;varying vec3 localPoint;varying vec2 v;void main(){
       if(cruiserBlocksBeam(lensInHull,localPoint))discard;
       gl_FragColor=vec4(1.,.91,.72,.10*pow(v.y,2.));
     }`}));swivel.add(beam);
  beam.geometry.rotateZ(Math.PI/2);beam.scale.set(15,2.6,2.6);beam.position.x=7.61;
  for(const [material,batch] of batches)showInLowWaterCapture(addBatch(group,material,batch));
  let panel,lastPanel=-Infinity;
  const panelScreens=[];
  if(sonarCanvas){
    function createDisplay(name,width,height,position,pixelWidth,pixelHeight){
      const canvas=document.createElement('canvas');canvas.width=pixelWidth;canvas.height=pixelHeight;
      const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
      const face=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:texture}));
      face.name=name;face.position.set(...position);
      face.rotation.set(Math.PI/2,0,-Math.PI/2,'ZXY');
      face.rotateX(-.28);group.add(face);panelScreens.push(face.material);
      return {ctx:canvas.getContext('2d'),texture,width:pixelWidth,height:pixelHeight};
    }
    function paintScreen(display,image,title,footer,x=0,width=display.width){
      const {ctx,height,texture}=display;
      ctx.fillStyle='#152028';ctx.fillRect(x,0,width,height);
      const contentHeight=height-49;
      const scale=Math.min((width-14)/image.width,contentHeight/image.height);
      const sourceWidth=scale*image.width,sourceHeight=scale*image.height;
      ctx.drawImage(image,x+(width-sourceWidth)/2,25+(contentHeight-sourceHeight)/2,sourceWidth,sourceHeight);
      ctx.fillStyle='#d6e8ec';ctx.font='bold 14px sans-serif';
      ctx.fillText(title,x+9,17);
      ctx.font='13px monospace';ctx.fillText(footer,x+9,height-10);
      texture.needsUpdate=true;
    }
    if(interior){
      // Independent displays fit the two 320's recessed bezels.
      const chart=createDisplay('Live harbor chart',.235,.130,[-.031,-.405,1.518],320,176);
      const sonar=createDisplay('Live imaging sonar',.235,.130,[-.031,-.689,1.518],320,176);
      panel=rpm=>{
        const bearing=(450-group.rotation.z*180/Math.PI)%360;
        paintScreen(chart,chartCanvas,'HARBOR CHART','HDG '+Math.round(bearing)+'°');
        paintScreen(sonar,sonarCanvas,'3D IMAGING SONAR','0–'+sonarCanvas.dataset.range+' m   '+Math.round(Math.abs(rpm))+' RPM');
      };
    }else{
      const combined=createDisplay('Live sonar and chart display',.82,.265,[.033,-.40,1.55],512,176);
      panel=rpm=>{
        const bearing=(450-group.rotation.z*180/Math.PI)%360;
        paintScreen(combined,sonarCanvas,'3D IMAGING SONAR','0–'+sonarCanvas.dataset.range+' m   '+Math.round(Math.abs(rpm))+' RPM',0,256);
        paintScreen(combined,chartCanvas,'HARBOR CHART','HDG '+Math.round(bearing)+'°',256,256);
      };
    }
  }
  beam.visible=false;
  function setElectricalPower(on){
    if(electricalPower===on)return;
    electricalPower=on;
    for(const screen of panelScreens)screen.color.setHex(on?0xffffff:0x000000);
    if(on)return;
    setCabinLight(false);setRadio(false);
    emitters.visible=beam.visible=lens.visible=false;
    switchFixture(light,false);
    for(const led of underwaterLamps)switchFixture(led,false);
    for(const indicator of helmIndicators.values())indicator.light.material.emissiveIntensity=0;
  }
  function positionSearchlight(bearing,tilt){
    swivel.rotation.set(0,tilt,bearing,'ZYX');
    swivel.updateMatrix();beam.updateMatrix();
    beam.material.uniforms.beamToHull.value.multiplyMatrices(swivel.matrix,beam.matrix);
    beam.material.uniforms.lensInHull.value.copy(light.position).applyMatrix4(swivel.matrix);
  }
  async function preloadLighting(bearing,tilt,compile){
    positionSearchlight(bearing,tilt);
    updateSearchDepth();
    const meshes=[beam,lens,emitters];
    const visibility=meshes.map(mesh=>mesh.visible);
    try{
      for(const mesh of meshes)mesh.visible=true;
      await compile();
    }finally{
      meshes.forEach((mesh,index)=>{mesh.visible=visibility[index];});
    }
  }
  let previousTime,shaftRPM=0;
  function update(t,rpm,steer,settings,seaTime=t){
    if(electricalPower)radar.rotation.z=(seaTime%2.5)*(2*Math.PI/2.5);
    if(previousTime!==undefined){
      const advance=(t-previousTime)*rpm*Math.PI/30;
      for(const {rotor,direction} of propellers)rotor.rotation.x=(rotor.rotation.x+direction*advance)%(2*Math.PI);
    }
    for(const drive of drives)drive.rotation.z=steer;
    previousTime=t;shaftRPM=rpm;setSteeringWheel(steer);
    if(electricalPower&&panel&&t-lastPanel>=.2){panel(rpm);lastPanel=t;}
    emitters.visible=electricalPower&&Boolean(settings[1]);
    for(const led of underwaterLamps)switchFixture(led,emitters.visible);
    positionSearchlight(settings[2],settings[3]);
    beam.visible=lens.visible=electricalPower&&Boolean(settings[0]);
    switchFixture(light,beam.visible);
    if(beam.visible)updateSearchDepth();
  }
  function dispose(){
    depthMap.dispose();
    const geometries=new Set(),materials=new Set();
    group.traverse(o=>{
      if(o.userData.sharedVehicleAsset)return;
      if(o.geometry)geometries.add(o.geometry);
      if(o.material)materials.add(o.material);
    });
    for(const g of geometries)g.dispose();
    for(const m of materials){m.map?.dispose();m.dispose();}
  }
  const lamps=[{swivel,light,beam,lens,under:underwaterLamps[1]},{under:underwaterLamps[8]}];
  return {group,setLift,update,updateDamage,cabinObjects,deckObjects,setCabinLight,setRadio,setElectricalPower,setWiper,setHelmSwitch,setHelmControls,setAnchor,lamps,searchlight:{swivel,light},underwaterLamps,preloadLighting,dispose,
    get cabinWaterLevel(){return cabinWaterLevel;},get shaftRPM(){return shaftRPM;}};
}
