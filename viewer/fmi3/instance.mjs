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
  return {set,get time(){return time;},advance(dt){check(m._advance(time,dt));time+=dt;},
    get(name){const [vr,kind,n]=metadata.variables[name];check(kind==='Int64'?m._read_integer(vr):m._read_real(vr,n));
      const offset=m._buffer()/8;return n===1?m.HEAPF64[offset]:Array.from(m.HEAPF64.subarray(offset,offset+n));}};
}
