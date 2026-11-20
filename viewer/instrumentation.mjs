export function forceDisplay(T,scene,sub,yacht,cat,model){
 const group=new T.Group();scene.add(group);group.visible=false;
 const specs=[];
 function arrow(parent,origin,color){
   const glyph=new T.ArrowHelper(new T.Vector3(1,0,0),new T.Vector3(),1,color);
   for(const m of [glyph.line,glyph.cone]){m.material.depthTest=false;m.renderOrder=12;}
   group.add(glyph);specs.push({parent,origin:new T.Vector3(...origin),glyph});
 }
 arrow(yacht,cat?[-.6,0,3.3]:[-.28,0,1.1],0xffad4d);
 arrow(yacht,cat?[1.1,0,2.2]:[.62,0,.93],0xffad4d);
 for(let k=0;k<(cat?4:2);k++)
   arrow(yacht,[0,0,0],0x6cbcff);
 const buoyIndex=specs.length;arrow(yacht,[0,0,-.08],0x77e7ba);
 for(const r of sub.userData.rotors)arrow(sub,r.center.toArray(),0xff82af);
 arrow(sub,[0,0,.055],0x77e7ba);arrow(sub,[0,0,0],0xff524b);
 const dir=new T.Vector3(),up=new T.Vector3(0,0,1),yaw=new T.Quaternion();
 return (enabled,b,f,showSub)=>{
   group.visible=enabled;if(!enabled)return;
   yaw.setFromAxisAngle(up,b[2]);
   const [sails,foils,arms]=showSub?[]:model.getMany(['rigForce','foilLoad','foilArm']);
   for(let i=0;i<specs.length;i++){
     const {glyph,parent,origin}=specs[i];
     if((parent===sub)!==showSub){glyph.visible=false;continue;}
     glyph.position.copy(origin).applyQuaternion(parent.quaternion).add(parent.position);
     if(i<2)dir.fromArray(sails,3*i).applyQuaternion(yaw);
     else if(i<buoyIndex){
       const offset=3*(i-2);
       glyph.position.fromArray(arms,offset).applyQuaternion(yaw).add(parent.position);
       dir.fromArray(foils,offset).applyQuaternion(yaw);
     }
     else if(i===buoyIndex)dir.set(0,0,b[29]);
     else if(!f?.thrust){glyph.visible=false;continue;}
     else if(i<=buoyIndex+7){const rotor=i-buoyIndex-1;dir.copy(sub.userData.rotors[rotor].axis).multiplyScalar(f.thrust[rotor]).applyQuaternion(sub.quaternion);}
     else if(i===buoyIndex+8)dir.fromArray(f.buoyancy).applyQuaternion(sub.quaternion);
     else dir.fromArray(f.contact);
     const n=dir.length();glyph.visible=n>.03;
     if(glyph.visible){const len=.24*Math.log1p(n);glyph.setDirection(dir.normalize());glyph.setLength(len,Math.min(.18,len*.32),Math.min(.10,len*.18));}
   }
 };
}
export function sonarPlot(ctx,frame,az){
 const origin=[224,165],scale=13;
 const project=(x,y,z)=>[origin[0]+scale*(x*Math.sin(az)-y*Math.cos(az)),origin[1]-scale*(.44*(x*Math.cos(az)+y*Math.sin(az))+.9*z)];
 ctx.fillStyle='#0a2029';ctx.fillRect(0,0,460,220);
 ctx.strokeStyle='#38545b';ctx.beginPath();
 for(const b of [-60,0,60]){const r=b*Math.PI/180;ctx.moveTo(...origin);ctx.lineTo(...project(18*Math.cos(r),18*Math.sin(r),0));}ctx.stroke();
 function hit(r,col,e,count,color){
   if(!r)return;const a=(col/(count-1)-.5)*2*Math.PI/3,h=r*Math.cos(e);
   const [x,y]=project(h*Math.cos(a),h*Math.sin(a),r*Math.sin(e));
   ctx.fillStyle=color;ctx.fillRect(x-2,y-2,4,4);
 }
 frame.scan.forEach((r,i)=>hit(r,i,0,49,'#b7d9d5'));
 frame.elevationRanges.forEach((r,i)=>{const row=Math.floor(i/25);hit(r,i%25,[-24,-12,12,24][row]*Math.PI/180,25,['#548acc','#6bb8de','#91dfb0','#ffd17d'][row]);});
 ctx.fillStyle='white';ctx.fillRect(origin[0]-3,origin[1]-3,6,6);
 ctx.font='16px monospace';ctx.fillStyle='#91adb4';ctx.fillText('18 m · drag to rotate',10,211);
}
