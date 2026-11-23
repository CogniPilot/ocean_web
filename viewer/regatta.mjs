import {inboardMixer} from './inboard-audio.mjs';
import {droneMixer} from './drone-audio.mjs';
import {showInLowWaterCapture} from './render-layers.mjs';

// Compass bearing clockwise from true north in the east/north world frame.
export function trueBearing(east,north){
  const degrees=(Math.round(Math.atan2(east,north)*180/Math.PI)+360)%360;
  return String(degrees).padStart(3,'0')+'°T';
}
export function firstLeg(race){
  const e=race.get('markEast')[0]-(race.get('committeeEast')+race.get('pinEast'))/2;
  const n=race.get('markNorth')[0]-(race.get('committeeNorth')+race.get('pinNorth'))/2;
  return trueBearing(e,n);
}
// The line midpoint gives a single course-to-steer reference for an open gate.
export function raceTarget(race,stage,east,north){
  let x,y,label;
  if(stage===2 || stage===3){
    x=race.get('markEast')[stage-2];y=race.get('markNorth')[stage-2];
    label='Mark '+(stage-1);
  }else if(stage===0 || stage===1 || stage===4){
    x=(race.get('committeeEast')+race.get('pinEast'))/2;
    y=(race.get('committeeNorth')+race.get('pinNorth'))/2;
    label=stage===4?'Finish':'Start';
  }else return null;
  const de=x-east,dn=y-north,range=Math.hypot(de,dn);
  if(range<.01 || !Number.isFinite(range))return null;
  return {label,range,angle:Math.atan2(dn,de),bearing:trueBearing(de,dn)};
}
function inflatableMark(T){
  const body=new T.Group();
  body.name='Inflatable race mark';
  const bottom=-.10,apex=1.65,height=apex-bottom,radius=.85;
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
        bulge:0,seam:1-Math.min(1,Math.abs(t-.5)*2)});
    }
    const edgeEnd=next.clone().lerp(corner,.065);
    for(let j=0;j<14;j++){
      const t=j/14;
      rim.push({point:end.clone().lerp(edgeEnd,t),bulge:Math.sin(Math.PI*t)**2,seam:0});
    }
  }
  const positions=[],colors=[],faces=[];
  const steps=[0,.012,.032,.06,.095,.15,.22,.3,.38,.46,.54,.62,.7,.78,.85,.91,.96,.986,.996,1];
  const belly=u=>.037*Math.sin(Math.PI*u);
  const ringScale=u=>Math.max(.011,1-u)*(1-.12*Math.exp(-u/.025));
  for(const u of steps){
    for(const {point,bulge,seam} of rim){
      const bulged=point.clone().multiplyScalar(ringScale(u)).addScaledVector(point,belly(u)*bulge/point.length());
      positions.push(bulged.x,bulged.y,bottom+u*height);
      const weld=.09*seam+.085*Math.exp(-(((u-.06)/.014)**2));
      const shade=1-weld;
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
  const vinyl=new T.MeshPhysicalMaterial({color:0xff601d,vertexColors:true,roughness:.38,clearcoat:.33,clearcoatRoughness:.38});
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
  const label=document.createElement('canvas');label.width=512;label.height=512;
  const ink=label.getContext('2d');
  ink.clearRect(0,0,512,512);
  for(const [y,text] of [[88,'INFLATE'],[244,'DRAIN']]){
    ink.fillStyle='#f5e7d4';ink.beginPath();ink.arc(256,y,59,0,2*Math.PI);ink.fill();
    ink.fillStyle='#7c3c2a';ink.font='bold 18px sans-serif';ink.textAlign='center';ink.fillText(text,256,y-36);
  }
  ink.fillStyle='#eee8d8';ink.fillRect(137,329,238,133);
  ink.fillStyle='#504b43';ink.textAlign='left';ink.font='bold 21px sans-serif';ink.fillText('RACE MARK',157,359);
  ink.fillStyle='#aaa391';
  for(let i=0;i<4;i++)ink.fillRect(157,375+17*i,174-(i%2)*29,3);
  const texture=new T.CanvasTexture(label);texture.colorSpace=T.SRGBColorSpace;
  const decal=new T.MeshStandardMaterial({map:texture,roughness:.52,alphaTest:.5,side:T.FrontSide});
  add(new T.PlaneGeometry(.55,.52),decal,onPanel(0,.86));
  for(const z of [.86+.52*(.5-88/512),.86+.52*(.5-244/512)]){
    const socket=onPanel(0,z);
    const flange=add(new T.TorusGeometry(.027,.005,6,18),fittings,socket);flange.position.z=.008;
    const plug=add(new T.CylinderGeometry(.023,.023,.015,16),rubber,socket);
    plug.rotation.x=Math.PI/2;plug.position.z=.009;
  }
  return body;
}

// Z-up committee launch and inflatable marks. Dimensions are in metres.
export function courseScene(T,scene,race){
  const group=new T.Group();scene.add(group);
  const mat=(color,roughness=.55)=>new T.MeshStandardMaterial({color,roughness});
  const white=mat(0xf1ede0),navy=mat(0x152c36),metal=mat(0xb7c0bc,.27);
  const mesh=(parent,geometry,material,x,y,z)=>{
    const o=new T.Mesh(geometry,material);o.position.set(x,y,z);parent.add(o);return o;
  };
  function rod(parent,a,b,r,material){
    const v=new T.Vector3(...a),w=new T.Vector3(...b),d=w.clone().sub(v);
    const o=mesh(parent,new T.CylinderGeometry(r,r,d.length(),8),material,0,0,0);
    o.position.copy(v).lerp(w,.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;
  }
  const boat=new T.Group();boat.position.set(race.get('committeeEast'),race.get('committeeNorth'),0);boat.rotation.order='ZYX';boat.rotation.z=race.get('windBearing')+Math.PI;group.add(boat);
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
  const glass=mat(0x64808a);mesh(boat,new T.BoxGeometry(.06,.78,.42),glass,.40,0,1.80);
  for(const x of [-.75,.55])for(const y of [-.53,.53])rod(boat,[x,y,.79],[x,y,2.32],.027,metal);
  mesh(boat,new T.BoxGeometry(1.85,1.45,.08),white,0,0,2.32);
  mesh(boat,new T.BoxGeometry(.52,.48,.68),navy,-3.13,0,.58);
  rod(boat,[0,0,2.34],[0,0,4],.033,metal);
  // Aft landing pad shares the height and extent of the Modelica deck.
  mesh(boat,new T.BoxGeometry(1.45,1.3,.012),navy,-1.98,0,.777);
  for(const y of [-.22,.22])mesh(boat,new T.BoxGeometry(.65,.065,.008),white,-1.98,y,.786);
  mesh(boat,new T.BoxGeometry(.065,.47,.008),white,-1.98,0,.786);
  batchScenery(T,boat);
  boat.children.forEach(showInLowWaterCapture);
  // Keep the hoist attached to the mast while the free edge streams downwind.
  const cloth=new T.PlaneGeometry(.98,.72,12,3),flagMaterial=mat(0xff671a);flagMaterial.side=T.DoubleSide;
  const flag=mesh(boat,cloth,flagMaterial,0,0,3.60);flag.name='Committee wind flag';showInLowWaterCapture(flag);
  const uv=cloth.attributes.uv,verticesFlag=cloth.attributes.position,localWind=new T.Vector2();
  cloth.boundingSphere=new T.Sphere(new T.Vector3(),1.4);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=168;
  const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);
  const boardMaterial=new T.MeshBasicMaterial({map:texture});
  for(const side of [-1,1]){
    const board=mesh(boat,new T.PlaneGeometry(2.2,.82),boardMaterial,-.28,side*.57,1.83);
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
  let previous;
  function update(label,time=0,sampleWind){
    const [heave,roll,pitch]=race.get('launchPose');
    boat.position.z=heave;boat.rotation.x=roll;boat.rotation.y=-pitch;
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
  return {update,committee:boat,marks};
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
  const mix={swell:0,crest:0,wake:0,crash:0};
  let anchorEast,anchorNorth,lastTime,lastWake,rise=0,lastCrash=-Infinity;
  function silence(){mix.swell=mix.crest=mix.wake=mix.crash=rise=0;return mix;}
  function reset(){lastTime=undefined;lastCrash=-Infinity;silence();}
  function slope(values){
    let sum=0;
    for(let i=1;i<values.length;i++)sum+=Math.abs(values[i]-values[0]);
    return sum/(spacing*(values.length-1));
  }
  function sample(surface,time,east,north,tide,includeWake){
    const moved=lastTime===undefined||(east-anchorEast)**2+(north-anchorNorth)**2>36;
    if(moved){anchorEast=east;anchorNorth=north;}
    const dt=time-lastTime,previousCenter=incident[0];
    mix.crash=0;
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
    // Fire once when a substantial crest turns from rising to falling.
    // Strength needs both sustained motion and a raised, sloping surface.
    const centerSpeed=(incident[0]-previousCenter)/dt;
    if(centerSpeed>.025)rise=Math.max(rise,centerSpeed);
    else if(centerSpeed<-.012&&rise>0){
      const elevation=Math.max(previousCenter,incident[0]);
      if(rise>.075&&elevation>.082&&seaSlope>.009&&time-lastCrash>.85){
        mix.crash=Math.min(1,.85*(elevation-.062)+.60*rise+1.7*seaSlope);
        lastCrash=time;
      }
      rise=0;
    }
    return mix;
  }
  return {sample,reset};
}

export function hullGurgle(speed,swell,wake){
  if(!Number.isFinite(speed))return 0;
  const flow=Math.abs(speed);
  const fade=Math.max(0,Math.min(1,(3.2-flow)/1.65));
  return fade*fade*(3-2*fade)*Math.min(1,.52*flow/(.55+flow)+.45*swell+.45*wake);
}

export function raceAudio(){
  let engines,audio,wind,filter,noise,rain,weather,enabled=false,lastMix=-Infinity;
  let submerged,effects,luffGain,flapOscillator,flapRate,level=.15;
  let waves,waveGains,lastWaveMix=-Infinity,lastWaveTime,waveTimeWall,wavesActive=false;
  let waveEvents,crashRecording,crashLoading=false,lastCrashSound=-Infinity,nextBubble=-Infinity,crashClip=0;
  function silenceLuff(){
    flapRate?.reset();
    if(luffGain)luffGain.gain.setTargetAtTime(0,audio.currentTime,.06);
  }
  function silenceWaves(){
    if(!wavesActive)return;
    wavesActive=false;
    waves?.reset();
    nextBubble=-Infinity;
    waveEvents?.gain.setTargetAtTime(0,audio.currentTime,.09);
    for(const gain of waveGains??[])gain.gain.setTargetAtTime(0,audio.currentTime,.15);
  }
  function setVolume(value){
    level=value;
    if(effects)effects.gain.setTargetAtTime(level,audio.currentTime,.025);
    if(!level){silenceLuff();silenceWaves();}
  }
  const loading=new Set(),gullCalls=['1','2','4','5','6'].map(take=>'gull-'+take+'.mp3');
  const gullRecordings=new Map();
  async function decodeRecording(file){
    const response=await fetch(new URL('./assets/audio/'+file,import.meta.url));
    if(!response.ok)throw Error('Audio HTTP '+response.status);
    return audio.decodeAudioData(await response.arrayBuffer());
  }
  function startAmbience(file,destination){
    if(loading.has(file))return;
    loading.add(file);
    decodeRecording(file)
      .then(buffer=>{
        const source=audio.createBufferSource();
        source.buffer=buffer;source.loop=true;
        source.connect(destination);source.start();
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
      audio=new AudioContext();noise=audio.createBuffer(1,2*audio.sampleRate,audio.sampleRate);
      const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=2*Math.random()-1;
      effects=audio.createGain();effects.gain.value=level;effects.connect(audio.destination);
      submerged=audio.createGain();submerged.gain.value=0;submerged.connect(effects);
      const blower=audio.createBufferSource();blower.buffer=noise;blower.loop=true;
      filter=audio.createBiquadFilter();filter.type='lowpass';wind=audio.createGain();wind.gain.value=0;
      const rainfall=audio.createBufferSource(),rainFilter=audio.createBiquadFilter();
      rainfall.buffer=noise;rainfall.loop=true;rainfall.playbackRate.value=1.19;
      rainFilter.type="highpass";rainFilter.frequency.value=1350;
      weather=audio.createGain();weather.gain.value=0;rain=audio.createGain();rain.gain.value=.16;
      rainfall.connect(rainFilter).connect(rain).connect(weather).connect(effects);rainfall.start();
      blower.connect(filter).connect(wind).connect(effects);blower.start();
    }
    if(on)await audio.resume();
    else{
      silenceLuff();
      silenceWaves();
      await audio.suspend();
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
    const exposure=Math.max(0,Math.min(1,(height+.35)/.7));
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
    if(exposure<1)startAmbience('deep_rumble.mp3',submerged);
    submerged.gain.setTargetAtTime(.36*(1-exposure),lastMix,.35);
    weather.gain.setTargetAtTime(storm?exposure:0,lastMix,.20);
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
  function eventOutput(){
    if(!waveEvents){
      waveEvents=audio.createGain();
      waveEvents.connect(effects);
    }
    return waveEvents;
  }
  function waveCrash(strength,wall,exposure){
    if(wall-lastCrashSound<.66)return;
    lastCrashSound=wall;
    if(!crashLoading){
      crashLoading=true;
      decodeRecording('calm-waves.mp3').then(recording=>{crashRecording=recording;})
        .catch(error=>console.warn('Wave crash excerpts unavailable',error));
    }
    const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
    const excerpts=[3.88,14.43,20.42,24.42,26.29,38.30];
    source.buffer=crashRecording??noise;
    const length=crashRecording?1.12+.85*strength:.82+.55*strength;
    const offset=crashRecording?excerpts[crashClip++%excerpts.length]:Math.random()*(noise.duration-length);
    const peak=exposure*(.18+1.3*strength)*(crashRecording?1:1.65);
    filter.type='lowpass';
    filter.frequency.setValueAtTime(1700+3600*strength,wall);
    filter.frequency.exponentialRampToValueAtTime(550,wall+length);
    gain.gain.setValueAtTime(0,wall);
    gain.gain.linearRampToValueAtTime(peak,wall+.055);
    gain.gain.exponentialRampToValueAtTime(peak*.35,wall+.38);
    gain.gain.linearRampToValueAtTime(0,wall+length);
    source.connect(filter).connect(gain).connect(eventOutput());
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    source.start(wall,offset,length);
  }
  function bubbleBurst(strength,wall){
    const source=audio.createBufferSource(),bubble=audio.createBiquadFilter(),gain=audio.createGain();
    source.buffer=noise;bubble.type='bandpass';bubble.Q.value=3.2;
    let next=wall;
    gain.gain.setValueAtTime(0,wall);
    for(let i=0;i<3;i++){
      const pitch=220+260*Math.random(),length=.055+.050*Math.random();
      bubble.frequency.setValueAtTime(pitch,next);
      bubble.frequency.exponentialRampToValueAtTime(pitch*1.42,next+length);
      gain.gain.setValueAtTime(0,next);
      gain.gain.linearRampToValueAtTime(strength*(1.7-.25*i),next+.018);
      gain.gain.setTargetAtTime(0,next+.028,.015);
      next+=length+.012+.035*Math.random();
    }
    const duration=next-wall+.035;
    source.connect(bubble).connect(gain).connect(eventOutput());
    source.onended=()=>{source.disconnect();bubble.disconnect();gain.disconnect();};
    source.start(wall,Math.random()*(noise.duration-duration),duration);
  }
  function water(surface,time,east,north,tide,height,includeWake,hullSpeed,hullDistance=Infinity){
    if(!enabled||!level)return;
    if(!surface||height<=-.35){silenceWaves();return;}
    const wall=audio.currentTime;
    if(time!==lastWaveTime){lastWaveTime=time;waveTimeWall=wall;}
    else if(wall-waveTimeWall>.3){silenceWaves();return;}
    if(wall-lastWaveMix<.07)return;
    lastWaveMix=wall;
    if(!wavesActive)waveEvents?.gain.setTargetAtTime(1,wall,.06);
    wavesActive=true;
    waves??=waveAmbience();
    const {swell,crest,wake,crash}=waves.sample(surface,time,east,north,tide,includeWake);
    const exposure=Math.min(1,(height+.35)/.7)/(1+Math.max(0,height)/16);
    if(waveGains||swell+crest+wake>=.002){
      waveGains??=startWaves();
      waveGains[0].gain.setTargetAtTime(.76*swell*exposure,wall,.22);
      waveGains[1].gain.setTargetAtTime(.32*crest*exposure,wall,.09);
      waveGains[2].gain.setTargetAtTime(.66*wake*exposure,wall,.12);
    }
    if(crash>.03)waveCrash(crash,wall,exposure);
    const gurgle=hullGurgle(hullSpeed,swell,wake)*exposure/(1+(hullDistance/15)**2);
    if(gurgle>.024&&time>=nextBubble){
      bubbleBurst(gurgle,wall);
      nextBubble=time+(.65+.85*Math.random())/(1+.35*Math.abs(hullSpeed));
    }
  }
  function signal(){
    if(!enabled)return;const src=audio.createBufferSource(),gain=audio.createGain(),t=audio.currentTime;
    src.buffer=noise;gain.gain.setValueAtTime(.8,t);gain.gain.exponentialRampToValueAtTime(.0003,t+.52);
    src.connect(gain).connect(effects);src.onended=()=>{src.disconnect();gain.disconnect();};src.start();src.stop(t+.53);
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
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.001,peak),t+(impact?.055:.09));
    gain.gain.exponentialRampToValueAtTime(.0001,t+length);
    src.connect(band).connect(gain).connect(stereo).connect(effects);
    src.onended=()=>{for(const n of [src,band,gain,stereo])n.disconnect();};
    src.start(t);src.stop(t+length);
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
  return {get enabled(){return enabled;},get audible(){return enabled&&level>0;},
    setEnabled,update,water,signal,thunder,setVolume,wildlife,imagingHit,motorSound,droneSound};
}
