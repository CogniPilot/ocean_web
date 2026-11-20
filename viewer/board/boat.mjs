import {vehicleShell} from '../vehicle-assets.mjs';
import {loadInstance} from '../fmi3/instance.mjs';
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
export function observeBoat(model){
 const scalars=names=>names.split(' ').map(n=>model.get(n));
 const vertices=model.get('sailVertex');
 const [sf,sp,fa,fs]=['sailForward','sailPort','foilAxial','foilSide'].map(n=>model.get(n));
 // Preserve the existing telemetry layout. Sample the membrane at each strip.
 const sections=Array.from({length:10},(_,i)=>vertices[72*Math.floor(i/5)+12*(i%5)+7]);
 return [...scalars('east north heading heave heel pitch sheet rudder leg tack surge'),...sections,
   sf[0],sp[0],sf[1],sp[1],fa[0],fs[0],fa[1],fs[1],
   ...scalars('buoyancy vane navE navN courseEstimate speedE speedN cupSpeed p11 fixE fixN drumAngle payout'),...vertices,...model.get('sheetRotation'),...model.get('footX'),model.get('boomElevation')];
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
   for(let b=0;b<count;b++){
     const y0=1024*(1-luff[b]),y1=1024*(1-leech[b]);
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
 }
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
 return new T.MeshStandardMaterial({map:tex,roughness:.74,side:T.DoubleSide,transparent:cat,forceSinglePass:true});
}
export function sailboatMesh(T,cat=false,keelX=.06){
 const group=new T.Group();
 const paint=(c)=>new T.MeshStandardMaterial({color:c,roughness:.42,metalness:.12});
 const red=paint(0xca2526),white=paint(0xe3e5dd),black=paint(0x252c30);
 function mesh(geo,mat,parent=group){const m=new T.Mesh(geo,mat);parent.add(m);return m;}
 function rod(a,b,r,mat,parent=group){a=new T.Vector3(...a);b=new T.Vector3(...b);const d=b.clone().sub(a);const m=mesh(new T.CylinderGeometry(r,r,d.length(),10),mat,parent);m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return m;}
 let vane,drum,rudder,otherRudder,carriage,crossTiller;
 const deckCars=[],sheets=[];
 function sheetRope(color){
   const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(new Float32Array(9*3),3));
   const line=new T.Line(geometry,new T.LineBasicMaterial({color}));line.frustumCulled=false;group.add(line);return line;
 }
 function drawRope(line,from,to,sag){
   const v=line.geometry.attributes.position;
   for(let i=0;i<9;i++){
     const u=i/8;
     v.setXYZ(i,from.x+(to.x-from.x)*u,from.y+(to.y-from.y)*u,
       from.z+(to.z-from.z)*u-4*u*(1-u)*sag);
   }
   v.needsUpdate=true;
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
   group.add(vehicleShell('hobie-hulls'));
   for(const side of [-1,1]){
     const blade=new T.Group();group.add(blade);blade.position.set(-2.58,side*1.02,.16);
     mesh(foilShape,white,blade);
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
     rod([2.1,side*1.02,.29],[2.26,0,.75],.013,black);
     rod([-.52,side*1.02,.34],[.44,0,5.85],.009,black);
   }
   for(const x of [-1.4,.55])rod([x,-1.06,.41],[x,1.06,.41],.067,black);
   const tramp=mesh(new T.BoxGeometry(1.95,1.94,.028),paint(0x36454b));tramp.position.set(-.425,0,.40);
   for(const y of [-.87,.87])rod([-1.33,y,.44],[.48,y,.44],.014,black);
   carriage=mesh(new T.BoxGeometry(.34,.24,.16),new T.MeshStandardMaterial({color:0x17191a,roughness:.85,metalness:.08}));carriage.position.z=.52;
   rod([.44,0,.41],[.44,0,8.33],.043,black);
   rod([2.26,0,.75],[.44,0,5.85],.011,black);
   crossTiller=rod([-1.69,-1.02,.47],[-1.69,1.02,.47],.021,black);
   for(const x of [-1.4,.55])rod([x,-.94,.465],[x,.94,.465],.014,paint(0xbdc5c4));
   for(const x of [-1.4,.55,.55]){
     const car=mesh(new T.BoxGeometry(.095,.085,.075),black);car.position.set(x,0,.48);deckCars.push(car);
   }
   for(let i=0;i<10;i++)sheets.push(sheetRope(i<6?0xb63739:0x24768c));
 }else{
   sheets.push(sheetRope(0xad4045),sheetRope(0x2e7485));
 group.add(vehicleShell('sloop-hull'));
 const keel=mesh(new T.BoxGeometry(.28,.037,.64),black);keel.position.set(keelX,0,-.43);
 const bulb=mesh(new T.SphereGeometry(1,24,12),red);bulb.position.set(keelX,0,-.77);bulb.scale.set(.26,.075,.075);
 rudder=mesh(new T.BoxGeometry(.19,.026,.37),black);rudder.position.set(-.93,0,-.22);
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
   mesh(geo,sailMaterial(T,cat,index===0?8:4),pivot).frustumCulled=false;
   const boomHinge=new T.Group();pivot.add(boomHinge);
   if(!cat||index===0)rod([0,0,0],[-spec.width,0,0],.012,black,boomHinge);
   const vang=index===0?rod([0,0,-.115],[-.42,0,0],.005,black,pivot):null;
   return {pivot,geo,coords,boomHinge,vang};
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
   bracket.position.set(podX,0,podHeight-sideRadius-.022);
 }else shell=new T.SphereGeometry(podRadius,24,16);
 const pod=mesh(shell,cat?white:paint(0xffd14c));pod.position.set(podX,0,podHeight);
 const cameraPorts=[];
 for(let i=0;i<4;i++){
   const a=i*Math.PI/2,r=i%2?sideRadius:halfLength;
   const lens=mesh(new T.SphereGeometry(cat?.022:podRadius*.24,12,8),paint(0x18262e));
   lens.position.set(podX+r*Math.cos(a),r*Math.sin(a),podHeight);
   cameraPorts.push(lens.position.toArray());
 }
 if(vane)vane.position.z=podHeight+podRadius+.035;
 return {group,cameraPorts,update(s,ballast,cars,rope){
   if(vane)vane.rotation.z=s[30];if(drum)drum.rotation.y=s[40];
   if(otherRudder)otherRudder.rotation.z=-s[7];
   if(carriage && ballast)carriage.position.set(-.425+ballast[0],ballast[1],.52);
   group.position.set(s[0],s[1],s[3]);group.rotation.set(s[4],s[5],s[2],'ZYX');rudder.rotation.z=-s[7];
   sails.forEach(({pivot,geo,coords,boomHinge,vang},m)=>{
     const r=42+2*24*3+m*9;
     sheetMatrix.set(s[r],s[r+1],s[r+2],0,s[r+3],s[r+4],s[r+5],0,s[r+6],s[r+7],s[r+8],0,0,0,0,1);
     pivot.quaternion.setFromRotationMatrix(sheetMatrix);
     pivot.position.x=s[42+2*24*3+18+m];
     if(m===0)boomHinge.rotation.y=s[206];
     if(vang){
       const elevation=s[206];boomHinge.rotation.y=elevation;
       const line=new T.Vector3(-.42*Math.cos(elevation),0,.115+.42*Math.sin(elevation));
       vang.scale.y=line.length()/Math.hypot(.42,.115);
       vang.position.set(line.x/2,0,-.115+line.z/2);
       vang.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),line.normalize());
     }
     for(let i=0;i<24;i++){
       const offset=42+m*72+i*3;
       coords.setXYZ(i,s[offset],s[offset+1],s[offset+2]);
     }
     coords.needsUpdate=true;geo.computeVertexNormals();
   });
   if(cars){
     crossTiller.position.set(-2.58+.89*Math.cos(s[7]),-.89*Math.sin(s[7]),.47);
     deckCars[0].position.y=cars[0];deckCars[1].position.y=cars[1];deckCars[2].position.y=-cars[1];
     // Attachment positions in the hull frame. The front clew follows the actual cloth.
     const top=new T.Vector3(-1.84*Math.cos(s[206]),0,1.84*Math.sin(s[206])).applyQuaternion(sails[0].pivot.quaternion).add(sails[0].pivot.position);
     const jib=new T.Vector3().fromBufferAttribute(sails[1].coords,3).applyQuaternion(sails[1].pivot.quaternion).add(sails[1].pivot.position);
     for(let i=0;i<sheets.length;i++){
       const main=i<6,car=deckCars[main?0:i<8?1:2];
       const offset=(main?i-2.5:i%2-.5)*.014;
       const start=car.position.clone(),end=(main?top:jib).clone();start.x+=offset;end.x+=offset;
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
