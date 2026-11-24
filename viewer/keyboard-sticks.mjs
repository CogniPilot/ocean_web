export function preferredKeyboardLayout(){
  try{return localStorage.getItem('ocean-key-layout')==='mode2'?'mode2':'wasd';}
  catch{return 'wasd';}
}

export function saveKeyboardLayout(layout){
  try{localStorage.setItem('ocean-key-layout',layout);}catch{}
}

const transmitterKeys=new Set(['KeyW','KeyS','KeyA','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
const movementKeys={KeyW:'ArrowUp',KeyS:'ArrowDown',KeyA:'ArrowLeft',KeyD:'ArrowRight',
  KeyQ:'KeyA',KeyE:'KeyD',KeyR:'KeyW',KeyF:'KeyS'};
const surfaceKeys={KeyW:'KeyW',KeyS:'KeyS',KeyQ:'KeyA',KeyE:'KeyD'};

export function keyboardAxisKey(code,layout,kind){
  if(layout!=='wasd')return transmitterKeys.has(code)?code:undefined;
  if(kind==='boat'||kind==='motorboat')return surfaceKeys[code];
  if(kind==='whale'||kind==='shark'||kind==='gull'){
    if(code==='KeyW'||code==='KeyS')return code;
    if(code==='KeyR'||code==='KeyF'){
      const rising=code==='KeyR';
      return rising===(kind==='whale')?'ArrowUp':'ArrowDown';
    }
  }
  return movementKeys[code];
}

export function controlGain({fast,fine}){return fine ? .25 : fast ? 2 : 1;}

// Wall-clock input feel is independent of keyboard repeat and physics packet rate.
export function keyboardSticks(){
  const held=new Set(),levels=new Map();
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
      if(!transmitterKeys.has(key)||held.has(key))return;
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

export function animalSticks(axis,kind){
  const stick=pilotSticks(axis);
  if(kind==='gull'||kind==='shark')stick.pitch=-stick.pitch;
  return stick;
}
