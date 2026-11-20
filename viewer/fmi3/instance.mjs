export async function loadInstance(name,inputs,read=fetch){
  const url=new URL(name+'.json',import.meta.url);
  const metadata=await read(url,{cache:'no-cache'}).then(r=>r.json());
  const browser=url.protocol!=='file:';
  function asset(file){
    const path=new URL(file,url);
    if(browser)path.searchParams.set('version',metadata.token);
    return path.href;
  }
  const {default:create}=await import(asset(name+'.mjs'));
  const m=await create(browser?{locateFile:asset}:{});
  function check(status){if(status>1)throw Error(name+' FMI status '+status);}
  check(m.ccall('create_instance','number',['string'],[metadata.token]));
  function set(name,value){const variable=metadata.variables[name];if(!variable)throw Error('Unknown FMI input '+name);if(variable[2]===1){check(m._set_real(variable[0],value));return;}
    if(value.length!==variable[2])throw Error('Wrong FMI dimensions for '+name);
    m.HEAPF64.set(value,m._buffer()/8);check(m._set_reals(variable[0],value.length));}
  for(const [name,value] of Object.entries(inputs))set(name,value);
  check(m._initialize());
  let time=0;
  function result(offset, count) {
    return count===1 ? m.HEAPF64[offset] : Array.from(m.HEAPF64.subarray(offset,offset+count));
  }
  function get(name) {
    const [reference,kind,count]=metadata.variables[name];
    check(kind==='Int64' ? m._read_integer(reference) : m._read_real(reference,count));
    return result(m._buffer()/8,count);
  }
  function getMany(names) {
    if (!m._read_batch || names.length>128) return names.map(get);
    const variables=names.map(name=>metadata.variables[name]);
    const total=variables.reduce((sum,v)=>sum+v[2],0);
    if (total>16384 || variables.some(v=>v[1]!=='Float64')) return names.map(get);
    const refs=new Uint32Array(m.HEAPF64.buffer,m._reference_buffer(),names.length);
    variables.forEach(([reference],i)=>{refs[i]=reference;});
    check(m._read_batch(names.length,total));
    let offset=m._buffer()/8;
    return variables.map(([, , count])=>{
      const value=result(offset,count);
      offset+=count;
      return value;
    });
  }
  return {set,get,getMany,get time(){return time;},advance(dt){check(m._advance(time,dt));time+=dt;}};
}
