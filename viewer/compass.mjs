// Angles from the model are east-zero and counterclockwise. The sailing dial
// is bow-up and clockwise, with zero at twelve o'clock.
export function raceClock(stage,next,elapsed,heatAge,early=false,roomHeat=false){
  const clock=seconds=>Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  const countdown=clock(Math.max(0,Math.ceil(next)));
  const race=clock(Math.max(0,Math.floor(elapsed)));
  if(stage>=2)return {phase:stage===5?'Finished · '+race:'Leg '+(stage-1)+'/3 · Race '+race,next:'Next start '+countdown};
  if(stage===1)return {phase:(early?'Over early':'Start open')+' · Race '+clock(Math.max(0,Math.floor(heatAge))),next:'Next start '+countdown};
  if(roomHeat&&heatAge>=0)return {phase:'Current heat '+clock(Math.floor(heatAge)),next:'Next start '+countdown};
  return {phase:early?'Return behind line':'',next:'Starts in '+countdown};
}

export function raceGroundTrack(){
  let key,last,speed;
  return (id,position,time,current)=>{
    if(key!==id||!position||!Number.isFinite(time)||!last||time<last.time){
      key=id;last=null;speed=undefined;
    }
    if(position&&Number.isFinite(time)&&(!last||time>last.time)){
      if(last){
        const dt=time-last.time,dx=position[0]-last.x,dy=position[1]-last.y;
        const dz=current?(position[2]??0)-last.z:0;
        speed=Math.hypot(dx,dy,dz)<=12+80*Math.min(dt,.5)?Math.hypot(
          dx/dt-(current?.[0]??0),dy/dt-(current?.[1]??0),dz/dt-(current?.[2]??0)):undefined;
      }
      last={x:position[0],y:position[1],z:position[2]??0,time};
    }
    return speed;
  };
}

