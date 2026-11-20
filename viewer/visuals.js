// Pack static solids sharing a material into one draw call. Sensors retain individual boxes.
function batchScenery(T,group){
 const byMaterial=new Map();
 for(const part of [...group.children]){
   if(!part.isMesh)continue;
   part.updateMatrix();
   let batch=byMaterial.get(part.material);
   if(!batch){batch={position:[],normal:[],color:[]};byMaterial.set(part.material,batch);}
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
const causticTime={value:0};
function seabedMaterials(T){
 function textured(base,kind){
   const m=new T.MeshStandardMaterial({color:0xffffff,roughness:.86,metalness:kind==='metal'?.22:0});
   m.onBeforeCompile=s=>{
     s.vertexShader='varying vec3 location;\n'+s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nlocation=(modelMatrix*vec4(transformed,1.)).xyz;');
     s.uniforms.causticTime=causticTime;
     s.fragmentShader='uniform float causticTime;varying vec3 location;\n'+skyGLSL.slice(skyGLSL.indexOf('float hash'),skyGLSL.indexOf('vec3 skyColor'))+s.fragmentShader;
     const code=kind==='sand'?`vec2 p=location.xy;float ridge=sin(6.*p.x+2.4*sin(p.y*.81)+cloud(p*.7)*5.); diffuseColor.rgb=vec3(.26,.31,.27)*(.65+.12*ridge+.53*cloud(p*2.));`:
     `vec2 p=vec2(location.x+.34*location.y,location.z+.25*location.y);float oxidation=cloud(p*vec2(.75,.38))+.16*noise2(p*vec2(7.,1.2));vec3 brown=vec3(.35,.125,.046);diffuseColor.rgb=mix(vec3(${base}),brown,smoothstep(.43,.69,oxidation))*(.63+.47*noise2(p*43.));`;
     s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+code+'\nfloat rays=sin(location.x*2.9+sin(location.y*2.7+causticTime*.7))+sin(location.y*2.6+.65*cos(location.x*3.4-causticTime*.58));diffuseColor.rgb*=.83+.56*pow(1.-smoothstep(.02,.32,abs(rays)),2.);');
   };
   m.customProgramCacheKey=()=>kind+base;return m;
 }
 return {iron:textured('.18,.25,.24','metal'),deck:textured('.20,.23,.19','metal'),rib:textured('.26,.28,.23','metal'),wood:textured('.35,.20,.085','wood'),sand:textured('','sand'),dark:new T.MeshStandardMaterial({color:0x172927})};
}
function marineLife(T,scene){
 const fish=new T.Group();scene.add(fish);
 const visitors=oceanVisitors(T,scene);
 let swimmers=[];
 const ready=fetch('assets/fish.json').then(r=>r.json()).then(asset=>{
   const geo=fishGeometry(T,asset);
   const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.08,side:T.DoubleSide});
   for(let i=0;i<34;i++){const f=new T.Mesh(geo,mat);f.scale.setScalar(.68+.4*Math.abs(Math.sin(i)));fish.add(f);}
   swimmers=fish.children;
 });
 let seed=992;function random(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
 const dust=new Float32Array(1500*3);
 for(let i=0;i<dust.length;i+=3){dust[i]=random()*58-14;dust[i+1]=random()*30-15;dust[i+2]=-13+random()*11;}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(dust,3));
 const motes=new T.Points(geo,new T.PointsMaterial({size:.022,color:0x9ddddc,transparent:true,opacity:.45}));scene.add(motes);
 return t=>{
   visitors(t);
   swimmers.forEach((f,i)=>{const cycle=(t*6+i)%8,k=Math.floor(cycle);f.morphTargetInfluences.fill(0);f.morphTargetInfluences[k]=1-(cycle-k);f.morphTargetInfluences[(k+1)%8]=cycle-k;const a=t*.11+i*.17;f.position.set(-1+4*Math.sin(a)+.8*Math.sin(i*11),-3.8+1.9*Math.cos(a)+.67*Math.cos(i*2),-9.4+.8*Math.sin(i*3.2)+.18*Math.sin(t*.9+i));f.rotation.z=Math.atan2(-1.9*Math.sin(a),4*Math.cos(a))+.07*Math.sin(t*6+i);});
   motes.position.set(.35*Math.sin(t*.23),.15*Math.sin(t*.18),.14*Math.cos(t*.12));
 };
}
function coast(T,scene){
 const land=new T.Group();scene.add(land); const center=[36,40],sand=new T.Color(0xc7ad7c),grass=new T.Color(0x566745),rock=new T.Color(0x827665);
 const geo=new T.PlaneGeometry(58,46,74,62),pos=geo.attributes.position,colors=[];
 function terrain(x,y){const r=Math.hypot(x/17,y/11);return 3.6-4.2*r*r+.34*Math.sin(x*.64)*Math.cos(y*.55)+.37*Math.cos(.34*x-.51*y);}
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=terrain(x,y);pos.setZ(i,z);const c=sand.clone().lerp(grass,Math.min(1,Math.max(0,(z-1.1)*.8))).multiplyScalar(.92+.07*Math.cos(x*2+y));colors.push(c.r,c.g,c.b);}
 geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
 const island=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.96}));land.add(island);land.position.set(...center,0);
 let seed=13;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<46;i++){const a=random()*6.28,r=.84+.25*random(),x=17*r*Math.cos(a),y=11*r*Math.sin(a);
   const m=new T.Mesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({color:rock.clone().multiplyScalar(.65+.45*random()),flatShading:true}));
   m.scale.set(1+random()*1.5,.7+random(),.65+random());m.position.set(x,y,terrain(x,y));m.rotation.set(random(),random(),random()*6);land.add(m);}
 const bark=new T.MeshStandardMaterial({color:0x71634a}),leaf=new T.MeshStandardMaterial({color:0x4e7349,side:T.DoubleSide});
 for(let i=0;i<9;i++){
   const x=(random()-.5)*18,y=(random()-.5)*12,z=terrain(x,y),h=2.9+random()*2.4;
   const trunk=new T.Mesh(new T.CylinderGeometry(.10,.20,h,8),bark);trunk.rotation.x=Math.PI/2+.13;trunk.position.set(x,y,z+h/2);land.add(trunk);
   for(let j=0;j<8;j++){
     const a=j*.785+random()*.3,vertices=[],indices=[];
     for(let b=0;b<=10;b++){const u=b/10,l=2.3*u,w=.29*Math.sin(Math.PI*u)*(b%2?.65:1);
       for(const side of [-1,1])vertices.push(x+l*Math.cos(a)-side*w*Math.sin(a),y-.13*h+l*Math.sin(a)+side*w*Math.cos(a),z+h+.7*Math.sin(Math.PI*u)-u*u);
       if(b)indices.push(2*b-2,2*b-1,2*b,2*b,2*b-1,2*b+1);}
     const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();land.add(new T.Mesh(g,leaf));}
 }
 const blades=[],indices=[];
 for(let i=0;i<200;i++){
   const x=random()*48-14,y=random()*25-12;
   if(x>=0 && x<=30 && Math.abs(y)<4.4)continue;
   for(let j=0;j<10;j++){const bx=x+random()*.45,by=y+random()*.45,h=.15+.7*random(),n=blades.length/3;
     blades.push(bx-.035,by,-13.7,bx+.035,by,-13.7,bx+.10,by+.05,-13.7+h*.55,bx+.17,by+.06,-13.7+h);indices.push(n,n+1,n+2,n+1,n+3,n+2);}
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(blades,3));g.setIndex(indices);g.computeVertexNormals();
 scene.add(new T.Mesh(g,new T.MeshStandardMaterial({color:0x42624c,side:T.DoubleSide})));
 batchScenery(T,land);return land;
}
