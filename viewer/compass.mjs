// Bearings on the dial are clockwise from true north. Model vectors are east/north.
export function drawCompass(canvas,wind,bearing,current,heading,location){
  const ctx=canvas.getContext('2d'),windColor='#ffc46e',currentColor='#71dce4';
  const currentSpeed=Math.hypot(current[0],current[1]);
  const flow=Math.atan2(current[1],current[0]);
  const degrees=ang=>String(((Math.round(90-ang*180/Math.PI)%360)+360)%360).padStart(3,'0')+'°';
  ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,canvas.width/2,canvas.height/2);
  ctx.save();ctx.translate(42,48);
  ctx.strokeStyle='#52717b';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,27,0,2*Math.PI);ctx.stroke();
  ctx.fillStyle='#bdd2d5';ctx.font='9px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const [name,x,y] of [['N',0,-34],['E',34,0],['S',0,34],['W',-34,0]])ctx.fillText(name,x,y);
  function arrow(angle,radius,color){
    ctx.save();ctx.rotate(-angle);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(radius-4,0);ctx.stroke();
    ctx.beginPath();ctx.moveTo(radius,0);ctx.lineTo(radius-7,-3);ctx.lineTo(radius-7,3);ctx.closePath();ctx.fill();ctx.restore();
  }
  if(wind>.01)arrow(bearing,26,windColor);
  if(currentSpeed>.005)arrow(flow,19,currentColor);
  if(heading!==null)arrow(heading,11,'white');
  ctx.restore();
  ctx.font='10px monospace';ctx.fillStyle=windColor;ctx.fillText('WIND TO',87,17);
  ctx.fillText(wind.toFixed(1)+' m/s  '+(wind>.01?degrees(bearing):'—'),87,31);
  ctx.fillStyle=currentColor;ctx.fillText(location.toUpperCase()+' FLOW TO',87,48);
  ctx.fillText(currentSpeed.toFixed(2)+' m/s '+(currentSpeed>.005?degrees(flow):'—'),87,62);
  ctx.fillStyle='#ecf4f5';ctx.fillText(heading===null?'TRUE NORTH UP':'HDG '+degrees(heading),87,84);
  canvas.setAttribute('aria-label','Wind toward '+degrees(bearing)+' at '+wind.toFixed(1)+' metres per second. '+location+' flow toward '+degrees(flow)+' at '+currentSpeed.toFixed(2)+' metres per second.');
}

export function drawDroneCompass(canvas,{yaw,wind},target){
  const ctx=canvas.getContext('2d'),radius=36,windColor='#ffc46e',markColor='#ffade3';
  const bearing=angle=>String((Math.round(90-angle*180/Math.PI)%360+360)%360).padStart(3,'0')+'°T';
  const windSpeed=wind?Math.hypot(...wind):0;
  const windFrom=windSpeed>.05?Math.atan2(-wind[1],-wind[0]):null;
  if(canvas.height!==192)canvas.height=192;
  ctx.setTransform(2,0,0,2,0,0);
  ctx.clearRect(0,0,canvas.width/2,canvas.height/2);
  ctx.save();ctx.translate(46,47);
  ctx.beginPath();ctx.arc(0,0,radius,0,2*Math.PI);
  ctx.fillStyle='#112a34';ctx.strokeStyle='#52717b';ctx.lineWidth=1;ctx.fill();ctx.stroke();
  ctx.font='bold 10px monospace';ctx.fillStyle='#dcebef';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const [i,name] of ['E','N','W','S'].entries()){
    const angle=yaw-i*Math.PI/2;
    ctx.fillText(name,26*Math.sin(angle),-26*Math.cos(angle));
  }
  function pointer(angle,color,tip){
    ctx.save();ctx.rotate(yaw-angle);ctx.fillStyle=color;
    ctx.beginPath();ctx.moveTo(0,-tip);ctx.lineTo(5,-tip+9);ctx.lineTo(0,-tip+7);
    ctx.lineTo(-5,-tip+9);ctx.closePath();ctx.fill();ctx.restore();
  }
  pointer(yaw,'#f0f8f6',13);
  if(windFrom!==null)pointer(windFrom,windColor,radius+1);
  if(target)pointer(target.angle,markColor,radius-16);
  ctx.restore();
  const windText=wind?windSpeed.toFixed(1)+' m/s  '+(windFrom===null?'Calm':'from '+bearing(windFrom)):'Acquiring estimate';
  const markText=target?target.label+'  '+target.bearing+'  '+Math.round(target.range)+' m':'';
  ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font='bold 11px monospace';
  ctx.fillStyle='#dcebef';ctx.fillText('HDG '+bearing(yaw),96,21);
  ctx.fillStyle=windColor;ctx.fillText('EST. TRUE WIND',96,39);ctx.fillText(windText,96,55);
  ctx.fillStyle=markColor;ctx.fillText(markText,96,78);
  canvas.setAttribute('aria-label','Heading '+bearing(yaw)+'. Estimated true wind '+windText+'. '+markText);
}

// Angles from the model are east-zero and counterclockwise. The sailing dial
// is bow-up and clockwise, with zero at twelve o'clock.
export function drawSailingDial(canvas,{heading,boatSpeed,trueWind,cupSpeed,vane,pointer,noGo,target}){
  const ctx=canvas.getContext('2d');
  const centerX=51,centerY=48,r=39;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const trueSpeed=Math.hypot(trueWind[0],trueWind[1]);
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
  if(sector!==null){
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
      ctx.fillText(cardinal||String(i*5),(r-15)*Math.sin(a),-(r-15)*Math.cos(a));
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
  text('SOG '+knots(boatSpeed),98,18,'#fff','bold 13px system-ui');
  text('HDG '+compass(heading)+'T',271,18,'#e2eff0','bold 12px system-ui','right');
  function windRow(label,speed,angle,y,selected){
    const degrees=angle===null?null:Math.round(Math.abs(angle)*180/Math.PI);
    const side=angle<0?'port':'starboard';
    const direction=degrees===null?'Calm':degrees===0?'Bow':degrees===180?'Aft':degrees+'° '+(angle<0?'P':'S');
    const color=selected?'#ffd091':'#c9dfe1';
    text(label==='Apparent'?'App. wind':'True wind',98,y,color,'bold 12px system-ui');
    text(knots(speed),219,y,color,'bold 12px system-ui','right');
    text(direction,271,y,color,'bold 12px system-ui','right');
    const from=degrees===null?'':degrees===0?' from the bow':degrees===180?' from astern':' from '+degrees+' degrees '+side;
    return label+' wind '+knots(speed)+from+'.';
  }
  const trueText=windRow('True',trueSpeed,sector,41,pointer==='true');
  const apparentText=windRow('Apparent',cupSpeed,apparentFrom,62,pointer==='apparent');
  if(target)text(target.label+'  '+target.bearing+'  '+Math.round(target.range)+' m',98,84,targetColor,'bold 12px system-ui');
  const noGoText=sector===null?'':inside?' Heading inside the no-go sector.':' Heading clear of the no-go sector.';
  canvas.setAttribute('aria-label','Heading '+compass(heading)+' true. Speed over ground '+knots(boatSpeed)+'. '+trueText+' '+apparentText+noGoText+(target?' '+target.label+' bearing '+target.bearing+', '+Math.round(target.range)+' metres.':''));
}
