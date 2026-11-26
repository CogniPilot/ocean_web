// Each audible hull plays one continuous recording, positioned at the vehicle.
// Six measured shaft speeds drive the level and pitch regardless of motor direction.
function piccardThrusters(context,output,recording){
  const source=context.createBufferSource(),gain=context.createGain(),pan=context.createStereoPanner();
  source.buffer=recording;
  source.loop=true;
  gain.gain.value=0;
  source.connect(gain).connect(pan).connect(output);
  source.start(0,Math.random()*recording.duration);
  let lastGain=0,lastRate=1,lastSide=0;
  return {
    update(rpm,distance,balance,wet=1,cavitation){
      const now=context.currentTime;
      let energy=0,weightedSpeed=0,bubbles=0;
      for(let i=0;i<rpm.length;i++){
        const speed=Math.min(1,Math.abs(rpm[i])/5200),weight=speed*speed;
        energy+=weight;
        weightedSpeed+=speed*weight;
        bubbles+=weight*Math.min(1,Math.max(0,cavitation?.[i]||0));
      }
      const rate=.78+.55*weightedSpeed/Math.max(.0001,energy);
      const volume=(.82*Math.sqrt(energy)+.10*Math.sqrt(bubbles))*(.12+.88*wet)/(1+distance/5)**1.3;
      const side=Math.max(-1,Math.min(1,balance));
      if(Math.abs(volume-lastGain)>.0003){
        gain.gain.setTargetAtTime(volume,now,.14);
        lastGain=volume;
      }
      if(Math.abs(rate-lastRate)>.005){
        source.playbackRate.setTargetAtTime(rate,now,.24);
        lastRate=rate;
      }
      if(Math.abs(side-lastSide)>.005){
        pan.pan.setTargetAtTime(side,now,.09);
        lastSide=side;
      }
    },
    fade(){
      if(lastGain){gain.gain.setTargetAtTime(0,context.currentTime,.12);lastGain=0;}
    },
    stop(){
      const now=context.currentTime;
      gain.gain.setTargetAtTime(0,now,.018);
      source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();};
      source.stop(now+.15);
    }
  };
}

export function piccardMixer(context,output,recording){
  const voices=new Map();
  return {
    update(local,peers,camera,wet,running){
      const now=context.currentTime,nearby=[];
      function hear(group,rpm,cavitation){
        if(!rpm||rpm.length!==6||!rpm.every(Number.isFinite)||!rpm.some(speed=>Math.abs(speed)>10))return;
        const eye=camera.position,right=camera.matrixWorld.elements;
        const dx=group.position.x-eye.x,dy=group.position.y-eye.y,dz=group.position.z-eye.z;
        const distance=Math.hypot(dx,dy,dz),balanceAxis=dx*right[0]+dy*right[1]+dz*right[2];
        if(Number.isFinite(balanceAxis)&&distance<65)nearby.push({group,rpm,cavitation,distance,side:balanceAxis/Math.max(2,distance)});
      }
      if(running){
        if(local?.active)hear(local.mesh,local.frame?.rpm,local.frame?.cavitation);
        for(const group of peers)hear(group,group.userData.thrusterRPM);
      }
      nearby.sort((a,b)=>a.distance-b.distance);
      const active=new Set();
      for(const {group,rpm,cavitation,distance,side} of nearby.slice(0,3)){
        let voice=voices.get(group);
        if(!voice){voice={bank:piccardThrusters(context,output,recording)};voices.set(group,voice);}
        voice.last=now;active.add(group);voice.bank.update(rpm,distance,side,wet,cavitation);
      }
      for(const [group,voice] of voices)if(!active.has(group)){
        voice.bank.fade();
        if(now-voice.last>4){voice.bank.stop();voices.delete(group);}
      }
    },
    stop(){for(const voice of voices.values())voice.bank.stop();voices.clear();}
  };
}

// Forces come from the hull, viewport and thruster guards contacting the wreck or seabed.
export function piccardImpactDetector(){
  let previousTime,baseline=0,armed=false,lastHit=-Infinity;
  return (time,force)=>{
    if(!Number.isFinite(time)||!Number.isFinite(force))return 0;
    if(previousTime===undefined||time<previousTime){
      previousTime=time;baseline=force;armed=force<4;lastHit=-Infinity;return 0;
    }
    if(time===previousTime)return 0;
    const dt=time-previousTime,rise=force-baseline;
    previousTime=time;
    baseline+=-Math.expm1(-dt/.15)*rise;
    if(force<1.5)armed=true;
    if(force<4||time-lastHit<.18||(!armed&&rise<20))return 0;
    armed=false;baseline=force;lastHit=time;
    return Math.min(1,.12+Math.max(force,rise)/85);
  };
}

export function piccardKnock(context,output,strength,distance,balance){
  const t=context.currentTime,pan=context.createStereoPanner();
  pan.pan.value=Math.max(-1,Math.min(1,balance));
  pan.connect(output);
  let remaining=2;
  // Short shell resonances. The higher mode dies out first underwater.
  for(const [start,end,decay,gain] of [[145,90,.19,.60],[410,285,.075,.21]]){
    const tone=context.createOscillator(),level=context.createGain();
    tone.frequency.setValueAtTime(start,t);
    tone.frequency.exponentialRampToValueAtTime(end,t+decay);
    level.gain.setValueAtTime(.00001,t);
    level.gain.exponentialRampToValueAtTime(Math.max(.00002,strength*gain/(1+distance/5)),t+.004);
    level.gain.exponentialRampToValueAtTime(.00001,t+decay);
    tone.connect(level).connect(pan);
    tone.onended=()=>{tone.disconnect();level.disconnect();if(--remaining===0)pan.disconnect();};
    tone.start(t);tone.stop(t+decay);
  }
}
