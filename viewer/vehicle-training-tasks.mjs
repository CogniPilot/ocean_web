const signed=draw=>2*draw()-1;
const bound=x=>Math.max(-1,Math.min(1,x));

// These plants report shaft RPM. Integrate it on the rollout clock between
// published samples so playback and camera changes share the same rotor phase.
function shaftAngles(time,rpm,visual){
  const dt=time-(visual.time??time);
  visual.angle??=rpm.map(()=>0);
  for(let i=0;i<rpm.length;i++)visual.angle[i]+=dt*((visual.rpm?.[i]??rpm[i])+rpm[i])*Math.PI/60;
  visual.rpm=rpm;visual.time=time;
  return visual.angle.slice();
}

export const submarineTask={
  applicationHint:'Active while you pilot Piccard in auto-level mode.',
  id:'submarine',label:'Piccard submarine',plant:'Wreck_Plant',
  summary:'Track surge, yaw rate and heave with the survey submarine in auto-level mode.',
  featureNames:['Bias','Surge command','Yaw command','Heave command','Surge','Yaw rate','Heave'],
  actionNames:['Surge','Yaw','Heave'],outputs:['position','orientation','velocity','yawRate','propellerRPM'],dt:.01,ticksPerDecision:20,
  scenario(draw){return {surge:.75*signed(draw),yaw:.3*signed(draw),heave:.4*signed(draw),
    inputs:{manual:1,manualMode:1,spawnHeading:Math.PI*signed(draw),spawnPosition:[-900,-200,-7],
      spawnVelocity:[.15*signed(draw),.15*signed(draw),.1*signed(draw)],mappedCurrent:[1,.2*signed(draw),.2*signed(draw),0]}};},
  observe(m,s){const v=m.get('velocity');return [1,s.surge,s.yaw/.4,s.heave/.5,bound(v[0]),bound(m.get('yawRate')/.4),bound(v[2]/.5)];},
  act(m,s,a){m.set('pilot',[a[0],0,.4*a[1],.5*a[2]]);},
  reward(m,s){const v=m.get('velocity');return 1-(v[0]-s.surge)**2-((m.get('yawRate')-s.yaw)/.4)**2-((v[2]-s.heave)/.5)**2;},
  rigPose:(m,visual)=>shaftAngles(m.time,m.get('propellerRPM'),visual),
  pose(m){const [w,x,y,z]=m.get('orientation');return [...m.get('position'),Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z)),
    -Math.asin(bound(2*(w*y-x*z))),Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))];}
};

function bodyVelocity(yaw,[east,north,up]){
  return [east*Math.cos(yaw)+north*Math.sin(yaw),-east*Math.sin(yaw)+north*Math.cos(yaw),up];
}
export const droneTask={
  applicationHint:'Active while you pilot the RDD2 drone in position mode.',
  id:'drone',label:'RDD2 survey drone',plant:'Rdd2Survey',
  summary:'Track body-forward, lateral and climb velocities in wind using the survey drone’s position-mode pilot inputs.',
  featureNames:['Bias','Forward command','Port command','Climb command','Forward speed','Port speed','Climb rate','Roll','Pitch'],
  actionNames:['Forward','Port','Climb'],outputs:['position','attitude','estimatedVelocity','rotorAngle'],dt:.01,ticksPerDecision:20,
  scenario(draw){return {forward:1.6*signed(draw),left:1.6*signed(draw),up:.8*signed(draw),inputs:{
    pilot:1,flightMode:0,origin:[-6+3*signed(draw),3*signed(draw)],windENU:[3*signed(draw),3*signed(draw),0]}};},
  observe(m,s){const [r,p,y]=m.get('attitude'),[f,l,u]=bodyVelocity(y,m.get('estimatedVelocity'));
    return [1,s.forward/2,s.left/2,s.up,bound(f/2),bound(l/2),bound(u),bound(r),bound(p)];},
  act(m,s,a){m.set('forward',a[0]);m.set('left',a[1]);m.set('climb',a[2]);},
  reward(m,s){const [r,p,y]=m.get('attitude'),[f,l,u]=bodyVelocity(y,m.get('estimatedVelocity'));
    return 1-((s.forward-f)/2)**2-((s.left-l)/2)**2-(s.up-u)**2-.1*(r*r+p*p);},
  rigPose:m=>m.get('rotorAngle'),
  pose(m){const [roll,pitch,yaw]=m.get('attitude');return [...m.get('position'),yaw,-pitch,roll];}
};

