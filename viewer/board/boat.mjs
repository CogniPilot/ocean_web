import {vehicleShell} from '../vehicle-assets.mjs';
import {showInLowWaterCapture} from '../render-layers.mjs';
import {hobieTrampoline} from './trampoline.mjs';
import {loadInstance} from '../fmi3/instance.mjs?api=2';
export function advanceHullWake(model,wake){
  for(const name of ['east','north','heading','surge','sway','sectionVolume'])wake.set(name,model.get(name));
  wake.set('hullHeel',model.get('heel'));
  wake.set('hullPitch',model.get('pitch'));
  wake.advance(.05);
  // Applying the radiated height back to immersion counts displaced water twice.
  // The horizontal wave-making pressure reaction acts on the generating hull.
  model.set('wakeEast',wake.get('waveForceEast'));
  model.set('wakeNorth',wake.get('waveForceNorth'));
  model.set('wakeYaw',wake.get('waveYaw'));
}
export function elevation(frame,x,y){
 const wrap=n=>(n%32+32)%32;
 const u=x/2,v=y/2,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
 const at=(ix,iy)=>frame.tile[wrap(iy)*32+wrap(ix)];
 return frame.tide+(1-a)*(1-b)*at(i,j)+a*(1-b)*at(i+1,j)+(1-a)*b*at(i,j+1)+a*b*at(i+1,j+1);
}
const poseFields=['east','north','heading','heave','heel','pitch','sheet','rudder'];
const navFields=['buoyancy','vane','navE','navN','courseEstimate','speedE','speedN','cupSpeed','p11','fixE','fixN','drumAngle','payout'];
export const boatFields=['sailVertex','sailForward','sailPort','foilAxial','foilSide','sheetRotation','footX','boomElevation','surge',...poseFields,...navFields];
export function observeBoat(model){
 const [vertices,sf,sp,fa,fs,rotation,foot,elevation,surge,...poseAndNav]=model.getMany(boatFields);
 // Preserve the telemetry and multiplayer packet layout, including the two integer states.
 const sections=Array.from({length:10},(_,i)=>vertices[72*Math.floor(i/5)+12*(i%5)+7]);
 return [...poseAndNav.slice(0,poseFields.length),model.get('leg'),model.get('tack'),surge,...sections,
   sf[0],sp[0],sf[1],sp[1],fa[0],fs[0],fa[1],fs[1],
   ...poseAndNav.slice(poseFields.length),...vertices,...rotation,...foot,elevation];
}
export async function loadBoat(read=fetch){
 const ports=['windEast','windNorth','currentEast','currentNorth','waveHeight','waveRoll','wavePitch','orbitalEast','orbitalNorth','orbitalUp'];
 const model=await loadInstance('Sailboat',{windEast:10,windNorth:4},read);
 let state=observeBoat(model);
 return {get state(){return state;},advance(env,helm={enabled:false,rudder:0,trim:0}){
   ports.forEach((name,i)=>model.set(name,env[i]));
   model.set('manualHelm',Number(helm.enabled));model.set('rudderInput',helm.rudder);model.set('trimInput',helm.trim);
   for(let i=0;i<20;i++)model.advance(.01);
   state=observeBoat(model);
 }};
}
function sailMaterial(T,cat,count){
 const c=document.createElement('canvas');c.width=512;c.height=1024;
 let pocketRelief;
 const g=c.getContext('2d');g.fillStyle='#e9edef';g.fillRect(0,0,512,1024);
 g.fillStyle='#20282c';g.beginPath();g.moveTo(0,0);g.lineTo(512,0);g.lineTo(512,660);g.lineTo(0,805);g.fill();
 for(let i=0;i<7;i++){const y=150+i*66;g.fillStyle=i%2?'#d82e32':'#f04838';g.beginPath();g.moveTo(0,y);g.lineTo(512,y-170);g.lineTo(512,y-165+i*4);g.lineTo(0,y+12+i*2);g.fill();}
 g.strokeStyle='rgba(110,125,130,.45)';g.lineWidth=2;for(let y=80;y<1024;y+=104){g.beginPath();g.moveTo(0,y);g.lineTo(512,y+28);g.stroke();}
 if(cat){
   const classic=new URLSearchParams(location.search).get('sails')!=='modern';
   const luff=count===4?[.18,.38,.55,.73]:[.075,.185,.285,.395,.49,.575,.705,.80];
   const leech=count===4?luff:[.095,.205,.31,.42,.53,.605,.76,.90];
   const colors=classic?['#da2729','#da2729','#da2729','#fb5d18','#fb5d18','#ffca32','#ffca32','#ffca32','#ffca32']:
     ['#949397','#eeeae5','#ecebe8','#c5d833','#cadc36','#c9db37','#98989d','#f1efeb','#f5f1eb'];
   for(let i=0;i<=count;i++){
     const lower=i===0?0:luff[i-1],upper=i===count?1:luff[i];
     const tailLow=i===0?0:leech[i-1],tailHigh=i===count?1:leech[i];
     g.fillStyle=count===4?(classic?['#da2729','#da2729','#fb5d18','#fb5d18','#ffca32'][i]:'#cadb37'):colors[i];
     g.beginPath();g.moveTo(0,1024*(1-lower));g.lineTo(512,1024*(1-tailLow));
     g.lineTo(512,1024*(1-tailHigh));g.lineTo(0,1024*(1-upper));g.fill();
   }
   // The vinyl inspection windows sit below the lowest batten on both sails.
   g.clearRect(110,963,124,34);g.fillStyle='rgba(155,184,185,.28)';g.fillRect(110,963,124,34);
   g.strokeStyle='#d8d6cb';g.lineWidth=3;g.strokeRect(110,963,124,34);
   const relief=document.createElement('canvas');relief.width=256;relief.height=512;
   const height=relief.getContext('2d');height.fillStyle='#808080';height.fillRect(0,0,256,512);
   for(let b=0;b<count;b++){
     const y0=1024*(1-luff[b]),y1=1024*(1-leech[b]);
     for(const [width,gray] of [[4,146],[2.8,171],[1.5,193]]){
       height.strokeStyle='rgb('+gray+' '+gray+' '+gray+')';height.lineWidth=width;
       height.beginPath();height.moveTo(0,y0/2);height.lineTo(256,y1/2);height.stroke();
     }
     function pocket(color,width,offset=0){
       g.strokeStyle=color;g.lineWidth=width;g.beginPath();
       g.moveTo(0,y0+offset);g.lineTo(512,y1+offset);g.stroke();
     }
     // Shallow relief of a sewn cloth pocket over the fiberglass.
     pocket('rgba(55,31,19,.12)',5);
     pocket('rgba(255,232,179,.22)',1.4,-2);
     pocket('rgba(55,31,19,.22)',1,2);
     g.fillStyle='rgba(53,42,36,.5)';g.fillRect(508,y1-2,4,4);
   }
   pocketRelief=new T.CanvasTexture(relief);
 }
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
 return new T.MeshStandardMaterial({map:tex,bumpMap:pocketRelief??null,bumpScale:.001,roughness:.74,side:T.DoubleSide,transparent:cat,forceSinglePass:true});
}
// Bake the small fixed fittings by material so each swivel moves as one unit.
function deckHardware(T,traveler=false){
 const group=new T.Group(),batches=new Map();
 function part(g,color,metal,x=0,y=0,z=0){
   g.translate(x,y,z);
   if(!batches.has(color))batches.set(color,{positions:[],normals:[],metal});
   const batch=batches.get(color),p=g.attributes.position,n=g.attributes.normal;
   for(let i=0;i<(g.index?.count??p.count);i++){
     const j=g.index?g.index.getX(i):i;
     batch.positions.push(p.getX(j),p.getY(j),p.getZ(j));
     batch.normals.push(n.getX(j),n.getY(j),n.getZ(j));
   }
   g.dispose();
 }
 const dark=0x242a30,steel=0xacb7bb,wheel=0x41494b,rope=0xc65845;
 function pin(x,y,z,r,length){
   const g=new T.CylinderGeometry(r,r,length,12);g.rotateZ(Math.PI/2);part(g,steel,.65,x,y,z);
 }
 function eye(x,y,z,r,tube){
   const g=new T.TorusGeometry(r,tube,6,16);g.rotateY(Math.PI/2);part(g,steel,.65,x,y,z);
 }
 if(traveler){
   const deck=new T.Shape();
   deck.moveTo(-.042,-.038);deck.quadraticCurveTo(-.040,-.062,-.018,-.061);
   deck.lineTo(.035,-.031);deck.quadraticCurveTo(.062,0,.035,.031);
   deck.lineTo(-.018,.061);deck.quadraticCurveTo(-.040,.062,-.042,.038);deck.closePath();
   part(new T.ExtrudeGeometry(deck,{depth:.005,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:1}),steel,.48);
   for(const y of [-.036,.036]){
     const cam=new T.Shape();
     for(let j=0;j<=36;j++){
       const a=j*Math.PI/18,teeth=Math.sin(a)*Math.sign(y)<-.25;
       const r=.022*(teeth&&j%2?.87:1);
       const x=r*Math.cos(a),v=r*Math.sin(a);
       if(!j)cam.moveTo(x,v);else cam.lineTo(x,v);
     }
     part(new T.ExtrudeGeometry(cam,{depth:.023,bevelEnabled:true,bevelSize:.0018,bevelThickness:.002,bevelSegments:1}),dark,.12,-.023,y,.009);
     part(new T.CylinderGeometry(.009,.009,.003,10).rotateX(Math.PI/2),steel,.50,-.023,y,.035);
   }
   part(new T.CylinderGeometry(.027,.027,.025,16).rotateX(Math.PI/2),wheel,.15,.031,0,.026);
   eye(.026,0,.05,.021,.004);
 }else{
   const outline=new T.Shape();
   outline.moveTo(-.010,-.024);outline.quadraticCurveTo(0,-.029,.010,-.024);
   outline.lineTo(.022,.001);outline.absarc(0,.004,.022,-.14,Math.PI+.14,false);outline.closePath();
   const hole=new T.Path();hole.absellipse(0,-.010,.006,.009,0,2*Math.PI,true,0);outline.holes.push(hole);
   for(const y of [-.011,.011]){
     const slot=new T.Path();slot.absellipse(y,.0005,.0027,.007,0,2*Math.PI,true,y>0?.24:-.24);outline.holes.push(slot);
   }
   for(const x of [-.024,-.008,.008,.024]){
     const plate=new T.ExtrudeGeometry(outline,{depth:.002,bevelEnabled:true,bevelThickness:.0006,bevelSize:.00065,bevelSegments:1,curveSegments:8});
     // Map profile XY onto YZ, leaving extrusion along the axle.
     plate.rotateX(Math.PI/2);plate.rotateZ(Math.PI/2);
     part(plate,dark,.14,x-.0015,0,.034);
   }
   for(const x of [-.016,0,.016]){
     part(new T.CylinderGeometry(.019,.019,.012,16).rotateZ(Math.PI/2),wheel,.14,x,0,.038);
     const wrap=new T.TorusGeometry(.019,.0038,6,16,Math.PI);
     wrap.rotateZ(Math.PI);wrap.rotateX(Math.PI/2);wrap.rotateZ(Math.PI/2);
     part(wrap,rope,.04,x,0,.038);
   }
   pin(0,0,.038,.006,.054);pin(0,0,.013,.003,.055);
   for(const x of [-.028,.028]){
     const inset=new T.TorusGeometry(.010,.0013,5,16);inset.rotateY(Math.PI/2);part(inset,wheel,.14,x,0,.038);
   }
   eye(0,0,.005,.010,.0027);
 }
 for(const [color,{positions,normals,metal}] of batches){
   const g=new T.BufferGeometry();
   g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
   g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
   group.add(new T.Mesh(g,new T.MeshStandardMaterial({color,metalness:metal,roughness:metal>.5?.31:.63})));
 }
 // Beyond four metres the axle pins and cheek cutouts occupy a few pixels.
 // Keep the outline and rope attachment locations for the orbit and optical cameras.
 batches.clear();
 if(traveler){
   part(new T.BoxGeometry(.096,.105,.008),steel,.48,.003,0,.004);
   for(const y of [-.036,.036]){
     part(new T.CylinderGeometry(.023,.023,.029,8).rotateX(Math.PI/2),dark,.12,-.023,y,.021);
   }
   part(new T.CylinderGeometry(.027,.027,.025,8).rotateX(Math.PI/2),wheel,.15,.031,0,.026);
 }else{
   part(new T.CylinderGeometry(.025,.025,.052,10).rotateZ(Math.PI/2),dark,.14,0,0,.034);
   pin(0,0,.038,.006,.055);
 }
 const farGeometry=new T.BufferGeometry(),positions=[],normals=[],colors=[];
 for(const [tint,batch] of batches){
   positions.push(...batch.positions);normals.push(...batch.normals);
   const rgb=new T.Color(tint);
   for(let i=0;i<batch.positions.length;i+=3)colors.push(rgb.r,rgb.g,rgb.b);
 }
 for(const [name,data] of [['position',positions],['normal',normals],['color',colors]])
   farGeometry.setAttribute(name,new T.Float32BufferAttribute(data,3));
 const silhouette=new T.Mesh(farGeometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.60,metalness:.18}));
 const lod=new T.LOD();
 lod.addLevel(group,0);lod.addLevel(silhouette,4,.1);
 return lod;
}

