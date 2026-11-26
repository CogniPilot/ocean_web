// Rebuild from the Rumoca full-web bindings with prepare_gpu_value_function.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const url=pathToFileURL(resolve(process.argv[2])).href;
const {default:init,prepare_gpu_value_function}=await import(url);
await init({module_or_path:await readFile(new URL('rumoca_bind_wasm_bg.wasm',url))});
const source=await readFile('tools/diver-policy-vjp/DiverLiveUpdate.mo','utf8');
const a=JSON.parse(prepare_gpu_value_function(source,'DiverLiveUpdate'));
if(a.profile!=='wgsl-value-function-f32-v1')throw Error('Unsupported Rumoca shader profile '+a.profile);
const vars=Object.fromEntries(Object.entries(a.var_layout.bindings).filter(([,v])=>v.P).map(([k,v])=>[k,v.P.index]));
const target='viewer/assets/diver-policy/live-update';
await writeFile(target+'.wgsl',a.wgsl);
await writeFile(target+'-gpu.json',JSON.stringify({inputs:vars,p:a.var_layout.p_scalars,out:a.var_layout.bindings.update.Y.index,sourceSha256:a.source_sha256,compiler:a.compiler})+'\n');
