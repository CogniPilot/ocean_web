import {sailTelltale} from './sail-telltale.mjs';
import {battenTexturePaths,clothTopology,sailPanelTexture,sailTopology} from './sail-battens.mjs';
import {vehicleShell} from '../vehicle-assets.mjs';
import {showInLowWaterCapture} from '../render-layers.mjs';
import {hobieTrampoline,forwardBeam} from './trampoline.mjs';
import {loadInstance} from '../fmi3/instance.mjs?api=3';
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
const mastStationHeights=[.443,.97,2.442,3.914,5.386,6.858,8.33,8.44];
export const sailingRigFields=['mastStations','mainGooseneck','mainBlockPins'];
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
function sailclothLighting(shader){
 shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   // The transparent inspection windows are smoother than woven polyester.
   float fabricCoverage = smoothstep( 0.43, 0.92, diffuseColor.a );
   roughnessFactor = mix( 0.23, roughnessFactor, fabricCoverage );`);
}

function sailStitches(context,path,width,height){
 context.beginPath();
 let distance=0,remaining=0;
 for(let segment=1;segment<path.length;segment++){
   const [u,v]=path[segment-1],x=u*width,y=v*height;
   const dx=path[segment][0]*width-x,dy=path[segment][1]*height-y;
   const length=Math.hypot(dx,dy);
   if(length<.01)continue;
   const alongX=dx/length,alongY=dy/length;
   for(;remaining<length;remaining+=3){
     const offset=distance%2===0?1.5:4.1;
     const a=x+remaining*alongX-offset*alongY,b=y+remaining*alongY+offset*alongX;
     if(distance++===0)context.moveTo(a,b);
     else context.lineTo(a,b);
   }
   remaining-=length;
 }
 context.strokeStyle='rgba(255,241,225,.45)';
 context.lineWidth=.86;
 context.stroke();
}

function sailMaterial(T,cat,sail,telltaleRows,panelTexture,numbers){
 const c=document.createElement('canvas');c.width=512;c.height=1024;
 let pocketRelief;
 const g=c.getContext('2d');g.fillStyle='#e9edef';g.fillRect(0,0,512,1024);
 g.fillStyle='#20282c';g.beginPath();g.moveTo(0,0);g.lineTo(512,0);g.lineTo(512,660);g.lineTo(0,805);g.fill();
 for(let i=0;i<7;i++){const y=150+i*66;g.fillStyle=i%2?'#d82e32':'#f04838';g.beginPath();g.moveTo(0,y);g.lineTo(512,y-170);g.lineTo(512,y-165+i*4);g.lineTo(0,y+12+i*2);g.fill();}
 g.strokeStyle='rgba(110,125,130,.45)';g.lineWidth=2;for(let y=80;y<1024;y+=104){g.beginPath();g.moveTo(0,y);g.lineTo(512,y+28);g.stroke();}
 if(cat){
   const classic=new URLSearchParams(location.search).get('sails')!=='modern';
   const colors=classic?(sail===0?
     ['#da2729','#da2729','#da2729','#fb5d18','#fb5d18','#ffca32','#ffca32','#ffca32','#ffca32']:
     ['#da2729','#da2729','#fb5d18','#fb5d18','#ffca32']):
     Array.from({length:sail===0?9:5},(_,i)=>['#3ca726','#f6f7f7','#04a9c7','#cfdf00'][i%4]);
   const pockets=panelTexture?.pockets??battenTexturePaths(sail);
   const panels=[[[0,1],[1,1]],...pockets];
   // Upper panels cover the preceding fill so antialiased seam edges do not leave gaps.
   for(let i=0;i<colors.length;i++){
     const [start,...lower]=panels[i];
     g.fillStyle=colors[i];g.beginPath();g.moveTo(512*start[0],1024*start[1]);
     for(const [u,v] of lower)g.lineTo(512*u,1024*v);
     g.lineTo(512,0);g.lineTo(0,0);g.closePath();g.fill();
   }
   // Uneven yarn tension and finishing leave subtle variation across a panel.
   const finish=g.createLinearGradient(0,0,512,290);
   finish.addColorStop(0,'rgba(37,29,21,.075)');
   finish.addColorStop(.26,'rgba(37,29,21,0)');
   finish.addColorStop(.72,'rgba(37,29,21,.016)');
   finish.addColorStop(1,'rgba(37,29,21,.060)');
   g.fillStyle=finish;g.fillRect(0,0,512,1024);
   g.fillStyle='rgba(52,39,31,.21)';
   g.fillRect(0,0,7,1024);g.fillRect(508,0,4,1024);g.fillRect(0,1018,512,6);
   // Tinted inspection windows make the ribbon on the far face visible.
   const tabs=panelTexture?.telltaleTabs??telltaleRows.map(row=>1-(row+.48)/5);
   for(const v of tabs){
     const x=.20*512,y=v*1024;
     g.beginPath();g.moveTo(x+6,y);g.lineTo(x+55,y-13);g.lineTo(x+55,y+13);g.closePath();
     g.save();g.clip();g.clearRect(x+4,y-16,54,32);g.restore();
     g.fillStyle='rgba(52,86,105,.56)';g.fill();
     g.strokeStyle='#4b5260';g.lineWidth=3;g.stroke();
     g.beginPath();g.arc(x,y,4.2,0,2*Math.PI);g.fillStyle='#7d6a51';g.fill();
   }
   // The vinyl inspection windows sit below the lowest batten on both sails.
   g.clearRect(110,963,124,34);g.fillStyle='rgba(155,184,185,.28)';g.fillRect(110,963,124,34);
   g.strokeStyle='#d8d6cb';g.lineWidth=3;g.strokeRect(110,963,124,34);
   const relief=document.createElement('canvas');relief.width=256;relief.height=512;
   const height=relief.getContext('2d'),weave=height.createImageData(256,512);
   const yarn=[-.80,.15,.75,.15],over=[1,.80,-1,-.80];
   for(let y=0;y<weave.height;y++)for(let x=0;x<weave.width;x++){
     const k=4*(y*weave.width+x);
     const warp=yarn[x%4]*(1+.32*over[Math.floor(y/2)%4]);
     const weft=yarn[y%4]*(1+.32*over[Math.floor(x/2+2)%4]);
     const raised=128+6.5*(warp+weft);
     weave.data[k]=weave.data[k+1]=weave.data[k+2]=raised;
     weave.data[k+3]=255;
   }
   height.putImageData(weave,0,0);
   for(const path of pockets){
     function trace(context,sx,sy,offset=0){
       const [first,...rest]=path;
       context.beginPath();context.moveTo(first[0]*sx,first[1]*sy+offset);
       for(const [u,v] of rest)context.lineTo(u*sx,v*sy+offset);
       context.stroke();
     }
     for(const [width,gray] of [[4,146],[2.8,171],[1.5,193]]){
       height.strokeStyle='rgb('+gray+' '+gray+' '+gray+')';height.lineWidth=width;
       trace(height,256,512);
     }
     function pocket(color,width,offset=0){
       g.strokeStyle=color;g.lineWidth=width;trace(g,512,1024,offset);
     }
     // Shallow relief of a sewn cloth pocket over the fiberglass.
     if(!classic)pocket('rgba(248,250,250,.93)',7);
     pocket('rgba(55,31,19,.12)',5);
     pocket('rgba(255,232,179,.22)',1.4,-2);
     pocket('rgba(55,31,19,.22)',1,2);
     sailStitches(g,path,512,1024);
     const y1=1024*path.at(-1)[1];
     g.fillStyle='rgba(53,42,36,.5)';g.fillRect(508,y1-2,4,4);
   }
   pocketRelief=new T.CanvasTexture(relief);pocketRelief.anisotropy=4;
 }
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
 if(!cat)return new T.MeshStandardMaterial({map:tex,roughness:.74,side:T.DoubleSide,forceSinglePass:true});
 tex.anisotropy=4;
 const material=new T.MeshPhysicalMaterial({name:'Woven sailcloth and vinyl windows',map:tex,bumpMap:pocketRelief,bumpScale:.001,
   roughness:.46,clearcoat:.22,clearcoatRoughness:.36,sheen:.20,sheenColor:0xcfc3b7,
   sheenRoughness:.58,side:T.DoubleSide,transparent:true,forceSinglePass:true});
 material.onBeforeCompile=shader=>{
   sailclothLighting(shader);
   shader.uniforms.hobieNumber={value:numbers};
   const [left,bottom,width,height]=sail===0?['.49','.249','.44','.065']:['.40','.230','.44','.097'];
   shader.fragmentShader='uniform sampler2D hobieNumber;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
     vec2 printUV=(vMapUv-vec2(${left},${bottom}))/vec2(${width},${height});
     if(all(greaterThanEqual(printUV,vec2(0.)))&&all(lessThanEqual(printUV,vec2(1.)))){
       printUV.x=gl_FrontFacing?printUV.x:1.-printUV.x;
       float ink=texture2D(hobieNumber,printUV).a;
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.013,.016,.018),ink);
     }`);
 };
 material.customProgramCacheKey=()=>`hobie-race-number-${sail}`;
 return material;
}

