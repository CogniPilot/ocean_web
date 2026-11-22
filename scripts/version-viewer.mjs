// Give a page and its browser modules a common cache key when their interfaces change.
import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const root=process.argv[2];
const scripts=(await readdir(root)).filter(name=>/\.m?js$/.test(name)).sort();
const files=['index.html',...scripts,'board/boat.mjs','board/sail-telltale.mjs','fmi3/instance.mjs'];
const sources=await Promise.all(files.map(name=>readFile(join(root,name),'utf8')));
const hash=createHash('sha256');
for(const source of sources)hash.update(source).update('\0');
for(const animal of ['whale','shark'])hash.update(await readFile(join(root,'assets',animal+'.glb')));
const version=hash.digest('hex').slice(0,16);
for(const [index,name] of files.entries()){
  const source=sources[index];
  const updated=name==='index.html'
    ? source.replace(/(<script\b[^>]*\bsrc=")([^"?]+\.m?js)(?:\?[^"]*)?"/g,'$1$2?v='+version+'"')
    : source.replace(/(['"])(\.{1,2}\/[^'"\s?]+\.m?js)(?:\?[^'"\s]*)?\1/g,'$1$2?v='+version+'$1');
  if(updated!==source)await writeFile(join(root,name),updated);
}
