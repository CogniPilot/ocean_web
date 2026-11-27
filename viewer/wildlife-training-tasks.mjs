const signed=draw=>2*draw()-1;
const bound=x=>Math.max(-1,Math.min(1,x));
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));

export const sharkTask={
  applicationHint:'Active while you pilot the shark in ordinary cruise as the wildlife host.',
  id:'shark',label:'Great white shark',plant:'HarborTraffic',
  summary:'Tune the deployed cruise controller against speed, turn, pitch and bank commands in changing currents.',
  featureNames:['Cruise coefficient'],actionNames:['Tail amplitude','Speed feedback','Hinge damping','Caudal feather','Tail steering','Pitch feedback','Pitch trim','Roll feedback','Stroke frequency','Cadence gain'],
  outputs:['state','fish','sharkTrunkFlex','sharkFin','whiteShark.portAngle','whiteShark.starboardAngle','sharkBankState','whiteShark.trackingReward'],dt:.01,ticksPerDecision:32,
  // The FMU uses these ten unbounded coefficients to compute four bounded fin
  // and tail actions on every physics step from its instantaneous observations.
  linear:true,
  async pretrained(){
    const reply=await fetch(new URL('./assets/shark-policy.json',import.meta.url),{cache:'no-cache'});
    if(!reply.ok)throw Error('Cannot load the deployed shark policy');
    return (await reply.json()).weights.map(value=>[value]);
  },
  scenario(draw){
    return {inputs:{
      initialState:[0,-28,6,0,2,-25,2,6,0,-900,-200,-7,Math.PI*signed(draw),0,0,0,0],
      initialFish:[1+2*draw(),0,.15*signed(draw),0,Math.PI*signed(draw),0,0,0,0,.12*signed(draw)],
      sharkPilot:[1,.5*signed(draw),draw(),-1],sharkTurn:.85*signed(draw),sharkBank:.75*signed(draw),
      currentVelocity:[.35*signed(draw),.35*signed(draw)],sharkDirect:2
    }};
  },
  observe:()=>[1],act:(m,s,a)=>m.set('sharkPolicyWeights',a),
  reward:m=>m.get('whiteShark.trackingReward'),
  rigPose(m){const fish=m.get('fish');return [m.get('sharkTrunkFlex'),fish[5],fish[7],m.get('whiteShark.portAngle'),m.get('whiteShark.starboardAngle')];},
  pose(m){const state=m.get('state');return [...state.slice(9,13),m.get('fish')[2],m.get('sharkBankState')[0]];}
};

export const gullTask={
  applicationHint:'Active while you pilot an airborne gull as the wildlife host.',
  id:'gull',label:'Herring gull',plant:'HerringGull',
  summary:'Track climb rate, bank and airspeed by choosing pitch, bank and flap commands.',
  featureNames:['Bias','Climb command','Bank command','Airspeed command','Vertical speed','Bank','Roll rate','Pitch','Airspeed'],
  actionNames:['Climb','Bank','Flap or glide'],outputs:['x','memory','surfaceMotion','power','wings','joints','tailState','paddleState','webSpread'],dt:.01,ticksPerDecision:16,
  scenario(draw){
    return {climb:signed(draw),bank:.8*signed(draw),speed:11+4*draw(),inputs:{wind:[2*signed(draw),2*signed(draw)],seaLevel:0,
      startState:[0,0,10,Math.PI*signed(draw),12+2*draw(),signed(draw),draw()*Math.PI*2,.3],pilot:[1,0,0,0]}};
  },
  observe(m,s){
    const x=m.get('x'),att=m.get('memory');
    return [1,s.climb,s.bank,(s.speed-13)/3,bound(x[5]/4),bound(att[0]),bound(att[1]),bound(att[2]),bound((m.get('surfaceMotion')[1]-13)/4)];
  },
  act:(m,s,a)=>m.set('pilot',[1,...a]),
  reward(m,s){const x=m.get('x'),bank=m.get('memory')[0],air=m.get('surfaceMotion')[1];
    return 1-((x[5]-3*s.climb)/3)**2-(bank-.70*s.bank)**2-((air-s.speed)/5)**2-.0001*Math.max(0,m.get('power'));},
  rigPose(m){return [...m.get('x').slice(4,8),...m.get('wings'),...m.get('memory'),...m.get('surfaceMotion'),...m.get('joints').slice(0,6),...m.get('paddleState').slice(1),...m.get('webSpread'),...m.get('tailState')];},
  pose(m){const x=m.get('x'),att=m.get('memory');return [...x.slice(0,4),att[2],att[0]];}
};

