import {inboardMixer} from './inboard-audio.mjs';
import {droneMixer} from './drone-audio.mjs';
import {piccardImpactDetector,piccardKnock,piccardMixer} from './piccard-audio.mjs';
import {showInLowWaterCapture} from './render-layers.mjs';
import {committeePad} from './spawn-sites.mjs';
import {padMaterial} from './landing-tags.mjs';
import {drawMontauk} from './committee-boat.mjs';

// Compass bearing clockwise from true north in the east/north world frame.
export function trueBearing(east,north){
  const degrees=(Math.round(Math.atan2(east,north)*180/Math.PI)+360)%360;
  return String(degrees).padStart(3,'0')+'°T';
}
export function raceGateEnds(race){
  if(race.has('startGateEnds'))return race.get('startGateEnds');
  return race.getMany(['pinEast','pinNorth','committeeEast','committeeNorth']);
}
function raceGateCenter(race){
  const [pe,pn,ce,cn]=raceGateEnds(race);
  return [(pe+ce)/2,(pn+cn)/2];
}
export function firstLeg(race){
  const [x,y]=raceGateCenter(race);
  const e=race.get('markEast')[0]-x;
  const n=race.get('markNorth')[0]-y;
  return trueBearing(e,n);
}
// The line midpoint gives a single course-to-steer reference for an open gate.
export function raceTarget(race,stage,east,north){
  let x,y,label;
  if(stage===2 || stage===3){
    x=race.get('markEast')[stage-2];y=race.get('markNorth')[stage-2];
    label='Mark '+(stage-1);
  }else if(stage===0 || stage===1 || stage===4){
    [x,y]=raceGateCenter(race);
    label=stage===4?'Finish':'Start';
  }else return null;
  const de=x-east,dn=y-north,range=Math.hypot(de,dn);
  if(range<.01 || !Number.isFinite(range))return null;
  return {label,range,angle:Math.atan2(dn,de),bearing:trueBearing(de,dn)};
}
function inflatableMark(T){
  const body=new T.Group();
  body.name='Inflatable race mark';
  const bottom=-.10,apex=1.65,height=apex-bottom,radius=1.34;
  const corners=Array.from({length:3},(_,i)=>{
    const a=-Math.PI/2+i*2*Math.PI/3;
    return new T.Vector2(radius*Math.cos(a),radius*Math.sin(a));
  });
  const rim=[];
  for(let side=0;side<3;side++){
    const corner=corners[side],previous=corners[(side+2)%3],next=corners[(side+1)%3];
    const start=corner.clone().lerp(previous,.065),end=corner.clone().lerp(next,.065);
    // Round the welded corners, then span the inflated panel between them.
    for(let j=0;j<6;j++){
      const t=j/6,v=1-t;
      rim.push({point:start.clone().multiplyScalar(v*v).addScaledVector(corner,2*v*t).addScaledVector(end,t*t),
        bulge:0,seam:1-Math.min(1,Math.abs(t-.5)*2),phase:side*2*Math.PI/3});
    }
    const edgeEnd=next.clone().lerp(corner,.065);
    for(let j=0;j<14;j++){
      const t=j/14;
      rim.push({point:end.clone().lerp(edgeEnd,t),bulge:Math.sin(Math.PI*t)**2,seam:0,phase:(side+t)*2*Math.PI/3});
    }
  }
  const positions=[],colors=[],faces=[];
  const steps=[0,.012,.032,.06,.095,.15,.22,.3,.38,.46,.54,.62,.7,.78,.85,.91,.96,.986,.996,1];
  const belly=u=>.080*Math.sin(Math.PI*u);
  const ringScale=u=>Math.max(.011,1-u)*(1-.12*Math.exp(-u/.025));
  for(const u of steps){
    for(const {point,bulge,seam,phase} of rim){
      // The vinyl puckers at its lower welds. Keep the top panels under tension.
      const crease=(.010*Math.sin(23*phase+12*u)+.006*Math.sin(35*phase-17*u))
        *Math.exp(-((u-.12)**2)/.018)*bulge;
      const bulged=point.clone().multiplyScalar(ringScale(u)).addScaledVector(point,(belly(u)*bulge+crease)/point.length());
      const tuck=.082*bulge*Math.exp(-u/.056);
      positions.push(bulged.x,bulged.y,bottom+u*height+tuck);
      const weld=.09*seam+.085*Math.exp(-(((u-.06)/.014)**2));
      const shade=(1-weld)*(.77+.23*Math.min(1,u/.14));
      colors.push(shade,shade*(1-.025*seam),shade*(1-.055*seam));
    }
  }
  const n=rim.length;
  for(let i=0;i<steps.length-1;i++)for(let j=0;j<n;j++){
    const a=i*n+j,b=i*n+(j+1)%n;
    faces.push(a,b,b+n,a,b+n,a+n);
  }
  for(let i=1;i<n-1;i++){
    const a=(steps.length-1)*n;
    faces.push(0,i+1,i,a,a+i,a+i+1);
  }
  const shell=new T.BufferGeometry();
  shell.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  shell.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  shell.setIndex(faces);shell.computeVertexNormals();
  const vinyl=new T.MeshPhysicalMaterial({color:0xff601d,vertexColors:true,roughness:.29,clearcoat:.52,clearcoatRoughness:.25});
  const plainVinyl=new T.MeshPhysicalMaterial({color:0xff641b,roughness:.47,clearcoat:.2});
  const rubber=new T.MeshStandardMaterial({color:0x292825,roughness:.72});
  const fittings=new T.MeshStandardMaterial({color:0x666764,roughness:.35,metalness:.58});
  function add(geometry,material,parent=body){
    const mesh=new T.Mesh(geometry,material);
    parent.add(mesh);showInLowWaterCapture(mesh);return mesh;
  }
  add(shell,vinyl);

  // The reinforced lifting eye is welded around the tip.
  const eyeShape=new T.Shape();
  eyeShape.moveTo(-.054,-.045);eyeShape.lineTo(.054,-.045);
  eyeShape.quadraticCurveTo(.057,.042,0,.067);eyeShape.quadraticCurveTo(-.057,.042,-.054,-.045);
  const hole=new T.Path();hole.absellipse(0,.023,.018,.025,0,2*Math.PI,true);eyeShape.holes.push(hole);
  const eyeGeometry=new T.ExtrudeGeometry(eyeShape,{depth:.017,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:2,steps:1});
  eyeGeometry.translate(0,0,-.0085);
  const eye=add(eyeGeometry,plainVinyl);
  eye.rotation.x=Math.PI/2;eye.position.z=apex-.022;

  function onPanel(x,z){
    const u=(z-bottom)/height;
    const panel=new T.Group();
    panel.position.set(x,radius*.5*ringScale(u)+belly(u)+.005,z);
    panel.rotation.set(Math.PI/2-Math.atan(radius/(2*height)),0,Math.PI,'ZYX');
    body.add(panel);return panel;
  }
  // A dark circular reinforced valve patch follows the inclined vinyl panel.
  const socket=onPanel(0,1.19);
  const patch=add(new T.CircleGeometry(.100,32),rubber,socket);
  patch.position.z=.003;
  const flange=add(new T.TorusGeometry(.044,.005,6,24),fittings,socket);
  flange.position.z=.009;
  const plug=add(new T.CylinderGeometry(.038,.038,.018,20),rubber,socket);
  plug.rotation.x=Math.PI/2;plug.position.z=.011;
  return body;
}

// Z-up committee launch and inflatable marks. Dimensions are in metres.
export function raceCoursePoints(race){
  const [p,q,e,n,c,d]=race.getMany(['pinEast','pinNorth','markEast','markNorth','committeeEast','committeeNorth']);
  return [p,q,e[0],n[0],e[1],n[1],c,d];
}

