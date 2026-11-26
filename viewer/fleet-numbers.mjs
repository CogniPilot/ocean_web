import {npcAnimalLimit,npcGullLimit,npcVesselLimit} from './npc-room.mjs';

const slots=(prefix,count)=>Array.from({length:count},(_,i)=>prefix+(i+1));
const npcIds=[...slots('npc-',npcVesselLimit),...slots('gull-',npcGullLimit),'breakwater',
  ...['whale','shark','manta','diver'].flatMap(kind=>[kind,...slots(kind+'-',npcAnimalLimit).slice(1)])];

function hash(text){
  let value=2166136261;
  for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);
  return value>>>0;
}

export function fleetNumbers(seed,players){
  const numbers=new Map(),used=new Set();
  // Reserve every NPC slot before the room roster so spawning an NPC preserves player numbers.
  const ids=[...new Set([...npcIds,...players.slice().sort()])].slice(0,100);
  for(const id of ids){
    let number=hash(seed+'\0'+id)%100;
    while(used.has(number))number=(number+1)%100;
    numbers.set(id,number);used.add(number);
  }
  return numbers;
}
