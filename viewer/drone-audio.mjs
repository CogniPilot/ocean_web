// Synthesize a tonal blade pass for each rotor, plus broadband prop wash.
function rotorVoice(context,output,wave,noise){
  const tonal=context.createGain(),wash=context.createGain(),filter=context.createBiquadFilter();
  const washBand=context.createBiquadFilter();
  washBand.type='bandpass';washBand.frequency.value=1900;washBand.Q.value=.54;
  const gain=context.createGain(),pan=context.createStereoPanner();
  filter.type='lowpass';filter.Q.value=.56;gain.gain.value=0;
  tonal.connect(filter);wash.connect(filter);filter.connect(gain).connect(pan).connect(output);
  const propWash=context.createBufferSource();
  propWash.buffer=noise;propWash.loop=true;wash.gain.value=0;
  propWash.connect(washBand).connect(wash);propWash.start();
  const motors=Array.from({length:4},(_,index)=>{
    const tone=context.createOscillator(),level=context.createGain();
    tone.setPeriodicWave(wave);level.gain.value=0;
    // Modest rotor-specific frequency spread broadens the blade tone at hover.
    // The modulation has zero mean, so blade-pass pitch remains tied to RPM.
    const jitter=context.createOscillator(),deviation=context.createGain();
    jitter.frequency.value=5.9+1.37*index;deviation.gain.value=0;
    jitter.connect(deviation).connect(tone.frequency);
    tone.connect(level).connect(tonal);tone.start();jitter.start();
    return {tone,level,jitter,deviation};
  });
  let last=context.currentTime;
  return {
    set(speeds,blades,distance,balance,underwater){
      const now=last=context.currentTime;
      let energy=0;
      for(const [index,{tone,level,deviation}] of motors.entries()){
        const speed=Math.max(0,Math.min(1400,speeds[index]));
        const load=Math.min(1,speed/1100);
        energy+=load*load;
        const bladeFrequency=blades*speed/(2*Math.PI);
        tone.frequency.setTargetAtTime(Math.max(18,bladeFrequency),now,.045);
        deviation.gain.setTargetAtTime(Math.min(8,.016*bladeFrequency),now,.065);
        level.gain.setTargetAtTime(.105*load**1.55,now,.055);
      }
      wash.gain.setTargetAtTime(.17*energy/4,now,.07);
      filter.frequency.setTargetAtTime(underwater?410:Math.max(1350,2650+2450*energy/4-25*distance),now,.10);
      gain.gain.setTargetAtTime((underwater?.31:1)/(1+distance/6)**1.45,now,.08);
      pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,balance)),now,.08);
    },
    fade(){
      gain.gain.setTargetAtTime(0,context.currentTime,.07);
      return context.currentTime-last>.55;
    },
    dispose(){
      for(const {tone,level,jitter,deviation} of motors){
        tone.stop();jitter.stop();
        for(const node of [tone,level,jitter,deviation])node.disconnect();
      }
      propWash.stop();
      for(const node of [propWash,tonal,wash,washBand,filter,gain,pan])node.disconnect();
    }
  };
}

export function droneMixer(context,output,noise){
  const wave=context.createPeriodicWave(new Float32Array(12),Float32Array.of(0,1,.60,.76,.42,.29,.19,.145,.105,.08,.053,.042));
  const voices=new Map();
  let next=0;
  return (local,peers,listener,underwater,running)=>{
    const now=context.currentTime;
    if(now<next)return;
    next=now+.06;
    const eye=listener.position,right=listener.matrixWorld.elements,nearby=[];
    function collect(aircraft){
      const {group,rotorSpeeds:speeds,bladeCount:blades=2}=aircraft;
      if(!speeds||speeds.length!==4||!speeds.every(Number.isFinite)||Math.max(...speeds)<16)return;
      const dx=group.position.x-eye.x,dy=group.position.y-eye.y,dz=group.position.z-eye.z;
      const distance=Math.hypot(dx,dy,dz);
      if(distance<=100)nearby.push({group,speeds,blades,distance,
        balance:(dx*right[0]+dy*right[1]+dz*right[2])/Math.max(2,distance)});
    }
    if(running){
      if(local)collect(local);
      for(const aircraft of peers)collect(aircraft);
    }
    nearby.sort((a,b)=>a.distance-b.distance);
    const active=new Set();
    for(const {group,speeds,blades,distance,balance} of nearby.slice(0,3)){
      let voice=voices.get(group);
      if(!voice){voice=rotorVoice(context,output,wave,noise);voices.set(group,voice);}
      active.add(group);
      voice.set(speeds,blades,distance,balance,underwater);
    }
    for(const [group,voice] of voices)if(!active.has(group)&&voice.fade()){voice.dispose();voices.delete(group);}
  };
}
