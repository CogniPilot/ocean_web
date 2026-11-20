// Bundle the upstream loader against the viewer's matching global Three.js.
import {build} from 'esbuild';
import * as three from 'three';
await build({
  stdin:{contents:"export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'",resolveDir:process.cwd()},
  outfile:'../../viewer/vendor/gltf-loader.mjs',bundle:true,format:'esm',minify:true,
  plugins:[{name:'viewer-three',setup(api){
    api.onResolve({filter:/^three$/},()=>({path:'global',namespace:'viewer'}));
    api.onLoad({filter:/.*/,namespace:'viewer'},()=>({contents:
      'export const {'+Object.keys(three).join(',')+'}=globalThis.THREE;'}));
  }}]
});
