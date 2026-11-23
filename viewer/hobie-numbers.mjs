import {npcVesselLimit} from './npc-room.mjs';

function hash(text){
  let value=2166136261;
  for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);
  return value>>>0;
}

export function hobieNumbers(seed,players){
  const numbers=new Map(),used=new Set();
  // Reserve every NPC slot before the room roster so spawning an NPC preserves player numbers.
  const ids=[...Array.from({length:npcVesselLimit},(_,i)=>'npc-'+(i+1)),...[...new Set(players)].sort()].slice(0,100);
  for(const id of ids){
    let number=1+hash(seed+'\0'+id)%100;
    while(used.has(number))number=number%100+1;
    numbers.set(id,number);used.add(number);
  }
  return numbers;
}
