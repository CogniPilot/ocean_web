// Bake chart tiles directly from the same scene geometry as the playable harbor.
// Requires Playwright + Chromium. Optional overrides: PLAYWRIGHT_MODULE and CHROMIUM.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const root=new URL('../viewer/',import.meta.url),out=new URL('assets/chart/',root);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||undefined,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage();
  page.on('pageerror',error=>console.error(error));
  await page.route('http://chart.local/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice(1);
    if(!name)return route.fulfill({contentType:'text/html',body:'<script src="./vendor/three.min.js"></script><script src="./island-landscape.js"></script><script src="./bathymetry.js"></script><script src="./visuals.js"></script>'});
    const contentType=/\.m?js$/.test(name)?'text/javascript':name.endsWith('.webp')?'image/webp':'application/octet-stream';
    try{await route.fulfill({body:await readFile(new URL(name,root)),contentType});}catch{await route.fulfill({status:404});}
  });
  await page.goto('http://chart.local/');
  const tiles=await page.evaluate(async()=>{
    const T=window.THREE,{GLTFLoader}=await import('./vendor/gltf-loader.mjs');
    const {wreckSites}=await import('./red-sea-sites.mjs');
    const {fringingReef}=await import('./coral-reef.mjs');
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
    renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
    function tile(id,obj,bounds,terrain){
      const {west,east,south,north}=bounds;
      const scene=new T.Scene(),cx=(west+east)/2,cy=(south+north)/2;
      const width=east-west,height=north-south,ppu=terrain?16:26;
      scene.add(obj,new T.HemisphereLight(0xfff1d5,0x809c9d,1.45));
      const sun=new T.DirectionalLight(0xffefcd,2.15);
      sun.position.set(cx-24,cy+22,42);sun.target.position.set(cx,cy,0);scene.add(sun,sun.target);
      sun.castShadow=true;Object.assign(sun.shadow.camera,{left:-36,right:36,top:32,bottom:-32,near:1,far:100});
      sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.025;
      obj.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=!mesh.userData.bathymetricSurface;mesh.receiveShadow=true;}});
      const camera=new T.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,180);
      camera.position.set(cx,cy,80);camera.up.set(0,1,0);camera.lookAt(cx,cy,0);
      const w=Math.ceil(width*ppu),h=Math.ceil(height*ppu);
      renderer.setSize(w,h,false);renderer.render(scene,camera);
      const image=document.createElement('canvas');image.width=w;image.height=h;
      const ctx=image.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(renderer.domElement,0,0);
      if(terrain){
        const pixels=ctx.getImageData(0,0,w,h),data=pixels.data;
        for(let y=0,i=0;y<h;y++)for(let x=0;x<w;x++,i+=4){
          if(!data[i+3])continue;
          const e=west+(x+.5)*width/w,n=north-(y+.5)*height/h;
          const depth=Math.max(0,-terrain.height(e-terrain.center[0],n-terrain.center[1]));
          const mix=1-Math.exp(-depth*.16),alpha=1-Math.min(1,Math.max(0,(depth-4)/9.2))**1.6;
          for(const [k,color] of [33,105,110].entries())data[i+k]=data[i+k]*(1-mix)+color*mix;
          data[i+3]*=alpha;
        }
        ctx.putImageData(pixels,0,0);
      }
      scene.remove(obj);sun.shadow.map?.dispose();
      return {id,file:id+'.webp',...bounds,encoded:image.toDataURL('image/webp',.88).split(',')[1]};
    }
    async function waitTextures(textures){
      await Promise.all(textures.map(async texture=>{
        for(let i=0;i<200&&!texture.image;i++)await new Promise(resolve=>setTimeout(resolve,25));
        if(!texture.image)throw Error('Texture did not load: '+texture.name);
      }));
    }
    const {scene:shore}=await new GLTFLoader().loadAsync('assets/island/harbor-island.glb');
    shore.rotation.x=Math.PI/2;
    const landScene=new T.Group(),island=coast(T,landScene,shore),terrain=island.userData.chartTerrain;
    const reef=fringingReef(T,landScene,terrain,false,false,new AbortController().signal);
    reef.update(new T.Vector3(terrain.center[0],terrain.center[1],8),0);
    const materials=island.userData.terrainTextures;
    await waitTextures([materials.sand,materials.height,materials.palmBark,materials.palmHeight]);
    const source=materials.sand.image;
    const tileCanvas=document.createElement('canvas');tileCanvas.width=source.width;tileCanvas.height=source.height;
    const context=tileCanvas.getContext('2d');context.drawImage(source,0,0);
    // Keep the elevation-dependent native beach colors legible under the photographed grain.
    context.fillStyle='rgba(255,250,239,.58)';context.fillRect(0,0,source.width,source.height);
    const sand=new T.CanvasTexture(tileCanvas);sand.colorSpace=T.SRGBColorSpace;
    sand.wrapS=sand.wrapT=T.RepeatWrapping;sand.repeat.set(22,17);
    island.userData.sand.material.map=sand;island.userData.sand.receiveShadow=true;
    const [e,n]=terrain.center,tiles=[tile('island',landScene,{west:e-29,east:e+29,south:n-23,north:n+23},terrain)];
    for(const site of wreckSites){
      const {scene}=await new GLTFLoader().loadAsync('assets/red-sea/'+site.id+'/dive.glb');
      scene.position.set(site.east,site.north,0);scene.rotation.x=Math.PI/2;scene.updateMatrixWorld(true);
      const {min,max}=new T.Box3().setFromObject(scene,true);
      const bounds={west:Math.floor(min.x-0.2),east:Math.ceil(max.x+0.2),south:Math.floor(min.y-0.2),north:Math.ceil(max.y+0.2)};
      tiles.push(tile(site.id,scene,bounds));
    }
    renderer.dispose();return tiles;
  });
  for(const {file,encoded} of tiles)await writeFile(new URL(file,out),Buffer.from(encoded,'base64'));
  const bounds=tiles.map(({encoded,...metadata})=>metadata);
  await writeFile(new URL('harbor.json',out),JSON.stringify(bounds,null,2)+'\n');
  console.log(fileURLToPath(out),bounds);
}finally{await browser.close();}
