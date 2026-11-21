export function forceDisplay(T,scene,sub,yacht,cat,model){
 const group=new T.Group();scene.add(group);group.visible=false;
 const specs=[];
 function arrow(parent,origin,color){
   const glyph=new T.ArrowHelper(new T.Vector3(1,0,0),new T.Vector3(),1,color);
   for(const m of [glyph.line,glyph.cone]){m.material.depthTest=false;m.renderOrder=12;}
   group.add(glyph);specs.push({parent,origin:new T.Vector3(...origin),glyph});
 }
 if(yacht){
   arrow(yacht,cat?[-.6,0,3.3]:[-.28,0,1.1],0xffad4d);
   arrow(yacht,cat?[1.1,0,2.2]:[.62,0,.93],0xffad4d);
   for(let k=0;k<(cat?4:2);k++)
     arrow(yacht,[0,0,0],0x6cbcff);
   arrow(yacht,[0,0,-.08],0x77e7ba);
 }
 const subStart=specs.length,buoyIndex=subStart-1;
 if(sub){
   for(const r of sub.userData.rotors)arrow(sub,r.center.toArray(),0xff82af);
   arrow(sub,[0,0,.055],0x77e7ba);arrow(sub,[0,0,0],0xff524b);
 }
 const dir=new T.Vector3(),up=new T.Vector3(0,0,1),yaw=new T.Quaternion();
 return (enabled,b,f,showSub)=>{
   group.visible=enabled;if(!enabled)return;
   if(b&&!showSub)yaw.setFromAxisAngle(up,b[2]);
   const [sails,foils,arms]=showSub||!model?[]:model.getMany(['rigForce','foilLoad','foilArm']);
   for(let i=0;i<specs.length;i++){
     const {glyph,parent,origin}=specs[i];
     if((parent===sub)!==showSub){glyph.visible=false;continue;}
     glyph.position.copy(origin).applyQuaternion(parent.quaternion).add(parent.position);
     if(parent===sub){
       if(!f?.thrust){glyph.visible=false;continue;}
       const rotor=i-subStart,rotors=sub.userData.rotors;
       if(rotor<rotors.length)dir.copy(rotors[rotor].axis).multiplyScalar(f.thrust[rotor]).applyQuaternion(sub.quaternion);
       else if(rotor===rotors.length)dir.fromArray(f.buoyancy).applyQuaternion(sub.quaternion);
       else dir.fromArray(f.contact);
     }else if(i<2)dir.fromArray(sails,3*i).applyQuaternion(yaw);
     else if(i<buoyIndex){
       const offset=3*(i-2);
       glyph.position.fromArray(arms,offset).applyQuaternion(yaw).add(parent.position);
       dir.fromArray(foils,offset).applyQuaternion(yaw);
     }else dir.set(0,0,b[29]);
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

export function firstPersonInstruments(canvas){
  const ctx=canvas.getContext('2d'),deg=Math.PI/180;
  function line(x,y,X,Y){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(X,Y);ctx.stroke();}
  function box(x,y,text){
    const w=ctx.measureText(text).width/2+6;
    ctx.fillStyle='#032224c9';ctx.fillRect(x-w,y-9,2*w,18);ctx.strokeRect(x-w,y-9,2*w,18);
    ctx.fillStyle=ctx.strokeStyle;ctx.fillText(text,x,y);
  }
  return function draw(values,fov,height){
    const {roll,pitch,yaw,speed,level,sub,vertical}=values;
    const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.translate(w/2,h/2);
    ctx.strokeStyle='#71fff2';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.5;
    ctx.shadowColor='#052024';ctx.shadowBlur=2;ctx.font='bold 12px ui-monospace, monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';
    const heading=(90-yaw/deg+3600)%360,top=-h*.39,side=w*.39;
    for(let i=Math.ceil((heading-30)/5)*5;i<=heading+30;i+=5){
      const x=(i-heading)*w/125,n=(i+360)%360;
      line(x,top+13,x,top+(n%10===0?20:17));
      if(n%10===0)ctx.fillText(({0:'N',90:'E',180:'S',270:'W'})[n]??String(n),x,top+28);
    }
    box(0,top,String(Math.round(heading)%360).padStart(3,'0')+'°T');
    line(-3,top+11,0,top+15);line(0,top+15,3,top+11);
    const focal=height/(2*Math.tan(fov*deg/2));
    ctx.save();ctx.beginPath();ctx.rect(-w*.31,-h*.25,w*.62,h*.5);ctx.clip();ctx.rotate(-roll);
    for(let angle=-80;angle<=80;angle+=5){
      if(Math.abs(angle*deg+pitch)>Math.PI/3)continue;
      const y=-focal*Math.tan(angle*deg+pitch),span=w*(angle===0?.23:angle%10===0?.13:.075);
      ctx.setLineDash(angle<0?[4,3]:[]);
      for(const s of [-1,1]){
        line(s*12,y,s*span,y);
        if(angle!==0)line(s*span,y,s*span,y+Math.sign(angle)*4);
        if(angle!==0)ctx.fillText(String(Math.abs(angle)),s*(span+14),y);
      }
    }
    ctx.restore();
    line(-22,0,-10,0);line(-10,0,-5,4);line(5,4,10,0);line(10,0,22,0);
    ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.stroke();
    for(const [x,v,label] of [[-side,speed,'GS m/s'],[side,level,sub?'DEPTH m':'ALT m']]){
      const inward=x<0?1:-1;
      for(let k=Math.ceil(v-3);k<=v+3;k++){
        if(k<0 && (x<0||sub))continue;
        const y=(v-k)*17;
        if(Math.abs(y)<12)continue;
        line(x,y,x+inward*(k%2===0?8:4),y);
        if(k%2===0)ctx.fillText(String(k),x+inward*19,y);
      }
      box(x,0,v.toFixed(1));ctx.fillText(label,x,64);
    }
    if(!sub)ctx.fillText('V/S '+vertical.toFixed(1)+' m/s',0,h*.36);
    canvas.setAttribute('aria-label',(sub?'Submarine':'Drone')+' heading '+Math.round(heading)%360+' degrees true, '+(sub?'depth ':'altitude ')+level.toFixed(1)+' metres, speed '+speed.toFixed(1)+' metres per second');
  };
}
