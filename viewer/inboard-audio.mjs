function seamlessLoop(context,recording){
  const crossfade=Math.round(recording.sampleRate*.035),length=recording.length-crossfade;
  const loop=context.createBuffer(1,length,recording.sampleRate),input=recording.getChannelData(0);
  const samples=loop.getChannelData(0);
  samples.set(input.subarray(crossfade));
  for(let i=0;i<crossfade;i++){
    const t=i/crossfade;
    samples[length-crossfade+i]=(1-t)*samples[length-crossfade+i]+t*input[i];
  }
  return loop;
}

function engineVoice(context,output,recordings){
  const filter=context.createBiquadFilter(),gain=context.createGain(),pan=context.createStereoPanner();
  filter.type='lowpass';filter.Q.value=.63;gain.gain.value=0;
  filter.connect(gain).connect(pan).connect(output);
  let last=context.currentTime,loop,starter,cranking=false;
  function stopStarter(){
    if(starter){starter.stop();starter.disconnect();starter=null;}
  }
  return {
    set(shaft,distance,balance,underwater,remaining,rate){
      const load=Math.min(1,Math.abs(shaft)/1850),t=last=context.currentTime;
      const starting=remaining>1e-6;
      if(starting&&!cranking&&recordings.starter){
        if(loop){loop.stop();loop.disconnect();loop=null;}
        const sound=context.createBufferSource();
        sound.buffer=recordings.starter;
        sound.playbackRate.value=rate;
        sound.connect(filter);
        sound.start(t,Math.min(sound.buffer.duration-.002,Math.max(0,1-remaining)));
        starter=sound;
        sound.onended=()=>{sound.disconnect();if(starter===sound)starter=null;};
      }
      if(!starting&&recordings.loop&&!loop){
        stopStarter();
        loop=context.createBufferSource();
        loop.buffer=recordings.loop;loop.loop=true;loop.connect(filter);loop.start();
      }
      cranking=starting&&Boolean(recordings.starter);
      loop?.playbackRate.setTargetAtTime(.62+.92*load,t,.09);
      const airCutoff=1750+3000*load,wetCutoff=260+480*load;
      filter.frequency.setTargetAtTime(airCutoff*(wetCutoff/airCutoff)**underwater,t,.16);
      gain.gain.setTargetAtTime((starting?.85:.75+.48*load)/(1+distance/9),t,.05);
      pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,balance)),t,.085);
    },
    fade(){gain.gain.setTargetAtTime(0,context.currentTime,.06);return context.currentTime-last>.7;},
    dispose(){
      stopStarter();
      if(loop){loop.stop();loop.disconnect();}
      for(const node of [filter,gain,pan])node.disconnect();
    }
  };
}

// Mix the four nearest audible cruisers from their Modelica starter and shaft telemetry.
export function inboardMixer(context,output,decodeRecording){
  const voices=new Map(),recordings={};
  let next=0,loadClips;
  const neutralDelay=10;
  function prepare(){
    loadClips??=Promise.all([
      decodeRecording('inboard-loop.mp3').then(buffer=>{recordings.loop=seamlessLoop(context,buffer);}),
      decodeRecording('inboard-starter.mp3').then(buffer=>{recordings.starter=buffer;})
    ]).catch(error=>console.warn('Engine recordings unavailable',error));
  }
  return (local,peers,listener,underwater,running,localThrottle=0,simulationRate=1)=>{
    const now=context.currentTime;
    if(now<next)return;
    next=now+.05;
    if(local||peers.length)prepare();
    const pos=listener.position,right=listener.matrixWorld.elements;
    const nearby=[];
    function collect(boat,powered){
      const existing=voices.get(boat);
      const running=boat.engineRunning??(powered||Boolean(existing&&now-existing.lastPowered<neutralDelay));
      if(!running&&!(boat.starterRemaining>1e-6))return;
      const p=boat.group.position,dx=p.x-pos.x,dy=p.y-pos.y,dz=p.z-pos.z;
      const d=Math.hypot(dx,dy,dz);
      if(d<=150)nearby.push({boat,powered,d,balance:(dx*right[0]+dy*right[1]+dz*right[2])/Math.max(2,d)});
    }
    if(running){
      if(local)collect(local,Math.abs(localThrottle)>.008&&Math.abs(local.shaftRPM)>45);
      for(const boat of peers)collect(boat,Math.abs(boat.shaftRPM)>90);
    }
    nearby.sort((a,b)=>a.d-b.d);
    const active=new Set();
    for(const {boat,powered,d,balance} of nearby.slice(0,4)){
      let entry=voices.get(boat);
      if(!entry){
        entry={voice:engineVoice(context,output,recordings),lastPowered:now};
        voices.set(boat,entry);
      }
      if(powered)entry.lastPowered=now;
      active.add(boat);
      entry.voice.set(boat.shaftRPM,d,balance,underwater,boat.starterRemaining??0,simulationRate);
    }
    for(const [boat,{voice}] of voices)if(!active.has(boat)&&voice.fade()){voice.dispose();voices.delete(boat);}
  };
}
