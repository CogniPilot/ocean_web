import {sonarHalfBearing,sonarMount} from './cruiser-sonar-view.mjs';

// The same terrain profile is used to build the island mesh. Search radially
// for its land and depth contours at the model's mean water level.
function contour({center,height},level){
  return Array.from({length:96},(_,i)=>{
    const angle=2*Math.PI*i/96,x=17*Math.cos(angle),y=11*Math.sin(angle);
    let lo=0,hi=Math.min(29/Math.abs(x),23/Math.abs(y));
    for(let j=0;j<14;j++){
      const mid=(lo+hi)/2;
      if(height(mid*x,mid*y)>=level)lo=mid;else hi=mid;
    }
    return [center[0]+lo*x,center[1]+lo*y];
  });
}

function eastNorth(pose,ahead,port,up){
  const [e,n,,roll,pitch,yaw]=pose;
  const y=Math.cos(roll)*port-Math.sin(roll)*up;
  const z=Math.sin(roll)*port+Math.cos(roll)*up;
  const x=Math.cos(pitch)*ahead+Math.sin(pitch)*z;
  return [e+Math.cos(yaw)*x-Math.sin(yaw)*y,n+Math.sin(yaw)*x+Math.cos(yaw)*y];
}

export function cruiserChart(canvas,fitButton,terrain){
  const c=canvas.getContext('2d'),{width:w,height:h}=canvas;
  const bands=[[-10,'#a9d1d8'],[-6,'#c0dfe1'],[-3,'#daebe5'],[0,'#eddfb5']];
  let contours,scan,fit=false;
  function draw(){
    if(!scan)return;
    const {pose,range,points}=scan;
    const [east,north,,,,yaw]=pose;
    const offset=fit ? .38*range : 0,scale=w/(fit?Math.max(200,2.35*range):200);
    const focusE=east+offset*Math.cos(yaw),focusN=north+offset*Math.sin(yaw);
    const px=e=>w/2+(e-focusE)*scale,py=n=>h/2-(n-focusN)*scale;
    c.fillStyle='#91bdcd';c.fillRect(0,0,w,h);
    const grid=fit&&range>=200?100:25;
    c.lineWidth=1;c.strokeStyle='#426d7b33';
    c.beginPath();
    for(let e=Math.ceil((focusE-w/(2*scale))/grid)*grid;px(e)<w;e+=grid){
      c.moveTo(px(e),0);c.lineTo(px(e),h);
    }
    for(let n=Math.floor((focusN+h/(2*scale))/grid)*grid;py(n)<h;n-=grid){
      c.moveTo(0,py(n));c.lineTo(w,py(n));
    }
    c.stroke();
    contours??=bands.map(([level,fill])=>({level,fill,points:contour(terrain,level)}));
    for(const {level,fill,points} of contours){
      c.beginPath();
      points.forEach(([e,n],i)=>{if(i===0)c.moveTo(px(e),py(n));else c.lineTo(px(e),py(n));});
      c.closePath();c.fillStyle=fill;c.fill();
      c.strokeStyle=level===0?'#786d4f':'#557e83';c.stroke();
      if(level<0&&scale>1){
        const [e,n]=points[level===-3?60:level===-6?71:82];
        c.font='600 13px system-ui';c.fillStyle='#284e5b';c.fillText(String(-level),px(e)+4,py(n)+5);
      }
    }

    const [e,n]=eastNorth(pose,...sonarMount),x=px(e),y=py(n),heading=-yaw;
    c.beginPath();c.moveTo(x,y);
    c.arc(x,y,range*scale,heading-sonarHalfBearing,heading+sonarHalfBearing);
    c.closePath();c.fillStyle='#245eab28';c.strokeStyle='#215c8b';c.lineWidth=1.6;c.fill();c.stroke();
    c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(yaw)*range*scale,y-Math.sin(yaw)*range*scale);c.stroke();
    for(const point of points){
      if(point.kind===1)continue;
      const [a,p,u]=point.xyz,[ee,nn]=eastNorth(pose,a+sonarMount[0],p+sonarMount[1],u+sonarMount[2]);
      c.fillStyle=point.kind===2?'#744260':'#a64918';
      c.fillRect(px(ee)-1.4,py(nn)-1.4,2.8,2.8);
    }

    // The model's ship lies east-west between the stern at 0 and bow at 34.
    c.strokeStyle='#6a3d67';c.lineWidth=1.6;c.setLineDash([4,3]);
    c.strokeRect(px(0),py(4),34*scale,8*scale);c.setLineDash([]);
    c.font='600 14px system-ui';c.fillStyle='#553251';c.fillText('Wreck',px(17)-16,py(-4)+16);
    c.save();c.translate(px(east),py(north));c.rotate(heading+Math.PI/2);
    c.beginPath();c.moveTo(0,-10);c.lineTo(6,7);c.lineTo(0,4);c.lineTo(-6,7);c.closePath();
    c.fillStyle='#152c42';c.strokeStyle='#f4ffff';c.lineWidth=1.5;c.fill();c.stroke();c.restore();

    c.fillStyle='#193a4b';c.font='700 16px system-ui';c.fillText('N',w-32,28);
    c.beginPath();c.moveTo(w-26,35);c.lineTo(w-31,50);c.lineTo(w-21,50);c.closePath();c.fill();
    const bar=grid*scale;
    c.fillRect(16,h-19,bar,2);c.fillRect(16,h-23,2,8);c.fillRect(16+bar,h-23,2,8);
    c.font='600 14px system-ui';c.fillText(grid+' m',16,h-27);
    c.textAlign='right';c.fillText('Depths in m',w-16,h-17);c.textAlign='left';
  }
  fitButton.addEventListener('click',()=>{
    fit=!fit;fitButton.setAttribute('aria-pressed',String(fit));draw();
  });
  return (pose,range,points=[])=>{scan={pose,range,points};draw();};
}
