// Challenge the automatic pilot with an attractive craft across the island, then release it to patrol.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const approaches=[
  {name:'south',start:[36,-8],yaw:Math.PI/2,boat:[36,70]},
  {name:'east',start:[86,40],yaw:Math.PI,boat:[8,40]},
  {name:'northwest',start:[6,76],yaw:-.88,boat:[57,14]},
  {name:'handover off west beach',start:[4,40],yaw:0,boat:[70,40],late:true}
];
for(const {name,start,yaw,boat,late} of approaches){
  const craft=new Array(32*8).fill(0);
  craft.splice(0,8,1,1,...boat,0,0,0,1);
  const swimmer=[...start,-3,3,0,0,0,0,0,yaw,0,0,0,0,0,0,0,0];
  const model=await loadInstance('HarborTraffic',{initialSwimmer:swimmer,craft},read);
  let minGap=Infinity,travel=0,nearestBoat=Infinity,previous=start,lastContact=0;
  for(let tick=0;tick<1000;tick++){
    if(tick===600)model.set('craft',new Array(craft.length).fill(0));
    for(let step=0;step<10;step++)model.advance(.01);
    const [state,[force,gap]]=model.getMany(['swimmerState','whaleContact']);
    assert(state.every(Number.isFinite)&&Number.isFinite(gap));
    minGap=Math.min(minGap,gap);
    nearestBoat=Math.min(nearestBoat,Math.hypot(state[0]-boat[0],state[1]-boat[1]));
    travel+=Math.hypot(state[0]-previous[0],state[1]-previous[1]);
    previous=state;
    if(force>0)lastContact=model.time;
  }
  console.log(name,{minGap,travel,nearestBoat,lastContact});
  // Taking over inside the turning circle can produce a glancing fin contact.
  if(late)assert(lastContact<18&&minGap>-.03,name+' stayed aground');
  else assert.equal(lastContact,0,name+' grounded');
  assert(travel>65,name+' stopped swimming');
  assert(nearestBoat<Math.hypot(start[0]-boat[0],start[1]-boat[1])-8,name+' failed to make progress around island');
}
