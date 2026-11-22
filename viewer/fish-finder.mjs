// Two orthogonal projections of the same sonar ping, head-up and nose-right.
export function fishFinder(canvas){
  const c=canvas.getContext('2d');
  return (echoes,restock,t)=>{
    c.fillStyle='#081d26';c.fillRect(0,0,320,140);
    for(const side of [false,true]){
      const x=side?169:80,y=side?79:133,angle=side?.349:.785;
      c.save();c.translate(x,y);if(!side)c.rotate(-Math.PI/2);
      c.strokeStyle='#37606a';c.lineWidth=1;
      for(const r of [38,76,114]){
        c.beginPath();c.arc(0,0,r,-angle,angle);c.stroke();
      }
      for(const a of [-angle,angle]){c.beginPath();c.moveTo(0,0);c.lineTo(114*Math.cos(a),114*Math.sin(a));c.stroke();}
      for(let i=0;echoes&&i<restock.length;i++){
        const k=4*i,strength=echoes[k+3];
        if(!strength||restock[i]>t)continue;
        const b=echoes[k+1],e=echoes[k+2],r=echoes[k]*7.6;
        const ahead=r*Math.cos(b)*Math.cos(e),offset=side?-r*Math.sin(e):-r*Math.sin(b)*Math.cos(e);
        c.fillStyle='rgba(255,205,112,'+(.30+.70*strength)+')';
        c.beginPath();c.ellipse(ahead,offset,1.6,2.2,0,0,2*Math.PI);c.fill();
      }
      c.restore();
    }
    c.fillStyle='#a4d4d7';c.font='11px monospace';c.fillText('Bearing',8,15);c.fillText('Elevation',171,15);c.fillText('15 m',281,130);
  };
}
