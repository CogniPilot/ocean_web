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
       const {field,litter,sand,height,ready}=terrainTextures;
       Object.assign(s.uniforms,{fieldMap:{value:field},litterMap:{value:litter},sandMap:{value:sand},
         terrainHeightMap:{value:height},terrainMapsReady:ready});
       s.vertexShader='attribute float crownCover;varying float groundCover;\n'+s.vertexShader
         .replace('location=(modelMatrix*vec4(transformed,1.)).xyz;',
           'location=(modelMatrix*vec4(transformed,1.)).xyz;groundCover=crownCover;');
       s.fragmentShader=`varying float groundCover;
         uniform sampler2D fieldMap,litterMap,sandMap,terrainHeightMap;
         uniform float terrainMapsReady;
       `+s.fragmentShader;
       s.fragmentShader=s.fragmentShader
         .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
           roughnessFactor=mix(roughnessFactor,.70+.24*drySand,shoreWeight*(1.-greenCover)*terrainMapsReady);`)
         .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
           // Height in metres on the terrain surface, with a screen-space tangent frame.
           vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
           vec3 tx=cross(sy,normal),ty=cross(normal,sx);
           float handedness=dot(sx,tx);
           vec3 hill=sign(handedness)*(dFdx(groundRelief)*tx+dFdy(groundRelief)*ty);
           normal=normalize(max(abs(handedness),1e-12)*normal-hill);`);
     }
     const shoreline=`
     // Two rotations and scales break up the former repeated field pattern.
     vec2 grassUv=p*.47;
     vec2 secondUv=mat2(.78,.626,-.626,.78)*p*.34+vec2(.38,.77);
     vec2 sandUv=p*.14+vec2(.74,.23);
     float fieldVariation=cloud(p*.24);
     float mottling=smoothstep(.28,.72,noise2(p*.43+vec2(29.,41.)));
     float greenCover=smoothstep(.70,1.77,location.z+.96*(fieldVariation-.5));
     float fallen=smoothstep(.26,.73,groundCover+.34*(fieldVariation-.5));
     float drySand=smoothstep(-.36,.47,location.z);
     float shoreWeight=smoothstep(-13.7,-7.,location.z);
     vec3 shoreSand=texture2D(sandMap,sandUv).rgb*mix(.66,1.64,drySand);
     vec3 grass=mix(texture2D(fieldMap,grassUv).rgb,texture2D(fieldMap,secondUv).rgb,mottling);
     grass*=vec3(.69,1.17,.61)*(.83+.34*fieldVariation);
     vec3 leaves=texture2D(litterMap,secondUv).rgb*vec3(.70,.68,.60);
     vec3 surface=mix(shoreSand,mix(grass,leaves,fallen),greenCover);
     surface*=1.-.58*groundCover*greenCover;
     float h1=texture2D(terrainHeightMap,grassUv).r;
     vec2 h2=texture2D(terrainHeightMap,secondUv).rg;
     float h3=texture2D(terrainHeightMap,sandUv).b;
     float groundRelief=.020*mix(h3*.49,mix(mix(h1,h2.r,mottling),h2.g,fallen),greenCover)
       *terrainMapsReady*shoreWeight;
     diffuseColor.rgb=mix(bed,mix(diffuseColor.rgb,surface,terrainMapsReady),shoreWeight);`;
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
// Build the coconut grove in three indexed meshes. Each palm keeps its own wind sample.
function islandGrove(T,land,terrain,center,textures){
 const trees=[[-12.5,-2.8,4.4],[-10,2.7,7.7],[-8.3,-4.1,8.7],[-7,1,5.9],[-7,5.7,6.8],
   [-4.6,-5,5.6],[-3.8,-.8,8.7],[-3.9,4.5,7.9],[-1.3,6.7,5.6],[-.4,2.6,6.9],
   [1,0,8.3],[2.7,4.8,9],[4.6,-3,6.2],[5.6,.9,7.5],[7.4,4.7,6.3],[9,1.2,8.6],
   [12,-2.4,5.5],[11.1,4.3,7.1]];
 let seed=2897;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const tau=2*Math.PI,palmTime={value:0},palmWind={value:trees.map(()=>new T.Vector2())};
 const makeBatch=()=>({positions:[],colors:[],flex:[],indices:[],uv:[]});
 const trunks=makeBatch(),fronds=makeBatch(),shrubs=makeBatch();
 function vertex(batch,p,color,tree,flex,tip,shade){
   const index=batch.positions.length/3;
   batch.positions.push(p.x,p.y,p.z);batch.colors.push(color.r*shade,color.g*shade,color.b*shade);
   batch.flex.push(tree,flex,tip);return index;
 }
 function blade(batch,base,tip,width,color,tree,flex){
   const middle=base.clone().lerp(tip,.5),d=tip.clone().sub(base);
   const across=new T.Vector3(-d.y,d.x,0).normalize().multiplyScalar(width);
   if(batch===shrubs){
     const start=vertex(batch,base,color,tree,flex,0,.78);
     batch.uv.push(0,0);
     for(const u of [.32,.67]){
       const p=base.clone().lerp(tip,u),span=Math.sin(Math.PI*u)**.64;
       for(const side of [-1,0,1]){
         const node=p.clone().addScaledVector(across,side*span);
         if(!side)node.z+=width*.30;
         vertex(batch,node,color,tree,flex,u,side?.89:1.04);
         batch.uv.push(u,side);
       }
     }
     vertex(batch,tip,color,tree,flex,1,.92);
     batch.uv.push(1,0);
     for(const index of [0,1,2,0,2,3,1,4,2,2,4,5,2,5,3,3,5,6,4,7,5,5,7,6])
       batch.indices.push(start+index);
     return;
   }
   const a=vertex(batch,base,color,tree,flex,.4,.70);
   vertex(batch,middle.clone().add(across),color,tree,flex,.75,.80);
   vertex(batch,middle.clone().sub(across),color,tree,flex,.75,.96);
   middle.z+=width*.38;
   vertex(batch,middle,color,tree,flex,.75,1.10);
   vertex(batch,tip,color,tree,flex,1,.91);
   batch.indices.push(a,a+1,a+3,a,a+3,a+2,a+3,a+1,a+4,a+3,a+4,a+2);
 }
 function bendPalm(shader){
   shader.uniforms.palmTime=palmTime;shader.uniforms.palmWind=palmWind;
   shader.vertexShader=`attribute vec3 palmBend;uniform float palmTime;uniform vec2 palmWind[${trees.length}];\n`+
     shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
       vec2 wind=palmWind[int(palmBend.x)];
       float speed=length(wind),bend=(1.-exp(-speed/11.))*palmBend.y*palmBend.y;
       vec2 direction=wind/max(.001,speed),across=vec2(-direction.y,direction.x);
       float phase=.89*palmTime+palmBend.x*2.;
       transformed.xy+=bend*(direction*(.48+.14*sin(phase))+.08*across*cos(phase));
       transformed.z+=bend*palmBend.z*.16*sin(2.6*palmTime+3.*palmBend.z+palmBend.x);`);
 }
 const bark=new T.Color(0xc3b3a0),oldLeaf=new T.Color(0xa6943b),newLeaf=new T.Color(0x83a841),matureLeaf=new T.Color(0x45682c);
 const up=new T.Vector3(0,0,1);
 for(const [i,[x,y,height]] of trees.entries()){
   const z=terrain(x,y)-.13;
   const lean=(i===0||i===16?.40:.09+.22*random())*height,az=random()*tau;
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
       blade(fronds,p,tip,.085*(1-.51*u)*(.84+.32*random()),shade,i,1);
     }
   }
 }
 const deepGreen=new T.Color(0x234426),brush=new T.Color(0x58773b);
 for(let i=0;i<155;i++){
   const a=random()*tau,r=Math.sqrt(random()),x=15*r*Math.cos(a),y=.8+8.5*r*Math.sin(a);
   const z=terrain(x,y);
   if(z<1.1+.48*Math.sin(.8*x+.3*y)||(y<-3.4&&x>1))continue;
   const height=.38+1.04*random();
   for(let branch=0;branch<8;branch++){
     const az=random()*tau,dx=Math.cos(az),dy=Math.sin(az),length=height*(.48+.62*random()),pitch=.32+.62*random();
     for(let leaf=0;leaf<6;leaf++){
       const u=(leaf+1)/6,flip=leaf%2?1:-1;
       const base=new T.Vector3(x+dx*u*length,y+dy*u*length,z+.08+height*(pitch*u+.21*Math.sin(Math.PI*u)));
       const tip=base.clone().add(new T.Vector3((dx*.23-dy*.26*flip)*height,(dy*.23+dx*.26*flip)*height,
         height*(.33*random()-.17)));
       const width=height*(.15+.11*random())*(1-.48*u);
       blade(shrubs,base,tip,width,deepGreen.clone().lerp(brush,.25+.67*random()),0,0);
     }
   }
 }
 for(const [name,batch,doubleSide,animated] of [
   ['Curved coconut trunks',trunks,false,true],['Coconut palm fronds',fronds,true,true],['Island understory',shrubs,true,false]
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
   }else if(batch===shrubs){
     geometry.setAttribute('leafUV',new T.Float32BufferAttribute(batch.uv,2));
     material.onBeforeCompile=islandLeafFinish;
   }
   if(animated){
     geometry.setAttribute('palmBend',new T.Float32BufferAttribute(flex,3));
     geometry.boundingSphere.radius+=.75;
     material.onBeforeCompile=bendPalm;
   }
   const mesh=new T.Mesh(geometry,material);mesh.name=name;land.add(mesh);
 }
 return (time,sampleWind)=>{
   palmTime.value=time;
   trees.forEach(([x,y],i)=>sampleWind(center[0]+x,center[1]+y,palmWind.value[i]));
 };
}

function coast(T,scene,instanceRocks=true){
 const land=new T.Group();scene.add(land);
 const center=[36,40],sand=new T.Color(0xdcc69d),wet=new T.Color(0xa29276),grass=new T.Color(0x687641),rock=new T.Color(0x827665);
 const geo=new T.PlaneGeometry(58,46,74,62),pos=geo.attributes.position,colors=[],cover=[];
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
   const x=pos.getX(i),y=pos.getY(i),z=terrain(x,y),canopy=islandCrownCover(x,y);
   pos.setZ(i,z);
   color.copy(wet).lerp(sand,smoothStep((z+.23)/.68))
     .lerp(grass,smoothStep((z-.72)/1.05))
     .multiplyScalar(1-.34*canopy);
   colors.push(color.r,color.g,color.b);cover.push(canopy);
 }
 geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 geo.setAttribute('crownCover',new T.Float32BufferAttribute(cover,1));geo.computeVertexNormals();
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
 land.userData.updatePalms=islandGrove(T,land,terrain,center,textures);
 // Seat the small stems and blades on the actual rendered triangles.
 function plantedHeight(x,y){
   const col=(x+29)*74/58,row=(23-y)*62/46;
   const i=Math.floor(col),j=Math.floor(row),u=col-i,v=row-j,a=75*j+i;
   return u+v<=1?(1-u-v)*pos.getZ(a)+u*pos.getZ(a+1)+v*pos.getZ(a+75)
     :(u+v-1)*pos.getZ(a+76)+(1-u)*pos.getZ(a+75)+(1-v)*pos.getZ(a+1);
 }
 islandForest(T,land,plantedHeight,textures);
 return land;
}
