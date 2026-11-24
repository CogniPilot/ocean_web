// FLU metres. The physical pressure barrel is the union of eight slats whose
// tips meet at the vertices of a regular 16-gon. Each duct retains its bore.
export const viewport={center:[.54,0,.1],radius:.168};
export function piccardParts(mounts,axes){
  const parts=[];
  function box(center,half,axis=0,angle=0,wire=true){
    const c=Math.cos(angle),s=Math.sin(angle);
    const basis=axis===2?[[c,s,0],[-s,c,0],[0,0,1]]:[[1,0,0],[0,c,s],[0,-s,c]];
    parts.push({center,half,basis,wire});
  }
  const barrels=[];
  function barrel(x,length,radius){
    barrels.push({x,length,radius});
    const step=Math.PI/8;
    for(let i=0;i<8;i++)
      box([x,0,.1],[length/2,radius*Math.cos(step/2),radius*Math.sin(step/2)],0,i*step,false);
  }
  barrel(0,1.05,.17);
  for(const x of [-.53,.53])barrel(x,.024,.18);
  for(const x of [-.30,.26])barrel(x,.067,.183);
  for(const sign of [-1,1]){
    const y=sign*.218;
    for(const x of [-.356,.356])box([x,y,.015],[.245,.0075,.0955]);
    box([0,y,.091],[.115,.0075,.0195]);
    box([0,y,-.143],[.6025,.0095,.015]);
    box([-.04,sign*.092,-.125],[.365,.08,.042]);
  }
  for(const x of [-.53,-.20,.43])box([x,0,-.177],[.016,.2225,.0095]);
  box([-.02,0,-.169],[.495,.20,.0065]);
  const halfAngle=Math.PI/12,mid=.5*(.106+.090)*Math.cos(halfAngle);
  const radial=.5*(.106-.090)*Math.cos(halfAngle),tangent=.106*Math.sin(halfAngle);
  for(const [index,[x,y,z]] of mounts.entries()){
    const vertical=axes[index][2]===1;
    for(let i=0;i<12;i++){
      const a=i*2*halfAngle,c=Math.cos(a),s=Math.sin(a);
      if(vertical)box([x+mid*c,y+mid*s,z+.0005],[radial,tangent,.0475],2,a);
      else box([x+.0005,y+mid*c,z+mid*s],[.0475,radial,tangent],0,a);
    }
  }
  return {parts,barrels};
}

export function piccardWireframe({parts,barrels}){
  const lines=[];
  for(const {center,half,basis,wire} of parts){
    if(!wire)continue;
    const corners=Array.from({length:8},(_,i)=>center.map((x,k)=>
      x+basis.reduce((v,axis,j)=>v+axis[k]*half[j]*(i&(1<<j)?1:-1),0)));
    for(let i=0;i<8;i++)for(let j=0;j<3;j++)if(!(i&(1<<j)))lines.push(...corners[i],...corners[i|(1<<j)]);
  }
  for(const {x,length,radius} of barrels){
    const end=(sign,i)=>[x+sign*length/2,radius*Math.cos((i+.5)*Math.PI/8),.1+radius*Math.sin((i+.5)*Math.PI/8)];
    for(let i=0;i<16;i++){
      for(const s of [-1,1])lines.push(...end(s,i),...end(s,i+1));
      if(i%4===0)lines.push(...end(-1,i),...end(1,i));
    }
  }
  return lines;
}