export function courseScene(T,scene,race){
  const group=new T.Group();scene.add(group);
  const mat=(color,roughness=.55)=>new T.MeshStandardMaterial({color,roughness});
  const white=mat(0xf1ede0),navy=mat(0x152c36),metal=mat(0xb7c0bc,.27);
  const whaler=race.has('committeePadGeometry');
  const mesh=(parent,geometry,material,x,y,z)=>{
    const o=new T.Mesh(geometry,material);o.position.set(x,y,z);parent.add(o);return o;
  };
  function rod(parent,a,b,r,material){
    const v=new T.Vector3(...a),w=new T.Vector3(...b),d=w.clone().sub(v);
    const o=mesh(parent,new T.CylinderGeometry(r,r,d.length(),8),material,0,0,0);
    o.position.copy(v).lerp(w,.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;
  }
  const padMaterials=[];
  function addHelipad(parent,width,length,site){
    const pad=new T.Group();parent.add(pad);
    pad.name='Helipad marking';
    const material=padMaterial(T,site,width,length);
    padMaterials.push(material);
    mesh(pad,new T.PlaneGeometry(width,length),material,0,0,.0025);
    pad.traverse(showInLowWaterCapture);
    return pad;
  }
  const boat=new T.Group();boat.position.set(race.get('committeeEast'),race.get('committeeNorth'),0);boat.rotation.order='ZYX';boat.rotation.z=race.get('windBearing')+Math.PI;group.add(boat);
  const pad=whaler?race.get('committeePadGeometry'):
    [committeePad.aft,0,committeePad.top,committeePad.width,committeePad.length];
  const [padX,padY,padZ,padWidth,padLength]=pad;
  if(whaler)drawMontauk(T,boat,pad,{mesh,rod,mat,white,navy,metal});
  else{
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
    mesh(boat,new T.BoxGeometry(.06,.78,.42),mat(0x64808a),.40,0,1.80);
    for(const x of [-.75,.55])for(const y of [-.53,.53])rod(boat,[x,y,.79],[x,y,2.32],.027,metal);
    mesh(boat,new T.BoxGeometry(1.85,1.45,.08),white,0,0,2.32);
  }
  function drawOutboard(parent,offset){
    const outboard=new T.Group();outboard.position.x=offset;parent.add(outboard);
    const cowling=mat(0x141b22,.25),gearcase=mat(0x222b32,.48);
    const shroud=new T.LatheGeometry([[0,0],[.18,0],[.235,.055],[.252,.16],[.246,.35],[.20,.44],
      [.128,.46],[0,.46]].map(([radius,z])=>new T.Vector2(radius,z)),24);
    const cover=mesh(outboard,shroud,cowling,-.06,0,.53);
    cover.rotation.x=Math.PI/2;cover.scale.x=1.10;cover.scale.z=.86;
    mesh(outboard,new T.BoxGeometry(.23,.29,.17),gearcase,.06,0,.67);
    mesh(outboard,new T.BoxGeometry(.24,.19,.34),gearcase,-.09,0,.39).rotation.y=.16;
    mesh(outboard,new T.BoxGeometry(.17,.13,.52),gearcase,-.12,0,.01).rotation.y=.10;
    mesh(outboard,new T.BoxGeometry(.34,.29,.022),gearcase,-.12,0,-.13);
    const hub=mesh(outboard,new T.CylinderGeometry(.063,.090,.25,14),gearcase,-.18,0,-.26);
    hub.rotation.z=Math.PI/2;
    const propeller=new T.Group();propeller.position.set(-.32,0,-.26);outboard.add(propeller);
    for(let i=0;i<3;i++){
      const angle=i*Math.PI*2/3,blade=mesh(propeller,new T.SphereGeometry(.105,12,8),metal,0,
        .093*Math.cos(angle),.093*Math.sin(angle));
      blade.scale.set(.15,1,.40);blade.rotation.x=angle;
    }
    mesh(outboard,new T.BoxGeometry(.15,.035,.20),gearcase,-.06,0,-.38).rotation.y=-.25;
    for(const side of [-1,1])
      mesh(outboard,new T.BoxGeometry(.25,.004,.026),mat(0xb72c26,.40),-.07,side*.207,.81);
    return {outboard,propeller};
  }
  drawOutboard(boat,whaler?-3.08:-3.17);
  function createWhaler(){
    const group=new T.Group();
    group.name='Boston Whaler 190';scene.add(group);
    drawMontauk(T,group,null,{mesh,rod,mat,white,navy,metal});
    const {outboard,propeller}=drawOutboard(group,-3.08);
    batchScenery(T,group);
    group.traverse(showInLowWaterCapture);
    return {group,draw(engine,dt){
      outboard.rotation.z=-engine[3];
      propeller.rotation.x+=engine[0]*dt*Math.PI/95*Math.sign(engine[2]);
    }};
  }
  const mastTop=race.has('committeeMastTop')?race.get('committeeMastTop'):4;
  const bowMast=race.has('committeeMastX'),mastX=bowMast?race.get('committeeMastX'):0;
  rod(boat,[mastX,0,bowMast?.99:2.34],[mastX,0,mastTop],.033,metal);
  addHelipad(boat,padWidth,padLength,'committee').position.set(padX,padY,padZ);
  batchScenery(T,boat);
  boat.children.forEach(showInLowWaterCapture);
  // Keep the hoist attached to the mast while the free edge streams downwind.
  const cloth=new T.PlaneGeometry(.98,.72,12,3),flagMaterial=mat(0xff671a);flagMaterial.side=T.DoubleSide;
  const flag=mesh(boat,cloth,flagMaterial,mastX,0,3.60);flag.name='Committee wind flag';showInLowWaterCapture(flag);
  const uv=cloth.attributes.uv,verticesFlag=cloth.attributes.position,localWind=new T.Vector2();
  cloth.boundingSphere=new T.Sphere(new T.Vector3(),1.4);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=168;
  const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);
  const boardMaterial=new T.MeshBasicMaterial({map:texture});
  const [boardWidth,boardHeight,boardX,boardY,boardZ]=race.has('committeeBoardGeometry')
    ?race.get('committeeBoardGeometry'):[2.2,.82,-.28,.57,1.83];
  for(const side of [-1,1]){
    const board=mesh(boat,new T.PlaneGeometry(boardWidth,boardHeight),boardMaterial,boardX,side*boardY,boardZ);
    board.rotation.order='ZXY';board.rotation.x=Math.PI/2;board.rotation.z=side<0?0:Math.PI;
  }
  const marks=[];
  const buoyParts=inflatableMark(T);
  function mark(x,y){
    const body=buoyParts.clone();
    body.position.set(x,y,0);
    group.add(body);marks.push(body);
  }
  mark(race.get('pinEast'),race.get('pinNorth'));
  race.get('markEast').forEach((x,i)=>mark(x,race.get('markNorth')[i]));
  const anchorPoints=race.get('anchorPosition'),paid=race.get('rode');
  const deadweight=mat(0x454b47,.94);
  for(let i=0;i<4;i++){
    const [x,y,z]=anchorPoints.slice(3*i,3*i+3),w=i===3?.85:.42;
    mesh(group,new T.CylinderGeometry(w*.32,w*.68,w*.46,4),deadweight,x,y,z+w*.12).rotation.x=Math.PI/2;
    const eye=mesh(group,new T.TorusGeometry(w*.11,w*.025,6,12),metal,x,y,z+w*.38);
    eye.rotation.x=Math.PI/2;
  }
  const ropes=new T.Group();ropes.name='Anchor rodes';group.add(ropes);
  const ropeMaterial=mat(0x665c42,.89);
  const spans=Array.from({length:4},(_,i)=>{
    const radius=i===3?.013:.008;
    const geometry=new T.CylinderGeometry(radius,radius,1,8);
    return [mesh(ropes,geometry,ropeMaterial,0,0,0),mesh(ropes,geometry,ropeMaterial,0,0,0)];
  });
  const ropeAxis=new T.Vector3(0,1,0),ropeDelta=new T.Vector3();
  const anchor=new T.Vector3(),liftPoint=new T.Vector3(),fairlead=new T.Vector3();
  function placeSpan(span,a,b){
    ropeDelta.subVectors(b,a);
    const length=ropeDelta.length();
    span.visible=length>.001;
    if(!span.visible)return;
    span.position.copy(a).lerp(b,.5);
    span.scale.y=length;
    span.quaternion.setFromUnitVectors(ropeAxis,ropeDelta.divideScalar(length));
  }
  let previous;
  function setDeckPose(){
    const [x,y,z,yaw,roll,pitch]=race.get('deckState');
    boat.position.set(x,y,z);boat.rotation.set(roll,-pitch,yaw,'ZYX');
  }
  function update(label,time=0,sampleWind){
    setDeckPose();
    const ends=race.get('fairlead');
    for(let i=0;i<4;i++){
      const j=3*i,ax=anchorPoints[j],ay=anchorPoints[j+1],az=anchorPoints[j+2];
      const dx=ends[j]-ax,dy=ends[j+1]-ay,h=ends[j+2]-az,run=Math.hypot(dx,dy);
      // Draw paid-out slack resting on the bottom followed by a lifted span.
      const bedRun=Math.min(run,Math.max(0,(paid[i]**2-run**2-h**2)/(2*Math.max(.001,paid[i]-run))));
      const f=bedRun/Math.max(.001,run);
      anchor.set(ax,ay,az+.025);
      liftPoint.set(ax+f*dx,ay+f*dy,az+.025);
      fairlead.fromArray(ends,j);
      placeSpan(spans[i][0],anchor,liftPoint);
      placeSpan(spans[i][1],liftPoint,fairlead);
    }
    if(sampleWind){
      sampleWind(boat.position.x,boat.position.y,localWind);
      const speed=localWind.length(),tension=1-Math.exp(-speed/3);
      flag.rotation.z=Math.atan2(localWind.y,localWind.x)-boat.rotation.z;
      for(let i=0;i<uv.count;i++){
        const u=uv.getX(i),v=uv.getY(i),phase=time*(4+.32*speed)-8*u+.75*v;
        verticesFlag.setXYZ(i,u*(.10+.88*tension),.14*u*tension*(Math.sin(phase)+.30*Math.sin(1.7*phase)),
          .72*(v-.5)-.61*(1-tension)*u+.04*u*tension*Math.cos(phase));
      }
      verticesFlag.needsUpdate=true;cloth.computeVertexNormals();
    }
    const poses=race.get('markPose');
    const east=race.get('markEast'),north=race.get('markNorth');
    marks.forEach((mark,i)=>{
      mark.position.set(i?east[i-1]:race.get('pinEast'),i?north[i-1]:race.get('pinNorth'),poses[3*i]);
      mark.rotation.set(poses[3*i+1],-poses[3*i+2],0,'ZYX');
    });
    const bearing=firstLeg(race),key=label+bearing;
    if(previous===key)return;previous=key;ctx.fillStyle='#101d23';ctx.fillRect(0,0,512,168);
    ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 48px monospace';
    ctx.fillText('TRI 1   '+bearing,256,49);
    ctx.font='bold 35px monospace';ctx.fillText('S – 1p – 2p – F',256,99);
    ctx.fillStyle='#ffbe52';ctx.font='bold 43px monospace';ctx.fillText(label,256,151);texture.needsUpdate=true;
  }
  return {update,setDeckPose,committee:boat,marks,addHelipad,createWhaler,flag,padSize:[padWidth,padLength],
    setPadIllumination(intensity){for(const material of padMaterials)material.emissiveIntensity=intensity;}};
}
export function sailFlapRate(){
  const sampleRate=32,windowSize=96,firstFrequency=.5,frequencyStep=.25,binCount=47;
  const main=new Float64Array(windowSize),jib=new Float64Array(windowSize);
  const weightedMain=new Float64Array(windowSize),weightedJib=new Float64Array(windowSize);
  const taper=Float64Array.from(main,(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(windowSize-1)));
  const middle=(windowSize-1)/2,taperSum=taper.reduce((sum,w)=>sum+w,0);
  const slopeScale=taper.reduce((sum,w,i)=>sum+w*(i-middle)**2,0);
  const bins=Float64Array.from({length:binCount},(_,i)=>2*Math.cos(2*Math.PI*(firstFrequency+frequencyStep*i)/sampleRate));
  const powers=new Float64Array(binCount);
  const activitySamples=20, activityMiddle=(activitySamples-1)/2;
  const activitySlopeScale=activitySamples*(activitySamples**2-1)/12;
  let count=0,write=0,lastTime,nextSample,lastWall,lastMain,lastJib,analysisTime,frameInterval;
  let clockTime,clockWall,wallRate,dominant;

  function reset(){
    count=0;write=0;lastTime=undefined;dominant=undefined;
  }
  function prepare(samples,weighted){
    // Remove the changing mean camber and trim before looking for a flap.
    let sum=0,moment=0;
    for(let i=0;i<windowSize;i++){
      const value=taper[i]*samples[(write+i)%windowSize];
      sum+=value;moment+=value*(i-middle);
    }
    const mean=sum/taperSum,slope=moment/slopeScale;
    let energy=0;
    for(let i=0;i<windowSize;i++){
      const y=(samples[(write+i)%windowSize]-mean-slope*(i-middle))*taper[i];
      weighted[i]=y;energy+=y*y;
    }
    return energy;
  }
  function powerAt(samples,coefficient){
    let previous=0,previous2=0;
    for(const value of samples){
      const next=value+coefficient*previous-previous2;
      previous2=previous;previous=next;
    }
    return Math.max(0,previous*previous+previous2*previous2-coefficient*previous*previous2);
  }
  function analyze(mainLuff,jibLuff){
    const energy=mainLuff*prepare(main,weightedMain)+jibLuff*prepare(jib,weightedJib);
    // Use only bands the incoming snapshots can resolve. Interpolation aligns
    // the samples for analysis and cannot recover above their Nyquist limit.
    const limit=Math.min(binCount-1,Math.floor((.40/frameInterval-firstFrequency)/frequencyStep));
    if(energy<.001||limit<1)return undefined;
    let peak=0;
    for(let i=0;i<=limit;i++){
      powers[i]=mainLuff*powerAt(weightedMain,bins[i])+jibLuff*powerAt(weightedJib,bins[i]);
      if(powers[i]>powers[peak])peak=i;
    }
    if(powers[peak]<.10*windowSize*energy)return undefined;
    let offset=0;
    if(peak>0&&peak<limit){
      const left=powers[peak-1],right=powers[peak+1],top=powers[peak];
      const curvature=2*(2*top-left-right);
      if(curvature>1e-9)offset=(right-left)/curvature;
    }
    return firstFrequency+(peak+offset)*frequencyStep;
  }
  function append(mainY,jibY){
    main[write]=mainY;jib[write]=jibY;
    write=(write+1)%windowSize;count=Math.min(count+1,windowSize);
  }
  function motion(samples){
    if(count<activitySamples)return 0;
    let sum=0,moment=0,squares=0;
    for(let i=0;i<activitySamples;i++){
      const deflection=samples[(write-activitySamples+i+windowSize)%windowSize];
      sum+=deflection;
      moment+=(i-activityMiddle)*deflection;
      squares+=deflection**2;
    }
    // Reject steady draft and linear changes in trim. Use a short window for
    // gain so old flaps in the frequency analysis cannot keep the sound on.
    const rms=Math.sqrt(Math.max(0,(squares-sum**2/activitySamples-moment**2/activitySlopeScale)/activitySamples));
    const amplitude=Math.max(0,Math.min(1,(rms-.008)/.025));
    return amplitude*amplitude*(3-2*amplitude);
  }
  function sample(time,wall,mainY,jibY,mainLuff,jibLuff,playbackRate){
    if(time===lastTime)return wall-lastWall<.35;
    if(!Number.isFinite(mainY)||!Number.isFinite(jibY)){reset();return false;}
    const dt=time-lastTime;
    if(!(dt>0)||dt>.20||wall-lastWall>.4){
      reset();
      clockTime=time;clockWall=wall;wallRate=playbackRate;
      frameInterval=1/sampleRate;analysisTime=time;
      nextSample=time+1/sampleRate;
      append(mainY,jibY);
    }else{
      frameInterval=Math.max(dt,.90*frameInterval+.10*dt);
      while(nextSample<=time+1e-8){
        const fraction=Math.min(1,(nextSample-lastTime)/dt);
        append(lastMain+fraction*(mainY-lastMain),lastJib+fraction*(jibY-lastJib));
        nextSample+=1/sampleRate;
      }
      if(wall-clockWall>=.5){
        const rate=(time-clockTime)/(wall-clockWall);
        wallRate+=.5*(Math.min(playbackRate*1.25,rate)-wallRate);
        clockTime=time;clockWall=wall;
      }
      if(count===windowSize&&time-analysisTime>=.25){
        const measured=analyze(mainLuff,jibLuff);
        dominant=measured===undefined||dominant===undefined?measured:dominant+.55*(measured-dominant);
        analysisTime=time;
      }
    }
    lastTime=time;lastWall=wall;lastMain=mainY;lastJib=jibY;
    return true;
  }
  return {sample,reset,get activity(){return [motion(main),motion(jib)];},get dominant(){return dominant;},
    get audibleHz(){return (dominant??1.8)*(wallRate??1);}};
}

