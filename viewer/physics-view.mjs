// All geometry is projected from the current boat and water state. Keeping the
// annotations in a separate canvas also keeps them out of water captures.
export const cruiserInspectionFields=['stripEast','stripNorth','stripZ','stripForce','stripVolume'];
export const hullInspectionFields=['stationGeometry','beamFraction','halfSpacing','sectionVolume','sectionWater'];

export function physicsView(T,canvas,status){
  const ink=canvas.getContext('2d');
  const clip=new T.Vector3(),projected=new T.Vector2();
  const colors={main:'#79edff',jib:'#b2ffa8',mast:'#ffd080',joint:'#ff9cce',
    wet:'#5af2e9',dry:'#a1aab7',wave:'#7ebaff'};
  const clothEdges=new Set();
  for(let row=0;row<5;row++)for(let col=0;col<3;col++){
    const i=row*4+col;
    for(const [a,b] of [[i,i+1],[i,i+4],[i,i+5],[i+1,i+5],[i+4,i+5]])
      clothEdges.add(Math.min(a,b)*24+Math.max(a,b));
  }
  const waterPoints=Array.from({length:17*17},()=>new T.Vector3());
  const rigPoints=Array.from({length:24},()=>new T.Vector3());
  const a=new T.Vector3(),b=new T.Vector3(),center=new T.Vector3();
  let width,height,camera;
  const labelRects=[],markCache=new WeakMap();

  function project(point,object){
    clip.copy(point);
    if(object)clip.applyMatrix4(object.matrixWorld);
    clip.project(camera);
    if(clip.z < -1 || clip.z >= 1 || !Number.isFinite(clip.x))return null;
    return projected.set((clip.x+1)*width/2,(1-clip.y)*height/2);
  }
  function segment(from,to,object){
    const start=project(from,object);
    if(!start)return;
    const {x,y}=start;
    const end=project(to,object);
    if(end){ink.moveTo(x,y);ink.lineTo(end.x,end.y);}
  }
  function dot(point,object,color,radius=3){
    const p=project(point,object);
    if(!p)return;
    ink.fillStyle=color;
    ink.beginPath();ink.arc(p.x,p.y,radius,0,2*Math.PI);ink.fill();
  }
  function label(point,object,caption,color,dx=8,dy=-8){
    const p=project(point,object);
    if(!p||p.x<0||p.x>width||p.y<0||p.y>height)return;
    ink.font='600 11px ui-monospace, monospace';
    const span=ink.measureText(caption).width+4;
    const x=Math.min(width-span,Math.max(0,p.x+dx));
    let y=p.y+dy;
    const overlaps=()=>labelRects.some(rect=>x<rect.x+rect.width&&x+span>rect.x&&Math.abs(rect.y-y)<13);
    while(y<height-2&&overlaps())y+=13;
    if(y<10||y>height-2)return;
    labelRects.push({x,y,width:span});
    if(Math.abs(y-(p.y+dy))>2){
      ink.strokeStyle=color;ink.lineWidth=.7;ink.beginPath();ink.moveTo(p.x,p.y);ink.lineTo(x,y-5);ink.stroke();
    }
    ink.strokeStyle='#071d2b';ink.lineWidth=3;
    ink.strokeText(caption,x,y);
    ink.fillStyle=color;ink.fillText(caption,x,y);
  }
  function drawRig(rig){
    for(const [index,sail] of rig.sails.entries()){
      const color=index===0?colors.main:colors.jib;
      for(let i=0;i<24;i++)rigPoints[i].fromBufferAttribute(sail.coords,i);
      ink.strokeStyle=color;ink.lineWidth=1;ink.beginPath();
      for(const edge of clothEdges)
        segment(rigPoints[Math.floor(edge/24)],rigPoints[edge%24],sail.pivot);
      ink.stroke();
      for(const node of rigPoints)dot(node,sail.pivot,color,2.5);
      label(rigPoints[14],sail.pivot,index===0?'Main · 24 nodes':'Jib · 24 nodes',color);
      if(index===0){
        ink.strokeStyle=colors.mast;ink.lineWidth=2;ink.beginPath();
        for(let row=1;row<6;row++)segment(rigPoints[(row-1)*4],rigPoints[row*4],sail.pivot);
        ink.stroke();
        for(let row=0;row<6;row++){
          const node=rigPoints[row*4];
          dot(node,sail.pivot,colors.mast,4);
          label(node,sail.pivot,'M'+(row+1),colors.mast,-24,-5);
        }
      }
    }
    drawJoints(rig.joints,.27);
  }
  function drawJoints(joints,length){
    for(const [joint,axis,name] of joints){
      b.fromArray(axis).normalize().multiplyScalar(length);a.copy(b).negate();
      ink.strokeStyle=colors.joint;ink.lineWidth=2;ink.beginPath();
      segment(a,b,joint);ink.stroke();
      a.set(0,0,0);
      dot(a,joint,colors.joint,4);
      if(name)label(b,joint,name,colors.joint);
    }
  }

  function drawBody(body){
    const {group,kind,thrust}=body;
    const scale=kind==='motorboat'?1.1:kind==='drone'?.22:kind==='gull'?.30:kind==='sub'?.32:kind==='boat'?.62:1.25;
    const axes=[[scale,0,0,'X · Forward','#ffb278'],[0,scale,0,'Y · Port','#a1f1a2'],[0,0,scale,'Z · Up','#8ccaff']];
    a.set(0,0,0);
    for(const [x,y,z,name,color] of axes){
      b.set(x,y,z);
      ink.strokeStyle=color;ink.lineWidth=2;ink.beginPath();segment(a,b,group);ink.stroke();
      label(b,group,name,color);
    }
    let joints=markCache.get(group);
    if(!joints){
      joints=[];
      group.traverse(object=>{
        const frame=object.userData.physicsJoint;
        if(frame)joints.push([object,frame.axis,frame.label]);
      });
      markCache.set(group,joints);
    }
    drawJoints(joints,kind==='gull'?.07:kind==='drone'?.09:kind==='motorboat'?.34:.35);
    if(kind==='sub'){
      const rotors=group.userData.rotors;
      for(const [i,rotor] of rotors.entries()){
        const force=thrust?.[i]??0;
        a.copy(rotor.center);b.copy(a).addScaledVector(rotor.axis,(Math.sign(force)||1)*(.13+.037*Math.abs(force)));
        ink.strokeStyle=colors.joint;ink.lineWidth=2;ink.beginPath();segment(a,b,group);ink.stroke();
        dot(a,group,colors.joint,3);
        label(b,group,'T'+(i+1)+' '+force.toFixed(1)+' N',colors.joint);
      }
    }
  }
  function drawCruiserStrips(strips){
    const [east,north,z,force,volume]=strips;
    if(!east)return;
    for(let i=0;i<east.length;i++){
      const color=volume[i]>0?colors.wet:colors.dry;
      a.set(east[i],north[i],z[i]);b.copy(a);b.z+=Math.min(1.4,Math.max(-1.4,force[i]/1800));
      ink.strokeStyle=color;ink.lineWidth=2;ink.beginPath();segment(a,b);ink.stroke();
      dot(a,null,color,3);label(b,null,Math.round(volume[i]*1000)+' L',color);
    }
  }

  function drawHull(hull,boat,ocean){
    const {stations,fractions,separation,volume,probes}=hull;
    for(let side=0;side<(separation>0?2:1);side++)for(let i=0;i<6;i++){
      const offset=6*i,x=stations[offset],beam=stations[offset+1],y=(1-2*side)*separation;
      const wet=volume[6*side+i];
      const color=wet>1e-5?colors.wet:colors.dry;
      ink.strokeStyle=color;ink.lineWidth=1.7;ink.beginPath();
      for(const sign of [-1,1])for(let j=0;j<3;j++){
        a.set(x,y+sign*beam*fractions[j],stations[offset+2+j]);
        b.set(x,y+sign*beam*fractions[j+1],stations[offset+3+j]);
        segment(a,b,boat);
      }
      a.set(x,y-beam,stations[offset+5]);b.set(x,y+beam,stations[offset+5]);
      segment(a,b,boat);ink.stroke();
      center.set(x,y,0).applyMatrix4(boat.matrixWorld);
      center.z=probes?.[6*side+i]??ocean.sampleSurface(center.x,center.y,true);
      if(probes){
        const {swell,swellCenter}=ocean.U;
        const wave=swell.value,k=swellCenter.value;
        center.z+=wave.x*Math.sin(wave.y+wave.z*(center.x-k.x)+wave.w*(center.y-k.y));
      }
      dot(center,null,color,3);
      a.set(x,y+beam,stations[offset+5]);
      if(wet>=.0005)label(a,boat,Math.round(wet*1000)+' L',color);
    }
  }

  function drawWater(ocean,x,y){
    const {spectrumPeriod,wakeAvailable,bowAvailable}=ocean.U;
    const wake=wakeAvailable.value>.5;
    const spacing=wake?spectrumPeriod.value/64:2;
    // Follow the inspected body while interpolating the world-space field.
    const startX=x-8*spacing,startY=y-8*spacing;
    const size=17;
    ink.strokeStyle=colors.wave;ink.lineWidth=1;ink.globalAlpha=.52;ink.beginPath();
    for(let j=0;j<size;j++)for(let i=0;i<size;i++){
      const east=startX+i*spacing,north=startY+j*spacing;
      const k=j*size+i,point=waterPoints[k].set(east,north,ocean.sampleSurface(east,north,true));
      if(i)segment(waterPoints[k-1],point);
      if(j)segment(waterPoints[k-size],point);
    }
    ink.stroke();ink.globalAlpha=1;
    status.textContent='Boat-centered samples · '+(wake?'64×64 hull FFT · '+spacing.toFixed(2)+' m cells · ':'')+
      '32×32 wind-sea grid · analytic swell'+(bowAvailable.value>.5?' · 32×32 bow field':'');
  }

  function draw(viewCamera,body,ocean,options,hull){
    width=canvas.clientWidth;height=canvas.clientHeight;
    if(!width||!height)return;
    const scale=Math.min(2,devicePixelRatio||1);
    const w=Math.round(width*scale),h=Math.round(height*scale);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ink.setTransform(scale,0,0,scale,0,0);ink.clearRect(0,0,width,height);
    labelRects.length=0;
    const {group}=body;
    camera=viewCamera;camera.updateMatrixWorld();group.updateMatrixWorld(true);
    if(options.water)drawWater(ocean,group.position.x,group.position.y);
    status.hidden=!options.water;
    if(options.rig){
      drawBody(body);
      if(body.rig)drawRig(body.rig);
    }
    if(options.hulls){
      if(hull?.stations)drawHull(hull,group,ocean);
      if(body.strips)drawCruiserStrips(body.strips);
    }
  }
  return {draw};
}
