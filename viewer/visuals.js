// Pack static solids sharing a material into one draw call. Sensors retain individual boxes.
function batchScenery(T,group,attributes=[]){
 const byMaterial=new Map();
 for(const part of [...group.children]){
   if(!part.isMesh)continue;
   part.updateMatrix();
   let batch=byMaterial.get(part.material);
   if(!batch){batch={position:[],normal:[],color:[]};for(const name of attributes)batch[name]=[];byMaterial.set(part.material,batch);}
   const geom=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
   geom.applyMatrix4(part.matrix);
   for(const key of Object.keys(batch)){
     const attribute=geom.getAttribute(key);
     if(attribute)for(const value of attribute.array)batch[key].push(value);
   }
   geom.dispose();group.remove(part);
 }
 for(const [material,attributes] of byMaterial){
   const geo=new T.BufferGeometry();
   for(const [key,values] of Object.entries(attributes))if(values.length)geo.setAttribute(key,new T.Float32BufferAttribute(values,3));
   geo.computeBoundingSphere();group.add(new T.Mesh(geo,material));
 }
 return group;
}

const seabedTime={value:0};
// Keep one shared texture pair per substrate. Above-water sailing never downloads them.
function diveSurfaces(T){
 const files=[],loader=new T.ImageLoader();let requested=false,disposed=false;
 function map(name,suffix,color,srgb){
   const c=document.createElement('canvas');c.width=c.height=1;
   const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
   const texture=new T.CanvasTexture(c);
   texture.wrapS=texture.wrapT=T.MirroredRepeatWrapping;
   if(srgb)texture.colorSpace=T.SRGBColorSpace;
   files.push([texture,'assets/subsea/'+name+'-'+suffix+'.webp']);return texture;
 }
 function material(name,color,tileMeters){
   return {albedo:map(name,'albedo',color,true),relief:map(name,'surface','#80dcdb',false),tileMeters};
 }
 return {sand:material('carbonate-sand','#acaa91',.8),rubble:material('reef-rubble','#80786c',1.5),weed:material('ribbon-algae','#69814b',1),
   load(){if(requested||disposed)return;requested=true;
     for(const [texture,url] of files)loader.load(url,img=>{if(!disposed){texture.dispose();texture.image=img;texture.needsUpdate=true;}});},
   dispose(){disposed=true;for(const [texture] of files)texture.dispose();}
 };
}
// One world-space material spans the deep survey, datum strip and beach.
function harborTerrainMaterial(T,illumination,terrainTextures,tide,dive){
 const m=new T.MeshStandardMaterial({vertexColors:true,roughness:.86});
 m.onBeforeCompile=s=>{
   Object.assign(s.uniforms,illumination,{
     sandMap:{value:dive.sand.albedo},sandSurface:{value:dive.sand.relief},
     rubbleMap:{value:dive.rubble.albedo},rubbleSurface:{value:dive.rubble.relief},
     basinCenter:{value:new T.Vector2(harborBed.abyss.east,harborBed.abyss.north)},
     beachSand:{value:terrainTextures.sand},beachHeight:{value:terrainTextures.height},
     sandMapsReady:terrainTextures.ready,seaLevel:tide
   });
   s.vertexShader='varying vec3 location;\n'+s.vertexShader.replace('#include <worldpos_vertex>',
     '#include <worldpos_vertex>\nlocation=(modelMatrix*vec4(transformed,1.)).xyz;');
   s.fragmentShader=`varying vec3 location;
     uniform sampler2D sandMap,sandSurface,rubbleMap,rubbleSurface,beachSand,beachHeight,wreckFlux,wreckDepth;
     uniform vec2 basinCenter,causticShift;uniform float sandMapsReady,seaLevel,sunStrength;
     uniform mat4 wreckProjection;uniform vec3 waterRay;
     `+skyNoiseGLSL+s.fragmentShader;
   s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
     vec2 p=location.xy;
     float shoreWeight=smoothstep(-13.7,-7.,location.z);
     vec3 beachTint=diffuseColor.rgb;
     float groundRelief=0.,substrateRoughness=.86;
     if(shoreWeight<1.){
       float ridge=sin(6.*p.x+2.4*sin(p.y*.81)+cloud(p*.7)*5.);
       // Expose more rock on steeper faces and collect sediment in the abyss.
       vec3 bedNormal=inverseTransformDirection(normalize(vNormal),viewMatrix);
       float wall=smoothstep(.12,.65,1.-abs(bedNormal.z));
       vec2 sandUV=location.xy/.8;
       vec2 rubbleUV=location.xy/1.5;
       float patchField=.5+.18*sin(.43*p.x+.16*p.y+.8*sin(.35*p.y))
         +.14*sin(.32*p.y-.52*p.x)+.10*sin(.76*p.x+.40*p.y);
       float rubbleWeight=smoothstep(.30,.75,patchField);
       // Sand accumulates in the sheltered bottom of the abyss. Fade it into
       // the existing substrate as the bed climbs back to exposed rock.
       vec2 basin=p-basinCenter;
       float deposit=(1.-smoothstep(.48,1.,length(basin/vec2(8.5,6.5))))*
         (1.-smoothstep(-43.,-38.,location.z));
       float rippleHeight=0.;
       if(deposit>0.){
         // Include elevation along the west flank so grains retain their size on the incline.
         vec2 bedUV=vec2(basin.x-.48*(location.z+46.),basin.y);
         bedUV=mat2(.88,.475,-.475,.88)*bedUV;
         float meander=noise2(bedUV*.65);
         sandUV+=deposit*(bedUV/1.35-basin/.8+vec2(.06*meander,.14*meander));
         float ripplePhase=19.*bedUV.y+6.*meander+.9*sin(1.5*bedUV.x+.7*bedUV.y);
         float ripple=.5+.5*sin(ripplePhase);
         rippleHeight=.011*ripple*ripple*smoothstep(.16,.77,meander)*deposit;
         // Sparse shell grit collects in hollows between ripples.
         rubbleWeight=mix(rubbleWeight,.05+.52*(1.-ripple)*smoothstep(.47,.73,meander),deposit);
         wall*=1.-deposit;
       }
       vec3 grains=texture2D(sandMap,sandUV).rgb;
       vec3 rubble=texture2D(rubbleMap,rubbleUV).rgb;
       vec2 grainRG=texture2D(sandSurface,sandUV).rg;
       vec2 rubbleRG=texture2D(rubbleSurface,rubbleUV).rg;
       // Project the same rubble onto steep faces without stretching its grains.
       if(wall>.001){
         vec3 planes=abs(bedNormal);planes*=planes;planes*=planes;
         planes/=dot(planes,vec3(1.));
         vec2 yz=location.yz/1.5,xz=location.xz/1.5;
         rubble=mix(rubble,planes.x*texture2D(rubbleMap,yz).rgb+planes.y*texture2D(rubbleMap,xz).rgb+planes.z*rubble,wall);
         rubbleRG=mix(rubbleRG,planes.x*texture2D(rubbleSurface,yz).rg+planes.y*texture2D(rubbleSurface,xz).rg+planes.z*rubbleRG,wall);
       }
       float mineral=mix(rubbleWeight,1.,wall);
       groundRelief=rippleHeight+mix(mix(.0035,.011,deposit)*grainRG.r,.019*rubbleRG.r,mineral);
       substrateRoughness=mix(grainRG.g,rubbleRG.g,mineral);
       float ledge=cloud(vec2(.78*(location.x+.53*location.y),location.z*2.0));
       vec3 shale=rubble*vec3(.67,.72,.70)*(.75+.38*ledge);
       diffuseColor.rgb=mix(mix(grains,rubble,rubbleWeight)*(.79+.08*ridge+.18*cloud(p)),shale,wall);
       // Attenuate daylight reaching the lower walls, including views down from the rim.
       diffuseColor.rgb*=mix(1.,mix(.47,.88,deposit),smoothstep(15.,32.,-location.z));
     }
     if(shoreWeight>0.){
       // Blend two scales of the same sand scan to break up visible tiling.
       vec2 sandUv=p*.094+vec2(.74,.23);
       vec2 detailUv=mat2(.78,.626,-.626,.78)*p*.19+vec2(.38,.77);
       float variation=noise2(p*.32);
       float blend=smoothstep(.21,.78,variation);
       float drySand=smoothstep(-.32,.59,location.z-seaLevel+.22*(variation-.5));

       vec3 sandColor=mix(texture2D(beachSand,sandUv).rgb,texture2D(beachSand,detailUv).rgb,blend);
       vec3 shoreSand=sandColor*mix(vec3(.68,.73,.72),vec3(2.55,2.43,2.28),drySand);
       shoreSand=mix(shoreSand,vec3(.70,.64,.53),.35*drySand);
       float beachRelief=.017*mix(texture2D(beachHeight,sandUv).r,texture2D(beachHeight,detailUv).r,blend)*sandMapsReady;
       groundRelief=mix(groundRelief,beachRelief,shoreWeight);
       substrateRoughness=mix(substrateRoughness,.64+.29*drySand,shoreWeight*sandMapsReady);
       diffuseColor.rgb=mix(diffuseColor.rgb,mix(beachTint,shoreSand,sandMapsReady),shoreWeight);
     }
     if(sunStrength>.001){
       if(shoreWeight<1.){
         vec3 shadow=(wreckProjection*vec4(location,1.)).xyz*.5+.5;
         float exposed=1.;
         if(all(greaterThan(shadow,vec3(0.)))&&all(lessThan(shadow,vec3(1.))))
           exposed=step(shadow.z-.00032,texture2D(wreckDepth,shadow.xy).r);
         vec2 floorUV=(location.xy+waterRay.xy*((-13.7-location.z)/min(-.05,waterRay.z))-vec2(16.,0.))/64.+.5;
         if(all(greaterThan(floorUV,vec2(0.)))&&all(lessThan(floorUV,vec2(1.)))){
           float focus=max(0.,texture2D(wreckFlux,floorUV*(64./12.)+causticShift).r/.13-1.);
           vec2 margin=min(floorUV,1.-floorUV);
           float coverage=smoothstep(0.,.10,min(margin.x,margin.y));
           diffuseColor.rgb*=1.+(1.-shoreWeight)*coverage*min(focus,3.)*sunStrength*exposed*vec3(.55,.86,.77);
         }
       }
       if(shoreWeight>0.){
         float depth=seaLevel-location.z;
         if(depth>0.&&depth<6.){
           vec2 entry=location.xy-waterRay.xy*(depth/max(.05,-waterRay.z));
           vec2 causticUV=.34*entry+causticShift;
           float focus=clamp(texture2D(wreckFlux,causticUV).r/.13-1.,-.40,2.3);
           float contrast=smoothstep(.03,.35,depth)*(1.-smoothstep(2.,6.,depth));
           diffuseColor.rgb*=1.+shoreWeight*sunStrength*contrast*focus*vec3(.52,.84,.79);
         }
       }
     }`)
     .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=substrateRoughness;')
     .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
           // Height in metres on the terrain surface, with a screen-space tangent frame.
           vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
           vec3 tx=cross(sy,normal),ty=cross(normal,sx);
           float handedness=dot(sx,tx);
           vec3 hill=sign(handedness)*(dFdx(groundRelief)*tx+dFdy(groundRelief)*ty);
           normal=normalize(max(abs(handedness),1e-12)*normal-hill);
     `);
 };
 m.customProgramCacheKey=()=>'harbor-terrain';
 return m;
}
// Each instance is a single rooted ribbon. Nearby shoots share a swell phase
// through their world coordinates, while their height and bearing vary.
function seabedVegetation(T,sites,shore,weed){
 let seed=992;
 const rand=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
 const group=new T.Group();group.name='Seabed vegetation';
 const vertices=[],faces=[],uv=[];
 for(let j=0;j<=8;j++){
   const u=j/8,w=.09*(.09+Math.sin(Math.PI*u)**.75)*(1+.19*Math.sin(u*16));
   vertices.push(.23*u*u,-w,u,.23*u*u,w,u);uv.push(0,u,1,u);
   if(j){const a=2*j;faces.push(a-2,a-1,a,a,a-1,a+1);}
 }
 const blade=new T.BufferGeometry();
 blade.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
 blade.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 blade.setIndex(faces);blade.computeVertexNormals();
 const material=new T.MeshStandardMaterial({side:T.DoubleSide,map:weed.albedo,bumpMap:weed.relief,bumpScale:.0008,roughnessMap:weed.relief,roughness:1});
 material.onBeforeCompile=shader=>{
   shader.uniforms.seabedTime=seabedTime;
   shader.vertexShader='uniform float seabedTime;\n'+shader.vertexShader.replace('#include <project_vertex>',`
     vec4 mvPosition=instanceMatrix*vec4(transformed,1.);
     vec2 root=modelMatrix[3].xy+instanceMatrix[3].xy;
     float bend=position.z*position.z*instanceMatrix[2].z;
     float wave=sin(.81*seabedTime+dot(root,vec2(.28,.17))-.9*position.z);
     mvPosition.xy+=bend*vec2(.15*wave,.07*sin(.64*seabedTime+.32*root.y)+.045*wave);
     mvPosition=modelViewMatrix*mvPosition;
     gl_Position=projectionMatrix*mvPosition;`);
 };
 const pose=new T.Object3D(),tint=new T.Color(),tileSize=48;
 const basin=harborBed.abyss;
 const abyssRim=[
   [1.33,-.15],[1.19,.30],[1.14,-.37],[1.09,.47],[.96,-.67],[.83,.65],
   [.86,-.29],[.84,.26],[.64,-.68],[.56,.78],[.36,.96],[-.12,1.04],
   [-.49,.86],[-.8,.72],[-.97,.3],[-1.04,-.14],[-.92,-.57],[-.55,-.85],[-.16,-1.07],[.32,-.97]
 ];
 // The approach and passage follow the centre of the basin westwards.
 // Short tufts frame the exterior rock shoulders on either side.
 const caveShoulders=[
   [1.96,-2.74],[2.80,-2.23],[4.05,-1.64],[3.88,1.96],
   [2.75,2.52],[1.86,3.28],[.42,3.78],[-1.35,-3.67]
 ];
 for(let iy=-5;iy<5;iy++)for(let ix=-5;ix<5;ix++){
   const cx=(ix+.5)*tileSize,cy=(iy+.5)*tileSize,shoots=[];
   function patch(x,y,spread=1,heightScale=1,cave=false){
     const radius=spread*(1.1+rand()*2.4),height=heightScale*(.42+rand()*.95);
     const shade=rand(),count=7+Math.floor(rand()*9);
     for(let i=0;i<count;i++){
       const a=rand()*2*Math.PI,r=radius*Math.sqrt(rand());
       const east=x+r*Math.cos(a),north=y+.65*r*Math.sin(a);
       if(sites.some(s=>Math.abs(east-s.east)<s.halfLength+1.6&&Math.abs(north-s.north)<s.halfBeam+1.6))continue;
       let z=harborBed.height(east,north);
       const dx=east-shore.center[0],dy=north-shore.center[1];
       if(Math.abs(dx)<29&&Math.abs(dy)<23)z=Math.max(z,shore.height(dx,dy));
       if(cave){
         if(z< -48||z> -38||Math.abs(north-basin.north)<1.4)continue;
       }else if(z> -2.5||z< -22)continue;
       shoots.push([east-cx,north-cy,z-.045,height*(.5+rand()*.75),rand()*2*Math.PI,shade*.7+rand()*.3]);
     }
   }
   for(let n=0;n<11;n++)patch((ix+rand())*tileSize,(iy+rand())*tileSize);
   for(const site of sites){
     // Loose beds along both sides make the weeds visible on wreck approaches.
     for(const side of [-1,1])for(let i=0;i<6;i++){
       const x=site.east+site.halfLength*(i/2.5-1);
       const y=site.north+side*(site.halfBeam+4+1.5*Math.sin(i*2+side));
       if(Math.floor(x/tileSize)===ix&&Math.floor(y/tileSize)===iy)patch(x,y);
     }
   }
   // These patches share the existing tile instances and leave the procedural
   // placement sequence elsewhere unchanged.
   const regularSeed=seed;
   seed=2162+ix+23*iy;
   for(const [x,y] of abyssRim){
     const east=basin.east+x*basin.eastRadius,north=basin.north+y*basin.northRadius;
     if(Math.floor(east/tileSize)===ix&&Math.floor(north/tileSize)===iy)patch(east,north,.62,1.2);
   }
   for(const [x,y] of caveShoulders){
     const east=basin.east+x,north=basin.north+y;
     if(Math.floor(east/tileSize)===ix&&Math.floor(north/tileSize)===iy)patch(east,north,.24,.59,true);
   }
   seed=regularSeed;
   if(!shoots.length)continue;
   const mesh=new T.InstancedMesh(blade,material,shoots.length);
   for(let i=0;i<shoots.length;i++){
     const [x,y,z,h,angle,shade]=shoots[i];
     pose.position.set(x,y,z-harborBed.datum);pose.rotation.z=angle;pose.scale.set(.8+.4*h,.75+.4*h,h);
     pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);
     tint.setRGB(.56+shade*.34,.74+shade*.23,.54+shade*.28);
     mesh.setColorAt(i,tint);
   }
   mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.4;
   const tile=new T.LOD();tile.position.set(cx,cy,harborBed.datum);
   tile.addLevel(mesh,0);tile.addLevel(new T.Group(),70,.08);group.add(tile);
 }
 return group;
}
function marineLife(T,scene,webgl2,schoolState,sites,shore,weed,baitfishSurface,fishBodies,isCollisionVisible){
 const habitat=new T.Group(),fish=new T.Group();habitat.add(fish);scene.add(habitat);
 const pose=new T.Object3D(),swimPhase={value:0};
 let school,strokeAttribute,tailExcursion,swimmers=[],scales=[],fishLoad,overlay,shapes,beatPeriod=1.2,disposed=false;
 function loadSchool(count){
   return fishLoad??=fetch('assets/fish.json?surface=3').then(r=>r.json()).then(asset=>buildSchool(asset,count)).catch(console.error);
 }
 function updateSchool(){
   if(disposed)return;
   const shared=schoolState?.();
   fish.visible=!!shared;
   const showCollision=shared&&fishBodies&&isCollisionVisible?.();
   if(overlay&&!showCollision){overlay.dispose();overlay=undefined;}
   if(!shared)return;
   loadSchool(shared.positions.length/4);
   const authoredPhase=(shared.time*8/beatPeriod)%8;
   const count=school?school.count:swimmers.length;
   if(showCollision&&count&&!overlay){
     overlay=fishBodies.createFishCollisionOverlay(T,habitat,count);
     shapes??=scales.map(scale=>fishBodies.fishBodyShape('bait',scale));
   }
   overlay?.begin();
   for(let i=0;i<count;i++){
     const f=school?pose:swimmers[i],k=i*4,visible=shared.restock[i]<=shared.time;
     f.scale.setScalar(visible?scales[i]:0);
     f.position.fromArray(shared.positions,k);
     f.rotation.z=shared.positions[k+3];
     if(overlay&&visible)overlay.add(f.position.x,f.position.y,f.position.z,f.rotation.z,shapes[i]);
     const offset=3*i,stroke=shared.strokes,solved=stroke&&stroke[offset+1]>=0;
     const frame=solved?stroke[offset]:authoredPhase+i*3.81966011;
     const gain=solved?stroke[offset+1]/(scales[i]*tailExcursion):1;
     if(school){
       strokeAttribute.setXYZ(i,frame,gain,0);
       f.updateMatrix();school.setMatrixAt(i,f.matrix);
     }else{
       setSchoolMorph(f,frame,gain);
     }
   }
   if(school){school.instanceMatrix.needsUpdate=true;strokeAttribute.needsUpdate=true;}
   overlay?.end();
 }
 function buildSchool(asset,count){
   if(disposed)return;
   beatPeriod=asset.swimProfile?.cycle??1.2;
   const geo=fishGeometry(T,asset,true);tailExcursion=geo.userData.tailExcursion;
   const mat=schoolFishMaterial(T,swimPhase,webgl2,asset.uv?baitfishSurface?.(T):undefined,true);
   scales=Array.from({length:count},(_,i)=>fishBodies?fishBodies.baitfishScale(i):.68+.4*Math.abs(Math.sin(i)));
   if(webgl2){
     strokeAttribute=new T.InstancedBufferAttribute(new Float32Array(count*3),3).setUsage(T.DynamicDrawUsage);
     geo.setAttribute('swimOffset',strokeAttribute);
     school=new T.InstancedMesh(geo,mat,count);
     school.morphTargetInfluences=new Array(geo.morphAttributes.position.length).fill(0);
     school.instanceMatrix.setUsage(T.DynamicDrawUsage);
     // Bounds cover all swim paths and the length of a fish, even between pose updates.
     school.boundingSphere=new T.Sphere(new T.Vector3(13,0,-5),36);
     school.name='Harbor fish schools';fish.add(school);
   }else{
     for(let i=0;i<count;i++)fish.add(new T.Mesh(geo,mat));
     swimmers=fish.children;
   }
   updateSchool();
 }
 let seed=992;function random(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
 habitat.add(seabedVegetation(T,sites,shore,weed));
 const dust=new Float32Array(1500*3);
 for(let i=0;i<dust.length;i+=3){dust[i]=random()*80;dust[i+1]=random()*80;dust[i+2]=-13.3+random()*12.6;}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(dust,3));
 const silt=new T.PointsMaterial({size:.012,color:0xa9c5bd,transparent:true,depthWrite:false,opacity:.24});
 silt.onBeforeCompile=shader=>{
   shader.vertexShader='varying float siltFade;\n'+shader.vertexShader.replace('#include <begin_vertex>',
     `#include <begin_vertex>
      vec2 origin=(modelMatrix*vec4(0.,0.,0.,1.)).xy;
      vec2 offset=mod(position.xy+origin-cameraPosition.xy+40.,80.)-40.;
      transformed.xy=cameraPosition.xy-origin+offset;
      transformed.z+=min(0.,cameraPosition.z+9.);
      siltFade=1.-smoothstep(26.,39.,length(offset));`);
   shader.fragmentShader='varying float siltFade;\n'+shader.fragmentShader.replace('#include <alphamap_fragment>',
     '#include <alphamap_fragment>\ndiffuseColor.a*=siltFade*(1.-smoothstep(.06,.5,length(gl_PointCoord-.5)));');
 };
 const motes=new T.Points(geo,silt);motes.frustumCulled=false;scene.add(motes);
 return {
   async prepare(count){await loadSchool(count);return habitat;},
   refreshSchool:updateSchool,
   dispose(){disposed=true;overlay?.dispose();},
   update(t){
     updateSchool();
     motes.position.set(.35*Math.sin(t*.23),.15*Math.sin(t*.18),.14*Math.cos(t*.12));
   }
 };
}
// Sparse palms share two indexed meshes and each has its own wind sample.
function islandPalms(T,land,terrain,center,textures){
 const trees=[[-9.5,.7,6.8],[-4.7,4.1,8.2],[-.8,4.6,6.4],[4.2,3.8,5.8],[9.4,1.5,7.2]];
 let seed=2897;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const tau=2*Math.PI,palmTime={value:0},palmWind={value:trees.map(()=>new T.Vector2())};
 const makeBatch=()=>({positions:[],colors:[],flex:[],indices:[],uv:[]});
 const trunks=makeBatch(),fronds=makeBatch();
 function vertex(batch,p,color,tree,flex,tip,shade){
   const index=batch.positions.length/3;
   batch.positions.push(p.x,p.y,p.z);batch.colors.push(color.r*shade,color.g*shade,color.b*shade);
   batch.flex.push(tree,flex,tip);return index;
 }
 function blade(base,tip,width,color,tree,span){
   const middle=base.clone().lerp(tip,.5),d=tip.clone().sub(base);
   const across=new T.Vector3(-d.y,d.x,0).normalize().multiplyScalar(width);
   const midSpan=Math.min(1,span+.12),tipSpan=Math.min(1,span+.24);
   const a=vertex(fronds,base,color,tree,1,span,.70);
   vertex(fronds,middle.clone().add(across),color,tree,1,midSpan,.80);
   vertex(fronds,middle.clone().sub(across),color,tree,1,midSpan,.96);
   middle.z+=width*.38;
   vertex(fronds,middle,color,tree,1,midSpan,1.10);
   vertex(fronds,tip,color,tree,1,tipSpan,.91);
   fronds.indices.push(a,a+1,a+3,a,a+3,a+2,a+3,a+1,a+4,a+3,a+4,a+2);
 }
 function bendPalm(shader){
   shader.uniforms.palmTime=palmTime;shader.uniforms.palmWind=palmWind;
   shader.vertexShader=`attribute vec3 palmBend;uniform float palmTime;uniform vec2 palmWind[${trees.length}];\n`+
     shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
       vec2 wind=palmWind[int(palmBend.x)];
       float speedSquared=dot(wind,wind);
       // Drag grows with speed squared and bend reaches half its limit at 6.5 m/s.
       float load=speedSquared/(42.25+speedSquared);
       vec2 downwind=wind*inversesqrt(max(.000001,speedSquared));
       vec2 crosswind=vec2(-downwind.y,downwind.x);
       float tree=palmBend.x,span=palmBend.z;
       float phase=(.81+.073*tree)*palmTime+tree*2.39;
       float trunk=load*palmBend.y*palmBend.y;
       float sway=.84+.24*sin(phase)+.11*sin(1.7*phase+.5);
       transformed.xy+=trunk*(downwind*sway+crosswind*.15*cos(.91*phase));
       // Frond roots move with the crown. Drag and flutter grow along the blade.
       float leaf=load*span*span;
       float flutter=(2.4+.055*sqrt(speedSquared))*palmTime+6.*span+tree;
       transformed.xy+=leaf*(downwind*.23+crosswind*.11*sin(flutter));
       transformed.z+=leaf*(.18*sin(flutter+.7)-.12);`);
 }
 const bark=new T.Color(0xc3b3a0),oldLeaf=new T.Color(0xa6943b),newLeaf=new T.Color(0x83a841),matureLeaf=new T.Color(0x45682c);
 const up=new T.Vector3(0,0,1);
 for(const [i,[x,y,height]] of trees.entries()){
   const z=terrain(x,y)-.13;
   const lean=(i===0?.40:.09+.22*random())*height,az=random()*tau;
   const dx=Math.cos(az)*lean,dy=Math.sin(az)*lean,thickness=.16+.085*random();
   const sides=9,stride=sides+1,rings=Math.ceil(height*11),first=trunks.positions.length/3;
   for(let row=0;row<=rings;row++){
     const u=row/rings,curve=u**1.65;
     const radius=thickness*(1-.43*u+.46*Math.exp(-24*u)+.18*u**8)*(row%3===0?1.065:1);
     for(let edge=0;edge<=sides;edge++){
       const a=tau*edge/sides;
       vertex(trunks,new T.Vector3(x+dx*curve+Math.cos(a)*radius,y+dy*curve+Math.sin(a)*radius,z+height*u),
         bark,i,u,0,(row%3===0?.83:.97)+.08*Math.sin(a*3.+i));
       trunks.uv.push(edge/sides+i*.37,height*u*.7);
       if(row&&edge){
         const next=first+(row-1)*stride+edge,prev=next-1;
         trunks.indices.push(prev,next,prev+stride,next,next+stride,prev+stride);
       }
     }
   }
   const head=new T.Vector3(x+dx,y+dy,z+height),phase=random()*tau;
   for(let j=0;j<16;j++){
     const upright=j<5,weathered=j>=12,a=phase+j*2.39996+.30*random();
     const forward=new T.Vector3(Math.cos(a),Math.sin(a),0),side=new T.Vector3(-forward.y,forward.x,0);
     const length=(upright?1.4:2)+1.3*random(),rise=(upright?1.18:.38)+.42*random();
     const fall=upright?.05:weathered?1.70+.55*random():.82+.65*random();
     const shade=matureLeaf.clone().lerp(weathered?oldLeaf:newLeaf,.25+.60*random());
     const point=u=>head.clone().addScaledVector(forward,length*u)
       .addScaledVector(side,.22*Math.sin(a+j)*u*u).addScaledVector(up,rise*Math.sin(Math.PI*u*.77)-fall*u**3);
     const ribs=18,stemStart=fronds.positions.length/3;
     for(let step=0;step<=ribs;step++){
       const u=step/ribs,p=point(u),stem=.017*(1-u)+.002;
       vertex(fronds,p.clone().addScaledVector(side,stem),oldLeaf,i,1,u,.88);
       vertex(fronds,p.clone().addScaledVector(side,-stem),oldLeaf,i,1,u,.88);
       if(step){const n=stemStart+2*step;fronds.indices.push(n-2,n-1,n,n,n-1,n+1);}
     }
     for(let step=0;step<ribs;step++)for(const flip of [-1,1]){
       const u=.12+.84*(step+(flip===1?.34:0))/ribs,p=point(u);
       const spread=(.36+.47*Math.sin(Math.PI*u))*(1-u)**.63*(.82+.34*random());
       const tip=p.clone().addScaledVector(forward,.42*spread+.10*u).addScaledVector(side,flip*spread);
       tip.z-=spread*(upright?.11:.44)+.16*u*u;
       blade(p,tip,.085*(1-.51*u)*(.84+.32*random()),shade,i,u);
     }
   }
 }
 for(const [name,batch,doubleSide] of [
   ['Curved coconut trunks',trunks,false],['Coconut palm fronds',fronds,true]
 ]){
   const geometry=new T.BufferGeometry(),{positions,colors,indices,flex}=batch;
   geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
   geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
   geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
   const material=new T.MeshStandardMaterial({vertexColors:true,roughness:doubleSide?.75:.92,
     side:doubleSide?T.DoubleSide:T.FrontSide});
   if(batch===trunks){
     geometry.setAttribute('uv',new T.Float32BufferAttribute(batch.uv,2));
     material.map=textures.palmBark;material.bumpMap=textures.palmHeight;material.bumpScale=.048;
   }
   geometry.setAttribute('palmBend',new T.Float32BufferAttribute(flex,3));
   geometry.boundingSphere.radius+=1.6;
   material.onBeforeCompile=bendPalm;
   const mesh=new T.Mesh(geometry,material);mesh.name=name;land.add(mesh);
 }
 const gust=new T.Vector2();
 let previousTime;
 return (time,sampleWind)=>{
   const gain=previousTime===undefined||time<previousTime?1:1-Math.exp(-(time-previousTime)/.24);
   palmTime.value=previousTime=time;
   trees.forEach(([x,y],i)=>{
     sampleWind(center[0]+x,center[1]+y,gust);
     palmWind.value[i].lerp(gust,gain);
   });
 };
}

function coast(T,scene,shell,instanceRocks=true){
 const land=new T.Group();scene.add(land);
 const {shelf}=harborBed,asset=shell.children.find(node=>node.userData.shelf);
 const {reflectionRange,shelf:survey,islandPadTop}=asset.userData;
 const {center,columns,rows,width,height,vertexStart,rowStride}=survey;
 Object.assign(shelf,{center,columns,rows,width,height});
 const geo=asset.geometry.clone().rotateX(Math.PI/2);
 geo.userData.reflectionRange=reflectionRange;
 const coordinates=geo.attributes.position;
 shelf.samples=new Float32Array((columns+1)*(rows+1));
 for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++)
   shelf.samples[j*(columns+1)+i]=coordinates.getZ(vertexStart+j*rowStride+i);
 const terrain=(x,y)=>shelf.plane(center[0]+x,center[1]+y)?.height??harborBed.datum;
 land.userData.chartTerrain={center,height:terrain};
 const bedPixels=new Uint8Array(4*shelf.samples.length);
 for(let i=0;i<shelf.samples.length;i++)bedPixels[4*i]=Math.round(255*(shelf.samples[i]+13.7)/18);
 const bedTexture=new T.DataTexture(bedPixels,columns+1,rows+1);
 bedTexture.minFilter=bedTexture.magFilter=T.LinearFilter;bedTexture.needsUpdate=true;
 land.userData.bed={texture:bedTexture,bounds:new T.Vector4(center[0]-width/2,center[1]-height/2,width,height)};
 const bottom=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.86}));
 bottom.name='Harbor bathymetry';land.userData.sand=bottom;land.userData.islandPadTop=islandPadTop;
 land.position.set(...center,0);bottom.position.set(-center[0],-center[1],0);land.add(bottom);
 const boulders=[];
 shell.updateMatrixWorld(true);
 shell.traverse(object=>{if(object.userData.shoreRock)boulders.push(object);});
 const origin=new T.Matrix4().makeTranslation(-center[0],-center[1],0);
 if(instanceRocks&&boulders.length){
   const rocks=new T.InstancedMesh(boulders[0].geometry,new T.MeshStandardMaterial({roughness:.93}),boulders.length);
   const pose=new T.Matrix4();
   boulders.forEach((rock,i)=>{
     rocks.setColorAt(i,rock.material.color);
     rocks.setMatrixAt(i,pose.multiplyMatrices(origin,rock.matrixWorld));
   });
   rocks.userData.shoreRock=true;rocks.computeBoundingSphere();land.add(rocks);
 }else for(const source of boulders){
   const rock=new T.Mesh(source.geometry,source.material);
   rock.matrix.multiplyMatrices(origin,source.matrixWorld);
   rock.matrixAutoUpdate=false;rock.userData.shoreRock=true;land.add(rock);
 }
 const textures=islandTextures(T);
 land.userData.terrainTextures=textures;
 land.userData.updatePalms=islandPalms(T,land,terrain,center,textures);
 islandScrub(T,land,terrain);
 return land;
}