// The 6-by-4 mesh is expressed in the boom frame, starting at the tack.
// Compare the trailing and anchored leading nodes at two middle rows.
function leechDeflection(state,offset){
  return .65*(state[offset+34]-state[offset+25])+.35*(state[offset+46]-state[offset+37]);
}

export function waveAmbience(){
  const spacing=2.3,offsets=[[0,0],[spacing,0],[-spacing,0],[0,spacing],[0,-spacing]];
  const incident=new Float64Array(offsets.length),wake=new Float64Array(offsets.length);
  const mix={swell:0,crest:0,wake:0};
  let anchorEast,anchorNorth,lastTime,lastWake;
  function silence(){mix.swell=mix.crest=mix.wake=0;return mix;}
  function reset(){lastTime=undefined;silence();}
  function slope(values){
    let sum=0;
    for(let i=1;i<values.length;i++)sum+=Math.abs(values[i]-values[0]);
    return sum/(spacing*(values.length-1));
  }
  function sample(surface,time,east,north,tide,includeWake){
    const moved=lastTime===undefined||(east-anchorEast)**2+(north-anchorNorth)**2>36;
    if(moved){anchorEast=east;anchorNorth=north;}
    const dt=time-lastTime;
    if(!moved&&dt===0&&includeWake===lastWake)return mix;
    // Initialize the new probe coordinates before taking differences.
    const continuous=!moved&&dt>0&&dt<.32;
    const continuousWake=continuous&&includeWake&&lastWake;
    let motion=0,fallingMotion=0,wakeMotion=0;
    for(let i=0;i<offsets.length;i++){
      const x=anchorEast+offsets[i][0],y=anchorNorth+offsets[i][1];
      const h=surface(x,y,false),sea=h-tide;
      const localWake=includeWake?surface(x,y,true)-h:0;
      if(continuous){
        const delta=sea-incident[i];
        motion+=delta*delta;
        if(delta<0)fallingMotion+=delta*delta;
      }
      if(continuousWake)wakeMotion+=(localWake-wake[i])**2;
      incident[i]=sea;wake[i]=localWake;
    }
    lastTime=time;lastWake=includeWake;
    if(!continuous)return silence();
    const rmsSpeed=energy=>Math.max(0,Math.sqrt(energy/offsets.length)/dt-.004);
    const moving=rmsSpeed(motion),falling=rmsSpeed(fallingMotion),radiating=rmsSpeed(wakeMotion);
    const seaSlope=slope(incident),wakeSlope=slope(wake);
    mix.swell=.62*moving/(.16+moving);
    mix.crest=.48*falling/(.22+falling)*seaSlope/(.045+seaSlope);
    mix.wake=.42*radiating/(.13+radiating)*wakeSlope/(.02+wakeSlope);
    return mix;
  }
  return {sample,reset};
}

