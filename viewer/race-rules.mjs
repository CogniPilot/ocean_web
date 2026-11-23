// Automatic calls for the clear-cut situations on the simulator's fleet course.
const fullTurn=2*Math.PI;
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const range=(a,b)=>Math.hypot(a.east-b.east,a.north-b.north);
const length=boat=>boat.cat?5.11:2.43;
const projection=(a,b,bearing)=>(a.east-b.east)*Math.cos(bearing)+(a.north-b.north)*Math.sin(bearing);

function tack(boat,previous,windFrom){
  const off=wrap(windFrom-boat.heading),old=previous?.off;
  const passedHeadToWind=old!==undefined&&old*off<0&&Math.abs(old)<.50&&Math.abs(off)<.50;
  const turning=(passedHeadToWind||previous?.turning)&&Math.abs(off)<.76;
  const side=Math.abs(Math.sin(off))>.045?Math.sign(off):
    Math.cos(off)<0?Math.sign(boat.sheet):previous?.side??0;
  return {...boat,off,turning,side};
}

function sameTack(a,b,windFrom){
  const fromA=projection(b,a,a.heading),fromB=projection(a,b,b.heading);
  if(fromA>(length(b)+length(a)*Math.abs(Math.cos(a.heading-b.heading)))/2)return '12';
  if(fromB>(length(a)+length(b)*Math.abs(Math.cos(a.heading-b.heading)))/2)return null;
  const windward=projection(a,b,windFrom);
  return windward>.12?'11':null;
}

function obligation(a,b,windFrom){
  if(a.turning&&b.turning)return sameTack(a,b,windFrom)==='12'?'13':null;
  if(a.turning)return '13';
  if(b.turning||!a.side||!b.side)return null;
  if(a.side!==b.side)return a.side===1?'10':null;
  return sameTack(a,b,windFrom);
}

function turnedInto(a,b,priorA,priorB){
  if(!priorA||!priorB||Math.abs(wrap(a.heading-priorA.heading))<.19)return false;
  const target=Math.atan2(b.north-a.north,b.east-a.east);
  const before=Math.abs(wrap(target-priorA.heading)),after=Math.abs(wrap(target-a.heading));
  // A sudden turn that closes the available manoeuvring room changes the call.
  return before-after>.16&&range(priorA,priorB)<(length(a)+length(b))*.70;
}

export function rightOfWayCall(a,b,windFrom,previousA,previousB){
  const mustKeepClear=obligation(a,b,windFrom),peerMustKeepClear=obligation(b,a,windFrom);
  if(mustKeepClear&&!peerMustKeepClear){
    if(turnedInto(b,a,previousB,previousA))return null;
    return mustKeepClear;
  }
  if(peerMustKeepClear&&!mustKeepClear&&turnedInto(a,b,previousA,previousB))return '16';
  return null;
}

const markNames=['start pin','mark 1','mark 2'];
export function raceRules(){
  const encounters=new Map();
  const pending=[];
  let lastBoat,lastTime,rotation=0,distance=0,marked=[false,false,false],lastStage=0;
  function reset(){
    pending.length=0;encounters.clear();lastBoat=lastTime=undefined;
    distance=rotation=0;marked.fill(false);lastStage=0;
  }
  function update({time,stage,countdown,boat,peers,marks,windFrom}){
    if(time===lastTime)return;
    const racing=(stage>0&&stage<5)||(stage===0&&countdown<=240)||lastStage===4&&stage===5;
    const dt=time-lastTime,own=tack(boat,lastBoat,windFrom),reasons=[];
    let wellClear=true;
    for(const [id,other] of peers){
      const history=encounters.get(id)??{samples:[],touching:false};
      const peer=tack(other,history.samples.at(-1)?.peer,windFrom);
      const gap=range(own,peer);
      wellClear&&=gap>length(own)+.5*length(peer);
      const touch=other.force>10;
      const before=history.samples[0];
      if(racing&&touch&&!history.touching){
        // Mark-room depends on the overlap at zone entry. Avoid making an
        // automatic boat-to-boat call when both racers are at a rounding mark.
        const atRounding=marks.some((mark,i)=>i>0&&range(own,mark)<3*length(own)&&range(peer,mark)<3*length(peer));
        if(!atRounding||own.side!==peer.side&&Math.cos(own.off)>.7&&Math.cos(peer.off)>.7){
          const rule=rightOfWayCall(own,peer,windFrom,before?.own,before?.peer);
          if(rule)reasons.push({rule,detail:{10:'Port tack must keep clear',11:'Windward boat must keep clear',
            12:'Clear astern must keep clear',13:'Keep clear while tacking',16:'Allow room when changing course'}[rule]});
        }
      }
      history.touching=touch||history.touching&&gap<.5*(length(own)+length(peer))+.5;
      history.samples.push({time,own,peer});
      while(history.samples.length>1&&history.samples[1].time<time-.75)history.samples.shift();
      encounters.set(id,history);
    }
    for(const id of encounters.keys())if(!peers.has(id))encounters.delete(id);
    marks.forEach((mark,i)=>{
      const touch=mark.force>1;
      if(racing&&touch&&!marked[i]&&!reasons.length)reasons.push({rule:'31',detail:'Touched '+markNames[i]});
      const near=range(own,mark)<length(own);
      marked[i]=touch||marked[i]&&near;
      if(near)wellClear=false;
    });
    if(reasons.length){
      pending.push(...reasons);
      distance=rotation=0;
    }
    if(pending.length){
      if(reasons.length||!wellClear||Math.abs(own.speed)<.30||!(dt>0&&dt<.8)||!lastBoat){
        distance=rotation=0;
      }else{
        const delta=wrap(own.heading-lastBoat.heading);
        if(Math.abs(delta)<.65){
          distance+=range(lastBoat,own);
          rotation+=delta;
          // A continuous turn necessarily crosses both head-to-wind and
          // dead downwind. The hull also has to move through the water.
          if(Math.abs(rotation)>=fullTurn-.05&&distance>1){
            pending.shift();distance=rotation=0;
          }
        }else{
          distance=rotation=0;
        }
      }
    }
    lastBoat=own;lastTime=time;lastStage=stage;
    return {remaining:pending.length,reason:pending[0],degrees:Math.round(Math.abs(rotation)*180/Math.PI),wellClear};
  }
  return {update,reset};
}
