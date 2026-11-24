const noGo=1.04,heatSeconds=300,roundingLimit=18;
export const nextFleetStart=(utc,countdown)=>Math.round((utc+countdown)/heatSeconds)*heatSeconds;
const dot=([x,y],[a,b])=>x*a+y*b;
const add=([x,y],[a,b],scale=1)=>[x+scale*a,y+scale*b];
const direction=angle=>[Math.cos(angle),Math.sin(angle)];
const left=([x,y])=>[-y,x];
const difference=(a,b)=>add(a,b,-1);
function unit(vector){
  const length=Math.hypot(...vector);
  return vector.map(x=>x/length);
}
const turn=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

// Regatta.mo scores directional crossings of the start/finish line and the
// outward angle bisectors of the two buoys. Use the same crossing geometry.
function crossing(a,b,origin,normal,across,min,max){
  const before=difference(a,origin),after=difference(b,origin);
  const side=dot(before,normal),next=dot(after,normal);
  if(side>0||next<=0)return null;
  const fraction=-side/(next-side),distance=dot(add(before,difference(after,before),fraction),across);
  return distance>=min&&distance<max?fraction:null;
}

export function hobieRace(race,index,startAt,windSpeed=11,resetLane){
  const prevailing=race.get('windBearing');
  const upwind=prevailing+Math.PI,pin=[race.get('pinEast'),race.get('pinNorth')];
  const committee=[race.get('committeeEast'),race.get('committeeNorth')];
  const gate=add(pin,difference(committee,pin),.5),halfLine=Math.hypot(...difference(committee,pin))/2;
  const crosswind=unit(difference(pin,committee)),up=left(crosswind).map(x=>-x);
  const markEast=race.get('markEast'),markNorth=race.get('markNorth');
  const marks=Array.from(markEast,(east,i)=>[east,markNorth[i]]);
  const lane=resetLane===undefined?[13,-13,22,-22,5,-5,26,-26][index%8]:-26+13*resetLane;
  const tack=resetLane===undefined&&index%2?-1:1,launchHeading=upwind+tack*noGo,launchDirection=direction(launchHeading);
  const speedScale=Math.min(1.45,Math.max(.10,windSpeed/11))*(1-.016*(index%5));
  const launchSpeed=3.1*speedScale,startDelay=.32+.15*(index%7);
  const approachSeconds=11,startPoint=add(gate,crosswind,lane);
  const launch=add(startPoint,launchDirection,-launchSpeed*approachSeconds);
  let at=startDelay-approachSeconds,current=launch,previousHeading=launchHeading;
  const segments=[],events=[{stage:1,time:0}];
  let stage=1,crossedAt=null,finishedAt=null;
  const gates=marks.map((mark,i)=>{
    const before=i===0?gate:marks[0],after=i===0?marks[1]:gate;
    const outside=unit(difference(mark.map(x=>2*x),add(before,after))),tangent=left(outside);
    return {mark,outside,tangent,approach:add(add(mark,outside,10),tangent,-9),departure:add(add(mark,outside,10),tangent,9)};
  });
  function append(target,speed){
    const delta=difference(target,current),length=Math.hypot(...delta);
    if(length<1e-5)return;
    const heading=Math.atan2(delta[1],delta[0]),offWind=Math.abs(turn(upwind,heading));
    // Simple speed polar with reduced speed during a tack or a deep run.
    const polar=offWind<1.3?3.8:offWind>2.65?4.5:5.65;
    const loss=1-.21*Math.min(1,Math.abs(turn(previousHeading,heading))/1.5);
    speed??=polar*speedScale*loss;
    const duration=length/speed;
    segments.push({origin:current,delta,heading,previousHeading,speed,time:at,duration});
    let hit=null;
    if(stage===1)hit=crossing(current,target,gate,up,crosswind,-halfLine,halfLine);
    if(stage===2||stage===3){
      const {mark,outside,tangent}=gates[stage-2];
      hit=crossing(current,target,mark,tangent,outside,.70,roundingLimit);
    }
    if(stage===4)hit=crossing(current,target,gate,up.map(x=>-x),crosswind,-halfLine,halfLine);
    if(hit!==null&&at+hit*duration>=0){
      const time=at+hit*duration;
      if(++stage===2)crossedAt=time;
      if(stage===5)finishedAt=time;
      events.push({stage,time});
    }
    at+=duration;current=target;previousHeading=heading;
  }
  function sailTo(target,side=tack){
    const delta=difference(target,current),along=dot(delta,up),across=dot(delta,crosswind);
    // Inside the no-go sector, split the leg into alternating close-hauled
    // headings. Bound the lateral excursion rather than taking a long detour.
    const reach=along*Math.tan(noGo);
    if(along<=0||Math.abs(across)>=reach){append(target);return;}
    const travel=(reach+side*across)/2,back=(reach-side*across)/2;
    const tacks=Math.max(1,Math.ceil(Math.max(travel,back)/46));
    for(let i=0;i<tacks;i++)for(const [heading,offset] of [[side,travel],[-side,back]]){
      const distance=offset/(tacks*Math.sin(noGo));
      append(add(current,direction(upwind+heading*noGo),distance));
    }
  }
  append(add(startPoint,launchDirection,2),launchSpeed);
  for(const {approach,departure} of gates){
    sailTo(approach);sailTo(departure);
  }
  sailTo(add(gate,up,19));
  sailTo(add(gate,up,-14));
  sailTo(add(launch,launchDirection,-6));
  append(launch,launchSpeed);
  const period=heatSeconds*Math.max(1,Math.ceil((at+approachSeconds+12)/heatSeconds));
  const holdingTime=period+segments[0].time-at;
  const orbitRate=launchSpeed/6;
  const laps=Math.max(1,Math.round(holdingTime*orbitRate/(2*Math.PI)));
  const returnOrbitRate=2*Math.PI*laps/holdingTime;
  const offset=left(launchDirection),position={east:0,north:0,heading:0,speed:0,
    status:{stage:0,elapsed:0,lapTime:0,startDelay:null,heatStart:startAt}};
  const heatIndex=utc=>Math.max(0,Math.floor((utc-startAt-segments[0].time)/period));
  const cornerHalfTime=(a,b)=>Math.min(.6,a.duration/4,b.duration/4);
  function smoothCorner(previous,next,time){
    if(!previous||!next)return;
    const half=cornerHalfTime(previous,next),offset=time-next.time;
    if(Math.abs(offset)>=half)return;
    // Integrate a cosine blend of the incoming and outgoing velocities.
    // Position and velocity meet the straight segments at both ends.
    const u=(offset+half)/(2*half),angle=Math.PI*u;
    const drift=Math.sin(angle)/Math.PI,weight=.5-.5*Math.cos(angle);
    const a=previous.delta.map(x=>x/previous.duration),b=next.delta.map(x=>x/next.duration);
    const p=add(add(next.origin,a,half*(u+drift-1)),b,half*(u-drift));
    const velocity=add(a.map(x=>(1-weight)*x),b,weight);
    position.east=p[0];position.north=p[1];
    position.heading=Math.atan2(velocity[1],velocity[0]);position.speed=Math.hypot(...velocity);
    return true;
  }
  function sample(utc,displayUtc){
    const completedHeats=heatIndex(utc),heatTime=utc-startAt-completedHeats*period;
    const visualClock=displayUtc??utc,visualTime=visualClock-startAt-heatIndex(visualClock)*period;
    if(visualTime<segments[0].time||visualTime>=at){
      // A holding oval joins the close-hauled approach at its tangent.
      const returning=visualTime>=at;
      const waiting=returning?visualTime-at:visualTime-segments[0].time;
      const rate=returning?returnOrbitRate:orbitRate;
      const phase=-.5*Math.PI+waiting*rate;
      const far=resetLane!==undefined&&!returning?Math.max(0,Math.min(1,(-waiting-3)/28)):0;
      const holding=add(launch,up,-55*far*far*(3-2*far));
      const p=add(add(holding,launchDirection,6*Math.cos(phase)),offset,3.5*(1+Math.sin(phase)));
      const velocity=add(launchDirection.map(x=>-x*Math.sin(phase)),offset,3.5/6*Math.cos(phase));
      position.east=p[0];position.north=p[1];position.heading=Math.atan2(velocity[1],velocity[0]);
      position.speed=6*rate*Math.hypot(...velocity);
    }else{
      const index=segments.findIndex(leg=>visualTime<leg.time+leg.duration);
      const leg=index<0?segments.at(-1):segments[index];
      const rounded=displayUtc!==undefined&&(smoothCorner(segments[index-1],leg,visualTime)||
        smoothCorner(leg,segments[index+1],visualTime));
      if(!rounded){
        const elapsed=Math.max(0,visualTime-leg.time);
        const portion=Math.min(1,elapsed/leg.duration);
        position.east=leg.origin[0]+leg.delta[0]*portion;position.north=leg.origin[1]+leg.delta[1]*portion;
        position.heading=displayUtc!==undefined?leg.heading:
          leg.previousHeading+turn(leg.previousHeading,leg.heading)*Math.min(1,elapsed/1.5);
        position.speed=leg.speed;
      }
    }
    const status=position.status;
    status.heatStart=startAt+completedHeats*period;
    status.stage=heatTime<0?0:1;
    for(const event of events)if(heatTime>=event.time)status.stage=event.stage;
    const scored=status.stage>=2;
    status.startDelay=scored?crossedAt:null;
    status.elapsed=scored?Math.min(heatTime,finishedAt??heatTime):0;
    status.lapTime=scored?Math.max(0,status.elapsed-crossedAt):0;
    return position;
  }
  return {sample};
}
