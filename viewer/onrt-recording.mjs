// All fields and geometry in a frame come from the same native solver step.
export async function loadRecording(meta,read){
  const seq=meta.sequence;
  if(!seq)return;
  const geometry=await read('turn-geometry.bin');
  const count=meta.volumeGrid.dims.reduce((a,b)=>a*b);
  const volumes=new Map(),pending=new Map();
  async function ensureField(key){
    if(volumes.has(key))return;
    if(!pending.has(key))pending.set(key,read('turn-'+key+'.bin').then(buffer=>{
      const volume=new Uint16Array(buffer);
      if(volume.length!==count*seq.frames.length)throw Error('Incomplete CFD volume recording');
      volumes.set(key,volume);
    }).finally(()=>pending.delete(key)));
    await pending.get(key);
  }
  const start=seq.frames[0].time,duration=seq.frames.at(-1).time-start;
  function frameAt(elapsed,loop=true){
    const time=start+(loop?elapsed%duration:Math.min(duration,Math.max(0,elapsed)));
    let index=0;
    while(index+1<seq.frames.length && time>=(seq.frames[index].time+seq.frames[index+1].time)/2)index++;
    return index;
  }
  function decode(key,index,values){
    const {min,step}=seq.fields[key][index],volume=volumes.get(key),offset=index*count;
    for(let i=0;i<count;i++){
      const q=volume[offset+i];values[i]=q===0?NaN:min+(q-1)*step;
    }
  }
  function geometryAt(index){
    let offset=seq.frames[index].offset;
    const pressure=new Float32Array(geometry,offset,meta.arrays.pressure[1]);offset+=pressure.byteLength;
    const tracer=new Float32Array(geometry,offset,3*seq.tracers);offset+=tracer.byteLength;
    const lines=new Int16Array(geometry,offset,4*seq.paths*seq.verticesPerPath);
    return {pressure,tracer,lines};
  }
  return {start,duration,frameAt,decode,geometryAt,ensureField};
}
