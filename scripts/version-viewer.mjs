// Give a page and its browser modules a common cache key when their interfaces change.
import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const root=process.argv[2];
const scripts=(await readdir(root)).filter(name=>/\.m?js$/.test(name)).sort();
const files=['index.html','onrt.html','onrt-propeller.html',...scripts,'board/boat.mjs','board/sail-battens.mjs','board/sail-telltale.mjs','fmi3/instance.mjs'];
const sources=await Promise.all(files.map(name=>readFile(join(root,name),'utf8')));
for(const kind of ['turn','lobby']){
  const variable='OCEAN_'+kind.toUpperCase()+'_ENDPOINT';
  if(!process.env[variable])continue;
  const endpoint=new URL(process.env[variable]);
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)
    throw Error(variable+' must be HTTPS with no token in the URL');
  const address=endpoint.href.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  sources[0]=sources[0].replace(`<meta name="ocean-${kind}-endpoint" content="">`,
    `<meta name="ocean-${kind}-endpoint" content="${address}">`);
}
const hash=createHash('sha256');
for(const source of sources)hash.update(source).update('\0');
for(const name of ['trystero.mjs','names.js'])
  hash.update(await readFile(join(root,'vendor',name))).update('\0');
for(const asset of ['hobie-hulls','whale','shark'])hash.update(await readFile(join(root,'assets',asset+'.glb')));
for(const surface of ['island','subsea','chart'])for(const asset of (await readdir(join(root,'assets',surface))).sort())
  hash.update(await readFile(join(root,'assets',surface,asset)));
for(const site of ['yatush','satil'])for(const asset of ['far.glb','dive.glb','collision.json'])
  hash.update(await readFile(join(root,'assets','red-sea',site,asset)));
for(const name of ['harbor-hud.css','harbor-aux.css'])hash.update(await readFile(join(root,name)));
const version=hash.digest('hex').slice(0,16);
for(const [index,name] of files.entries()){
  const source=sources[index];
  const updated=name.endsWith('.html')
    ? source.replace(/(<script\b[^>]*\bsrc=")([^"?]+\.m?js)(?:\?[^"]*)?"/g,'$1$2?v='+version+'"')
      .replace(/(href=")(harbor-(?:hud|aux)\.css)(?:\?[^"]*)?"/g,'$1$2?v='+version+'"')
    : source.replace(/(['"])(\.{1,2}\/[^'"\s?]+\.m?js)(?:\?[^'"\s]*)?\1/g,'$1$2?v='+version+'$1');
  if(updated!==source)await writeFile(join(root,name),updated);
}
