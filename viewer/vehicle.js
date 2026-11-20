function surveyVehicle(T){
 const sub=new T.Group();
 const mat=(color,metalness=.3,roughness=.54)=>new T.MeshStandardMaterial({color,metalness,roughness});
 const frame=mat(0x60747b),rubber=mat(0x182324),tube=mat(0x47545a,.16),bolt=mat(0xa6b6b5,.7),yellow=mat(0xe3aa3e);
 const rotors=[];sub.userData.rotors=rotors;
 const blades=mat(0x8c9c9e,.52,.35);
 const cube=new T.BoxGeometry(),sphere=new T.SphereGeometry(1,28,16);
 function part(geometry,material,pos,scale){
   const m=new T.Mesh(geometry,material);m.position.set(...pos);m.scale.set(...scale);sub.add(m);return m;
 }
 function cylinder(x,y,z,r,l,axis,m){
   const shape=part(new T.CylinderGeometry(r,r,l,32),m,[x,y,z],[1,1,1]);
   if(axis==='x')shape.rotation.z=Math.PI/2;
   if(axis==='z')shape.rotation.x=Math.PI/2;
   return shape;
 }
 cylinder(0,0,.1,.17,1.05,'x',tube);
 part(sphere,mat(0x80b8c8,.26,.12),[.52,0,.1],[.15,.168,.168]);
 for(const x of [-.5,-.26,.22,.49]) cylinder(x,0,.1,.178,.033,'x',rubber);
 for(const y of [-.23,.23]){
   part(cube,frame,[0,y,-.007],[1.22,.023,.105]);
   part(cube,frame,[0,y,-.172],[1.22,.023,.034]);
   for(const x of [-.47,.24,.53])part(cube,frame,[x,y,-.11],[.13,.023,.14]);
   for(const x of [-.51,.47])cylinder(x,0,-.161,.014,.48,'y',bolt);
   for(const x of [-.52,-.23,.22,.52])part(sphere,bolt,[x,y*1.06,-.05],[.013,.009,.013]);
   for(const x of [-.42,.38]){
     const shroud=part(new T.TorusGeometry(.092,.017,10,28),rubber,[x,y*1.5,-.02],[1,1,1]);
     const id=2+(x<0?2:0)+(y<0?1:0);
     rotors[id]=makeRotor(T,sub,id,[x,y*1.5,-.02],[0,0,1],blades,tube);
   }
   const duct=part(new T.TorusGeometry(.10,.019,12,30),rubber,[-.15,y*1.53,-.06],[1,1,1]);duct.rotation.y=Math.PI/2;
   const id=y>0?0:1;
   rotors[id]=makeRotor(T,sub,id,[-.15,y*1.53,-.06],[1,0,0],blades,tube);
   const cable=new T.CatmullRomCurve3([[-.51,y,.14],[-.55,y*1.32,.13],[-.38,y*1.4,.06],[.29,y*1.3,.07],[.38,y*1.5,-.02]].map(p=>new T.Vector3(...p)));
   part(new T.TubeGeometry(cable,32,.008,6,false),yellow,[0,0,0],[1,1,1]);
   cylinder(.05,y*.68,.258,.013,1.05,'x',bolt);
   part(cube,yellow,[.06,y*.5,.282],[.65,.16,.045]);
   const lamp=new T.MeshStandardMaterial({color:0xbbe6ff,emissive:0xb9efff,emissiveIntensity:3});
   part(sphere,lamp,[.57,y,-.035],[.015,.034,.034]);
 }
 const cross=part(new T.TorusGeometry(.092,.014,10,28),rubber,[0,0,-.14],[1,1,1]);cross.rotation.x=Math.PI/2;
 rotors[6]=makeRotor(T,sub,6,[0,0,-.14],[0,1,0],blades,tube);
 const light=new T.SpotLight(0xc8f0ff,45,18,.55,.38,1.3);
 light.position.set(.65,0,0);light.target.position.set(8,0,0);sub.add(light,light.target);
 sub.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});return sub;
}