let bowNumberTemplate;
function bowNumbers(T,hulls){
 if(!bowNumberTemplate){
   hulls.updateMatrixWorld(true);
   const ray=new T.Raycaster(),positions=[],uvs=[],faces=[],columns=10,rows=6;
   for(const side of [-1,1]){
     const base=positions.length/3;
     for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
       const u=column/columns,v=row/rows,x=1.72+side*(.5-u)*.47,z=-.105+.207*v;
       ray.set(new T.Vector3(x,side*1.55,z),new T.Vector3(0,-side,0));
       const hit=ray.intersectObject(hulls,true).find(h=>Math.abs(h.point.y)>.9);
       positions.push(x,hit?hit.point.y+side*.003:side*1.02,z);
       uvs.push(u,v);
       if(row&&column){
         const d=base+row*(columns+1)+column,a=d-columns-2;
         faces.push(a,a+1,d,a,d,d-1);
       }
     }
   }
   bowNumberTemplate=new T.BufferGeometry();
   bowNumberTemplate.setAttribute('position',new T.Float32BufferAttribute(positions,3));
   bowNumberTemplate.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
   bowNumberTemplate.setIndex(faces);bowNumberTemplate.computeVertexNormals();
 }
 return bowNumberTemplate.clone();
}
const mainSheaveSpacing=.018,mainSheaveInset=.033,mainSheetTurn=.0255;
const camEyeX=.026,camEyeZ=.05,camExitX=-.056,camExitZ=.042;
const mainOutletY=.097,mainOutletDrop=.017;
const deckCleatScale=.60;
const defaultTravelerMounts=[-1.3546,0,.499,-1.378,0,.495,-1.427,0,.493,-1.469,0,.434];
// Bake the small fixed fittings by material so each swivel moves as one unit.
function deckHardware(T,traveler=false,blockFace=.1475,withCleat=false){
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
 const dark=0x242a30,steel=0xacb7bb,wheel=0x41494b,rope=0xcfbd9c;
 const axleHeight=blockFace-mainSheaveInset, sheaveRadius=.029;
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
   eye(camEyeX,0,camEyeZ,.021,.004);
 }else{
   const outline=new T.Shape();
   const neck=.037-axleHeight;
   outline.moveTo(-.016,neck);outline.quadraticCurveTo(0,neck-.008,.016,neck);
   outline.lineTo(.031,-.005);outline.absarc(0,0,.031,-.16,Math.PI+.16,false);outline.closePath();
   const slot=new T.Path();
   slot.moveTo(-.010,neck+.014);slot.lineTo(-.015,-.022);slot.lineTo(.015,-.022);
   slot.lineTo(.010,neck+.014);slot.closePath();outline.holes.push(slot);
   const bearing=new T.Path();bearing.absarc(0,0,.0125,0,2*Math.PI,true);outline.holes.push(bearing);
   for(const x of [-.027,-.009,.009,.027]){
     const plate=new T.ExtrudeGeometry(outline,{depth:.0028,bevelEnabled:true,bevelThickness:.001,bevelSize:.001,bevelSegments:1,curveSegments:10});
     // Map profile XY onto YZ, leaving extrusion along the axle.
     plate.rotateX(Math.PI/2);plate.rotateZ(Math.PI/2);
     part(plate,dark,.14,x-.0015,0,axleHeight);
   }
   const profile=[[.009,-.007],[.027,-.007],[sheaveRadius,-.005],[sheaveRadius,-.004],
     [.024,-.001],[.024,.001],[sheaveRadius,.004],[sheaveRadius,.005],[.027,.007],[.009,.007]]
     .map(([r,x])=>new T.Vector2(r,x));
   for(const x of [-mainSheaveSpacing,0,mainSheaveSpacing]){
     part(new T.LatheGeometry(profile,20).rotateZ(-Math.PI/2),wheel,.14,x,0,axleHeight);
     const leadToCleat=withCleat&&x>0;
     const wrap=new T.TorusGeometry(mainSheetTurn,.0038,6,16,leadToCleat?Math.PI/2:Math.PI);
     wrap.rotateZ(Math.PI);wrap.rotateX(Math.PI/2);wrap.rotateZ(Math.PI/2);
     part(wrap,rope,.04,x,0,axleHeight);
   }
   pin(0,0,axleHeight,.008,.060);pin(0,0,.037,.0035,.059);
   part(new T.CylinderGeometry(.012,.008,.020,12).rotateX(Math.PI/2),steel,.65,0,0,.024);
   for(const x of [-.030,.030]){
     const inset=new T.TorusGeometry(.0118,.0013,5,16);inset.rotateY(Math.PI/2);part(inset,wheel,.14,x,0,axleHeight);
     for(const y of [-.010,.010])pin(x,y,.042,.0028,.003);
   }
   eye(0,0,.010,.0078,.0022);
   if(withCleat){
     // Two curved cheeks carry the integral cam cleat off the sheave axle.
     const arm=new T.Shape();
     arm.moveTo(-.014,.013);arm.quadraticCurveTo(.007,.025,.025,.011);
     arm.quadraticCurveTo(.041,-.021,.068,-.020);arm.lineTo(.071,-.032);
     arm.quadraticCurveTo(.035,-.035,.016,-.012);arm.quadraticCurveTo(0,-.010,-.014,-.008);arm.closePath();
     for(const x of [-.022,.022]){
       const cheek=new T.ExtrudeGeometry(arm,{depth:.005,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:1,curveSegments:6});
       part(cheek.rotateX(Math.PI/2).rotateZ(Math.PI/2),dark,.14,x,0,axleHeight);
     }
     part(new T.BoxGeometry(.052,.034,.006),dark,.14,0,.062,axleHeight-.027);
     for(const sign of [-1,1]){
       const jaw=new T.Shape();
       for(let i=0;i<28;i++){
         const a=i*2*Math.PI/28,tooth=Math.cos(a)*sign<-.35&&i%2;
         const x=(tooth ? .010 : .0135)*Math.cos(a),y=.014*Math.sin(a);
         if(i===0)jaw.moveTo(x,y);else jaw.lineTo(x,y);
       }
       jaw.closePath();
       part(new T.ExtrudeGeometry(jaw,{depth:.012,bevelEnabled:true,bevelSize:.0012,bevelThickness:.0014,bevelSegments:1}),dark,.14,sign*.015,.064,axleHeight-.022);
       part(new T.CylinderGeometry(.004,.004,.002,10).rotateX(Math.PI/2),steel,.65,sign*.015,.064,axleHeight-.008);
     }
     const bail=new T.TorusGeometry(.013,.0024,6,14,Math.PI);
     part(bail.rotateX(Math.PI/2),steel,.65,0,.077,axleHeight-.022);
     eye(-mainSheaveSpacing,mainSheetTurn,axleHeight-.036,.005,.0018);
     const tail=[[mainSheaveSpacing,0,axleHeight-mainSheetTurn],[mainSheaveSpacing,.016,axleHeight-mainSheetTurn],
       [0,.057,axleHeight-mainOutletDrop],[0,mainOutletY,axleHeight-mainOutletDrop]].map(point=>new T.Vector3(...point));
     const ropeAxis=new T.Vector3(),up=new T.Vector3(0,1,0),rotation=new T.Quaternion();
     for(let i=1;i<tail.length;i++){
       ropeAxis.subVectors(tail[i],tail[i-1]);
       const lead=new T.CylinderGeometry(.0038,.0038,ropeAxis.length(),8);
       lead.applyQuaternion(rotation.setFromUnitVectors(up,ropeAxis.normalize()));
       const center=tail[i-1].clone().lerp(tail[i],.5);
       part(lead,rope,.04,center.x,center.y,center.z);
     }
   }
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
   part(new T.CylinderGeometry(sheaveRadius,sheaveRadius,.060,10).rotateZ(Math.PI/2),dark,.14,0,0,axleHeight);
   part(new T.CylinderGeometry(.019,.010,axleHeight,8).rotateX(Math.PI/2),dark,.14,0,0,axleHeight/2);
   if(withCleat)part(new T.BoxGeometry(.053,.052,.022),dark,.14,0,.050,axleHeight-.019);
   pin(0,0,axleHeight,.006,.055);
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

function ballastMarker(T){
 const sphere=new T.SphereGeometry(.11,24,12);
 const geometry=sphere.toNonIndexed();
 sphere.dispose();
 const points=geometry.attributes.position,colors=new Float32Array(points.count*3);
 const dark=new T.Color(0x171a1c),light=new T.Color(0xf1f2ee);
 for(let i=0;i<points.count;i+=3){
   const x=points.getX(i)+points.getX(i+1)+points.getX(i+2);
   const y=points.getY(i)+points.getY(i+1)+points.getY(i+2);
   const z=points.getZ(i)+points.getZ(i+1)+points.getZ(i+2);
   const color=x*y*z<0?dark:light;
   for(let j=0;j<3;j++)color.toArray(colors,3*(i+j));
 }
 geometry.setAttribute('color',new T.BufferAttribute(colors,3));
 const marker=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.66}));
 marker.name='Ballast center of mass';
 return marker;
}

