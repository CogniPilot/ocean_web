// Keep the current and preceding rollout. Budget sample density by the size of
// the whole population, so inspecting a stroke also works on smaller devices.
export function trainingReplay(){
  const legSeconds=2.4,bytesPerTake=12*1024*1024;
  let current=[],previous=[],playing=[],interval=0,started=0,index=-1,lastTime=-1,count=0;
  function clear(){
    current=[];previous=[];playing=[];index=-1;lastTime=-1;count=0;
  }
  function record(rows,time){
    if(!rows.length||!Number.isFinite(time))return;
    if(time<=lastTime||rows.length!==count){
      previous=current.length>=2?current:[];
      current=[];
    }
    lastTime=time;count=rows.length;
    const width=rows[0].length;
    const samples=Math.floor(bytesPerTake/(4*width*count));
    if(samples<2)return;
    interval=Math.max(1/30,legSeconds/(samples-1));
    const tail=current.at(-1);
    if(tail&&time-tail.time<interval-1e-6&&time<legSeconds-1e-6)return;
    const data=new Float32Array(width*count);
    for(let i=0;i<count;i++) data.set(rows[i],i*width);
    current.push({time,data,width,count});
  }
  function clip(){return previous.length>=2?previous:current;}
  function available(){const take=clip();return take.length>=2&&take.at(-1).time-take[0].time>=.2-1e-6;}
  function stop(){playing=[];index=-1;}
  function sample(now){
    if(!available())return;
    if(!playing.length||now-started>=(playing.at(-1).time-playing[0].time)*1000){
      playing=clip().slice();started=now;index=-1;
    }
    const time=playing[0].time+(now-started)/1000;
    let next=index;
    while(next+1<playing.length&&playing[next+1].time<=time)next++;
    if(next===index)return;
    index=next;
    const {count,width,data}=playing[index];
    return Array.from({length:count},(_,i)=>data.subarray(width*i,width*(i+1)));
  }
  return {clear,record,sample,available,stop};
}