function mantaForward(x,current){
  return (x[3]-current[0])*Math.cos(x[6])+(x[4]-current[1])*Math.sin(x[6]);
}
export const mantaTask={
  applicationHint:'Active while you pilot the manta in ordinary cruise as the wildlife host.',
  id:'manta',label:'Manta ray',plant:'MantaRay',
  summary:'Learn bilateral pectoral stroke cadence, amplitude and twist for commanded swimming speed and attitude.',
  featureNames:['Bias','Speed command','Yaw command','Pitch command','Roll command','Forward speed','Yaw rate','Pitch','Roll','Pitch rate','Roll rate','Stroke sine','Stroke cosine'],
  actionNames:['Cadence','Amplitude','Camber','Twist','Asymmetric stroke'],outputs:['state','musclePower','wingJoints'],dt:.01,ticksPerDecision:26,
  scenario(draw){
    const heading=Math.PI*signed(draw),current=[.30*signed(draw),.30*signed(draw),0];
    return {speed:1+2.5*draw(),turn:.6*signed(draw),pitch:.40*signed(draw),roll:.5*signed(draw),current,
      inputs:{initialState:[0,0,-8,1.5*Math.cos(heading),1.5*Math.sin(heading),0,heading,0,0,0,0,0,6.28*draw(),.34,0,60],
        currentVelocity:current,bedHeight:-50,directDrive:1}};
  },
  observe(m,s){const x=m.get('state'),forward=mantaForward(x,s.current);
    return [1,s.speed/4,s.turn,s.pitch,s.roll,bound(forward/4),bound(x[9]),bound(x[7]),bound(x[8]),bound(x[10]),bound(x[11]),Math.sin(x[12]),Math.cos(x[12])];},
  act:(m,s,a)=>m.set('finActions',[(1+a[0])/2,(1+a[1])/2,...a.slice(2)]),
  reward(m,s){const x=m.get('state'),speed=mantaForward(x,s.current);
    return 1-((s.speed-speed)/2)**2-(.4*s.turn-x[9])**2-angle(s.pitch-x[7])**2-angle(s.roll-x[8])**2-.00002*Math.max(0,m.get('musclePower'));},
  rigPose:m=>m.get('wingJoints').slice(0,2),
  pose(m){const x=m.get('state');return [...x.slice(0,3),...x.slice(6,9)];}
};

export const whaleTask={
  applicationHint:'Active while you pilot the whale in ordinary cruise as the wildlife host.',
  id:'whale',label:'Humpback whale',plant:'HarborTraffic',
  summary:'Track cruise, turn, pitch and bank commands with five independent fin, fluke and sculling controls.',
  featureNames:['Bias','Speed command','Turn command','Pitch command','Bank command','Forward speed','Yaw rate','Pitch','Bank','Pitch rate','Roll rate','Stroke sine','Stroke cosine'],
  actionNames:['Port fin','Starboard fin','Peduncle','Fluke feather','Lateral scull'],outputs:['swimmerState','tailPower'],dt:.01,ticksPerDecision:28,
  scenario(draw){const yaw=Math.PI*signed(draw);
    return {speed:1+2.5*draw(),turn:signed(draw),pitch:.35*signed(draw),roll:.45*signed(draw),inputs:{
      initialSwimmer:[-900,-200,-10,1.5+.8*draw(),0,0,0,0,0,yaw,0,0,0,6.28*draw(),0,0,0,0],
      currentVelocity:[.3*signed(draw),.3*signed(draw)],whalePilot:[1,0,.4,-1],whaleDirect:1}};},
  observe(m,s){const x=m.get('swimmerState'),phase=x[13]+2.4*m.time;
    return [1,s.speed/4,s.turn,s.pitch,s.roll,bound(x[3]/4),bound(x[10]),bound(x[5]),bound(x[11]),bound(x[6]),bound(x[12]),Math.sin(phase),Math.cos(phase)];},
  act:(m,s,a)=>m.set('whaleActuators',a),
  reward(m,s){const x=m.get('swimmerState');
    return 1-((x[3]-s.speed)/2)**2-(x[10]-.3*s.turn)**2-angle(x[5]-s.pitch)**2-angle(x[11]-s.roll)**2-.03*Math.max(0,m.get('tailPower'))/420000;},
  rigPose(m){const x=m.get('swimmerState');return [x[7]-x[5],x[15],x[16],x[17]];},
  pose(m){const x=m.get('swimmerState');return [...x.slice(0,3),x[9],x[5],x[11]];}
};
