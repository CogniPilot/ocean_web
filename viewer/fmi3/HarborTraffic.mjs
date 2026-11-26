export default async function create({locateFile,wasmBinary}={}){
  const url=new URL(locateFile?.('HarborTraffic.wasm')??'./HarborTraffic.wasm',import.meta.url);
  const bytes=wasmBinary??(url.protocol==='file:'?await (await import('node:fs/promises')).readFile(url):await fetch(url).then(r=>{if(!r.ok)throw Error('Could not load '+url);return r.arrayBuffer();}));
  const {instance}=await WebAssembly.instantiate(bytes,{wasi_snapshot_preview1:{fd_close(){return 8;},fd_seek(){return 8;},fd_write(){return 8;},proc_exit(code){throw Error('FMI reactor exited '+code);}}});
  const e=instance.exports;e._initialize?.();
  const api={get HEAPF64(){return new Float64Array(e.memory.buffer);},
    ccall(name,_type,argTypes,args){if(name!=='create_instance'||argTypes[0]!=='string')throw Error('Unexpected FMI binding '+name);
      const text=new TextEncoder().encode(args[0]+'\0');new Uint8Array(e.memory.buffer,e.buffer(),text.length).set(text);return e.create_instance(e.buffer());}};
  for(const name of ["current_instance","select_instance","release_instance","create_instance","initialize","set_real","set_reals","read_real","read_integer","advance","buffer","reference_buffer","read_batch"])api['_'+name]=e[name];
  return api;
}
