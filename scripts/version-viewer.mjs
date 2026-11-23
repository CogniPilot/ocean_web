// Give a page and its browser modules a common cache key when their interfaces change.
import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const root=process.argv[2];
const scripts=(await readdir(root)).filter(name=>/\.m?js$/.test(name)).sort();
const files=['index.html',...scripts,'board/boat.mjs','board/sail-battens.mjs','board/sail-telltale.mjs','fmi3/instance.mjs'];
const sources=await Promise.all(files.map(name=>readFile(join(root,name),'utf8')));
if(process.env.OCEAN_TURN_ENDPOINT){
  const endpoint=new URL(process.env.OCEAN_TURN_ENDPOINT);
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)
    throw Error('OCEAN_TURN_ENDPOINT must be an HTTPS credential endpoint with no token in the URL');
  const address=endpoint.href.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  sources[0]=sources[0].replace('<meta name="ocean-turn-endpoint" content="">',
    `<meta name="ocean-turn-endpoint" content="${address}">`);
}
const hash=createHash('sha256');
for(const source of sources)hash.update(source).update('\0');
hash.update(await readFile(join(root,'vendor/trystero.mjs'))).update('\0');
for(const asset of ['hobie-hulls','whale','shark'])hash.update(await readFile(join(root,'assets',asset+'.glb')));
for(const asset of (await readdir(join(root,'assets','island'))).sort())
  hash.update(await readFile(join(root,'assets','island',asset)));
const version=hash.digest('hex').slice(0,16);
for(const [index,name] of files.entries()){
  const source=sources[index];
  const updated=name==='index.html'
    ? source.replace(/(<script\b[^>]*\bsrc=")([^"?]+\.m?js)(?:\?[^"]*)?"/g,'$1$2?v='+version+'"')
    : source.replace(/(['"])(\.{1,2}\/[^'"\s?]+\.m?js)(?:\?[^'"\s]*)?\1/g,'$1$2?v='+version+'$1');
  if(updated!==source)await writeFile(join(root,name),updated);
}
