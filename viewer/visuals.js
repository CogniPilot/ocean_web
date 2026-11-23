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
function seabedMaterials(T,illumination,terrainTextures){
 function textured(base,kind){
   const shore=kind==='shore';
   const m=new T.MeshStandardMaterial({color:0xffffff,roughness:.86,metalness:kind==='metal'?.22:0,vertexColors:shore});
   m.onBeforeCompile=s=>{
     s.vertexShader='varying vec3 location;\n'+s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nlocation=(modelMatrix*vec4(transformed,1.)).xyz;');
     s.fragmentShader='varying vec3 location;\n'+skyNoiseGLSL+s.fragmentShader;
     if(shore){
       const {sand,height,ready}=terrainTextures;
       Object.assign(s.uniforms,{sandMap:{value:sand},sandHeightMap:{value:height},sandMapsReady:ready});
       s.fragmentShader='uniform sampler2D sandMap,sandHeightMap;uniform float sandMapsReady;\n'+s.fragmentShader;
       s.fragmentShader=s.fragmentShader
         .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
           roughnessFactor=mix(roughnessFactor,.64+.29*drySand,shoreWeight*sandMapsReady);`)
         .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
           // Height in metres on the terrain surface, with a screen-space tangent frame.
           vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
           vec3 tx=cross(sy,normal),ty=cross(normal,sx);
           float handedness=dot(sx,tx);
           vec3 hill=sign(handedness)*(dFdx(groundRelief)*tx+dFdy(groundRelief)*ty);
           normal=normalize(max(abs(handedness),1e-12)*normal-hill);`);
     }
     const shoreline=`
     // Blend two scales of the same sand scan to break up visible tiling.
     vec2 sandUv=p*.094+vec2(.74,.23);
     vec2 detailUv=mat2(.78,.626,-.626,.78)*p*.19+vec2(.38,.77);
     float variation=noise2(p*.32);
     float blend=smoothstep(.21,.78,variation);
     float drySand=smoothstep(-.32,.59,location.z+.22*(variation-.5));
     float shoreWeight=smoothstep(-13.7,-7.,location.z);
     vec3 sandColor=mix(texture2D(sandMap,sandUv).rgb,texture2D(sandMap,detailUv).rgb,blend);
     vec3 shoreSand=sandColor*mix(vec3(.68,.73,.72),vec3(2.55,2.43,2.28),drySand);
     shoreSand=mix(shoreSand,vec3(.70,.64,.53),.35*drySand);
     float groundRelief=.017*mix(texture2D(sandHeightMap,sandUv).r,texture2D(sandHeightMap,detailUv).r,blend)
       *sandMapsReady*shoreWeight;
     diffuseColor.rgb=mix(bed,mix(diffuseColor.rgb,shoreSand,sandMapsReady),shoreWeight);`;
     const code=kind==='sand'||shore?`vec2 p=location.xy;float ridge=sin(6.*p.x+2.4*sin(p.y*.81)+cloud(p*.7)*5.);
     vec3 bed=vec3(.26,.31,.27)*(.65+.12*ridge+.53*cloud(p*2.));
     ${shore?shoreline:'diffuseColor.rgb=bed;'}`:
     `vec2 p=vec2(location.x+.34*location.y,location.z+.25*location.y);float oxidation=cloud(p*vec2(.75,.38))+.16*noise2(p*vec2(7.,1.2));vec3 brown=vec3(.35,.125,.046);diffuseColor.rgb=mix(vec3(${base}),brown,smoothstep(.43,.69,oxidation))*(.63+.47*noise2(p*43.));`;
     Object.assign(s.uniforms,illumination);
     s.fragmentShader='uniform sampler2D wreckFlux,wreckDepth;uniform mat4 wreckProjection;uniform vec3 waterRay;uniform vec2 causticShift;uniform float sunStrength;\n'+s.fragmentShader;
     s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n'+code+`
       if(sunStrength>.001){
       vec3 shadow=(wreckProjection*vec4(location,1.)).xyz*.5+.5;
       float exposed=1.;
       if(all(greaterThan(shadow,vec3(0.)))&&all(lessThan(shadow,vec3(1.))))
         exposed=step(shadow.z-.00032,texture2D(wreckDepth,shadow.xy).r);
       vec2 floorUV=(location.xy+waterRay.xy*((-13.7-location.z)/min(-.05,waterRay.z))-vec2(16.,0.))/64.+.5;
       if(all(greaterThan(floorUV,vec2(0.)))&&all(lessThan(floorUV,vec2(1.)))){
         float focus=max(0.,texture2D(wreckFlux,floorUV*(64./12.)+causticShift).r/.13-1.);
         vec2 margin=min(floorUV,1.-floorUV);
         float coverage=smoothstep(0.,.10,min(margin.x,margin.y));
         diffuseColor.rgb*=1.+coverage*min(focus,3.)*sunStrength*exposed*vec3(.55,.86,.77);
       }}`);
   };
   m.customProgramCacheKey=()=>kind+base;return m;
 }
 return {iron:textured('.18,.25,.24','metal'),deck:textured('.20,.23,.19','metal'),rib:textured('.26,.28,.23','metal'),wood:textured('.35,.20,.085','wood'),sand:textured('','sand'),shore:textured('','shore'),dark:new T.MeshStandardMaterial({color:0x172927})};
}
function marineLife(T,scene,webgl2,schoolState){
 const fish=new T.Group();scene.add(fish);
 const pose=new T.Object3D(),swimPhase={value:0};
 let school,swimmers=[],fishLoad;
 function updateSchool(){
   const shared=schoolState?.();
   fish.visible=!!shared;
   if(!shared)return;
   fishLoad??=fetch('assets/fish.json').then(r=>r.json()).then(asset=>buildSchool(asset,shared.positions.length/4)).catch(console.error);
   swimPhase.value=shared.time*6%8;
   for(let i=0;i<(school?school.count:swimmers.length);i++){
     const f=school?pose:swimmers[i],k=i*4,visible=shared.restock[i]<=shared.time;
     f.scale.setScalar(visible?.68+.4*Math.abs(Math.sin(i)):0);
     f.position.fromArray(shared.positions,k);
     f.rotation.z=shared.positions[k+3];
     if(school){
       f.updateMatrix();school.setMatrixAt(i,f.matrix);
     }else{
       const cycle=(swimPhase.value+i)%8,k=Math.floor(cycle);
       f.morphTargetInfluences.fill(0);
       f.morphTargetInfluences[k]=1-(cycle-k);f.morphTargetInfluences[(k+1)%8]=cycle-k;
     }
   }
   if(school)school.instanceMatrix.needsUpdate=true;
 }
 function buildSchool(asset,count){
   const geo=fishGeometry(T,asset);
   const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.08,side:T.DoubleSide});
   if(webgl2){
     // All instances share the same eight absolute poses in Three's morph texture.
     // The vertex and normal use the same two layers, offset by each fish's index.
     mat.onBeforeCompile=shader=>{
       shader.uniforms.swimPhase=swimPhase;
       shader.vertexShader='uniform float swimPhase;\n'+shader.vertexShader
         .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
           float swimFrame=mod(swimPhase+float(gl_InstanceID),float(MORPHTARGETS_COUNT));
           int firstPose=int(floor(swimFrame)),secondPose=(firstPose+1)%MORPHTARGETS_COUNT;
           float weight=fract(swimFrame);`)
         .replace('#include <morphnormal_vertex>', 'objectNormal=mix(getMorph(gl_VertexID,firstPose,1).xyz,getMorph(gl_VertexID,secondPose,1).xyz,weight);')
         .replace('#include <morphtarget_vertex>', 'transformed=mix(getMorph(gl_VertexID,firstPose,0).xyz,getMorph(gl_VertexID,secondPose,0).xyz,weight);');
     };
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
 // Rooted kelp beds flank the survey corridor. All fronds share one draw call.
 const blades=[],bladeFaces=[],flex=[];
 for(let bed=0;bed<50;bed++){
   const x=-17+random()*62,y=(bed%2?1:-1)*(5+random()*18);
   for(let blade=0;blade<11;blade++){
     const rootX=x+2*(random()-.5),rootY=y+2*(random()-.5);
     const h=.45+1.65*random(),az=random()*Math.PI*2,w=.055+random()*.09;
     const offset=blades.length/3;
     for(let j=0;j<=8;j++){
       const u=j/8,width=w*(.11+Math.sin(Math.PI*u)**.7)*(1+.20*Math.sin(u*16));
       const bend=h*.38*u*u+.08*Math.sin(7*u);
       for(const side of [-1,1]){
         blades.push(rootX+bend*Math.cos(az)-side*width*Math.sin(az),
           rootY+bend*Math.sin(az)+side*width*Math.cos(az),-13.7+h*u);
         flex.push(u*u);
       }
       if(j){const a=offset+2*j;bladeFaces.push(a-2,a-1,a,a,a-1,a+1);}
     }
   }
 }
 const kelp=new T.BufferGeometry();
 kelp.setAttribute('position',new T.Float32BufferAttribute(blades,3));
 kelp.setAttribute('flex',new T.Float32BufferAttribute(flex,1));
 kelp.setIndex(bladeFaces);kelp.computeVertexNormals();
 const frond=new T.MeshStandardMaterial({color:0x416047,side:T.DoubleSide,roughness:.74});
 frond.onBeforeCompile=s=>{
   s.uniforms.seabedTime=seabedTime;
   s.vertexShader='attribute float flex;uniform float seabedTime;\n'+s.vertexShader.replace('#include <begin_vertex>',
     '#include <begin_vertex>\ntransformed.xy+=flex*vec2(.15*sin(.83*seabedTime+.6*position.y),.09*cos(.6*seabedTime+.45*position.x));');
 };
 scene.add(new T.Mesh(kelp,frond));
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
      siltFade=1.-smoothstep(26.,39.,length(offset));`);
   shader.fragmentShader='varying float siltFade;\n'+shader.fragmentShader.replace('#include <alphamap_fragment>',
     '#include <alphamap_fragment>\ndiffuseColor.a*=siltFade*(1.-smoothstep(.06,.5,length(gl_PointCoord-.5)));');
 };
 const motes=new T.Points(geo,silt);motes.frustumCulled=false;scene.add(motes);
 return t=>{
   updateSchool();
   motes.position.set(.35*Math.sin(t*.23),.15*Math.sin(t*.18),.14*Math.cos(t*.12));
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

function coast(T,scene,instanceRocks=true){
 const land=new T.Group();scene.add(land);
 const center=[36,40],sand=new T.Color(0xdcc69d),wet=new T.Color(0xa29276),rock=new T.Color(0x827665);
 const geo=new T.PlaneGeometry(58,46,74,62),pos=geo.attributes.position,colors=[];
 const bedPixels=new Uint8Array(4*pos.count);
 function smoothStep(value){
   const u=Math.max(0,Math.min(1,value));
   return u*u*(3-2*u);
 }
 function terrain(x,y){
   // Keep the same slope, skirt and cell vertices as Shore.terrain.
   const height=17.3-4.2*((x/17)**2+(y/11)**2)+.34*Math.sin(x*.64)*Math.cos(y*.55)+.37*Math.cos(.34*x-.51*y);
   return -13.7+Math.max(0,height)*smoothStep(height/.8)*smoothStep((29-Math.abs(x))/7)*smoothStep((23-Math.abs(y))/7);
 }
 land.userData.chartTerrain={center,height:terrain};
 const color=new T.Color();
 for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),y=pos.getY(i),z=terrain(x,y);
   pos.setZ(i,z);
   const bedIndex=4*((62-Math.floor(i/75))*75+i%75);
   bedPixels[bedIndex]=Math.round(255*(z+13.7)/18);
   color.copy(wet).lerp(sand,smoothStep((z+.23)/.68));
   colors.push(color.r,color.g,color.b);
 }
 geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 geo.computeVertexNormals();
 // Reuse the actual terrain elevations for shallow-water light scattering.
 const bedTexture=new T.DataTexture(bedPixels,75,63);
 bedTexture.minFilter=bedTexture.magFilter=T.LinearFilter;
 bedTexture.needsUpdate=true;
 land.userData.bed={texture:bedTexture,bounds:new T.Vector4(center[0]-29,center[1]-23,58,46)};
 const island=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.86}));land.userData.sand=island;land.add(island);land.position.set(...center,0);
 let seed=13;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const rockCount=46,shape=new T.IcosahedronGeometry(1,1);
 const rocks=instanceRocks?new T.InstancedMesh(shape,new T.MeshStandardMaterial({roughness:.93}),rockCount):new T.Group();
 const pose=new T.Object3D(),tint=new T.Color();
 for(let i=0;i<rockCount;i++){const a=random()*6.28,r=.84+.25*random(),x=17*r*Math.cos(a),y=11*r*Math.sin(a);
   tint.copy(rock).multiplyScalar(.65+.45*random());
   pose.scale.set(1+random()*1.5,.7+random(),.65+random());pose.position.set(x,y,terrain(x,y));pose.rotation.set(random(),random(),random()*6);
   pose.updateMatrix();
   if(instanceRocks){rocks.setColorAt(i,tint);rocks.setMatrixAt(i,pose.matrix);}
   else {
     const mesh=new T.Mesh(shape,new T.MeshStandardMaterial({roughness:.93,color:tint}));
     mesh.position.copy(pose.position);mesh.quaternion.copy(pose.quaternion);mesh.scale.copy(pose.scale);rocks.add(mesh);
   }
 }
 if(instanceRocks)rocks.computeBoundingSphere();
 const blades=[],indices=[];
 for(let i=0;i<200;i++){
   const x=random()*48-14,y=random()*25-12;
   if(x>=0 && x<=30 && Math.abs(y)<4.4)continue;
   for(let j=0;j<10;j++){const bx=x+random()*.45,by=y+random()*.45,h=.15+.7*random(),n=blades.length/3;
     blades.push(bx-.035,by,-13.7,bx+.035,by,-13.7,bx+.10,by+.05,-13.7+h*.55,bx+.17,by+.06,-13.7+h);indices.push(n,n+1,n+2,n+1,n+3,n+2);}
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(blades,3));g.setIndex(indices);g.computeVertexNormals();
 scene.add(new T.Mesh(g,new T.MeshStandardMaterial({color:0x42624c,side:T.DoubleSide})));
 land.add(rocks);
 const textures=islandTextures(T);
 land.userData.terrainTextures=textures;
 land.userData.updatePalms=islandPalms(T,land,terrain,center,textures);
 islandScrub(T,land,terrain);
 return land;
}
