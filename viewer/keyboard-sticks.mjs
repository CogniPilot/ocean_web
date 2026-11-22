// Wall-clock input feel is independent of keyboard repeat and physics packet rate.
export function keyboardSticks(){
  const held=new Set(),levels=new Map();
  const controls=new Set(['KeyW','KeyS','KeyA','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
  let stamp;
  function advance(now){
    const dt=stamp===undefined?0:Math.max(0,now-stamp)/1000;
    stamp=now;
    for(const [key,v] of levels){
      const value=held.has(key)?Math.min(1,v+dt):v*Math.pow(.85,dt/.016);
      if(value<.002)levels.delete(key);else levels.set(key,value);
    }
  }
  return {advance,
    press(key,now){
      if(!controls.has(key)||held.has(key))return;
      advance(now);held.add(key);levels.set(key,Math.max(.08,levels.get(key)??0));
    },
    release(key,now){advance(now);held.delete(key);},
    get active(){return levels.size>0;},
    get(key){return levels.get(key)??0;},
    clear(){held.clear();levels.clear();stamp=undefined;}
  };
}

// Both keyboard arrows and touch controls use horizontal roll and vertical pitch.
export function pilotSticks(axis){
  return {
    throttle:axis('KeyW','KeyS'),yaw:axis('KeyA','KeyD'),
    pitch:axis('ArrowUp','ArrowDown'),roll:axis('ArrowRight','ArrowLeft')
  };
}

export const animalSticks=pilotSticks;
