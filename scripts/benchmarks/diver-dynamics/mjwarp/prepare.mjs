// Extract benchmark entry names from the generated FMI translation unit.
// Capture the actual rigid solver operands after Modelica resolves water loads.
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
const [source, dest] = process.argv.slice(2);
const text = readFileSync(join(source,'rmc_functions.c'),'utf8');
const fns = [...text.matchAll(/^RMC_API int rumoca_scalar_pure_(\d+)\([^\n]+\) \{\n([\s\S]*?)\n\}/gm)];
function select(condition) {
  const selected = fns.filter(m=>condition(m[2]));
  if(selected.length!==1) throw Error('Ambiguous generated diver function ABI');
  return selected[0][1];
}
const full = select(s => s.includes('out[392+k]') && s.includes('in[25]'));
const rigid = select(s => s.includes('out+576,out+600,') && s.includes('in[9]'));
writeFileSync(join(dest,'entry.h'),`#define TREE_FORWARD rumoca_scalar_pure_${full}\n#define RIGID_FORWARD rumoca_pure_${rigid}\n`);
const signature = `static int rumoca_pure_${rigid}(const void* const in[], void* const out[], const RmcAssertionObserver* observer)`;
if(!text.includes(signature+' {')) throw Error('Missing typed rigid body entry');
writeFileSync(join(dest,'capture.c'),text.replace(signature+' {', signature.replace('rumoca_pure_'+rigid,'benchmark_rigid')+' {') + `
extern void record_rigid_case(const void* const*, const double*);
${signature} {
  int status=benchmark_rigid(in,out,observer);
  if(!status && out[2]) record_rigid_case(in,out[2]);
  return status;
}
`);