export function hullWashMix(speed,swell,wake,catamaran=false){
  if(!Number.isFinite(speed))return {gurgle:0,rush:0,gurgleRate:1};
  const flow=Math.abs(speed);
  const speedKnots=flow/(1852/3600);
  const transition=Math.max(0,Math.min(1,(speedKnots-10)/3));
  const blend=transition*transition*(3-2*transition);
  // The narrow Hobie hulls make very little wash at a slow glide. Build up
  // both the strength and the cadence of the bubbles toward six knots.
  const cruise=Math.min(1,speedKnots/6);
  const lowFlow=catamaran?.56*cruise*cruise*(3-2*cruise):.52*flow/(.55+flow);
  const low=Math.min(1,lowFlow+.45*swell+.45*wake);
  const high=Math.min(1,.90*flow/(1.45+flow)+.22*wake);
  return {gurgle:Math.sqrt(1-blend)*low,rush:Math.sqrt(blend)*high,gurgleRate:catamaran?.70+.40*cruise:1};
}

// Signed listener height above the local animated wave, in metres.
export function underwaterMix(height){
  const t=Math.max(0,Math.min(1,.5-height/.7));
  return t*t*(3-2*t);
}

// Piccard contacts short crests over its hull height. The cruiser crossfades
// from lapping at rest to the existing hull wash as it gathers headway.
export function hullLappingMix(piccard,height,speed){
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  if(piccard)return smooth((height+.29)/.24)*(1-smooth((height-.08)/.17));
  return 1-smooth((Math.abs(speed)-.25)/1.6);
}

// Arm only after seeing this rider's skids clearly above the local water.
// Once a launch wets the skids, waves cannot retrigger it until another recovery.
export function hoistWaterEntry(){
  let rider,armed=false,wet=false;
  return (lift,clearance)=>{
    if(rider!==lift?.rider){rider=lift?.rider;armed=false;wet=false;}
    if(!rider||!Number.isFinite(clearance))return false;
    if(lift.goal===1&&clearance>.15){wet=false;armed=true;}
    if(!wet&&clearance>.06)armed=true;
    if(lift.goal!==0||!armed||wet||clearance>0)return false;
    armed=false;wet=true;return true;
  };
}

// A slap needs prior clearance and a downward crossing of the moving water.
export function surfaceSlap(clearanceToArm,speedToTrigger,quietTime){
  let priorTime,priorClearance,armed=false,last=-Infinity;
  return (time,clearance)=>{
    if(time===priorTime)return 0;
    const dt=time-priorTime;
    let speed=0;
    if(!(dt>0&&dt<.24))armed=false;
    if(clearance>clearanceToArm)armed=true;
    else if(armed&&clearance<=0&&priorClearance>0){
      armed=false;
      const entry=(priorClearance-clearance)/dt;
      if(entry>=speedToTrigger&&time-last>=quietTime){last=time;speed=entry;}
    }
    if(dt<0)last=-Infinity;
    priorTime=time;priorClearance=clearance;
    return speed;
  };
}