export const basinTask={
  id:'onrt',label:'ONRT towing-basin model',plant:'OnrTumblehome',
  summary:'Track forward speed and yaw rate with the scale model’s shaft and rudder in the towing basin.',
  applicationHint:'Active in the towing basin’s free-drive mode.',
  featureNames:['Bias','Speed command','Turn command','Surge','Sway','Yaw rate','Roll','Shaft speed','Rudder'],
  actionNames:['Shaft speed','Rudder'],outputs:['east','north','heave','heading','pitch','roll','surge','sway','yawRate','rpm','rudder','propAngle'],
  dt:.01,ticksPerDecision:36,
  async fixedInputs(){
    const response=await fetch(new URL('./assets/onrt/wake.json',import.meta.url));
    if(!response.ok)throw Error('Cannot load the basin hull geometry');
    const {stations,beamHalf,volume}=await response.json();
    return {stations,beamHalf,bareVolume:volume.slice(0,6)};
  },
  scenario(draw){return {speed:.3+1.4*draw(),turn:.24*signed(draw),inputs:{initialHeading:.3*signed(draw),initialSurge:.5+.6*draw(),
    initialRpm:300+200*draw(),initialEast:0,initialNorth:0,basinContact:1,generatorStart:-100000,tow:0,
    waveAmplitude:.015*draw(),waveDirection:Math.PI*signed(draw)}};},
  observe(m,s){return [1,s.speed/2,s.turn/.3,bound(m.get('surge')/2),bound(m.get('sway')),bound(m.get('yawRate')/.3),
    bound(m.get('roll')),m.get('rpm')/900,m.get('rudder')/35];},
  act(m,s,a){m.set('shaftDemand',450*(1+a[0]));m.set('helm',35*a[1]);},
  reward(m,s){return 1-((s.speed-m.get('surge'))/1.2)**2-((s.turn-m.get('yawRate'))/.3)**2-.2*m.get('roll')**2;},
  rigPose:m=>[m.get('rudder')*Math.PI/180,m.get('propAngle')],
  pose:m=>['east','north','heave','heading','pitch','roll'].map(k=>m.get(k))
};

export const motorboatTask={
  id:'motorboat',label:'Cabin cruiser',plant:'OceanMotorboat',
  summary:'Track through-water speed and turning rate with the inboard throttle and rudder.',
  applicationHint:'Active at the cabin cruiser helm.',
  featureNames:['Bias','Speed command','Turn command','Surge','Yaw rate','Roll','Pitch','Shaft speed','Rudder'],
  actionNames:['Throttle','Helm'],outputs:['boatPose','engine','yawRate'],dt:.01,ticksPerDecision:80,
  scenario(draw){return {speed:-1+5*draw(),turn:.18*signed(draw),inputs:{initialEast:-900,initialNorth:-200,initialHeading:Math.PI*signed(draw),
    windSpeed:2+8*draw(),windBearing:Math.PI*signed(draw),omitWake:1}};},
  observe(m,s){const p=m.get('boatPose'),e=m.get('engine');
    return [1,s.speed/5,s.turn/.25,bound(e[1]/5),bound(m.get('yawRate')/.25),bound(p[3]),bound(p[4]),bound(e[0]/1750),bound(e[3])];},
  act(m,s,a){m.set('throttleLever',a[0]);m.set('helmLever',a[1]);},
  reward(m,s){const e=m.get('engine');return 1-((e[1]-s.speed)/3)**2-((m.get('yawRate')-s.turn)/.25)**2-.2*m.get('boatPose')[3]**2;},
  rigPose(m,visual){const engine=m.get('engine');return [engine[3],...shaftAngles(m.time,[engine[0]],visual)];},
  pose(m){const p=m.get('boatPose');return [...p.slice(0,3),p[5],p[4],p[3]];}
};
