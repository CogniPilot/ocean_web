// Produce static browser assets from the released FMI-LS-WASM archive.
import {mkdir, readFile, copyFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=new URL('../',import.meta.url);
const microduck=process.env.MICRODUCK_WEB?pathToFileURL(resolve(process.env.MICRODUCK_WEB)+'/'):new URL('.deps/microduck_web/',root);
const jco=process.env.JCO_TRANSPILE||new URL('.deps/ocean-component/node_modules/@bytecodealliance/jco-transpile/dist/index.js',root).pathname;
const {buildFmu,writeBuildFiles}=await import(new URL('scripts/build-fmu.mjs',microduck));
const out=resolve(process.argv[2]||'build/world-runtime');
const bytes=await readFile(new URL('viewer/fmi3/OceanWorld.fmu',root));
const {index,indexFile,files}=await buildFmu(bytes,{jco});
if(index.modelName!=='OceanWorld')throw Error('Expected the integrated OceanWorld component');
await mkdir(out,{recursive:true});
await writeBuildFiles(out,files);
for(const name of ['fmu-session.js','fmu-page-contract.js','sha256.js'])
  await copyFile(new URL('site/'+name,microduck),join(out,name));
await copyFile(new URL('LICENSE',microduck),join(out,'LICENSE-microduck_web'));
await copyFile(new URL('viewer/ocean-world-worker.mjs',root),join(out,'ocean-world-worker.mjs'));
await writeFile(join(out,'manifest.json'),JSON.stringify({index:indexFile})+'\n');
console.log('Prepared '+out+' with '+index.component.coreModules+' verified WebAssembly modules');
