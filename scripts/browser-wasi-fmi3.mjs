// Build a Rumoca source FMU as a browser reactor with native LLVM and WASI libc.
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
const [source,destination]=process.argv.slice(2).map(p=>resolve(p));
const name=basename(source),src=join(source,'sources'),xml=await readFile(join(source,'modelDescription.xml'),'utf8');
if(!xml.includes('generationTool="Rumoca"')||!xml.includes('fmiVersion="3.0"'))throw Error('Expected a Rumoca FMI 3 source directory');
await mkdir(destination,{recursive:true});
const symbols=['current_instance','select_instance','release_instance','create_instance','initialize','set_real','set_reals','read_real','read_integer','advance','buffer','reference_buffer','read_batch'];
const cc=process.env.WASI_CC??'wasm32-unknown-wasi-clang';
execFileSync(cc,[...(process.env.WASM_LD?['-fuse-ld='+process.env.WASM_LD]:[]),'-O2','-mexec-model=reactor','-Wl,-z,stack-size=4194304',
  ...symbols.map(s=>'-Wl,--export='+s),'-I.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers',
  '-I'+src,...(await readdir(src)).filter(s=>s.endsWith('.c')).sort().map(s=>join(src,s)),'scripts/browser-fmi3.c','-o',join(destination,name+'.wasm')],{stdio:'inherit'});
const token=xml.match(/instantiationToken="([^"]+)"/)[1],variables={};
const body=xml.match(/<ModelVariables>([\s\S]*?)<\/ModelVariables>/)[1];
for(const [,kind,attrs,dims=''] of body.matchAll(/<(Float64|Int64|Boolean|String)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)){
  const key=attrs.match(/\bname="([^"]+)"/)[1],ref=Number(attrs.match(/\bvalueReference="(\d+)"/)[1]);
  variables[key]=[ref,kind,[...dims.matchAll(/<Dimension start="(\d+)"/g)].reduce((n,m)=>n*Number(m[1]),1)];
}
await writeFile(join(destination,name+'.json'),JSON.stringify({token,variables}));
await writeFile(join(destination,name+'.mjs'),`export default async function create({locateFile,wasmBinary}={}){
  const url=new URL(locateFile?.('${name}.wasm')??'./${name}.wasm',import.meta.url);
  const bytes=wasmBinary??(url.protocol==='file:'?await (await import('node:fs/promises')).readFile(url):await fetch(url).then(r=>{if(!r.ok)throw Error('Could not load '+url);return r.arrayBuffer();}));
  const {instance}=await WebAssembly.instantiate(bytes,{wasi_snapshot_preview1:{fd_close(){return 8;},fd_seek(){return 8;},fd_write(){return 8;},proc_exit(code){throw Error('FMI reactor exited '+code);}}});
  const e=instance.exports;e._initialize?.();
  const api={get HEAPF64(){return new Float64Array(e.memory.buffer);},
    ccall(name,_type,argTypes,args){if(name!=='create_instance'||argTypes[0]!=='string')throw Error('Unexpected FMI binding '+name);
      const text=new TextEncoder().encode(args[0]+'\\0');new Uint8Array(e.memory.buffer,e.buffer(),text.length).set(text);return e.create_instance(e.buffer());}};
  for(const name of ${JSON.stringify(symbols)})api['_'+name]=e[name];
  return api;
}
`);
await copyFile(source+'.fmu',join(destination,name+'.fmu'));