// A single vertex-coloured mesh keeps the moving deck ballast to one draw call.
function ballastCooler(T){
 const position=[],normal=[],color=[];
 function add(geometry,tint){
   const g=geometry.index?geometry.toNonIndexed():geometry;
   const rgb=new T.Color(tint);
   position.push(...g.attributes.position.array);
   normal.push(...g.attributes.normal.array);
   for(let i=0;i<g.attributes.position.count;i++)color.push(rgb.r,rgb.g,rgb.b);
   if(g!==geometry)g.dispose();
   geometry.dispose();
 }
 function rounded(width,depth,r){
   const contour=new T.Shape(),x=width/2,y=depth/2;
   contour.moveTo(-x+r,-y);contour.lineTo(x-r,-y);contour.quadraticCurveTo(x,-y,x,-y+r);
   contour.lineTo(x,y-r);contour.quadraticCurveTo(x,y,x-r,y);
   contour.lineTo(-x+r,y);contour.quadraticCurveTo(-x,y,-x,y-r);
   contour.lineTo(-x,-y+r);contour.quadraticCurveTo(-x,-y,-x+r,-y);
   return contour;
 }
 function molding(contour,base,height,bevel,tint){
   const g=new T.ExtrudeGeometry(contour,{depth:height,curveSegments:4,bevelEnabled:true,
     bevelSegments:2,bevelThickness:bevel,bevelSize:bevel});
   add(g.translate(0,0,base),tint);
 }
 molding(rounded(.41,.25,.03),-.098,.176,.009,0x096587);
 molding(rounded(.415,.255,.03),.077,.023,.005,0xeaf0e9);
 const lid=rounded(.411,.253,.031);
 for(const x of [-.148,.148]){
   const hole=new T.Path();hole.absarc(x,.065,.028,0,2*Math.PI,true);
   lid.holes.push(hole);
   add(new T.CircleGeometry(.029,24).translate(x,.065,.103),0x737b7c);
 }
 molding(lid,.102,.022,.004,0xa8ada9);
 for(const sign of [-1,1]){
   const outline=rounded(.112,.080,.012);
   const hole=new T.Path();hole.moveTo(-.039,-.023);hole.lineTo(-.039,.03);
   hole.lineTo(.039,.03);hole.lineTo(.039,-.023);hole.closePath();outline.holes.push(hole);
   const grip=new T.ExtrudeGeometry(outline,{depth:.005,bevelThickness:.002,bevelSize:.002,bevelSegments:1,curveSegments:3});
   grip.rotateX(Math.PI/2);grip.rotateZ(sign*Math.PI/2);
   add(grip.translate(sign*.216,0,.038),0xdde2dd);
 }
 const g=new T.BufferGeometry();
 for(const [key,data] of [['position',position],['normal',normal],['color',color]])
   g.setAttribute(key,new T.Float32BufferAttribute(data,3));
 const cooler=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:.68}));
 cooler.name='Deck ballast cooler';
 return cooler;
}

