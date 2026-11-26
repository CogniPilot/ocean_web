// Body coordinates in metres, forward/port/up.
export const piccardScale=.5;
export const viewport={center:[.27,0,.05],radius:.084};

const nominalMounts=[.18,.0325,-.215].flatMap(x=>[[x,.16,0],[x,-.16,0]]);
const nominalAxes=nominalMounts.map((_,i)=>i<2?[1,0,0]:[0,0,1]);
const basis=[[1,0,0],[0,1,0],[0,0,1]];

export function piccardParts(mounts=nominalMounts,axes=nominalAxes){
  const parts=[];
  function cylinder(center,axis,length,radius){
    const half=[radius,radius,radius];
    half[axis]=length/2;
    parts.push({kind:'cylinder',axis,center,half,basis});
  }
  function plate(center,half){
    parts.push({kind:'plate',center,half,basis});
  }
  // The barrel includes its retaining collars. Ducts are solid at propeller scale.
  cylinder([0,0,.05],0,.542,.0915);
  mounts.forEach((mount,i)=>{
    const axis=axes[i][2]===1?2:0;
    const center=mount.slice();
    center[axis]+=.00025;
    cylinder(center,axis,.0475,.053);
  });
  // Two outer frame plates, belly pan, front and rear skid bars, magnetic pickup face.
  for(const side of [-1,1])plate([0,side*.109,-.011875],[.30125,.00475,.067125]);
  plate([-.01,0,-.0845],[.2475,.10,.00325]);
  for(const x of [-.265,.215])plate([x,0,-.0885],[.008,.11125,.00475]);
  plate([0,0,.1475],[.05,.034,.0025]);
  return {parts};
}

export function piccardWireframe({parts}){
  const lines=[];
  for(const {kind,center,half,axis} of parts){
    if(kind==='cylinder'){
      const u=(axis+1)%3,v=(axis+2)%3;
      function rim(side,i){
        const p=center.slice(),angle=i*Math.PI/6;
        p[axis]+=side*half[axis];
        p[u]+=half[u]*Math.cos(angle);
        p[v]+=half[v]*Math.sin(angle);
        return p;
      }
      for(let i=0;i<12;i++){
        for(const side of [-1,1])lines.push(...rim(side,i),...rim(side,i+1));
        if(i%3===0)lines.push(...rim(-1,i),...rim(1,i));
      }
    }else{
      const corners=Array.from({length:8},(_,i)=>center.map((x,k)=>x+(i&(1<<k)?1:-1)*half[k]));
      for(let i=0;i<8;i++)for(let k=0;k<3;k++)if(!(i&(1<<k)))lines.push(...corners[i],...corners[i|(1<<k)]);
    }
  }
  return lines;
}
