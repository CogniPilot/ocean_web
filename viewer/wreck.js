// Ship coordinates: x runs stern to bow, z is perpendicular to the decks.
// The seabed is level; all other solids share the wreck's 78 degree list.
function makeWreck(T,materials){
 const group=new T.Group(),shape=new T.BoxGeometry();
 const list=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),78*Math.PI/180);
 function box(x,y,z,l,w,h,material,turn=0,ship=true){
   const m=new T.Mesh(shape,materials[material]);m.position.set(x,y,z);m.rotation.z=turn;
   if(ship){m.position.applyQuaternion(list);m.position.z-=9.8;m.quaternion.premultiply(list);}
   m.scale.set(l,w,h);group.add(m);
 }
 box(10,0,-14.2,180,140,1,'sand',0,false);
 // Longitudinal shell plates taper around the stem. A torn opening cuts the upper side.
 const stations=[[0,3.25],[3,3.65],[8,3.85],[19,3.85],[25,3.55],[29,2.55],[32,1.2],[34,.08]];
 for(let i=1;i<stations.length;i++){
   const [a,wa]=stations[i-1],[b,wb]=stations[i],x=(a+b)/2,w=(wa+wb)/2;
   for(const side of [-1,1]){
     const open=side===1 && i===3;
     box(x,side*w,open?-1.85:0,Math.hypot(b-a,wb-wa),.16,open?1.7:5.45,'iron',Math.atan2(side*(wb-wa),b-a));
   }
   box(x,0,-2.68,b-a,2*Math.min(wa,wb),.17,'iron');
   // Missing weather-deck plates leave an entry from the superstructure.
   if(i!==3)box(x,0,2.72,b-a,2*Math.min(wa,wb),.16,'deck');
   for(const side of [-1,1])box(x,side*w,3.12,Math.hypot(b-a,wb-wa),.055,.055,'rib',Math.atan2(side*(wb-wa),b-a));
 }
 // Three original deck levels. Full-height companionway openings connect them.
 for(const z of [-1.05,1.03]){
   for(const [a,b] of [[0,5],[8,16],[19,26],[28,30]])box((a+b)/2,0,z,b-a,6.1,.13,'deck');
   for(const x of [6.5,17.5,27])for(const side of [-1,1])box(x,side*2.35,z,x===27?2:3,1.4,.13,'deck');
 }
 // Doorways along the centreline and side cabins on each deck.
 for(const x of [5,12,20,27.8]){
   for(const side of [-1,1])box(x,side*2.33,0,.17,2.25,5.25,'iron');
   for(const z of [-1.05,1.03,2.55])box(x,0,z,.22,2.6,.18,'rib');
 }
 for(const side of [-1,1])for(const [a,b] of [[1,3],[8,11],[14,18],[22,25]]){
   box((a+b)/2,side*1.9,.04,b-a,.11,1.83,'iron');
   box(a,side*2.66,-.84,1.15,.62,.24,'wood');
 }
 for(let x=1;x<27;x+=2){
   for(const side of [-1,1]){
     box(x,side*3.55,0,.10,.18,5.36,'rib');
     box(x,side*3.48,2.92,.05,.05,.53,'rib');
   }
 }
 box(30,0,0,.17,4.2,5.35,'iron');
 // Bridge on the weather deck, with an open aft door and window ports.
 box(18,0,4.43,5.5,3.4,.14,'deck');
 for(const side of [-1,1]){
   box(18,side*1.62,3.08,5.4,.13,.71,'iron');
   for(let x=15.4;x<21;x+=1.3)box(x,side*1.62,3.93,.13,.14,.98,'rib');
 }
 box(20.66,0,3.55,.14,3.3,1.65,'iron');
 group.updateMatrixWorld(true);return group;
}
if(typeof module!=='undefined')module.exports=makeWreck;
