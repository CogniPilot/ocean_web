// Package the Rumoca FMI C source as a WASI reactor with native LLVM.
import {mkdir,readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
const dir=resolve(process.argv[2]??'build/diver-swim-kernel'),out=resolve(process.argv[3]??'viewer/assets/diver-policy');
const training=process.argv[4]==='DiverLiveUpdate';
const name=training?'DiverLiveUpdate':'DiverSwimPolicy';
const basename=training?'live-update':'swim-policy';
await mkdir(dir,{recursive:true});await mkdir(out,{recursive:true});
const run=(proc,args)=>execFileSync(proc,args,{stdio:'inherit'});
run(process.env.RUMOCA??'rumoca',['compile',training?'tools/diver-policy-vjp/DiverLiveUpdate.mo':'viewer/board/DiverSwimPolicy.mo','-m',name,'--target','fmi3','-o',dir]);
const root=join(dir,name),src=join(root,'sources');
const xml=await readFile(join(root,'modelDescription.xml'),'utf8'),token=xml.match(/instantiationToken="([^"]+)"/)[1];
const vars={};
for(const [,attrs,body=''] of xml.matchAll(/<Float64\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Float64>)/g)){
  const name=attrs.match(/\bname="([^"]+)"/)[1],ref=Number(attrs.match(/\bvalueReference="(\d+)"/)[1]);
  vars[name]=[ref,[...body.matchAll(/<Dimension start="(\d+)"/g)].reduce((n,m)=>n*Number(m[1]),1)];
}
const entry=join(dir,'entry.c');
await writeFile(entry,'const char *token(void){return "'+token+'";}\n');
const ld=process.env.WASM_LD?['-fuse-ld='+process.env.WASM_LD]:[];
run(process.env.WASI_CC??'wasm32-unknown-wasi-clang',[...ld,'-O2','-mexec-model=reactor','-Wl,-z,stack-size=2097152',
  '-Wl,--export=current_instance,--export=select_instance,--export=release_instance,--export=token,--export=create_instance,--export=initialize,--export=buffer,--export=set_reals,--export=set_real,--export=read_real,--export=reference_buffer,--export=read_batch',
  '-I.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers','-I'+src,
  ...(await readdir(src)).filter(f=>f.endsWith('.c')).sort().map(f=>join(src,f)),'scripts/browser-fmi3.c',entry,'-o',join(dir,basename+'.wasm')]);
await copyFile(join(dir,basename+'.wasm'),join(out,basename+'.wasm'));
await writeFile(join(out,basename+'.json'),JSON.stringify({token,vars})+'\n');