export function drawRaceDial(canvas,{heading,boatSpeed,trueWind,cupSpeed,vane,pointer,noGo,target,detailed=false,
  timing,speedLabel='Boat speed',flow,drone=false}){
  const ctx=canvas.getContext('2d');
  const centerX=51,centerY=48,r=39;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const trueSpeed=trueWind?Math.hypot(trueWind[0],trueWind[1]):0;
  // The environmental vector points downwind in east/north. The vane points
  // upwind in hull axes, counterclockwise from the bow (positive to port).
  const sector=trueSpeed>.01?wrap(heading-Math.atan2(-trueWind[1],-trueWind[0])):null;
  const apparentFrom=cupSpeed>.01?wrap(-vane):null;
  const selectedFrom=pointer==='apparent'?apparentFrom:sector;
  const inside=sector!==null&&Math.abs(sector)<=noGo;
  const compass=a=>String(((Math.round(90-a*180/Math.PI)%360)+360)%360).padStart(3,'0')+'°';
  if(canvas.height!==192)canvas.height=192;
  ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,274,132);
  ctx.save();ctx.translate(centerX,centerY);
  ctx.beginPath();ctx.arc(0,0,r,0,2*Math.PI);ctx.fillStyle='#112a34';ctx.fill();
  if(sector!==null&&Number.isFinite(noGo)){
    ctx.save();ctx.rotate(sector-Math.PI/2);
    ctx.fillStyle='rgba(242,104,81,.28)';ctx.beginPath();ctx.moveTo(0,0);
    ctx.arc(0,0,r,-noGo,noGo);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#f28c74';ctx.lineWidth=1.5;
    for(const limit of [-noGo,noGo]){
      ctx.beginPath();ctx.moveTo(11*Math.cos(limit),11*Math.sin(limit));ctx.lineTo(r*Math.cos(limit),r*Math.sin(limit));ctx.stroke();
    }
    ctx.strokeStyle='#f28c74';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r,-noGo,noGo);ctx.stroke();
    ctx.restore();
  }
  if(selectedFrom!==null){
    ctx.save();ctx.rotate(selectedFrom-Math.PI/2);
    ctx.fillStyle='#ffd091';ctx.beginPath();ctx.moveTo(r-14,0);ctx.lineTo(r+3,-4);ctx.lineTo(r+3,4);ctx.closePath();ctx.fill();
    ctx.restore();
  }
  // True compass card rotates beneath a fixed bow index.
  const bowBearing=Math.PI/2-heading;
  ctx.textAlign='center';ctx.textBaseline='middle';
  for(let i=0;i<72;i+=2){
    const a=i*Math.PI/36-bowBearing,major=i%6===0;
    ctx.strokeStyle=major?'#d2e4e8':'#77949c';ctx.lineWidth=major?1.5:1;
    ctx.beginPath();ctx.moveTo((r-1)*Math.sin(a),-(r-1)*Math.cos(a));
    ctx.lineTo((r-(major?7:3))*Math.sin(a),-(r-(major?7:3))*Math.cos(a));ctx.stroke();
    if(major){
      ctx.fillStyle=i===0?'#ffc46e':'#e2eff0';
      ctx.font='bold 10px monospace';
      const cardinal={0:'N',18:'E',36:'S',54:'W'}[i];
      if(cardinal||detailed)ctx.fillText(cardinal||String(i*5),(r-15)*Math.sin(a),-(r-15)*Math.cos(a));
    }
  }
  ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-r+2);
  ctx.lineTo(-4,-r-7);ctx.lineTo(4,-r-7);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(0,-21);ctx.quadraticCurveTo(11,-7,7,15);ctx.lineTo(-7,15);ctx.quadraticCurveTo(-11,-7,0,-21);
  ctx.fillStyle=inside?'#ffb6a4':'#f0f8f6';ctx.fill();
  const targetColor='#ffade3';
  if(target){
    ctx.save();ctx.rotate(heading-target.angle);
    ctx.beginPath();ctx.moveTo(0,-31);ctx.lineTo(4,-21);ctx.lineTo(0,-23);ctx.lineTo(-4,-21);ctx.closePath();
    ctx.strokeStyle='#172831';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=targetColor;ctx.fill();ctx.restore();
  }
  ctx.restore();
  ctx.textAlign='left';
  function text(msg,x,y,color,font,align='left'){
    ctx.fillStyle=color;ctx.font=font;ctx.textAlign=align;ctx.fillText(msg,x,y);
  }
  const knots=speed=>(speed*1.94384449).toFixed(1)+' kn';
  text(speedLabel+'  '+(Number.isFinite(boatSpeed)?knots(boatSpeed):'—'),98,14,'#fff','bold 13px system-ui');
  if(detailed)text(compass(heading)+'T',271,14,'#e2eff0','bold 12px system-ui','right');
  function windRow(label,speed,angle,y,selected){
    const degrees=angle===null?null:Math.round(Math.abs(angle)*180/Math.PI);
    const side=angle<0?'port':'starboard';
    const direction=degrees===null?'Calm':degrees===0?'Bow':degrees===180?'Aft':degrees+'° '+(angle<0?'P':'S');
    const color=selected?'#ffd091':'#c9dfe1';
    if(detailed||selected){
      const row=detailed?y:32;
      text(label+' wind',98,row,color,'bold 12px system-ui');
      text(knots(speed),detailed?226:266,row,color,'bold 12px system-ui','right');
      if(detailed)text(direction,271,row,color,'bold 12px system-ui','right');
    }
    const from=degrees===null?'':degrees===0?' from the bow':degrees===180?' from astern':' from '+degrees+' degrees '+side;
    return label+' wind '+knots(speed)+from+'.';
  }
  let windText='';
  if(trueWind)windText=windRow(drone?'Est. true':'True',trueSpeed,sector,28,pointer!=='apparent');
  else if(drone)text('Wind estimate pending',98,32,'#c9dfe1','11px system-ui');
  if(Number.isFinite(cupSpeed))windText+=' '+windRow('Apparent',cupSpeed,apparentFrom,42,pointer==='apparent');
  if(flow){
    const speed=Math.hypot(flow[0],flow[1]),direction=speed>.005?compass(Math.atan2(flow[1],flow[0]))+'T':'—';
    const current='Current to '+direction+'  '+speed.toFixed(1)+' m/s';
    text(current,98,45,'#71dce4','11px system-ui');windText+=' '+current+'.';
  }
  if(target)text(target.label+'  '+target.bearing+'  '+Math.round(target.range)+' m',98,61,targetColor,'bold 12px system-ui');
  if(timing){
    if(timing.phase)text(timing.phase,98,77,'#e2eff0','bold 12px system-ui');
    text(timing.next,98,timing.phase?92:80,'#a5e5e0','bold 12px system-ui');
  }
  const noGoText=sector===null||!Number.isFinite(noGo)?'':inside?' Heading inside the no-go sector.':' Heading clear of the no-go sector.';
  canvas.setAttribute('aria-label','Heading '+compass(heading)+' true. '+(Number.isFinite(boatSpeed)?'Speed over ground '+knots(boatSpeed)+'. ':'')+windText+noGoText+
    (target?' '+target.label+' bearing '+target.bearing+', '+Math.round(target.range)+' metres.':'')+
    (timing?' '+[timing.phase,timing.next].filter(Boolean).join('. ')+'.':''));
}