export function sailboatMesh(T,cat=false,keelX=.06){
 const group=new T.Group();
 const paint=(c)=>new T.MeshStandardMaterial({color:c,roughness:.42,metalness:.12});
 const red=paint(0xca2526),white=paint(0xe3e5dd),black=paint(0x252c30);
 function mesh(geo,mat,parent=group){const m=new T.Mesh(geo,mat);parent.add(m);return m;}
 function rod(a,b,r,mat,parent=group){a=new T.Vector3(...a);b=new T.Vector3(...b);const d=b.clone().sub(a);const m=mesh(new T.CylinderGeometry(r,r,d.length(),10),mat,parent);m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return m;}
 let vane,drum,rudder,otherRudder,carriage,crossTiller;
 let jibHalyard;
 const deckCars=[],sheets=[],sheetBlocks=[],podParts=[],streamers=[],staySegments=[[],[],[]];
 let mastGeometry,mastRest,mastWeights;
 const braids=new Map();
 function braidedCover(color){
   if(braids.has(color))return braids.get(color);
   const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
   const ctx=canvas.getContext('2d');ctx.fillStyle=color===0xc65845?'#e9dfc9':'#303834';ctx.fillRect(0,0,64,64);
   ctx.strokeStyle=color===0xc65845?'#ae4336':'#b2c859';ctx.lineWidth=4;ctx.lineCap='round';
   for(let x=-16;x<=72;x+=16)for(let y=-16;y<80;y+=16){
     const start=x+(Math.abs(y/16)%2)*8;
     ctx.beginPath();ctx.moveTo(start,y);ctx.lineTo(start+4,y+7);ctx.stroke();
     ctx.beginPath();ctx.moveTo(start+8,y+8);ctx.lineTo(start+5,y+13);ctx.stroke();
   }
   const braid=new T.CanvasTexture(canvas);braid.colorSpace=T.SRGBColorSpace;
   braid.wrapS=braid.wrapT=T.RepeatWrapping;braids.set(color,braid);return braid;
 }
 const ropeSides=6,ropeRings=9;
 const circle=Array.from({length:ropeSides},(_,i)=>[Math.cos(i*2*Math.PI/ropeSides),Math.sin(i*2*Math.PI/ropeSides)]);
 const stayUp=new T.Vector3(0,1,0);
 const side=new T.Vector3(),tangent=new T.Vector3(),binormal=new T.Vector3();
 function sheetRope(color){
   const geometry=new T.BufferGeometry(),faces=[];
   for(const name of ['position','normal']){
     geometry.setAttribute(name,new T.BufferAttribute(new Float32Array(3*ropeRings*ropeSides),3).setUsage(T.DynamicDrawUsage));
   }
   for(let i=0;i<ropeRings-1;i++)for(let j=0;j<ropeSides;j++){
     const a=i*ropeSides+j,b=i*ropeSides+(j+1)%ropeSides;
     faces.push(a,b,b+ropeSides,a,b+ropeSides,a+ropeSides);
   }
   geometry.setIndex(faces);
   if(cat)geometry.setAttribute('uv',new T.BufferAttribute(new Float32Array(ropeSides*ropeRings*2),2));
   const rope=mesh(geometry,new T.MeshStandardMaterial({color:cat?0xffffff:color,
     map:cat?braidedCover(color):null,roughness:.94}));
   rope.frustumCulled=false;
   return rope;
 }
 function drawRope(rope,from,to,sag){
   const {position,normal}=rope.geometry.attributes;
   const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,radius=cat ? .004 : .002;
   const repeats=Math.hypot(dx,dy,dz)/.065;
   side.set(-dy,dx,0);
   if(side.lengthSq()<1e-16)side.set(1,0,0);else side.normalize();
   for(let i=0;i<ropeRings;i++){
     const u=i/(ropeRings-1),x=from.x+dx*u,y=from.y+dy*u,z=from.z+dz*u-4*u*(1-u)*sag;
     tangent.set(dx,dy,dz-4*(1-2*u)*sag).normalize();
     binormal.crossVectors(tangent,side);
     for(let j=0;j<ropeSides;j++){
       const [c,s]=circle[j],k=i*ropeSides+j;
       const nx=c*side.x+s*binormal.x,ny=c*side.y+s*binormal.y,nz=s*binormal.z;
       normal.setXYZ(k,nx,ny,nz);
       if(rope.geometry.attributes.uv)rope.geometry.attributes.uv.setXY(k,j/ropeSides,u*repeats);
       position.setXYZ(k,x+radius*nx,y+radius*ny,z+radius*nz);
     }
   }
   position.needsUpdate=true;normal.needsUpdate=true;
   if(rope.geometry.attributes.uv)rope.geometry.attributes.uv.needsUpdate=true;
 }
 if(cat){
   // Loft the white blades through progressively narrower foil sections.
   const sections=[[.10,-.06,.13],[.05,-.04,.20],[-.12,-.025,.25],[-.32,-.045,.26],
     [-.49,-.072,.23],[-.62,-.10,.18],[-.68,-.127,.12],[-.705,-.158,.057],[-.712,-.18,.011]];
   const vertices=[],faces=[],ring=24;
   for(const [height,leadingEdge,chord] of sections){
     for(let j=0;j<ring;j++){
       const angle=2*Math.PI*j/ring,u=(1-Math.cos(angle))/2;
       const thickness=.60*(.2969*Math.sqrt(u)-.126*u-.3516*u*u+.2843*u**3-.1036*u**4);
       vertices.push(leadingEdge-chord*u,Math.sign(Math.sin(angle))*chord*thickness,height);
     }
   }
   for(let i=0;i<sections.length-1;i++)for(let j=0;j<ring;j++){
     const a=i*ring+j,b=i*ring+(j+1)%ring;
     faces.push(a,b+ring,b,a,a+ring,b+ring);
   }
   for(let j=1;j<ring-1;j++){
     const end=(sections.length-1)*ring;
     faces.push(0,j,j+1,end,end+j+1,end+j);
   }
   const foilShape=new T.BufferGeometry();
   foilShape.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
   foilShape.setIndex(faces);foilShape.computeVertexNormals();
   const pin=paint(0xa7afb2);
   function installStay(index,anchor){
     const head=[.44,0,5.85],mid=head.map((x,i)=>(x+anchor[i])/2);
     for(const [a,b] of [[anchor,mid],[mid,head]]){
       const segment=rod(a,b,.003,pin);
       staySegments[index].push(segment);
     }
   }
   const hulls=vehicleShell('hobie-hulls');
   hulls.traverse(showInLowWaterCapture);
   group.add(hulls);
   for(const side of [-1,1]){
     const blade=new T.Group();group.add(blade);blade.position.set(-2.58,side*1.02,.16);
     showInLowWaterCapture(mesh(foilShape,white,blade));
     for(const y of [-.025,.025]){
       rod([-.18,y,.08],[-.035,y,.13],.027,black,blade);
       rod([-.035,y,.13],[-.018,y,-.045],.024,black,blade);
       rod([-.018,y,-.045],[-.18,y,.08],.022,black,blade);
     }
     rod([-.15,-.06,.072],[-.15,.06,.072],.017,pin,blade);
     rod([0,0,-.05],[0,0,.145],.018,pin,blade);
     rod([-.16,0,.09],[-.13,0,.24],.027,black,blade);
     rod([-.13,0,.24],[.89,0,.31],.023,black,blade);
     if(side===1)rudder=blade;else otherRudder=blade;
     // Terminal loft station of Shore.pontoon: 4 mm half-beam, .463 m sheer.
     const bowEye=[2.555,side*(1.02-.004),.463];
     rod([2.548,side*1.02,.452],bowEye,.004,pin);
     const bridle=rod(bowEye,[2.29,0,.65],.003,pin);
     bridle.name=side===1?'Port bow bridle':'Starboard bow bridle';
     installStay(side===1?0:1,[-.52,side*1.02,.34]);
     // Woven tape, 42.5 cm long and 15 mm wide, with a square-cut free end.
     // A slight twist keeps both edges legible when seen from the helm.
     const ribbon=new T.BufferGeometry(),vertices=[],indices=[];
     for(let j=0;j<=12;j++){
       const t=j/12,twist=1.25*Math.sin(1.5*Math.PI*t);
       const w=.0075*Math.min(1,.45+8*t);
       const fold=.007*t*Math.sin(2*Math.PI*t),hem=.009*t*t*Math.sin(2.5*Math.PI*t);
       for(const edge of [-1,1])vertices.push(.425*t,fold+w*edge*Math.sin(twist),hem+w*edge*Math.cos(twist));
       if(j>0){const i=2*j;indices.push(i-2,i-1,i,i-1,i+1,i);}
     }
     ribbon.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
     ribbon.setIndex(indices);
     ribbon.computeVertexNormals();
     const yarn=mesh(ribbon,new T.MeshStandardMaterial({color:side===1?0xf94748:0x67ee85,roughness:.95,side:T.DoubleSide}));
     yarn.position.set(-.52+.28*.96,side*1.02*.72,.34+.28*5.51);
     yarn.visible=false;streamers[side===1?0:1]=yarn;
   }
   for(const x of [-1.4,.55])rod([x,-1.06,.41],[x,1.06,.41],.067,black);
   group.add(hobieTrampoline(T));
   for(const y of [-.87,.87])rod([-1.33,y,.44],[.48,y,.44],.014,black);
   carriage=ballastCooler(T);group.add(carriage);carriage.position.set(-.425,0,.52);
   mastGeometry=new T.CylinderGeometry(.043,.043,7.92,10,32);
   mastGeometry.rotateX(Math.PI/2);mastGeometry.translate(.44,0,4.37);
   mesh(mastGeometry,black);
   const positions=mastGeometry.attributes.position;
   mastRest=positions.clone();
   // This interpolates the six luff nodes reported by the cloth FMU.
   mastWeights=Array.from({length:positions.count},(_,i)=>Math.min(5,Math.max(0,(positions.getZ(i)-.97)*5/7.15)));
   const lower=deckHardware(T),upper=lower.clone();upper.scale.z=-1;
   lower.name='Mainsheet lower triple block';upper.name='Mainsheet upper triple block';
   const cleat=deckHardware(T,true);cleat.scale.setScalar(.52);cleat.position.set(.027,.006,.021);lower.add(cleat);
   group.add(lower,upper);sheetBlocks.push(lower,upper);
   rod([2.29,0,.65],[2.26,0,.75],.009,pin);
   installStay(2,[2.26,0,.75]);
   jibHalyard=rod([0,0,0],[0,1,0],.004,paint(0xe7c85c));
   jibHalyard.name="Jib head halyard";
   crossTiller=rod([-1.69,-1.02,.47],[-1.69,1.02,.47],.021,black);
   for(const x of [-1.4,.55])rod([x,-.94,.465],[x,.94,.465],.014,paint(0xbdc5c4));
   for(const x of [-1.4,.55,.55]){
     const jibCar=x>0;
     const car=mesh(jibCar?new T.BoxGeometry(.070,.055,.028):new T.BoxGeometry(.095,.085,.075),black);
     car.position.set(x,0,jibCar?.482:.48);deckCars.push(car);
     if(x<0)rod([-.028,0,.04],[.028,0,.04],.004,pin,car);
     if(x>0){const fairlead=deckHardware(T,true);fairlead.name='Jib traveler fairlead and cam cleat';fairlead.scale.setScalar(.60);fairlead.position.z=.014;car.add(fairlead);}
   }
   for(let i=0;i<10;i++)sheets.push(sheetRope(i<6?0xc65845:0x24768c));
 }else{
   sheets.push(sheetRope(0xad4045),sheetRope(0x2e7485));
 const hull=vehicleShell('sloop-hull');
 hull.traverse(showInLowWaterCapture);
 group.add(hull);
 const keel=mesh(new T.BoxGeometry(.28,.037,.64),black);keel.position.set(keelX,0,-.43);
 const bulb=mesh(new T.SphereGeometry(1,24,12),red);bulb.position.set(keelX,0,-.77);bulb.scale.set(.26,.075,.075);
 rudder=showInLowWaterCapture(mesh(new T.BoxGeometry(.19,.026,.37),black));rudder.position.set(-.93,0,-.22);
 function block(x,y,z,l,w,h,material){
   const m=mesh(new T.BoxGeometry(l,w,h),material);m.position.set(x,y,z);return m;
 }
 // Raised hatch with a clear lid, visible drum, electronics and tie rods.
 const tray=paint(0xa79a75),alloy=paint(0xa3abb0);
 block(-.27,0,.087,.75,.41,.018,black);block(-.27,0,.101,.70,.37,.012,tray);
 block(-.37,.08,.12,.19,.095,.032,black);block(-.2,.07,.125,.09,.08,.033,alloy);
 drum=mesh(new T.CylinderGeometry(.064,.064,.04,20),black);drum.rotation.x=Math.PI/2;drum.position.set(-.16,-.09,.13);
 for(const y of [-.18,.18])rod([-.62,y,.137],[.07,y,.137],.007,alloy);
 const glass=new T.MeshPhysicalMaterial({color:0xaacbd1,transparent:true,opacity:.28,roughness:.12,metalness:.1,depthWrite:false});
 block(-.27,0,.154,.74,.40,.009,glass);
 for(const x of [-.64,.10])for(const y of [-.20,.20])block(x,y,.16,.025,.025,.045,black);
 for(const y of [-.15,.15])rod([-.84,y,.085],[-.62,y,.14],.003,alloy);
 const vaneMount=paint(0xfbc833);vane=new T.Group();group.add(vane);vane.position.set(.12,0,2.95);
 rod([.12,0,2.75],[.12,0,2.95],.012,black);
 rod([-.20,0,0],[.25,0,0],.009,vaneMount,vane);
 const flag=new T.BufferGeometry();
 flag.setAttribute('position',new T.Float32BufferAttribute([-.20,0,0,-.07,0,0,-.18,0,.105,-.20,0,0,-.18,0,.105,-.29,0,.105],3));
 flag.computeVertexNormals();vaneMount.side=T.DoubleSide;mesh(flag,vaneMount,vane);
 rod([.12,0,.08],[.12,0,2.85],.014,black);
 for(const [x,y,z] of [[1.16,0,.09],[-1.06,0,.09],[-.05,.31,.09],[-.05,-.31,.09]])rod([x,y,z],[.12,0,2.78],.0028,black);
 }
 const sheetMatrix=new T.Matrix4();
 const vangReach=.42,vangDrop=.115;
 const sails=(cat?[{width:2.78,z:.97},{width:1.98,z:.75}]:[{width:1.28,z:.19},{width:.60,z:.19}]).map((spec,index)=>{
   const pivot=new T.Group();pivot.position.z=spec.z;group.add(pivot);
   const geo=new T.BufferGeometry();
   const coords=new T.Float32BufferAttribute(new Float32Array(24*3),3);
   const uv=[],idx=[];
   for(let row=0;row<6;row++)for(let col=0;col<4;col++){
     uv.push(col/3,row/5);
     const i=row*4+col;
     if(row<5&&col<3)idx.push(i,i+1,i+5,i,i+5,i+4);
   }
   geo.setAttribute('position',coords);geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);
   showInLowWaterCapture(mesh(geo,sailMaterial(T,cat,index===0?8:4),pivot)).frustumCulled=false;
   const boomHinge=new T.Group();pivot.add(boomHinge);
   if(!cat||index===0)rod([0,0,0],[-spec.width,0,0],.012,black,boomHinge);
   const vang=!cat&&index===0?rod([0,0,-vangDrop],[-vangReach,0,0],.005,black,pivot):null;
   const downhaul=[];
   if(cat && index===0){
     const line=paint(0x9c282a);
     for(const y of [-.009,0,.009]){
       downhaul.push(rod([-.055,y,-.38],[-.055,y,-.03],.0028,line,pivot));
     }
     rod([-.055,-.014,-.38],[-.055,.014,-.38],.012,black,pivot);
     rod([-.055,-.014,-.03],[-.055,.014,-.03],.013,black,boomHinge);
   }
   const tufts=[];
   if(cat){
     for(let k=0;k<4;k++){
       const tuft=streamers[k%2].clone();
       tuft.scale.set(.52,.55,.6);tuft.name=(index?'Jib':'Main')+' face telltale '+k;
       pivot.add(tuft);tufts.push(tuft);
     }
   }
   return {pivot,geo,coords,boomHinge,vang,downhaul,tufts};
 });
 const podRadius=cat?.17:.075,podHeight=cat?8.44:3.02,podX=cat?.44:.12;
 const halfLength=cat?.29:podRadius;
 const sideRadius=cat?Math.sqrt(podRadius**3/halfLength):podRadius;
 let shell;
 if(cat){
   const profile=Array.from({length:33},(_,i)=>{
     const u=i/16-1;
     return new T.Vector2(sideRadius*(1+u)*Math.sqrt(1-u),halfLength*u);
   });
   shell=new T.LatheGeometry(profile,32);shell.rotateZ(-Math.PI/2);
   const bracket=mesh(new T.BoxGeometry(.095,.06,.115),paint(0x76838b));
   podParts.push(bracket);bracket.position.set(podX,0,podHeight-sideRadius-.022);
 }else shell=new T.SphereGeometry(podRadius,24,16);
 const pod=mesh(shell,cat?white:paint(0xffd14c));podParts.push(pod);pod.position.set(podX,0,podHeight);
 const cameraPorts=[];
 for(let i=0;i<4;i++){
   const a=i*Math.PI/2,r=i%2?sideRadius:halfLength;
   const lens=mesh(new T.SphereGeometry(cat?.022:podRadius*.24,12,8),paint(0x18262e));
   lens.position.set(podX+r*Math.cos(a),r*Math.sin(a),podHeight);
   podParts.push(lens);cameraPorts.push(lens.position.toArray());
 }
 if(vane)vane.position.z=podHeight+podRadius+.035;
 return {group,cameraPorts,update(s,ballast,cars,rope,tails,faceTails,stayPath){
   if(stayPath){
     for(let i=0;i<3;i++){
       const a=side.fromArray(stayPath,9*i);
       for(let j=0;j<2;j++){
         const b=binormal.fromArray(stayPath,9*i+3*(j+1));
         const segment=staySegments[i][j],direction=tangent.subVectors(b,a);
         segment.position.copy(a).lerp(b,.5);
         segment.scale.y=direction.length()/segment.geometry.parameters.height;
         segment.quaternion.setFromUnitVectors(stayUp,direction.normalize());
         if(i<2 && j===0)streamers[i].position.copy(a).lerp(b,.56);
         a.copy(b);
       }
     }
   }
   for(let i=0;i<streamers.length;i++){
     streamers[i].visible=Boolean(tails);
     if(tails)streamers[i].quaternion.setFromUnitVectors(tangent.set(1,0,0),side.fromArray(tails,3*i).normalize());
   }
   if(vane)vane.rotation.z=s[30];if(drum)drum.rotation.y=s[40];
   if(otherRudder)otherRudder.rotation.z=-s[7];
   if(carriage && ballast)carriage.position.set(-.425+ballast[0],ballast[1],.52);
   group.position.set(s[0],s[1],s[3]);group.rotation.set(s[4],s[5],s[2],'ZYX');rudder.rotation.z=-s[7];
   sails.forEach(({pivot,geo,coords,boomHinge,vang,downhaul,tufts},m)=>{
     const r=42+2*24*3+m*9;
     sheetMatrix.set(s[r],s[r+1],s[r+2],0,s[r+3],s[r+4],s[r+5],0,s[r+6],s[r+7],s[r+8],0,0,0,0,1);
     pivot.quaternion.setFromRotationMatrix(sheetMatrix);
     pivot.position.x=s[42+2*24*3+18+m];
     if(m===0){
       boomHinge.rotation.y=s[206];
       boomHinge.position.z=cat?s[44]:0;
       for(const line of downhaul){
         line.position.z=(-.41+boomHinge.position.z)/2;
         line.scale.y=(.35+boomHinge.position.z)/.35;
       }
     }
     if(vang){
       const elevation=s[206];boomHinge.rotation.y=elevation;
       const line=new T.Vector3(-vangReach*Math.cos(elevation),0,vangDrop+vangReach*Math.sin(elevation));
       vang.scale.y=line.length()/Math.hypot(vangReach,vangDrop);
       vang.position.set(line.x/2,0,-vangDrop+line.z/2);
       vang.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),line.normalize());
     }
     for(let i=0;i<24;i++){
       const offset=42+m*72+i*3;
       coords.setXYZ(i,s[offset],s[offset+1],s[offset+2]);
     }
     if(m===1 && jibHalyard && stayPath){
       const head=side.fromBufferAttribute(coords,20).applyQuaternion(pivot.quaternion).add(pivot.position);
       const tang=binormal.fromArray(stayPath,24);
       head.y+=.012;
       tang.y+=.012;
       tangent.subVectors(tang,head);
       jibHalyard.position.copy(head).lerp(tang,.5);
       jibHalyard.scale.y=tangent.length();
       jibHalyard.quaternion.setFromUnitVectors(stayUp,tangent.normalize());
     }
     coords.needsUpdate=true;geo.computeVertexNormals();
     for(let k=0;k<tufts.length;k++){
       const tuft=tufts[k];tuft.visible=Boolean(faceTails);if(!faceTails)continue;
       const j=k<2?4:12;
       const a=new T.Vector3().fromBufferAttribute(coords,j);
       const chord=new T.Vector3().fromBufferAttribute(coords,j+1).sub(a);
       const span=new T.Vector3().fromBufferAttribute(coords,j+5).sub(a).sub(chord);
       const n=new T.Vector3().crossVectors(chord,span).normalize();
       tuft.position.copy(a).addScaledVector(chord,.7).addScaledVector(span,k%2?.22:.18)
         .addScaledVector(n,k%2?-.012:.012);
       tuft.quaternion.setFromUnitVectors(tangent.set(1,0,0),side.fromArray(faceTails,m*12+k*3).normalize());
     }
   });
   if(mastGeometry){
     const main=sails[0],nodes=main.coords;
     const bend=Array.from({length:6},(_,r)=>s[186]*nodes.getX(4*r)+s[187]*nodes.getY(4*r));
     const lateral=Array.from({length:6},(_,r)=>s[189]*nodes.getX(4*r)+s[190]*nodes.getY(4*r));
     const pos=mastGeometry.attributes.position;
     for(let i=0;i<pos.count;i++){
       const w=mastWeights[i],lo=Math.floor(w),hi=Math.min(5,lo+1);
       pos.setX(i,mastRest.getX(i)+bend[lo]+(w-lo)*(bend[hi]-bend[lo]));
       pos.setY(i,mastRest.getY(i)+lateral[lo]+(w-lo)*(lateral[hi]-lateral[lo]));
     }
     pos.needsUpdate=true;
     const dx=podX+bend[5]-pod.position.x;
     const dy=lateral[5]-pod.position.y;
     for(const part of podParts){part.position.x+=dx;part.position.y+=dy;}
     for(const port of cameraPorts){port[0]+=dx;port[1]+=dy;}
   }
   if(cars){
     crossTiller.position.set(-2.58+.89*Math.cos(s[7]),-.89*Math.sin(s[7]),.47);
     deckCars[0].position.y=cars[0];deckCars[1].position.y=cars[1];deckCars[2].position.y=-cars[1];
     // Attachment positions in the hull frame. The front clew follows the actual cloth.
     const top=new T.Vector3(-1.84*Math.cos(s[206]),0,1.84*Math.sin(s[206])+sails[0].boomHinge.position.z).applyQuaternion(sails[0].pivot.quaternion).add(sails[0].pivot.position);
     const lowerBlock=deckCars[0].position.clone();lowerBlock.z+=.04;
     const axis=new T.Vector3().subVectors(top,lowerBlock).normalize();
     sheetBlocks.forEach((block,i)=>{
       block.position.copy(i?top:lowerBlock);
       block.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),axis);
     });
     const jib=new T.Vector3().fromBufferAttribute(sails[1].coords,3).applyQuaternion(sails[1].pivot.quaternion).add(sails[1].pivot.position);
     for(let i=0;i<sheets.length;i++){
       const main=i<6,car=deckCars[main?0:i<8?1:2];
       const offset=(i%2-.5)*.014;
       let start,end;
       if(main){
         const x=(Math.floor(i/2)-1)*.016,y=(i%2?1:-1)*.019;
         start=new T.Vector3(x,y,.038).applyQuaternion(sheetBlocks[0].quaternion).add(lowerBlock);
         end=new T.Vector3(x,y,-.038).applyQuaternion(sheetBlocks[1].quaternion).add(top);
       }else{
         start=car.position.clone();start.x+=.026*.60+offset*.60;start.z+=.014+.05*.60;
         end=jib.clone();end.x+=offset;
       }
       drawRope(sheets[i],start,end,rope?rope[main?0:i<8?1:2]:0);
     }
   }else if(rope){
     for(let m=0;m<2;m++){
       const x=sails[m].pivot.position.x,z=sails[m].pivot.position.z;
       const r=m===0?.44:.60,e=m===0?s[206]:0;
       const start=new T.Vector3(x-r,0,z-.105);
       const end=new T.Vector3(-r*Math.cos(e),0,r*Math.sin(e)).applyQuaternion(sails[m].pivot.quaternion).add(sails[m].pivot.position);
       drawRope(sheets[m],start,end,rope[m]);
     }
   }
 }};
}