export function raceAudio(T){
  let engines,audio,wind,filter,noise,rain,weather,enabled=false,lastMix=-Infinity;
  let submerged,effects,luffGain,flapOscillator,flapRate,level=1;
  let rainPlaying=false,lastWet=-Infinity;
  function startRain(){
    if(!rain.paused)return;
    rainPlaying=true;
    void rain.play().catch(error=>{
      if(error.name!=='AbortError')console.warn('Rain recording unavailable',error);
    });
  }
  function stopRain(){
    rain?.pause();rainPlaying=false;
  }
  let waves,waveGains,lastWaveMix=-Infinity,lastWaveTime,waveTimeWall,wavesActive=false;
  let hullWash,hullGurgle,hullLapping,piccardVoices,piccardRecording,piccardRetryAt=0;
  function silencePiccard(){piccardVoices?.stop();piccardVoices=undefined;}
  const detectPiccardImpact=piccardImpactDetector();
  function submarineSound(sub,camera,wet,running,peers=[]){
    const frame=sub?.frame;
    const impact=frame?.contact?detectPiccardImpact(frame.time,Math.hypot(...frame.contact)):0;
    if(!enabled||!level)return;
    if(!piccardVoices&&!sub?.active&&!peers.length)return;
    if(piccardRecording){
      piccardVoices??=piccardMixer(audio,effects,piccardRecording);
      piccardVoices.update(sub,peers,camera,wet,running);
    }else if(audio.currentTime>=piccardRetryAt){
      piccardRetryAt=Infinity;
      decodeRecording('piccard-engine.flac').then(buffer=>{piccardRecording=buffer;})
        .catch(error=>{
          piccardRetryAt=audio.currentTime+30;
          console.warn('Piccard motor recording unavailable',error);
        });
    }
    if(impact&&sub.active&&running&&wet>0&&audio.state==='running'){
      const source=sub.mesh.position,eye=camera.position,right=camera.matrixWorld.elements;
      const dx=source.x-eye.x,dy=source.y-eye.y,dz=source.z-eye.z,distance=Math.hypot(dx,dy,dz);
      const balance=(dx*right[0]+dy*right[1]+dz*right[2])/Math.max(2,distance);
      piccardKnock(audio,effects,impact*wet,distance,balance);
    }
  }
  function silenceLuff(){
    flapRate?.reset();
    if(luffGain)luffGain.gain.setTargetAtTime(0,audio.currentTime,.06);
  }
  function silenceWaves(){
    if(!wavesActive)return;
    wavesActive=false;
    hullLapping?.gain.setTargetAtTime(0,audio.currentTime,.16);
    waves?.reset();
    for(const gain of hullWash??[])gain.gain.setTargetAtTime(0,audio.currentTime,.20);
    for(const gain of waveGains??[])gain.gain.setTargetAtTime(0,audio.currentTime,.15);
  }
  function setVolume(value){
    const wasMuted=!level;
    level=value;
    if(effects)effects.gain.setTargetAtTime(level,audio.currentTime,.025);
    if(!level){stopRain();silenceLuff();silenceWaves();silencePiccard();}
    else if(wasMuted&&enabled){lastWet=audio.currentTime;startRain();}
  }
  function connectCabinRadio(media){
    const speaker=audio.createPanner(),gain=audio.createGain();
    speaker.panningModel='HRTF';
    speaker.distanceModel='exponential';
    speaker.refDistance=1.2;
    speaker.rolloffFactor=1.6;
    speaker.maxDistance=60;
    gain.gain.value=.6;
    const bassCut=audio.createBiquadFilter(),trebleCut=audio.createBiquadFilter();
    bassCut.type='highpass';bassCut.frequency.value=310;
    trebleCut.type='lowpass';trebleCut.frequency.value=3000;
    const saturation=audio.createWaveShaper();
    saturation.curve=Float32Array.from({length:513},(_,i)=>.65*Math.tanh(2.4*(i/256-1)));
    saturation.oversample='2x';
    audio.createMediaElementSource(media).connect(bassCut).connect(saturation).connect(trebleCut);
    trebleCut.connect(speaker).connect(gain).connect(effects);

    const staticNoise=audio.createBuffer(1,8*audio.sampleRate,audio.sampleRate);
    const samples=staticNoise.getChannelData(0);
    let crackle=0;
    for(let i=0;i<samples.length;i++){
      if(Math.random()<27/audio.sampleRate)crackle=.15+Math.random()*.5;
      samples[i]=(2*Math.random()-1)*(.016+crackle);
      crackle*=.985;
    }
    const staticSource=audio.createBufferSource(),staticGate=audio.createGain();
    staticSource.buffer=staticNoise;staticSource.loop=true;
    staticGate.gain.value=0;
    staticSource.connect(staticGate).connect(trebleCut);staticSource.start();
    const staticLevel=value=>staticGate.gain.setTargetAtTime(value,audio.currentTime,.014);
    media.addEventListener('playing',()=>staticLevel(1));
    for(const event of ['pause','waiting','ended','error','emptied'])media.addEventListener(event,()=>staticLevel(0));
    const {listener}=audio,position=new T.Vector3(),direction=new T.Vector3(),up=new T.Vector3();
    function coordinates(x,y,z,vector){
      x.value=vector.x;
      y.value=vector.y;
      z.value=vector.z;
    }
    return (emitter,camera)=>{
      emitter.getWorldPosition(position);
      if(speaker.positionX)coordinates(speaker.positionX,speaker.positionY,speaker.positionZ,position);
      else speaker.setPosition(position.x,position.y,position.z);
      camera.getWorldDirection(direction);
      position.setFromMatrixPosition(camera.matrixWorld);
      up.setFromMatrixColumn(camera.matrixWorld,1).normalize();
      if(listener.positionX)coordinates(listener.positionX,listener.positionY,listener.positionZ,position);
      else listener.setPosition(position.x,position.y,position.z);
      if(listener.forwardX){
        coordinates(listener.forwardX,listener.forwardY,listener.forwardZ,direction);
        coordinates(listener.upX,listener.upY,listener.upZ,up);
      }else listener.setOrientation(direction.x,direction.y,direction.z,up.x,up.y,up.z);
    };
  }
  const loading=new Set(),gullCalls=['1','2','4','5','6'].map(take=>'gull-'+take+'.mp3');
  const gullRecordings=new Map();
  let exhaleBuffer,loadingExhale;
  async function decodeRecording(file){
    const response=await fetch(new URL('./assets/audio/'+file,import.meta.url));
    if(!response.ok)throw Error('Audio HTTP '+response.status);
    return audio.decodeAudioData(await response.arrayBuffer());
  }
  function startAmbience(file,destination,fadeIn=false,onSource){
    if(loading.has(file))return;
    loading.add(file);
    decodeRecording(file)
      .then(buffer=>{
        const source=audio.createBufferSource();
        source.buffer=buffer;source.loop=true;
        if(fadeIn){
          const entrance=audio.createGain();
          entrance.gain.value=0;entrance.gain.setTargetAtTime(1,audio.currentTime,.16);
          source.connect(entrance).connect(destination);
        }else source.connect(destination);
        onSource?.(source);
        source.start();
      }).catch(error=>console.warn('Ambience unavailable',file,error));
  }
  function imagingHit(distance,underwater){
    if(!enabled||audio.state!=='running'||distance>32)return;
    const tone=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime;
    const level=(underwater?.20:.55)/(1+distance/5);
    tone.frequency.setValueAtTime(underwater?830:1370,t);
    tone.frequency.exponentialRampToValueAtTime(underwater?420:780,t+.13);
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.linearRampToValueAtTime(level,t+.007);
    gain.gain.exponentialRampToValueAtTime(.0001,t+.15);
    tone.connect(gain).connect(effects);
    tone.onended=()=>{tone.disconnect();gain.disconnect();};
    tone.start(t);tone.stop(t+.16);
  }
  async function setEnabled(on){
    if(!audio && !on)return;
    if(!audio){
      audio=new AudioContext({latencyHint:.025});noise=audio.createBuffer(1,2*audio.sampleRate,audio.sampleRate);
      const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=2*Math.random()-1;
      effects=audio.createGain();effects.gain.value=level;effects.connect(audio.destination);
      submerged=audio.createGain();submerged.gain.value=0;submerged.connect(effects);
      const blower=audio.createBufferSource();blower.buffer=noise;blower.loop=true;
      filter=audio.createBiquadFilter();filter.type='lowpass';wind=audio.createGain();wind.gain.value=0;
      // Stream the four-minute stereo track without allocating a full decoded buffer on phones.
      rain=new Audio();rain.preload='none';rain.loop=true;
      rain.src=new URL('./assets/audio/dark-rainy-night.mp3',import.meta.url).href;
      weather=audio.createGain();weather.gain.value=0;
      audio.createMediaElementSource(rain).connect(weather).connect(effects);
      blower.connect(filter).connect(wind).connect(effects);blower.start();
    }
    if(on){
      // Unlock media playback during the same gesture that enables sound.
      if(level){lastWet=audio.currentTime;startRain();}
      await audio.resume();
      outputFailed=false;
      startAmbience('underwater-rumble.flac',submerged,true);
      if(!exhaleBuffer&&!loadingExhale){
        loadingExhale=decodeRecording('diver-exhale.mp3?take=acid').then(buffer=>{exhaleBuffer=buffer;})
          .catch(error=>console.warn('Diver regulator recording unavailable',error)).finally(()=>{loadingExhale=undefined;});
      }
    }
    else{
      enabled=false;stopRain();
      try{silenceLuff();silenceWaves();silencePiccard();}
      finally{if(audio.state!=='closed')await audio.suspend();}
    }
    enabled=audio.state==='running';return enabled;
  }
  function startLuff(){
    const source=audio.createBufferSource(),low=audio.createBiquadFilter(),high=audio.createBiquadFilter();
    const flutter=audio.createGain(),envelope=audio.createWaveShaper();
    source.buffer=noise;source.loop=true;
    low.type='lowpass';low.frequency.value=380;low.Q.value=.6;
    high.type='highpass';high.frequency.value=72;high.Q.value=.55;
    envelope.curve=Float32Array.from({length:129},(_,i)=>.035+.965*(i/128)**2.5);
    flapOscillator=audio.createOscillator();flapOscillator.frequency.value=1.8;
    flutter.gain.value=0;
    luffGain=audio.createGain();luffGain.gain.value=0;
    source.connect(high).connect(low).connect(flutter).connect(luffGain).connect(effects);
    // The oscillator shapes the gain of the cloth noise. Its signal never
    // reaches the output as a tone.
    flapOscillator.connect(envelope).connect(flutter.gain);
    source.start();flapOscillator.start();
  }
  function update(speed,storm,height,sailLuff,state,time,playbackRate){
    if(!enabled||!level)return;
    const wall=audio.currentTime;
    const exposure=1-underwaterMix(height);
    let luff=0;
    if(sailLuff&&state&&exposure>0){
      const main=.74*sailLuff[0],jib=.45*sailLuff[1];
      if(main+jib>.015||flapRate){
        flapRate??=sailFlapRate();
        // Hull, load and instrument fields occupy the first 42 entries.
        const vertices=42,verticesPerSail=72;
        if(flapRate.sample(time,wall,leechDeflection(state,vertices),
          leechDeflection(state,vertices+verticesPerSail),main,jib,playbackRate)){
          const [mainMotion,jibMotion]=flapRate.activity;
          luff=Math.max(0,Math.min(1,main*mainMotion+jib*jibMotion)-.015);
        }
      }
    }else flapRate?.reset();
    if(wall-lastMix<.05)return;
    lastMix=wall;
    if(!luffGain&&luff>.015)startLuff();
    if(luffGain){
      const rate=Math.max(.35,Math.min(16,flapRate.audibleHz));
      flapOscillator.frequency.setTargetAtTime(rate,wall,.15);
      luffGain.gain.setTargetAtTime(1.1*exposure*luff,wall,.09);
    }
    submerged.gain.setTargetAtTime(.36*(1-exposure),lastMix,.35);
    const wet=storm?exposure:0;
    weather.gain.setTargetAtTime(.5*wet,lastMix,.20);
    if(wet>0){lastWet=wall;if(!rainPlaying)startRain();}
    else if(rainPlaying&&wall-lastWet>=1.2)stopRain();
    filter.frequency.setTargetAtTime(180+Math.min(30,speed)*53,audio.currentTime,.4);
    wind.gain.setTargetAtTime(exposure*Math.min(.28,.009*speed),audio.currentTime,.35);
  }
  function startWaves(){
    const source=audio.createBufferSource();
    source.buffer=noise;source.loop=true;
    const gains=[['lowpass',520,.60],['bandpass',1420,.70],['bandpass',860,.65]].map(([type,frequency,q])=>{
      const band=audio.createBiquadFilter(),gain=audio.createGain();
      band.type=type;band.frequency.value=frequency;band.Q.value=q;
      gain.gain.value=0;
      source.connect(band).connect(gain).connect(effects);
      return gain;
    });
    source.start();
    return gains;
  }
  function water(surface,time,east,north,tide,height,includeWake,hullSpeed,hullDistance=Infinity,lappingPosition,catamaran=false){
    if(!enabled||!level)return;
    if(!surface||height<=-.35){silenceWaves();return;}
    const wall=audio.currentTime;
    if(time!==lastWaveTime){lastWaveTime=time;waveTimeWall=wall;}
    else if(wall-waveTimeWall>.3){silenceWaves();return;}
    if(wall-lastWaveMix<.07)return;
    lastWaveMix=wall;
    wavesActive=true;
    waves??=waveAmbience();
    const {swell,crest,wake}=waves.sample(surface,time,east,north,tide,includeWake);
    const exposure=(1-underwaterMix(height))/(1+Math.max(0,height)/16);
    if(waveGains||swell+crest+wake>=.002){
      waveGains??=startWaves();
      waveGains[0].gain.setTargetAtTime(.76*swell*exposure,wall,.22);
      waveGains[1].gain.setTargetAtTime(.32*crest*exposure,wall,.09);
      waveGains[2].gain.setTargetAtTime(.66*wake*exposure,wall,.12);
    }
    let lap=0;
    if(lappingPosition){
      const piccard=!Number.isFinite(hullSpeed);
      // Use the hull's own waterline. A dry sub in the cradle and a deep sub
      // can both be viewed by a camera sitting on the surface.
      const hullHeight=piccard?lappingPosition.z-surface(lappingPosition.x,lappingPosition.y,true):0;
      const range=Math.hypot(lappingPosition.x-east,lappingPosition.y-north,height);
      lap=hullLappingMix(piccard,hullHeight,hullSpeed)*exposure*(.77+.62*swell+.30*wake)/(1+(range/(piccard?5:12))**2);
    }
    if(lap>.004&&!hullLapping){
      hullLapping=audio.createGain();hullLapping.gain.value=0;hullLapping.connect(effects);
      startAmbience('hull-lapping.mp3',hullLapping,true);
    }
    hullLapping?.gain.setTargetAtTime(lap,wall,.16);
    const {gurgle,rush,gurgleRate}=hullWashMix(hullSpeed,swell,wake,catamaran);
    const listenerGain=.86*exposure/(1+(hullDistance/15)**2);
    if(!hullWash&&Math.max(gurgle,rush)*listenerGain>.015){
      // Start both loops together so the next blend needs no audio fetch.
      hullWash=['hull-wash.mp3','hull-rush.mp3'].map((file,index)=>{
        const gain=audio.createGain();
        gain.gain.value=0;
        gain.connect(effects);
        startAmbience(file,gain,false,index===0?source=>{
          hullGurgle=source;
          source.playbackRate.value=gurgleRate;
        }:undefined);
        return gain;
      });
    }
    if(hullWash){
      hullWash[0].gain.setTargetAtTime(gurgle*listenerGain,wall,.24);
      hullWash[1].gain.setTargetAtTime(rush*listenerGain,wall,.24);
      hullGurgle?.playbackRate.setTargetAtTime(gurgleRate,wall,.24);
    }
  }
  function signal(){
    if(!enabled)return;
    const tone=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime;
    tone.frequency.value=330;
    gain.gain.setValueAtTime(0,t);
    gain.gain.linearRampToValueAtTime(.19,t+.06);
    gain.gain.setValueAtTime(.19,t+.22);
    gain.gain.linearRampToValueAtTime(0,t+.38);
    tone.connect(gain).connect(effects);
    tone.onended=()=>{tone.disconnect();gain.disconnect();};
    tone.start(t);tone.stop(t+.38);
  }
  function finishGun(){
    if(!enabled)return;
    const blast=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain(),t=audio.currentTime;
    blast.buffer=noise;filter.type='lowpass';
    filter.frequency.setValueAtTime(2400,t);filter.frequency.exponentialRampToValueAtTime(170,t+.36);
    gain.gain.setValueAtTime(.002,t);gain.gain.exponentialRampToValueAtTime(.65,t+.005);
    gain.gain.exponentialRampToValueAtTime(.10,t+.075);gain.gain.exponentialRampToValueAtTime(.001,t+.44);
    blast.connect(filter).connect(gain).connect(effects);
    blast.onended=()=>{blast.disconnect();filter.disconnect();gain.disconnect();};
    blast.start(t,.35);blast.stop(t+.45);
  }
  function thunder(){
    if(!enabled)return;
    const src=audio.createBufferSource(),low=audio.createBiquadFilter(),gain=audio.createGain(),t=audio.currentTime;
    src.buffer=noise;src.loop=true;low.type='lowpass';
    low.frequency.setValueAtTime(210,t);low.frequency.exponentialRampToValueAtTime(57,t+2.6);
    gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(1.2,t+.10);
    gain.gain.exponentialRampToValueAtTime(.28,t+.6);gain.gain.linearRampToValueAtTime(.51,t+.95);
    gain.gain.exponentialRampToValueAtTime(.001,t+3.5);
    src.connect(low).connect(gain).connect(weather);src.onended=()=>{src.disconnect();low.disconnect();gain.disconnect();};
    src.start(t);src.stop(t+3.6);
  }
  function wildlife(kind,distance,pan,underwater,strength){
    if(!enabled||audio.state!=='running'||distance>240)return;
    if(kind==='fluke slap'){waterSlap(distance,pan,Number(underwater),strength,true);return;}
    if(kind==='fin'){
      if(!level||distance>12||strength<=0)return;
      const t=audio.currentTime,source=audio.createBufferSource(),band=audio.createBiquadFilter();
      const gain=audio.createGain(),stereo=audio.createStereoPanner();
      const peak=(underwater?.40:.08)*strength/(1+(distance/2.2)**2);
      source.buffer=noise;source.loop=true;stereo.pan.value=pan;
      band.type='bandpass';band.Q.value=.68;
      band.frequency.setValueAtTime(280+310*strength,t);band.frequency.exponentialRampToValueAtTime(140,t+.24);
      gain.gain.setValueAtTime(.00001,t);gain.gain.linearRampToValueAtTime(peak,t+.065);
      gain.gain.exponentialRampToValueAtTime(.00001,t+.32);
      source.connect(band).connect(gain).connect(stereo).connect(effects);
      source.onended=()=>{source.disconnect();band.disconnect();gain.disconnect();stereo.disconnect();};
      source.start(t,Math.random()*.35);source.stop(t+.33);return;
    }
    if(kind==='exhale'){
      if(!exhaleBuffer||!level||distance>20)return;
      const source=audio.createBufferSource(),gain=audio.createGain(),stereo=audio.createStereoPanner();
      source.buffer=exhaleBuffer;source.playbackRate.value=.93+.14*Math.random();
      stereo.pan.value=pan*Math.min(1,distance);gain.gain.value=strength*(underwater?.88:.18)/(1+(distance/2)**2);
      source.connect(gain).connect(stereo).connect(effects);source.onended=()=>{source.disconnect();gain.disconnect();stereo.disconnect();};
      source.start();return;
    }
    if(kind==='gull'){
      const file=strength>=1?'gull-hit.mp3':gullCalls[Math.floor(Math.random()*gullCalls.length)];
      let recording=gullRecordings.get(file);
      if(!recording){
        recording=decodeRecording(file);
        gullRecordings.set(file,recording);
      }
      void recording.then(buffer=>{
        if(!enabled||audio.state!=='running')return;
        const source=audio.createBufferSource(),gain=audio.createGain();
        const filter=audio.createBiquadFilter(),stereo=audio.createStereoPanner();
        source.buffer=buffer;stereo.pan.value=pan;
        filter.type='lowpass';
        filter.frequency.value=underwater?620:Math.max(1800,7800-25*distance);
        gain.gain.value=.65*strength*(underwater?.32:1)/(1+distance/22);
        source.connect(filter).connect(gain).connect(stereo).connect(effects);
        source.onended=()=>{for(const node of [source,filter,gain,stereo])node.disconnect();};
        source.start();
      }).catch(error=>{
        gullRecordings.delete(file);
        console.warn('Gull recording unavailable',file,error);
      });
      return;
    }
    const t=audio.currentTime,impact=kind==='impact',length=impact?2.35:1.05;
    const src=audio.createBufferSource(),band=audio.createBiquadFilter(),gain=audio.createGain(),stereo=audio.createStereoPanner();
    src.buffer=noise;src.loop=true;band.type=impact?'lowpass':'bandpass';
    const cutoff=(impact?1600:2300)*(underwater?.32:1);
    band.frequency.setValueAtTime(cutoff,t);band.frequency.exponentialRampToValueAtTime(cutoff*(impact?.16:.48),t+length);
    band.Q.value=impact?.68:.86;stereo.pan.value=pan;
    const peak=strength*(impact?1.65:.95)/(1+distance/18);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.001,peak),t+(impact?.055:.045));
    if(kind==='spout')gain.gain.exponentialRampToValueAtTime(Math.max(.001,peak*.22),t+.29);
    gain.gain.exponentialRampToValueAtTime(.0001,t+length);
    src.connect(band).connect(gain).connect(stereo).connect(effects);
    src.onended=()=>{for(const n of [src,band,gain,stereo])n.disconnect();};
    src.start(t);src.stop(t+length);
  }
  const whaleClips=['humpback-song-1.mp3','humpback-song-2.mp3'];
  const whaleBuffers=new Map();
  let whaleVoice,loadingWhale,nextWhale=0,whaleClip=0,lastWhaleMix=-Infinity;
  let whaleGain=0,whalePan=0,whaleCutoff=2000;
  function mixWhale(voice){
    const now=audio.currentTime;
    voice.gain.gain.setTargetAtTime(whaleGain,now,.14);
    voice.stereo.pan.setTargetAtTime(whalePan,now,.11);
    voice.filter.frequency.setTargetAtTime(whaleCutoff,now,.15);
    lastWhaleMix=now;
  }
  function whaleSong(distance,pan,depth,running){
    if(!audio||!enabled||audio.state!=='running')return;
    const now=audio.currentTime;
    const wet=running&&depth>0&&distance<70;
    const margin=Math.max(0,Math.min(1,(70-distance)/20));
    whaleGain=wet?.80*Math.min(1,depth/.5)*margin/(1+(distance/20)**2):0;
    whalePan=pan;
    whaleCutoff=Math.max(800,4200-43*distance);
    if(whaleVoice&&now-lastWhaleMix>=.06)mixWhale(whaleVoice);
    if(!wet){if(!whaleVoice)nextWhale=now;return;}
    if(!whaleGain||whaleVoice||loadingWhale||now<nextWhale)return;
    const file=whaleClips[whaleClip%whaleClips.length];
    if(!whaleBuffers.has(file))whaleBuffers.set(file,decodeRecording(file));
    const recording=whaleBuffers.get(file);loadingWhale=recording;
    void recording.then(buffer=>{
      if(loadingWhale!==recording||!enabled||audio.state!=='running'||!whaleGain)return;
      const source=audio.createBufferSource(),gain=audio.createGain(),filter=audio.createBiquadFilter(),stereo=audio.createStereoPanner();
      source.buffer=buffer;gain.gain.value=0;filter.type='lowpass';
      stereo.pan.value=whalePan;filter.frequency.value=whaleCutoff;
      source.connect(filter).connect(gain).connect(stereo).connect(effects);
      const voice={source,gain,stereo,filter};
      whaleVoice=voice;
      mixWhale(voice);whaleClip++;
      source.onended=()=>{
        for(const node of [source,filter,gain,stereo])node.disconnect();
        if(whaleVoice===voice){whaleVoice=undefined;nextWhale=audio.currentTime+3+2*Math.random();}
      };
      source.start();
    }).catch(error=>{
      if(loadingWhale!==recording)return;
      whaleBuffers.delete(file);whaleClip++;
      nextWhale=audio.currentTime+3;
      console.warn('Humpback recording unavailable',error);
    }).finally(()=>{if(loadingWhale===recording)loadingWhale=undefined;});
  }
  const launches=new Map(),entryBuffers=new Map();
  let splashVariant=0;
  function entryRecording(variant){
    if(!entryBuffers.has(variant)){
      const file='hull-entry-'+variant+'.mp3';
      entryBuffers.set(variant,decodeRecording(file).catch(error=>{
        entryBuffers.delete(variant);console.warn('Hull entry recording unavailable',file,error);
      }));
    }
    return entryBuffers.get(variant);
  }
  function waterSlap(distance,balance,wet,strength,fluke=false){
    const reach=fluke?65:27;
    if(!enabled||!level||audio.state!=='running'||distance>reach||!(strength>0))return;
    const at=audio.currentTime,variant=splashVariant++%2+1;
    void entryRecording(variant).then(buffer=>{
      if(!buffer||!enabled||!level||audio.state!=='running'||audio.currentTime-at>.28)return;
      const sound=audio.createBufferSource(),pan=audio.createStereoPanner(),gain=audio.createGain(),filter=audio.createBiquadFilter();
      sound.buffer=buffer;sound.playbackRate.value=(fluke?.69:1.16)+.16*(variant-1);
      pan.pan.value=balance;filter.type='lowpass';
      filter.frequency.value=(fluke?8600:11500)*(1-wet)+1250*wet;
      gain.gain.value=(fluke?1.1:.72)*(1-.35*wet)*Math.min(1,strength)/(1+distance/(fluke?13:6))*(1-distance/reach);
      sound.connect(filter).connect(gain).connect(pan).connect(effects);
      sound.onended=()=>{for(const node of [sound,filter,gain,pan])node.disconnect();};
      sound.start();
    });
  }
  function hoistWater(local,peers,surface,camera,wet,running){
    if(!enabled||!level||!running){launches.clear();return;}
    for(const key of launches.keys())if(key!==null&&!peers.has(key))launches.delete(key);
    function observe(id,lift){
      if(!lift?.rider){launches.delete(id);return;}
      const p=lift.pose;
      if(!p||Math.hypot(p[0]-camera.position.x,p[1]-camera.position.y)>44){launches.delete(id);return;}
      let entered=launches.get(id);
      if(!entered){entered=hoistWaterEntry();launches.set(id,entered);}
      // Build the buffers while lowering the loaded cable, before water entry.
      if(lift.goal===0&&lift.level>.3){entryRecording(1);entryRecording(2);}
      const clearance=p[2]-.09325*p[11]-surface(p[0],p[1],true);
      if(!entered(lift,clearance))return;
      const dx=p[0]-camera.position.x,dy=p[1]-camera.position.y,dz=p[2]-camera.position.z;
      const distance=Math.hypot(dx,dy,dz),right=camera.matrixWorld.elements,at=audio.currentTime;
      const variant=splashVariant++%2+1;
      entryRecording(variant).then(buffer=>{
        if(!buffer||!enabled||!level||audio.state!=='running'||audio.currentTime-at>.3||launches.get(id)!==entered)return;
        const source=audio.createBufferSource(),pan=audio.createStereoPanner(),gain=audio.createGain(),filter=audio.createBiquadFilter();
        source.buffer=buffer;
        pan.pan.value=Math.max(-1,Math.min(1,(dx*right[0]+dy*right[1]+dz*right[2])/Math.max(1,distance)));
        gain.gain.value=(.92-.40*wet)/(1+distance/7);
        filter.type='lowpass';filter.frequency.value=14000*(1-wet)+1200*wet;
        source.connect(filter).connect(gain).connect(pan).connect(effects);
        source.onended=()=>{for(const node of [source,filter,gain,pan])node.disconnect();};source.start();
      });
    }
    if(local)observe(null,local);else launches.delete(null);
    for(const [id,lift] of peers)observe(id,lift);
  }
  function structureImpact(force,distance,pan,underwater){
    if(!enabled||audio.state!=='running'||distance>140)return;
    const t=audio.currentTime,volume=Math.min(1.4,.30+force/55000)/(1+distance/16);
    const stereo=audio.createStereoPanner();
    stereo.pan.value=Math.max(-1,Math.min(1,pan));stereo.connect(effects);
    const thump=audio.createOscillator(),body=audio.createGain();
    thump.frequency.setValueAtTime(underwater?83:104,t);
    thump.frequency.exponentialRampToValueAtTime(34,t+.30);
    body.gain.setValueAtTime(.0001,t);body.gain.linearRampToValueAtTime(volume*.84,t+.012);
    body.gain.exponentialRampToValueAtTime(.0001,t+.63);
    thump.connect(body).connect(stereo);thump.start();thump.stop(t+.65);
    thump.onended=()=>{for(const node of [thump,body,stereo])node.disconnect();};
    for(const [delay,frequency,magnitude,end] of [[0,470,.99,.44],[.036,2280,.61,.15],[.15,1140,.30,.23]]){
      const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),burst=audio.createGain(),at=t+delay;
      source.buffer=noise;filter.type='bandpass';filter.frequency.value=frequency*(underwater?.47:1);filter.Q.value=.73;
      burst.gain.setValueAtTime(.0001,at);burst.gain.linearRampToValueAtTime(volume*magnitude,at+.006);
      burst.gain.exponentialRampToValueAtTime(.0001,at+end);
      source.connect(filter).connect(burst).connect(stereo);
      source.start(at,.9*delay);source.stop(at+end);
      source.onended=()=>{for(const node of [source,filter,burst])node.disconnect();};
    }
  }
  let floodingVoice;
  function floodSound(rate,distance){
    if(!enabled)return;
    const t=audio.currentTime,strength=Math.min(1,Math.max(0,rate)*3)/(1+distance/4)**1.25;
    if(!floodingVoice&&strength>.001){
      const source=audio.createBufferSource(),band=audio.createBiquadFilter(),level=audio.createGain();
      const gulp=audio.createOscillator(),amount=audio.createGain();
      source.buffer=noise;source.loop=true;band.type='bandpass';band.Q.value=1.15;
      level.gain.value=0;
      gulp.frequency.value=7;amount.gain.value=170;
      gulp.connect(amount).connect(band.frequency);
      source.connect(band).connect(level).connect(effects);
      source.start();gulp.start();floodingVoice={band,level};
    }
    if(!floodingVoice)return;
    floodingVoice.band.frequency.setTargetAtTime(470+720*Math.min(rate,1),t,.13);
    floodingVoice.level.gain.setTargetAtTime(.57*strength,t,.14);
  }
  let rotors;
  function droneSound(local,peers,camera,underwater,running){
    if(!enabled||(!rotors&&!local&&!peers.length))return;
    rotors??=droneMixer(audio,effects,noise);
    rotors(local,peers,camera,underwater,running);
  }
  function motorSound(local,peers,camera,underwater,running,throttle,simulationRate){
    if(!enabled||(!engines&&!local&&!peers.length))return;
    engines??=inboardMixer(audio,effects,decodeRecording);
    engines(local,peers,camera,underwater,running,throttle,simulationRate);
  }
  const mixer={get enabled(){return enabled;},get audible(){return enabled&&level>0;},
    setEnabled,setVolume,connectCabinRadio,onOutputError:undefined,
    dispose(){
      stopRain();
      if(rain){rain.removeAttribute('src');rain.load();}
      if(audio&&audio.state!=='closed')void audio.close().catch(()=>{});
    }};
  let outputFailed=false;
  const effectsMethods={update,water,signal,finishGun,thunder,wildlife,imagingHit,motorSound,droneSound,submarineSound,hoistWater,structureImpact,floodSound,whaleSong,waterSlap};
  for(const [name,mix] of Object.entries(effectsMethods)){
    mixer[name]=(...args)=>{
      if(outputFailed)return;
      try{return mix(...args);}
      catch(error){
        outputFailed=true;enabled=false;
        console.warn('Sound effects interrupted',error);
        mixer.onOutputError?.();
      }
    };
  }
  return mixer;
}
