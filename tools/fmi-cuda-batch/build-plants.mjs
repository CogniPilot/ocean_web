// Compile the exact FMI sources shipped to the browser and register their CUDA modules.
import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..'),runtime=join(root,'viewer/fmi3');
const [output,...names]=process.argv.slice(2);
if(!output||!names.length||names.some(n=>!/^\w+$/.test(n)))throw Error('Usage: node build-plants.mjs OUTPUT PLANT [PLANT ...]');
const blockCopies=process.env.RUMOCA_CUDA_BLOCK_COPIES==='1';
const out=resolve(output);
mkdirSync(out,{recursive:true});
const work=mkdtempSync(join(out,'build-'));
const rumoca=resolve(process.env.RUMOCA_ROOT??join(root,'.deps/rumoca-upstream'));
const templates=join(rumoca,'crates/rumoca-phase-codegen/src/templates');
const compiler=join(work,'cuda-fmi3');
cpSync(join(rumoca,'examples/codegen/cuda-fmi3'),compiler,{recursive:true});
// Carry Rumoca PR #766 for checkouts that predate the CUDA bulk-copy pass.
if(!existsSync(join(compiler,'bulk-copy.mjs'))){
  execFileSync('patch',['--batch','--forward','-p4','-i',join(root,'compiler/rumoca-cuda-bulk-copy.patch')],
    {cwd:compiler,stdio:'inherit'});
}
// These scalar functions in the shipped FMUs are available in CUDA libdevice.
const math=join(compiler,'freestanding/math.h');
const mathBindings=readFileSync(math,'utf8');
for(const name of ['atan','cosh','sinh']){
  if(!new RegExp('^#define '+name+'\\s','m').test(mathBindings)){
    writeFileSync(math,'\n#define '+name+' __nv_'+name+'\ndouble '+name+'(double);\n',{flag:'a'});
  }
}
const env={...process.env,FMI_INCLUDE:process.env.FMI_INCLUDE??join(templates,'fmi-ls-wasm/fmi3-headers')};
const run=(program,args)=>execFileSync(program,args,{stdio:'inherit',env});
const entries={};
for(const name of new Set(names)){
  const metadata=join(runtime,name+'.json');
  const {token}=JSON.parse(readFileSync(metadata));
  const dir=join(work,name),source=join(dir,'source'),device=join(dir,'device'),host=join(dir,'host');
  mkdirSync(source,{recursive:true});
  const trainingArchive=join(runtime,name+'.training.fmu');
  const archive=existsSync(trainingArchive)?trainingArchive:join(runtime,name+'.fmu');
  run('unzip',['-q',archive,'modelDescription.xml','sources/*','-d',source]);
  const xml=readFileSync(join(source,'modelDescription.xml'),'utf8');
  if(xml.match(/instantiationToken="([^"]+)"/)?.[1]!==token)throw Error('Browser and source archive FMI tokens differ for '+name);
  const entry=join(source,'sources/rmc_cuda_step.c.inc');
  if(!existsSync(entry)||(blockCopies&&!readFileSync(entry,'utf8').includes('rmc_fmi3_step_block'))){
    // Early source archives predate the optional CUDA entry. Supply the same
    // template from the CUDA compiler, leaving the archived model equations intact.
    const template=readFileSync(join(templates,'fmi3/cuda_step.c.jinja'),'utf8');
    if(!template.includes('{{ artifact.identities.fmu }}')||!/^[\w-]+$/.test(token))throw Error('Unsupported CUDA entry template or FMI token for '+name);
    writeFileSync(entry,template.replaceAll('{{ artifact.identities.fmu }}',token));
  }
  let builder=join(compiler,'build.mjs');
  const compilerEnv={...env};
  if(name==='OceanMotorboat'){
    // The unrolled world equations make LLVM's NVPTX instruction scheduling
    // expensive. Keep the upstream O2 IR passes and let ptxas schedule the PTX.
    const original=readFileSync(builder,'utf8');
    const tuned=original.replace(/(join\(LLVM_BIN, ['"]llc['"]\)\s*,\s*)['"]-O2['"]/,"$1'-O0'");
    if(tuned===original)throw Error('Unsupported CUDA builder llc invocation for OceanMotorboat');
    builder=join(compiler,'build-cruiser.mjs');
    writeFileSync(builder,tuned);
    compilerEnv.PTXAS_OPT_LEVEL='1';
  }
  execFileSync(process.execPath,[builder,source,device,...(blockCopies?['--block-copies']:[])],{stdio:'inherit',env:compilerEnv});
  const deviceBuild=JSON.parse(readFileSync(join(device,'ensemble.json'),'utf8'));
  if(blockCopies && (deviceBuild.kernel!=='rmc_fmi3_step_block' || deviceBuild.threadsPerBlock!==33)){
    throw Error('Selected Rumoca checkout does not provide cooperative CUDA copies');
  }
  const defines=deviceBuild.hostDefines ?? [];
  if(!Array.isArray(defines)){
    throw Error('Unsupported CUDA host ABI for '+name);
  }
  run('bash',[join(here,'build.sh'),join(source,'sources'),host,...defines]);
  const runner=join(host,'runner'),cubin=join(device,'ensemble.cubin');
  const entryConfig={runner:relative(out,runner),cubin:relative(out,cubin),metadata:relative(out,metadata)};
  if(name==='OceanMotorboat'){
    // The cruiser kernel uses a 30,928-byte entry frame on SM 86.
    entryConfig.stackBytes=32768;
    entryConfig.arenaBytes=8*1024*1024;
  }
  const options={...env};
  if(entryConfig.stackBytes)options.RUMOCA_CUDA_STACK_BYTES=String(entryConfig.stackBytes);
  if(entryConfig.arenaBytes)options.RUMOCA_CUDA_ARENA_BYTES=String(entryConfig.arenaBytes);
  execFileSync(runner,[cubin,metadata,'--capabilities'],{stdio:'inherit',env:options});
  entries[name]=entryConfig;
}
const registry=join(out,'registry.json');
const temporary=join(work,'registry.json');
writeFileSync(temporary,JSON.stringify(entries,null,2)+'\n');
renameSync(temporary,registry);
console.log('CUDA plant registry',registry);
