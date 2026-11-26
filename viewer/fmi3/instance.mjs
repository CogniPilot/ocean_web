export async function loadInstance(name,inputs,read=fetch){
  const factory=await prepareInstance(name,read);
  return factory(inputs);
}

// A training batch can pin one model version and share its binary across
// independent FMI instances for the whole experiment.
export async function prepareInstance(name,read=fetch,shareBinary=false){
  const url=new URL(name+'.json',import.meta.url);
  const metadata=await read(url,{cache:'no-cache'}).then(r=>r.json());
  const browser=url.protocol!=='file:';
  function asset(file){
    const path=new URL(file,url);
    if(browser)path.searchParams.set('version',metadata.token);
    return path.href;
  }
  const {default:create}=await import(asset(name+'.mjs'));
  const options=browser?{locateFile:asset}:{};
  if(shareBinary){
    const reply=await read(new URL(asset(name+'.wasm')));
    if(!reply.ok)throw Error('Cannot load '+name+' WebAssembly');
    options.wasmBinary=new Uint8Array(await reply.arrayBuffer());
    const first=await create(options);
    if(first._select_instance)return inputs=>bindInstance(name,metadata,first,inputs,true);
    // Previously generated reactors own one instance per WASM memory.
    let available=first;
    return async inputs=>{const initial=available;available=null;return bindInstance(name,metadata,initial??await create(options),inputs);};
  }
  return async inputs=>bindInstance(name,metadata,await create({...options}),inputs);
}

function bindInstance(name,metadata,m,inputs,shared=false){
  function check(status){if(status>1)throw Error(name+' FMI status '+status);}
  check(m.ccall('create_instance','number',['string'],[metadata.token]));
  const handle=shared?m._current_instance():0;
  let closed=false;
  function select(){
    if(closed)throw Error(name+' FMI instance is closed');
    if(shared)m._select_instance(handle);
  }
  function close(){if(!closed&&shared){m._release_instance(handle);closed=true;}}
  function set(name,value){select();const variable=metadata.variables[name];if(!variable)throw Error('Unknown FMI input '+name);if(variable[2]===1){check(m._set_real(variable[0],value));return;}
    if(value.length!==variable[2])throw Error('Wrong FMI dimensions for '+name);
    m.HEAPF64.set(value,m._buffer()/8);check(m._set_reals(variable[0],value.length));}
  try{for(const [name,value] of Object.entries(inputs))set(name,value);check(m._initialize());}
  catch(error){close();throw error;}
  let time=0;
  function result(offset, count) {
    return count===1 ? m.HEAPF64[offset] : Array.from(m.HEAPF64.subarray(offset,offset+count));
  }
  function get(name, destination) {
    select();
    const [reference,kind,count]=metadata.variables[name];
    check(kind==='Int64' ? m._read_integer(reference,count) : m._read_real(reference,count));
    const offset=m._buffer()/8;
    if(destination===undefined)return result(offset,count);
    if(destination.length!==count)throw Error('Wrong output dimensions for '+name);
    destination.set(m.HEAPF64.subarray(offset,offset+count));
    return destination;
  }
  function getMany(names) {
    select();
    if (!m._read_batch || names.length>128) return names.map(name=>get(name));
    const variables=names.map(name=>metadata.variables[name]);
    const total=variables.reduce((sum,v)=>sum+v[2],0);
    if (total>16384 || variables.some(v=>v[1]!=='Float64')) return names.map(name=>get(name));
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
  return {set,get,getMany,close,has:name=>Object.hasOwn(metadata.variables,name),get time(){return time;},advance(dt){select();check(m._advance(time,dt));time+=dt;}};
}
