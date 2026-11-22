// Exhaust pulses over a four-stroke cycle. Small cylinder-to-cylinder variation
// keeps low crank orders audible between the stronger firing harmonics.
function exhaustWave(context){
  const re=new Float32Array(73),im=new Float32Array(73),pulse=[1,.87,1.03,.93,.91,1.04];
  for(let h=1;h<re.length;h++){
    const envelope=1/(1+(h/17)**1.4);
    for(let c=0;c<pulse.length;c++){
      const phase=2*Math.PI*h*c/6;
      re[h]+=pulse[c]*Math.cos(phase)*envelope;
      im[h]-=pulse[c]*Math.sin(phase)*envelope;
    }
  }
  return context.createPeriodicWave(re,im);
}

function engineVoice(context,output,wave,noise){
  const exhaust=context.createOscillator(),mechanical=context.createOscillator(),wash=context.createBufferSource();
  const casing=context.createGain(),washGain=context.createGain(),filter=context.createBiquadFilter();
  const gain=context.createGain(),pan=context.createStereoPanner();
  exhaust.setPeriodicWave(wave);mechanical.type='triangle';casing.gain.value=.13;
  wash.buffer=noise;wash.loop=true;washGain.gain.value=0;
  filter.type='lowpass';filter.Q.value=.63;gain.gain.value=0;
  exhaust.connect(filter);mechanical.connect(casing).connect(filter);wash.connect(washGain).connect(filter);
  filter.connect(gain).connect(pan).connect(output);
  for(const src of [exhaust,mechanical,wash])src.start();
  let last=context.currentTime;
  return {
    set(shaft,distance,balance,underwater){
      const rpm=Math.min(2200,Math.abs(shaft)),load=Math.min(1,rpm/1850);
      // The plant exports signed propeller shaft RPM. The engine idles with
      // the gearbox in neutral, and turns in the same direction in reverse.
      const crank=Math.max(660,1.6*rpm),t=last=context.currentTime;
      exhaust.frequency.setTargetAtTime(crank/120,t,.09);mechanical.frequency.setTargetAtTime(crank/60,t,.09);
      filter.frequency.setTargetAtTime((underwater?240:870)+(underwater?360:1450)*load,t,.11);
      washGain.gain.setTargetAtTime(.022+.21*load*load,t,.16);
      gain.gain.setTargetAtTime((.28+.50*load)/(1+distance/9),t,.08);
      pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,balance)),t,.085);
    },
    fade(){gain.gain.setTargetAtTime(0,context.currentTime,.06);return context.currentTime-last>.7;},
    dispose(){for(const src of [exhaust,mechanical,wash])src.stop();
      for(const n of [exhaust,mechanical,wash,casing,washGain,filter,gain,pan])n.disconnect();}
  };
}

// Mix only the nearest audible cruisers, using the same shaft telemetry their
// propellers use. Keep a short audible rundown after propulsion goes neutral.
export function inboardMixer(context,output,noise){
  const voices=new Map(),wave=exhaustWave(context);
  let next=0;
  const neutralDelay=1.8;
  return (local,peers,listener,underwater,running,localThrottle=0)=>{
    const now=context.currentTime;
    if(now<next)return;
    next=now+.07;
    const pos=listener.position,right=listener.matrixWorld.elements;
    const nearby=[];
    function collect(boat,powered){
      const existing=voices.get(boat);
      if(!powered&&(!existing||now-existing.lastPowered>=neutralDelay))return;
      const p=boat.group.position,dx=p.x-pos.x,dy=p.y-pos.y,dz=p.z-pos.z;
      const d=Math.hypot(dx,dy,dz);
      if(d<=150)nearby.push({boat,powered,d,balance:(dx*right[0]+dy*right[1]+dz*right[2])/Math.max(2,d)});
    }
    if(running){
      if(local)collect(local,Math.abs(localThrottle)>.008);
      for(const boat of peers)collect(boat,Math.abs(boat.shaftRPM)>90);
    }
    nearby.sort((a,b)=>a.d-b.d);
    const active=new Set();
    for(const {boat,powered,d,balance} of nearby.slice(0,4)){
      let entry=voices.get(boat);
      if(!entry){
        entry={voice:engineVoice(context,output,wave,noise),lastPowered:now};
        voices.set(boat,entry);
      }
      if(powered)entry.lastPowered=now;
      active.add(boat);entry.voice.set(boat.shaftRPM,d,balance,underwater);
    }
    for(const [boat,{voice}] of voices)if(!active.has(boat)&&voice.fade()){voice.dispose();voices.delete(boat);}
  };
}
