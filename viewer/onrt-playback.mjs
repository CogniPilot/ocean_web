// Retain every physics tick when the worker batches steps. Camera, hull and
// free surface all interpolate against this single monotonic simulation clock.
export function createWakePlayback(delay) {
  const frames=[];
  let time,playing=false;
  return {
    append(batch){frames.push(...batch);},
    sample(dt,end=Infinity){
      if(!frames.length)return;
      const latest=Math.min(end,frames.at(-1).state.time);
      time??=frames[0].state.time;
      if(!playing)playing=latest-time>=delay-1e-8;
      if(playing){
        const rate=Math.min(1.1,Math.max(.9,1+1.5*(latest-time-delay)));
        time=Math.min(latest,time+Math.max(0,dt)*rate);
      }
      while(frames.length>2&&frames[1].state.time<=time)frames.shift();
      const [left,right=left]=frames;
      const mix=left===right?0:(time-left.state.time)/(right.state.time-left.state.time);
      return {left,right,mix};
    }
  };
}
