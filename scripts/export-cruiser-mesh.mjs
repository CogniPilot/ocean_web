import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';

const [runtime,destination]=process.argv.slice(2);
const base=pathToFileURL(resolve(runtime)+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
const session=await openFmuSession({base,index,fetch:fileFetch});
try{
  function read(name){
    const {dimensions}=index.variables.find(variable=>variable.name===name);
    const binding=session.bind_outputs(JSON.stringify(scalarNames(name,dimensions)));
    return Array.from(session.read_bound(binding));
  }
  const vertices=read('cruiserContactVertices'),faces=read('cruiserContactFaces');
  const edges=new Map();
  for(let i=0;i<faces.length;i+=3){
    for(let j=0;j<3;j++){
      const a=faces[i+j],b=faces[i+(j+1)%3];
      assert(Number.isInteger(a)&&a>0&&3*a<=vertices.length&&a!==b);
      const edge=a<b?a+','+b:b+','+a;
      const [count,orientation]=edges.get(edge)??[0,0];
      edges.set(edge,[count+1,orientation+(a<b?1:-1)]);
    }
  }
  assert(vertices.every(Number.isFinite));
  assert([...edges.values()].every(([count,orientation])=>count===2&&orientation===0),
    'Every hull edge must join two consistently oriented triangles');
  await writeFile(destination,JSON.stringify({vertices,faces})+'\n');
}finally{
  session.free();
}