// Merge fixed opaque fittings that share one material and move with the same joint.
function mergeFittings(T,parent,parts,material){
 const positions=[],normals=[],triangles=[];
 for(const part of parts){
   part.updateMatrix();
   const geometry=part.geometry.applyMatrix4(part.matrix);
   const {position,normal}=geometry.attributes;
   const offset=positions.length/3;
   for(let i=0;i<position.count;i++){
     positions.push(position.getX(i),position.getY(i),position.getZ(i));
     normals.push(normal.getX(i),normal.getY(i),normal.getZ(i));
   }
   for(let i=0;i<(geometry.index?.count??position.count);i++)
     triangles.push(offset+(geometry.index?geometry.index.getX(i):i));
   part.removeFromParent();
   geometry.dispose();
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
 geometry.setIndex(triangles);
 const merged=new T.Mesh(geometry,material);
 parent.add(merged);
 return merged;
}

export function sailboatMesh(T,cat=false,keelX=.06,sailPanels,blockStack=.295,travelerMounts=defaultTravelerMounts){
 const group=new T.Group();
 let numberCanvas,numberMap,sailNumber;
 if(cat){
   numberCanvas=document.createElement('canvas');numberCanvas.width=256;numberCanvas.height=128;
   numberMap=new T.CanvasTexture(numberCanvas);numberMap.colorSpace=T.SRGBColorSpace;numberMap.anisotropy=4;
 }
 function setSailNumber(number){
   if(!cat||number===sailNumber)return;
   sailNumber=number;
   const context=numberCanvas.getContext('2d');
   context.clearRect(0,0,256,128);
   if(Number.isInteger(number)){
     context.fillStyle='#1d2022';context.font='bold 124px Georgia, serif';
     context.textAlign='center';context.textBaseline='alphabetic';
     context.fillText(String(number),128,108,238);
   }
   numberMap.needsUpdate=true;
 }
 const paint=(c)=>new T.MeshStandardMaterial({color:c,roughness:.42,metalness:.12});
 const red=paint(0xca2526);
 const white=cat?new T.MeshPhysicalMaterial({name:'White gelcoat',color:0xe9ebe5,roughness:.34,
   clearcoat:.36,clearcoatRoughness:.28}):paint(0xe3e5dd);
 const black=cat?new T.MeshPhysicalMaterial({name:'Black anodized aluminum',color:0x252931,metalness:.52,
   roughness:.34,clearcoat:.25,clearcoatRoughness:.28}):paint(0x252c30);
 function mesh(geo,mat,parent=group){const m=new T.Mesh(geo,mat);parent.add(m);return m;}
 function rod(a,b,r,mat,parent=group){a=new T.Vector3(...a);b=new T.Vector3(...b);const d=b.clone().sub(a);const m=mesh(new T.CylinderGeometry(r,r,d.length(),10),mat,parent);m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return m;}
 let vane,drum,rudder,otherRudder,carriage,crossTiller,rightingLine;
 let jibHalyard,stayEyes,staySleeves,lowerBowAdjuster,upperBowAdjuster,forestayShockCord;
 const deckCars=[],sheets=[],sheetBlocks=[],jibBlocks=[],travelerRopes=[],jibTails=[],streamers=[];
 const [travelerCleat,travelerForward,travelerAft,travelerDeadeye]=[0,3,6,9].map(i=>new T.Vector3().fromArray(travelerMounts,i));
 const travelerExit=new T.Vector3(),mainOutlet=new T.Vector3();
 const jibEyes=[new T.Vector3(),new T.Vector3()],jibExits=[new T.Vector3(),new T.Vector3()];
 const jibBight=new T.Vector3(.15,0,.431);
 let travelerCam,coilStart,coilEnd;
 const stayCables=[],chainplates=[];
 const jibTackZ=.87,jibTackX=2.26-(jibTackZ-.75)*1.82/5.1;
 const bridlePin=new T.Vector3(2.29,0,.65),jibTackPin=new T.Vector3(jibTackX,0,jibTackZ);
 let mastGeometry,mastRest,mastRestNormal,mastWeights,mastHeel,gooseneckSlider;
 const mastAxis=new T.Vector3(-Math.sin(.112),0,Math.cos(.112));
 const mastQuaternion=new T.Quaternion();
 const mastSection=new T.Vector3();
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
 const connectorPose=new T.Matrix4(),connectorRotation=new T.Quaternion(),connectorAxis=new T.Vector3();
 const connectorScale=new T.Vector3(1,1,1),terminationLength=.064;
 const plateAxis=new T.Vector3(),pinAxis=new T.Vector3(),plateAcross=new T.Vector3();
 const side=new T.Vector3(),tangent=new T.Vector3(),binormal=new T.Vector3();
 const cableChord=new T.Vector3(),cableSag=new T.Vector3(),cableCenter=new T.Vector3(),cablePolar=new T.Vector3();
 const stayAnchor=new T.Vector3(),stayMid=new T.Vector3(),stayHead=new T.Vector3();
 const cableRings=25;
 function updateStay(index,anchor,mid,head){
   const {position,normal}=stayCables[index].geometry.attributes;
   cableChord.subVectors(head,anchor);
   const length=cableChord.length();
   if(length<.001)return;
   // Interpolate the cable through the two pins and the Modelica sag point.
   // The quadratic is straight under tension and smooth through the midpoint.
   cableSag.copy(mid).sub(cableCenter.copy(anchor).lerp(head,.50));
   const isSidestay=index<2;
   const inset=terminationLength/length;
   for(let end=0;end<2;end++){
     connectorAxis.copy(cableChord).addScaledVector(cableSag,end?-4:4).normalize();
     if(end)connectorAxis.negate();
     connectorRotation.setFromUnitVectors(stayUp,connectorAxis);
     connectorPose.compose(end?head:anchor,connectorRotation,connectorScale);
     stayEyes.setMatrixAt(index*2+end,connectorPose);
     staySleeves.setMatrixAt(index*2+end,connectorPose);
   }
   for(let i=0;i<cableRings;i++){
     const u=T.MathUtils.lerp(inset,1-inset,i/(cableRings-1));
     cableCenter.copy(anchor).addScaledVector(cableChord,u).addScaledVector(cableSag,4*u*(1-u));
     tangent.copy(cableChord).addScaledVector(cableSag,4*(1-2*u)).normalize();
     side.set(-tangent.y,tangent.x,0);
     if(side.lengthSq()<1e-10)side.set(1,0,0);
     else side.normalize();
     binormal.crossVectors(tangent,side);
     for(let j=0;j<ropeSides;j++){
       const [cos,sin]=circle[j],vertex=i*ropeSides+j;
       cablePolar.copy(side).multiplyScalar(cos).addScaledVector(binormal,sin);
       normal.setXYZ(vertex,cablePolar.x,cablePolar.y,cablePolar.z);
       cablePolar.multiplyScalar(.003).add(cableCenter);
       position.setXYZ(vertex,cablePolar.x,cablePolar.y,cablePolar.z);
     }
   }
   position.needsUpdate=normal.needsUpdate=true;
   if(isSidestay)chainplates[index].position.copy(anchor);
   streamers[index]?.position.copy(anchor).addScaledVector(cableChord,.28).addScaledVector(cableSag,4*.28*.72);
 }
 function positionAdjuster(adjuster,lower,upper){
   plateAxis.subVectors(upper,lower);
   const span=plateAxis.length();
   if(span<.001)return;
   plateAxis.divideScalar(span);
   pinAxis.copy(stayUp).addScaledVector(plateAxis,-plateAxis.y).normalize();
   plateAcross.crossVectors(plateAxis,pinAxis);
   adjuster.position.copy(lower);
   adjuster.scale.y=span/adjuster.userData.pinSpacing;
   adjuster.quaternion.setFromRotationMatrix(connectorPose.makeBasis(plateAcross,plateAxis,pinAxis));
 }
 function updateBowAdjusters(tack,forestayPin){
   positionAdjuster(lowerBowAdjuster,bridlePin,tack);
   const hasTakeup=forestayPin.distanceToSquared(tack)>.01;
   upperBowAdjuster.visible=forestayShockCord.visible=hasTakeup;
   if(hasTakeup){
     positionAdjuster(upperBowAdjuster,tack,forestayPin);
     connectorAxis.subVectors(forestayPin,bridlePin);
     forestayShockCord.position.copy(bridlePin).lerp(forestayPin,.5);
     forestayShockCord.scale.y=connectorAxis.length();
     forestayShockCord.quaternion.setFromUnitVectors(stayUp,connectorAxis.normalize());
   }
 }
 function ropeBatch(color,count){
   const span=ropeSides*ropeRings,vertices=count*span;
   const geometry=new T.BufferGeometry(),faces=[];
   for(const attribute of ['position','normal'])
     geometry.setAttribute(attribute,new T.BufferAttribute(new Float32Array(vertices*3),3).setUsage(T.DynamicDrawUsage));
   if(cat)geometry.setAttribute('uv',new T.BufferAttribute(new Float32Array(vertices*2),2).setUsage(T.DynamicDrawUsage));
   for(let rope=0;rope<count;rope++)for(let i=0;i<ropeRings-1;i++)for(let j=0;j<ropeSides;j++){
     const a=rope*span+i*ropeSides+j,b=rope*span+i*ropeSides+(j+1)%ropeSides;
     faces.push(a,b,b+ropeSides,a,b+ropeSides,a+ropeSides);
   }
   geometry.setIndex(faces);
   const batch=mesh(geometry,new T.MeshStandardMaterial({color:cat?0xffffff:color,
     map:cat?braidedCover(color):null,roughness:.94}));
   batch.frustumCulled=false;
   return Array.from({length:count},(_,i)=>({batch,offset:i*span}));
 }
 function sheetRope(color){
   return ropeBatch(color,1)[0].batch;
 }
 function drawRope(rope,from,to,sag){
   const {position,normal,uv}=(rope.batch??rope).geometry.attributes;
   const offset=rope.offset??0;
   const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,radius=cat ? .004 : .002;
   const repeats=Math.hypot(dx,dy,dz)/.065;
   side.set(-dy,dx,0);
   if(side.lengthSq()<1e-16)side.set(1,0,0);else side.normalize();
   for(let i=0;i<ropeRings;i++){
     const u=i/(ropeRings-1),x=from.x+dx*u,y=from.y+dy*u,z=from.z+dz*u-4*u*(1-u)*sag;
     tangent.set(dx,dy,dz-4*(1-2*u)*sag).normalize();
     binormal.crossVectors(tangent,side);
     for(let j=0;j<ropeSides;j++){
       const [c,s]=circle[j],k=offset+i*ropeSides+j;
       const nx=c*side.x+s*binormal.x,ny=c*side.y+s*binormal.y,nz=s*binormal.z;
       normal.setXYZ(k,nx,ny,nz);
       if(uv)uv.setXY(k,j/ropeSides,u*repeats);
       position.setXYZ(k,x+radius*nx,y+radius*ny,z+radius*nz);
     }
   }
   position.needsUpdate=true;normal.needsUpdate=true;
   if(uv)uv.needsUpdate=true;
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
   const jacket=new T.MeshPhysicalMaterial({name:'Black coated sidestay cable',color:0x131619,roughness:.35,
     clearcoat:.32,clearcoatRoughness:.29});
   const stainless=new T.MeshStandardMaterial({name:'Stainless rig fittings',color:0xb2b9c1,
     metalness:.74,roughness:.31});
   const eyeShape=new T.TorusGeometry(.0095,.0025,6,14).scale(.77,1.6,1).translate(0,.0145,0);
   const sleeveShape=new T.CylinderGeometry(.0048,.0057,.036,10).translate(0,.046,0);
   stayEyes=new T.InstancedMesh(eyeShape,stainless,6);
   staySleeves=new T.InstancedMesh(sleeveShape,stainless,6);
   stayEyes.name='Stay terminal eyes';staySleeves.name='Stay swage sleeves';
   for(const fitting of [stayEyes,staySleeves]){
     fitting.frustumCulled=false;
     fitting.instanceMatrix.setUsage(T.DynamicDrawUsage);
     group.add(fitting);
   }
   function installStay(index,anchor){
     const head=[-.168,0,5.85],mid=head.map((value,i)=>(value+anchor[i])/2);
     const geometry=new T.BufferGeometry(),indices=[];
     for(const attribute of ['position','normal'])
       geometry.setAttribute(attribute,new T.BufferAttribute(new Float32Array(3*cableRings*ropeSides),3).setUsage(T.DynamicDrawUsage));
     for(let row=0;row<cableRings-1;row++)for(let col=0;col<ropeSides;col++){
       const a=row*ropeSides+col,b=row*ropeSides+(col+1)%ropeSides;
       indices.push(a,b,b+ropeSides,a,b+ropeSides,a+ropeSides);
     }
     geometry.setIndex(indices);
     const isSidestay=index<2;
     const cable=mesh(geometry,isSidestay?jacket:stainless);
     cable.name=['Port sidestay','Starboard sidestay','Forestay'][index];cable.frustumCulled=false;
     stayCables[index]=cable;
     if(!isSidestay){
       updateStay(index,stayAnchor.fromArray(anchor),stayMid.fromArray(mid),stayHead.fromArray(head));
       return;
     }
     const plate=new T.Group();plate.name=cable.name+' chainplate';group.add(plate);chainplates[index]=plate;
     const flange=new T.Mesh(new T.BoxGeometry(.123,.040,.013),stainless);
     flange.position.z=-.216;plate.add(flange);
     const adjuster=new T.Shape();
     adjuster.moveTo(-.028,-.216);adjuster.lineTo(-.021,-.035);
     adjuster.quadraticCurveTo(-.017,.015,0,.016);adjuster.quadraticCurveTo(.017,.015,.021,-.035);
     adjuster.lineTo(.028,-.216);adjuster.closePath();
     for(let z=-.177;z<.001;z+=.026){
       const hole=new T.Path();hole.absarc(0,z,.0050,0,Math.PI*2,true);adjuster.holes.push(hole);
     }
     const bracket=new T.ExtrudeGeometry(adjuster,{depth:.005,bevelEnabled:false,curveSegments:8});
     bracket.rotateX(Math.PI/2);bracket.translate(0,.0025,0);
     plate.add(new T.Mesh(bracket,stainless));
     const fasteners=new T.CylinderGeometry(.006,.006,.004,10).rotateX(Math.PI/2);
     for(const x of [-.044,.044]){
       const screw=new T.Mesh(fasteners,stainless);screw.position.set(x,0,-.207);plate.add(screw);
     }
     const clevis=new T.Mesh(new T.CylinderGeometry(.0042,.0042,.021,12),stainless);
     plate.add(clevis);
     updateStay(index,stayAnchor.fromArray(anchor),stayMid.fromArray(mid),stayHead.fromArray(head));
     stayEyes.instanceMatrix.needsUpdate=staySleeves.instanceMatrix.needsUpdate=true;
   }
   function bowAdjuster(name,length){
     const adjuster=new T.Group();adjuster.name=name;group.add(adjuster);
     adjuster.userData.pinSpacing=length;
     // Perforated clevis cheeks run between the two hinge pins.
     const cheek=new T.Shape();
     cheek.moveTo(-.011,0);cheek.lineTo(-.011,length);
     cheek.quadraticCurveTo(-.011,length+.012,0,length+.012);
     cheek.quadraticCurveTo(.011,length+.012,.011,length);
     cheek.lineTo(.011,0);cheek.quadraticCurveTo(.011,-.012,0,-.012);
     cheek.quadraticCurveTo(-.011,-.012,-.011,0);
     for(let hole=0;hole<=7;hole++){
       const opening=new T.Path();
       opening.absarc(0,length*hole/7,.0037,0,2*Math.PI,true);cheek.holes.push(opening);
     }
     const plate=new T.ExtrudeGeometry(cheek,{depth:.0025,bevelEnabled:false,curveSegments:6});
     for(const z of [-.011,.0085])mesh(plate,stainless,adjuster).position.z=z;
     for(const y of [0,length])rod([0,y,-.016],[0,y,.016],.0045,stainless,adjuster);
     return adjuster;
   }
   const hulls=vehicleShell('hobie-hulls');
   hulls.traverse(showInLowWaterCapture);
   group.add(hulls);
   const identifiers=new T.MeshStandardMaterial({map:numberMap,roughness:.72,side:T.DoubleSide,alphaTest:.42});
   showInLowWaterCapture(mesh(bowNumbers(T,hulls),identifiers)).name='Bow race numbers';
   for(const side of [-1,1]){
     const blade=new T.Group();group.add(blade);blade.position.set(-2.545,side*1.02,.16);
     showInLowWaterCapture(mesh(foilShape,white,blade));
     const casting=[];
     for(const y of [-.025,.025]){
       casting.push(rod([-.18,y,.08],[-.035,y,.13],.027,black,blade),
         rod([-.035,y,.13],[-.018,y,-.045],.024,black,blade),
         rod([-.018,y,-.045],[-.18,y,.08],.022,black,blade));
     }
     casting.push(rod([-.16,0,.09],[-.13,0,.24],.027,black,blade),
       rod([-.13,0,.24],[.89,0,.31],.023,black,blade));
     mergeFittings(T,blade,casting,black);
     mergeFittings(T,blade,[rod([-.15,-.06,.072],[-.15,.06,.072],.017,pin,blade),
       rod([0,0,-.05],[0,0,.145],.018,pin,blade)],pin);
     if(side===1)rudder=blade;else otherRudder=blade;
     // Terminal loft station of Shore.pontoon: 4 mm half-beam at the deck seam.
     const bowEye=[2.520,side*(1.02-.004),.2261];
     rod([2.513,side*1.02,.222],bowEye,.004,pin);
     const bridle=rod(bowEye,bridlePin.toArray(),.003,stainless);
     bridle.name=side===1?'Port bow bridle':'Starboard bow bridle';
     installStay(side===1?0:1,[-.30,side*1.02,.34]);
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
     yarn.position.set(-.30+.28*.132,side*1.02*.72,.34+.28*5.51);
     yarn.visible=false;streamers[side===1?0:1]=yarn;
   }
   group.add(hobieTrampoline(T));
   carriage=ballastMarker(T);group.add(carriage);carriage.position.set(-.425,0,.52);
   rightingLine=sheetRope(0xc65845);
   rightingLine.name='Hobie righting line';
   rightingLine.visible=false;
   const mastLength=8.07,mastStepZ=.41;
   mastGeometry=new T.CylinderGeometry(1,1,mastLength,14,32);
   mastGeometry.rotateX(Math.PI/2);
   mastGeometry.translate(0,0,mastStepZ+mastLength/2);
   const positions=mastGeometry.attributes.position,normals=mastGeometry.attributes.normal;
   const finish=new Float32Array(positions.count*3);
   for(let i=0;i<positions.count;i++){
     const x=positions.getX(i),y=positions.getY(i);
     // The extrusion is broad at the nose and narrows into the aft track.
     positions.setXY(i,.009+.055*x,.039*y*(.80+.26*x));
     if(Math.abs(normals.getZ(i))<.5){
       const nx=.039*(x*(.80+.26*x)-.26*y*y),ny=.055*y;
       const length=Math.hypot(nx,ny);
       normals.setXYZ(i,nx/length,ny/length,0);
     }
     const tint=x<-.96?.46:x<-.88?.78:1;
     finish.fill(tint,3*i,3*i+3);
   }
   mastGeometry.setAttribute('color',new T.BufferAttribute(finish,3));
   const castAlloy=new T.MeshStandardMaterial({color:0x898981,roughness:.64,metalness:.46});
   const step=mesh(new T.CylinderGeometry(.078,.093,.038,18).rotateX(Math.PI/2),castAlloy);
   step.position.set(.44,0,mastStepZ+.011);
   step.name='Cast mast step and stops';
   const rim=mesh(new T.TorusGeometry(.057,.012,8,18),castAlloy,step);
   rim.position.z=.021;
   const bearing=mesh(new T.CylinderGeometry(.045,.045,.006,18).rotateX(Math.PI/2),paint(0xe6e3d8),step);
   bearing.position.z=.024;
   for(const sign of [-1,1]){
     const stop=mesh(new T.BoxGeometry(.038,.022,.024),castAlloy,step);
     stop.position.set(-.019,sign*.066,.030);stop.rotation.z=-sign*.19;
   }
   mastHeel=mesh(new T.SphereGeometry(.042,14,8).scale(1.22,.86,.68),castAlloy);
   mastHeel.name='Rotating mast heel';
   const heelStop=mesh(new T.BoxGeometry(.033,.027,.020),castAlloy,mastHeel);
   heelStop.position.x=-.047;
   gooseneckSlider=mesh(new T.BoxGeometry(.023,.028,.060),stainless);
   gooseneckSlider.name='Sliding gooseneck';
   const mastFinish=black.clone();mastFinish.vertexColors=true;
   mesh(mastGeometry,mastFinish).name='Hobie mast';
   mastRest=positions.clone();
   mastRestNormal=normals.clone();
   positions.setUsage(T.DynamicDrawUsage);normals.setUsage(T.DynamicDrawUsage);
   // This interpolates the six luff nodes reported by the cloth FMU.
   mastWeights=Array.from({length:positions.count},(_,i)=>Math.min(5,Math.max(0,(positions.getZ(i)-.97)*5/7.36)));
   const lower=deckHardware(T,false,.50*blockStack,true);
   const upper=deckHardware(T,false,.50*blockStack);upper.scale.z=-1;
   lower.name='Mainsheet lower triple block';upper.name='Mainsheet upper triple block';
   group.add(lower,upper);sheetBlocks.push(lower,upper);
   lowerBowAdjuster=bowAdjuster('Jib tack adjuster',bridlePin.distanceTo(jibTackPin));
   upperBowAdjuster=bowAdjuster('Pivoting forestay adjuster',.20);
   forestayShockCord=rod([0,0,0],[0,1,0],.0033,
     new T.MeshStandardMaterial({name:'Braided rubber shock cord',color:0x373331,roughness:.91}));
   forestayShockCord.name='Forestay take-up shock cord';
   updateBowAdjusters(jibTackPin,jibTackPin);
   installStay(2,jibTackPin.toArray());
   stayEyes.instanceMatrix.needsUpdate=staySleeves.instanceMatrix.needsUpdate=true;
   jibHalyard=rod([0,0,0],[0,1,0],.004,paint(0xe7c85c));
   jibHalyard.name="Jib head halyard";
   crossTiller=rod([-1.655,-1.02,.47],[-1.655,1.02,.47],.021,black);
   const traveler=new T.Group();
   traveler.name='Mainsheet traveler car';
   traveler.position.set(-1.40,0,.48);
   group.add(traveler);
   deckCars.push(traveler);
   const carriageParts=[mesh(new T.BoxGeometry(.035,.104,.009),stainless,traveler)];
   for(const y of [-.039,.039]){
     const end=mesh(new T.BoxGeometry(.042,.021,.012),stainless,traveler);
     end.position.set(0,y,-.004);carriageParts.push(end);
   }
   for(const x of [-.010,.010]){
     const ear=mesh(new T.BoxGeometry(.004,.018,.027),stainless,traveler);
     ear.position.set(x,0,.024);carriageParts.push(ear);
   }
   carriageParts.push(rod([-.016,0,.037],[.016,0,.037],.0038,stainless,traveler));
   // The two small flared mouths mark one straight passage through the car.
   for(const end of [travelerForward,travelerAft]){
     const guide=mesh(new T.TorusGeometry(.007,.0025,6,12),stainless,traveler);
     guide.rotation.y=Math.PI/2;
     guide.position.copy(end).sub(traveler.position);
     carriageParts.push(guide);
   }
   mergeFittings(T,traveler,carriageParts,stainless).name='Traveler slide and clevis';
   for(let i=0;i<2;i++){
     const car=mesh(new T.BoxGeometry(.070,.055,.028),black);
     car.position.set(.44,0,.482);deckCars.push(car);
     const fairlead=deckHardware(T,true);
     fairlead.name='Jib traveler fairlead and cam cleat';fairlead.scale.setScalar(deckCleatScale);
     fairlead.position.z=.014;car.add(fairlead);
   }
   const trackPieces=[mesh(new T.BoxGeometry(.045,1.87,.012),black)];
   trackPieces[0].position.set(-1.40,0,.459);
   for(const y of [-.92,.92]){
     const stop=mesh(new T.BoxGeometry(.044,.024,.019),black);
     stop.position.set(-1.40,y,.47);trackPieces.push(stop);
   }
   mergeFittings(T,group,trackPieces,black).name='Mainsheet traveler track';
   const trackLips=[];
   for(const x of [-1.418,-1.382]){
     const lip=mesh(new T.BoxGeometry(.004,1.83,.005),stainless);
     lip.position.set(x,0,.468);trackLips.push(lip);
   }
   const deadeyePlate=mesh(new T.BoxGeometry(.010,.041,.016),stainless);
   deadeyePlate.position.set(-1.451,0,travelerDeadeye.z);trackLips.push(deadeyePlate);
   const tie=mesh(new T.TorusGeometry(.011,.0028,7,14),stainless);
   tie.rotation.x=Math.PI/2;tie.position.copy(travelerDeadeye);trackLips.push(tie);
   for(const y of [-.014,.014])
     trackLips.push(rod([-1.461,y,travelerDeadeye.z],[-1.454,y,travelerDeadeye.z],.0034,stainless));
   mergeFittings(T,group,trackLips,stainless).name='Traveler track lips and bolted deadeye';
   const cleatBase=mesh(new T.BoxGeometry(.069,.056,.008),black);
   cleatBase.position.set(travelerCleat.x-.005,0,travelerCleat.z-.034);
   travelerCam=new T.Group();
   travelerCam.name='Aft crossbar traveler cam cleat';
   travelerCam.position.copy(travelerCleat);
   const cleat=deckHardware(T,true);
   cleat.scale.setScalar(deckCleatScale);
   cleat.position.set(-camEyeX*deckCleatScale,0,-camEyeZ*deckCleatScale);
   travelerCam.add(cleat);group.add(travelerCam);
   for(let i=0;i<2;i++){
     const block=new T.Group();
     block.name=i===0?'Port jib clew block':'Starboard jib clew block';
     group.add(block);jibBlocks.push(block);
     mesh(new T.CylinderGeometry(.016,.016,.014,14),black,block);
     mesh(new T.CylinderGeometry(.0167,.0167,.004,14),paint(0x24768c),block);
     const cheeks=[];
     for(const y of [-.009,.009]){
       const cheek=mesh(new T.BoxGeometry(.032,.003,.039),stainless,block);
       cheek.position.set(0,y,.004);cheeks.push(cheek);
     }
     const eye=mesh(new T.TorusGeometry(.009,.002,6,12),stainless,block);
     eye.rotation.x=Math.PI/2;eye.position.z=.025;cheeks.push(eye);
     mergeFittings(T,block,cheeks,stainless);
   }
   const mainRopes=ropeBatch(0xc65845,13),jibRopes=ropeBatch(0x24768c,10);
   mainRopes[0].batch.name='Mainsheet and traveler line';jibRopes[0].batch.name='Jib sheets';
   sheets.push(...mainRopes.slice(0,6),...jibRopes.slice(0,4));
   travelerRopes.push(...mainRopes.slice(6));jibTails.push(...jibRopes.slice(4));
   // The cleats isolate the working reaches. Show the spare line as one
   // laid coil on the deck, with both tails leading into the same rope.
   const coil=Array.from({length:45},(_,i)=>{
     const u=i/44,phase=1.15+u*5.2*Math.PI,radius=.148-.099*u+.006*Math.sin(2*phase);
     return new T.Vector3(-1.13+radius*Math.cos(phase),.23+.77*radius*Math.sin(phase),
       .421+.0017*Math.cos(phase));
   });
   coilStart=coil[0];coilEnd=coil.at(-1);
   const coilGeometry=new T.TubeGeometry(new T.CatmullRomCurve3(coil),84,.004,6,false);
   const knot=new T.SphereGeometry(.008,8,6).scale(1.15,1,.79);
   knot.translate(travelerDeadeye.x-.010,0,travelerDeadeye.z-.003);
   const ropeMaterial=mainRopes[0].batch.material;
   const uv=coilGeometry.attributes.uv;
   for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getY(i),20*uv.getX(i));
   mesh(coilGeometry,ropeMaterial).name='Mainsheet coil on trampoline';
   mesh(knot,ropeMaterial).name='Traveler stopper knot';
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
 const mainBail=new T.Vector3(-1.84,0,-.085);
 const sails=(cat?[{width:2.78,z:.97},{width:1.98,z:jibTackZ}]:[{width:1.28,z:.19},{width:.60,z:.19}]).map((spec,index)=>{
   const pivot=new T.Group();pivot.position.z=spec.z;group.add(pivot);
   const geo=new T.BufferGeometry();
   const panel=sailPanels?.[index],rows=panel?.luff.length??6;
   const coords=new T.Float32BufferAttribute(new Float32Array(rows*4*3),3);
   const airflowRows=panel?.telltaleRows??(index===0?[1,2]:[1,3]);
   const telltaleRows=cat&&index===0?airflowRows.slice(0,2):airflowRows;
   const panelTexture=panel?sailPanelTexture(panel.luff,panel.leech,telltaleRows):null;
   const uv=panelTexture?.uv??[];
   if(!panelTexture){
     for(let row=0;row<rows;row++)for(let col=0;col<4;col++)uv.push(col/3,row/(rows-1));
   }
   geo.setAttribute('position',coords);geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
   geo.setIndex(new T.BufferAttribute(panel?sailTopology(rows):clothTopology,1));
   showInLowWaterCapture(mesh(geo,sailMaterial(T,cat,index,telltaleRows,panelTexture,numberMap),pivot)).frustumCulled=false;
   const boomHinge=new T.Group();pivot.add(boomHinge);
   let outhaul,bail,downhaulBase;
   if(cat&&index===0){
     const end=-spec.width-.13;
     const boom=rod([0,0,-.029],[end,0,-.029],.035,black,boomHinge);
     boom.name='Hobie boom';boom.scale.z=1.27;
     bail=mesh(new T.TorusGeometry(.016,.004,6,16).rotateX(Math.PI/2),paint(0xa7afb2),boomHinge);
     bail.name='Mainsheet boom bail';
     bail.position.copy(mainBail);bail.position.z+=.016;
     outhaul={line:rod([0,0,0],[end,0,0],.0034,paint(0xf1e7c6),boomHinge),end};
   }else if(!cat)rod([0,0,0],[-spec.width,0,0],.012,black,boomHinge);
   const vang=!cat&&index===0?rod([0,0,-vangDrop],[-vangReach,0,0],.005,black,pivot):null;
   const downhaul=[];
   if(cat && index===0){
     const line=paint(0x9c282a);
     for(const y of [-.009,0,.009]){
       downhaul.push(rod([-.055,y,-.38],[-.055,y,-.03],.0028,line,pivot));
     }
     downhaulBase=rod([-.055,-.014,-.38],[-.055,.014,-.38],.012,black,pivot);
     rod([-.055,-.014,-.03],[-.055,.014,-.03],.013,black,boomHinge);
   }
   const tufts=[];
   if(cat){
     for(let k=0;k<2*telltaleRows.length;k++){
       const tuft=sailTelltale(T,k%2===0,k*1.8+index*.7);
       tuft.mesh.name=(index?'Jib':'Main')+' face telltale '+k;
       pivot.add(tuft.mesh);tufts.push(tuft);
     }
   }
   return {pivot,geo,coords,boomHinge,bail,vang,downhaul,downhaulBase,outhaul,tufts,telltaleRows,
     battenRows:panel?rows-2:0};
 });
 const podRadius=cat?.17:.075,podHeight=cat?8.44:3.02,podX=cat?.44:.12;
 const halfLength=cat?.29:podRadius;
 const sideRadius=cat?Math.sqrt(podRadius**3/halfLength):podRadius;
 const masthead=new T.Group();
 masthead.position.set(podX,0,podHeight);
 group.add(masthead);
 let shell;
 if(cat){
   const profile=Array.from({length:33},(_,i)=>{
     const u=i/16-1;
     return new T.Vector2(sideRadius*(1+u)*Math.sqrt(1-u),halfLength*u);
   });
   shell=new T.LatheGeometry(profile,32);shell.rotateZ(-Math.PI/2);
   const bracket=mesh(new T.BoxGeometry(.095,.06,.115),paint(0x76838b),masthead);
   bracket.position.z=-sideRadius-.022;
 }else shell=new T.SphereGeometry(podRadius,24,16);
 const pod=mesh(shell,cat?white:paint(0xffd14c),masthead);
 if(cat)pod.name='Masthead float';
 const cameraPorts=[];
 for(let i=0;!cat&&i<4;i++){
   const a=i*Math.PI/2,r=i%2?sideRadius:halfLength;
   const lens=mesh(new T.SphereGeometry(podRadius*.24,12,8),paint(0x18262e),masthead);
   lens.position.set(r*Math.cos(a),r*Math.sin(a),0);
   cameraPorts.push([podX+lens.position.x,lens.position.y,podHeight]);
 }
 if(vane)vane.position.z=podHeight+podRadius+.035;
 const ribbonGravity=new T.Vector3(),inverse=new T.Quaternion(),anchor=new T.Vector3(),ribbonNormal=new T.Vector3();
 const rightingLead=new T.Vector3(),rightingGrip=new T.Vector3();
 const inspection={sails,joints:[
   [sails[0].pivot,[0,0,1],'Main rotation'],[sails[0].boomHinge,[0,1,0],'Boom hinge'],
   [sails[1].pivot,[cat?-1.82/5.1:-1.04/2.69,0,1],'Jib rotation'],[rudder,[0,0,1],'Rudder hinge'],
   ...(otherRudder?[[otherRudder,[0,0,1],'']]:[])
 ]};
 function setPose(s){
   group.position.set(s[0],s[1],s[3]);
   group.rotation.set(s[4],s[5],s[2],'ZYX');
 }
 return {group,cameraPorts,inspection,setPose,setSailNumber,ballastPosition:carriage?.position,setBallastVisible(visible){if(carriage)carriage.visible=visible;},
   update(s,ballast,cars,rope,tails,faceTails,stayPath,time,geometry){
   const [mastStations,gooseneck,blockPins]=geometry?.rig??[];
   inspection.mastStations=mastStations;
   if(stayPath){
     for(let i=0;i<2;i++){
       updateStay(i,stayAnchor.fromArray(stayPath,9*i),stayMid.fromArray(stayPath,9*i+3),
         stayHead.fromArray(stayPath,9*i+6));
     }
     const loose=geometry?.forestay;
     const forestay=loose??stayPath,offset=loose?0:18;
     updateStay(2,stayAnchor.fromArray(forestay,offset),stayMid.fromArray(forestay,offset+3),
       stayHead.fromArray(forestay,offset+6));
     updateBowAdjusters(jibTackPin.fromArray(stayPath,18),stayAnchor);
     stayEyes.instanceMatrix.needsUpdate=staySleeves.instanceMatrix.needsUpdate=true;
   }
   for(let i=0;i<streamers.length;i++){
     streamers[i].visible=Boolean(tails);
     if(tails)streamers[i].quaternion.setFromUnitVectors(tangent.set(1,0,0),side.fromArray(tails,3*i).normalize());
   }
   if(vane)vane.rotation.z=s[30];if(drum)drum.rotation.y=s[40];
   if(otherRudder)otherRudder.rotation.z=-s[7];
   if(carriage&&ballast)carriage.position.set(-.425+ballast[0],ballast[1],ballast[2]??.52);
   if(rightingLine){
     const support=ballast?.[3]??0;
     rightingLine.visible=Math.abs(support)>.5;
     if(rightingLine.visible){
       rightingLead.set(carriage.position.x,-1.04*support,.27);
       rightingGrip.copy(carriage.position);
       rightingGrip.y-=.18*support;rightingGrip.z+=.16;
       drawRope(rightingLine,rightingLead,rightingGrip,.012);
     }
   }
   setPose(s);rudder.rotation.z=-s[7];
   sails.forEach(({pivot,geo,coords,boomHinge,bail,vang,downhaul,downhaulBase,outhaul,tufts,telltaleRows},m)=>{
     const r=42+2*24*3+m*9;
     sheetMatrix.set(s[r],s[r+1],s[r+2],0,s[r+3],s[r+4],s[r+5],0,s[r+6],s[r+7],s[r+8],0,0,0,0,1);
     pivot.quaternion.setFromRotationMatrix(sheetMatrix);
     pivot.position.x=s[42+2*24*3+18+m];
     if(m===0){
       boomHinge.rotation.y=s[206];
       if(gooseneck){
         inverse.copy(pivot.quaternion).invert();
         boomHinge.position.fromArray(gooseneck).sub(pivot.position).applyQuaternion(inverse);
         const height=pivot.position.z-.38;
         const t=(height-mastStations[2])/(mastStations[5]-mastStations[2]);
         downhaulBase.position.set(T.MathUtils.lerp(mastStations[0],mastStations[3],t),
           T.MathUtils.lerp(mastStations[1],mastStations[4],t),height)
           .sub(pivot.position).applyQuaternion(inverse);
         downhaulBase.position.x-=.055;
         if(bail&&blockPins){
           bail.position.fromArray(blockPins,3).sub(pivot.position).applyQuaternion(inverse)
             .sub(boomHinge.position).applyQuaternion(inverse.copy(boomHinge.quaternion).invert());
           bail.position.z+=.016;
         }
       }else boomHinge.position.z=cat?s[44]:0;
       for(const [i,line] of downhaul.entries()){
         const y=.009*(i-1);
         side.copy(downhaulBase.position);side.y+=y;
         binormal.set(-.055,y,-.03).applyQuaternion(boomHinge.quaternion).add(boomHinge.position);
         tangent.subVectors(binormal,side);
         line.position.copy(side).lerp(binormal,.5);
         line.scale.y=tangent.length()/.35;
         line.quaternion.setFromUnitVectors(stayUp,tangent.normalize());
       }
     }
     if(vang){
       const elevation=s[206];boomHinge.rotation.y=elevation;
       const line=new T.Vector3(-vangReach*Math.cos(elevation),0,vangDrop+vangReach*Math.sin(elevation));
       vang.scale.y=line.length()/Math.hypot(vangReach,vangDrop);
       vang.position.set(line.x/2,0,-vangDrop+line.z/2);
       vang.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),line.normalize());
     }
     const vertices=geometry?.cloth?.[m];
     if(vertices)coords.array.set(vertices);
     else for(let i=0;i<24;i++){
       const offset=42+m*72+i*3;
       coords.setXYZ(i,s[offset],s[offset+1],s[offset+2]);
     }
     if(outhaul){
       const clew=Math.hypot(coords.getX(3)-boomHinge.position.x,coords.getZ(3)-boomHinge.position.z);
       outhaul.line.position.x=(outhaul.end-clew)/2;
       outhaul.line.scale.y=Math.max(.001,(-outhaul.end-clew)/(-outhaul.end));
     }
     if(m===1 && jibHalyard && stayPath){
       const head=side.fromBufferAttribute(coords,coords.count-4).applyQuaternion(pivot.quaternion).add(pivot.position);
       const tang=binormal.fromArray(stayPath,24);
       head.y+=.012;
       tang.y+=.012;
       tangent.subVectors(tang,head);
       jibHalyard.position.copy(head).lerp(tang,.5);
       jibHalyard.scale.y=tangent.length();
       jibHalyard.quaternion.setFromUnitVectors(stayUp,tangent.normalize());
     }
     coords.needsUpdate=true;geo.computeVertexNormals();
     if(faceTails){
       ribbonGravity.set(0,0,-9.81).applyQuaternion(inverse.copy(group.quaternion).invert())
         .applyQuaternion(inverse.copy(pivot.quaternion).invert());
     }
     for(let k=0;k<tufts.length;k++){
       const tuft=tufts[k];
       if(!faceTails){tuft.mesh.visible=false;continue;}
       const j=4*telltaleRows[Math.floor(k/2)];
       anchor.fromBufferAttribute(coords,j);
       tangent.fromBufferAttribute(coords,j+1).sub(anchor);
       binormal.fromBufferAttribute(coords,j+5).sub(anchor).sub(tangent);
       ribbonNormal.crossVectors(tangent,binormal).normalize();
       anchor.addScaledVector(tangent,.60).addScaledVector(binormal,.48).addScaledVector(ribbonNormal,k%2?-.003:.003);
       tuft.update(anchor,ribbonNormal,ribbonGravity,side.fromArray(faceTails,m*18+k*3),time);
     }
   });
   if(mastGeometry){
     const {position,normal}=mastGeometry.attributes;
     const rotation=Number.isFinite(geometry?.mastRotation)
       ?mastQuaternion.setFromAxisAngle(mastAxis,geometry.mastRotation):sails[0].pivot.quaternion;
     gooseneckSlider.visible=Boolean(gooseneck);
     if(gooseneck)gooseneckSlider.position.fromArray(gooseneck);
     gooseneckSlider.quaternion.copy(rotation);
     let headX,headY,headZ=podHeight;
     if(mastStations){
       const last=mastStations.length-3;
       for(let i=0;i<position.count;i++){
         const height=mastRest.getZ(i);
         let a=0;
         while(a+3<last&&mastStationHeights[a/3+1]<height)a+=3;
         const b=a+3,lower=mastStationHeights[a/3],upper=mastStationHeights[b/3];
         const t=T.MathUtils.clamp((height-lower)/(upper-lower),0,1);
         const x=T.MathUtils.lerp(mastStations[a],mastStations[b],t);
         const y=T.MathUtils.lerp(mastStations[a+1],mastStations[b+1],t);
         const z=T.MathUtils.lerp(mastStations[a+2],mastStations[b+2],t);
         mastSection.set(mastRest.getX(i),mastRest.getY(i),0).applyQuaternion(rotation);
         position.setXYZ(i,x+mastSection.x,y+mastSection.y,z+mastSection.z);
       }
       mastHeel.position.fromArray(mastStations);mastHeel.position.z+=.031;
       headX=mastStations[last];headY=mastStations[last+1];headZ=mastStations[last+2];
     }else{
       const bend=Array.from({length:6},(_,r)=>s[186]*s[42+12*r]+s[187]*s[43+12*r]);
       const lateral=Array.from({length:6},(_,r)=>s[189]*s[42+12*r]+s[190]*s[43+12*r]);
       for(let i=0;i<position.count;i++){
         const w=mastWeights[i],lo=Math.floor(w),hi=Math.min(5,lo+1);
         mastSection.set(mastRest.getX(i),mastRest.getY(i),0).applyQuaternion(rotation);
         position.setXYZ(i,podX+T.MathUtils.lerp(bend[lo],bend[hi],w-lo)+mastSection.x,
           T.MathUtils.lerp(lateral[lo],lateral[hi],w-lo)+mastSection.y,mastRest.getZ(i)+mastSection.z);
       }
       mastHeel.position.set(.44,0,.474);
       headX=podX+bend[5];headY=lateral[5];
     }
     mastHeel.quaternion.copy(rotation);
     for(let i=0;i<normal.count;i++){
       mastSection.fromBufferAttribute(mastRestNormal,i).applyQuaternion(rotation);
       normal.setXYZ(i,mastSection.x,mastSection.y,mastSection.z);
     }
     position.needsUpdate=normal.needsUpdate=true;
     masthead.position.set(headX,headY,headZ);
     masthead.quaternion.copy(rotation);
   }
   if(cars){
     crossTiller.position.set(-2.545+.89*Math.cos(s[7]),-.89*Math.sin(s[7]),.47);
     deckCars[0].position.y=cars[0];for(const [i,side] of [[1,1],[2,-1]]){
       const y=side*cars[1],beam=forwardBeam(y);
       deckCars[i].position.set(beam.x,y,beam.z+.067);
     }
     travelerForward.y=travelerAft.y=cars[0];
     travelerCam.rotation.z=Math.atan2(travelerForward.y-travelerCleat.y,travelerForward.x-travelerCleat.x);
     const travelerSag=Math.min(.012,geometry?.travelerSag??0);
     drawRope(travelerRopes[0],travelerCleat,travelerForward,travelerSag);
     drawRope(travelerRopes[1],travelerForward,travelerAft,0);
     drawRope(travelerRopes[2],travelerAft,travelerDeadeye,travelerSag);
     travelerExit.set(deckCleatScale*(camExitX-camEyeX),0,deckCleatScale*(camExitZ-camEyeZ))
       .applyQuaternion(travelerCam.quaternion).add(travelerCleat);
     drawRope(travelerRopes[3],travelerExit,travelerCleat,0);
     drawRope(travelerRopes[4],coilEnd,travelerExit,.021);
     // Attachment positions in the hull frame. The front clew follows the actual cloth.
     const {boomHinge,pivot}=sails[0];
     const top=blockPins?new T.Vector3().fromArray(blockPins,3):
       mainBail.clone().applyQuaternion(boomHinge.quaternion).add(boomHinge.position)
         .applyQuaternion(pivot.quaternion).add(pivot.position);
     const lowerBlock=blockPins?new T.Vector3().fromArray(blockPins):deckCars[0].position.clone();
     if(!blockPins)lowerBlock.z+=.04;
     const axis=new T.Vector3().subVectors(top,lowerBlock).normalize();
     const fore=side.set(1,0,0).addScaledVector(axis,-axis.x).normalize();
     const across=binormal.crossVectors(fore,axis);
     connectorPose.makeBasis(across,fore,axis);
     sheetBlocks.forEach((block,i)=>{
       block.position.copy(i?top:lowerBlock);
       block.quaternion.setFromRotationMatrix(connectorPose);
     });
     mainOutlet.set(0,mainOutletY,.50*blockStack-mainSheaveInset-mainOutletDrop)
       .applyQuaternion(sheetBlocks[0].quaternion).add(lowerBlock);
     drawRope(travelerRopes[5],mainOutlet,coilStart,Math.min(.075,Math.max(0,.45*(mainOutlet.z-.423))));
     mainOutlet.copy(travelerDeadeye);mainOutlet.x-=.010;mainOutlet.z-=.003;
     drawRope(travelerRopes[6],travelerDeadeye,mainOutlet,0);
     for(let i=0;i<6;i++){
       const x=(Math.floor(i/2)-1)*mainSheaveSpacing,y=(i%2?-1:1)*mainSheetTurn;
       // The fall crosses to the next upper groove after each return.
       const lowerX=i>0&&i%2===0?x-mainSheaveSpacing:x;
       const lowerZ=.50*blockStack-mainSheaveInset-(i===0?.036:0);
       const start=new T.Vector3(lowerX,y,lowerZ).applyQuaternion(sheetBlocks[0].quaternion).add(lowerBlock);
       const end=new T.Vector3(x,y,-.50*blockStack+mainSheaveInset).applyQuaternion(sheetBlocks[1].quaternion).add(top);
       drawRope(sheets[i],start,end,rope?.[0]??0);
     }
     const jibPins=geometry?.jibSheetPins;
     const clew=jibPins?new T.Vector3().fromArray(jibPins):
       new T.Vector3().fromBufferAttribute(sails[1].coords,3).applyQuaternion(sails[1].pivot.quaternion).add(sails[1].pivot.position);
     for(let i=0;i<2;i++){
       const block=jibBlocks[i],car=deckCars[i+1].position;
       const forward=jibPins?new T.Vector3().fromArray(jibPins,6+6*i):new T.Vector3(car.x+.039,car.y,car.z+.043);
       const aft=jibPins?new T.Vector3().fromArray(jibPins,3+6*i):new T.Vector3(car.x+.001,car.y,car.z+.043);
       const blockUp=new T.Vector3().copy(clew).sub(forward).addScaledVector(tangent.subVectors(forward,aft),.5).normalize();
       const across=fore.set(1,0,0).addScaledVector(blockUp,-blockUp.x).normalize();
       connectorPose.makeBasis(across,binormal.crossVectors(blockUp,across),blockUp);
       block.quaternion.setFromRotationMatrix(connectorPose);
       block.position.copy(clew).addScaledVector(blockUp,-.031);
       const foreRim=block.position.clone().addScaledVector(across,.016);
       const aftRim=block.position.clone().addScaledVector(across,-.016);
       const sag=rope?.[i+1]??0;
       drawRope(sheets[6+2*i],aft,aftRim,sag);
       drawRope(sheets[7+2*i],forward,foreRim,sag);
       const eye=jibEyes[i].set(car.x+camEyeX*deckCleatScale,car.y,car.z+.014+camEyeZ*deckCleatScale);
       const exit=jibExits[i].set(car.x+camExitX*deckCleatScale,car.y,car.z+.014+camExitZ*deckCleatScale);
       drawRope(jibTails[2*i],forward,eye,0);
       drawRope(jibTails[2*i+1],eye,exit,0);
     }
     // The two free ends meet on the deck, clear of the mast step.
     drawRope(jibTails[4],jibExits[0],jibBight,.017);
     drawRope(jibTails[5],jibBight,jibExits[1],.017);
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
