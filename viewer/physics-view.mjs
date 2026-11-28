import {rigSelection} from './rig-selection.mjs';
import {battenPath} from './board/sail-battens.mjs';
import {forEachGridEdge,forEachHullSectionEdge,surfaceGridColor} from './physics-geometry.mjs';

// All geometry is projected from the current boat and water state. Keeping the
// annotations in a separate canvas also keeps them out of water captures.
export const cruiserInspectionFields=['stripEast','stripNorth','stripZ','stripForce','stripVolume'];
export const hullInspectionFields=['stationGeometry','beamFraction','halfSpacing','sectionVolume','sectionWater'];
export const refinedHullInspectionFields=['hydroStationGeometry','hydroSectionVolume'];
export const battenInspectionFields=[1,2].flatMap(sail=>
  ['battenCount','battenLuff','battenLeech','mesh'].map(name=>`cloth[${sail}].${name}`));

export function sampleAirflow(model,position,ambient,{rotors,sailPeers,sailNpcs,sailSource,catamaran}={}){
  const dimensions=rotors?[7,7,7]:[7,5,5];
  const [length,width,height]=dimensions;
  const buffer=new Float64Array(343*3);
  const points=buffer.subarray(0,length*width*height*3);
  const [dx,dy,dz]=catamaran?[3,3,1.8]:[2,2,.65];
  const nearRotor=[-1.14,-.57,-.22,0,.22,.57,1.14];
  const rotorLevels=[-2.48,-1.55,-.82,-.34,0,.41,1.02];
  const [alongEast,alongNorth]=ambient;
  const horizontalWind=Math.hypot(alongEast,alongNorth);
  const alignWind=!rotors&&horizontalWind>.01;
  const east=alignWind?alongEast/horizontalWind:1,north=alignWind?alongNorth/horizontalWind:0;
  for(let z=0;z<height;z++)for(let y=0;y<width;y++)for(let x=0;x<length;x++){
    const along=rotors?nearRotor[x]:(x-(length-1)/2)*dx;
    const across=rotors?nearRotor[y]:(y-(width-1)/2)*dy;
    const elevation=rotors?rotorLevels[z]:(z-1)*dz;
    points.set([position[0]+along*east-across*north,position[1]+along*north+across*east,
      position[2]+elevation],3*((z*width+y)*length+x));
  }
  model.set('mode',Number(Boolean(rotors)));
  model.set('points',buffer);
  model.set('ambient',ambient);
  if(rotors){
    model.set('rotorTraffic',rotors.traffic);
    model.set('rotorHubs',rotors.hubs);
    model.set('rotorParameters',rotors.parameters);
    model.set('localRotor',rotors.source??new Float64Array(12));
  }else{
    const traffic=new Float64Array(90);
    if(sailPeers)traffic.set(sailPeers);
    if(sailNpcs)traffic.set(sailNpcs,36);
    if(sailSource)traffic.set(sailSource,81);
    model.set('sailTraffic',traffic);
  }
  return {points,position,ambient,dimensions,spacing:rotors ? .32 : Math.min(dx,dy,dz),velocity:model.get('velocity').slice(0,points.length),
    rotor:Boolean(rotors),thrust:rotors?model.get('localRotorThrust'):null};
}

// Use the same selected mean field for physics, inspection and suspended particles.
export function currentVelocities(model,points,environment,out=new Float64Array(points.length)){
  if(model.sample){
    const pos=[0,0,0],v=[0,0,0];
    for(let i=0;i<points.length;i+=3){
      pos[0]=points[i];pos[1]=points[i+1];pos[2]=points[i+2];
      model.sample(pos,v);out.set(v,i);
    }
    return out;
  }
  model.set('points',points);
  ['tide','wind','bearing','tidalEast'].forEach((name,i)=>model.set(name,environment[i]));
  return model.get('velocity',out);
}

export function sampleCurrent(model,position,environment,bed,surface){
  const spacing=.9,points=new Float64Array(125*3),wet=new Uint8Array(125);
  for(let y=0;y<5;y++)for(let x=0;x<5;x++){
    const east=position[0]+spacing*(x-2),north=position[1]+spacing*(y-2);
    const floor=bed?.(east,north)??-Infinity,top=surface?.(east,north)??environment[0];
    for(let z=0;z<5;z++){
      const index=25*z+5*y+x,up=position[2]+spacing*(z-2);
      points.set([east,north,up],3*index);
      wet[index]=Number(up>=floor&&up<=top);
    }
  }
  return {points,position,velocity:currentVelocities(model,points,environment),spacing,dimensions:[5,5,5],ambient:[0,0,0],water:true,wet};
}

export function alignPontoonSamples(points,stations,separation,transform,aligned){
  const sections=stations.length/6;
  for(let side=0;side<2;side++){
    const y=(1-2*side)*separation;
    for(let i=0;i<sections;i++){
      const x=stations[6*i],offset=3*(side*sections+i);
      // Both the slice and its probe start at the same hull-frame station.
      // Only the elevation comes from the water sample.
      aligned[offset]=transform[0]*x+transform[4]*y+transform[12];
      aligned[offset+1]=transform[1]*x+transform[5]*y+transform[13];
      aligned[offset+2]=points[offset+2];
    }
  }
  return aligned;
}

export function physicsView(T,canvas,status,viewport,select,signal){
  const picker=rigSelection(T,viewport,select,signal);
  const ink=canvas.getContext('2d');
  const clip=new T.Vector3(),projected=new T.Vector2();
  const colors={main:'#79edff',jib:'#b2ffa8',mast:'#ffd080',joint:'#ff9cce',batten:'#fff07b',
    wet:'#5af2e9',dry:'#a1aab7',wind:'#7ebaff',wake:'#bd96ff',near:'#ffce74',swimmer:'#62ffe3',surface:surfaceGridColor};
  const surfaceField={size:32,length:64,emphasis:true};
  let gridPixels=new Float64Array(32*32*2);
  const a=new T.Vector3(),b=new T.Vector3(),center=new T.Vector3(),airflowOffset=new T.Vector3(),priorFlow=new T.Vector3();
  let pontoonPoints;
  let width,height,camera,labelsVisible=true;
  const labelRects=[],markCache=new WeakMap(),battenPaths=new WeakMap(),rigMeshes=new WeakMap();

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
    if(!labelsVisible)return;
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
  function rigMesh(sail){
    let mesh=rigMeshes.get(sail);
    if(!mesh){
      const count=sail.coords.count,edges=[];
      forEachGridEdge(4,count/4,(i,j)=>edges.push([i,j]),true);
      mesh={edges,points:Array.from({length:count},()=>new T.Vector3())};
      rigMeshes.set(sail,mesh);
    }
    return mesh;
  }
  function drawRig(rig){
    for(const [index,sail] of rig.sails.entries()){
      const color=index===0?colors.main:colors.jib;
      const {points:rigPoints,edges}=rigMesh(sail);
      for(let i=0;i<rigPoints.length;i++)rigPoints[i].fromBufferAttribute(sail.coords,i);
      ink.strokeStyle=color;ink.lineWidth=1;ink.beginPath();
      for(const [i,j] of edges)segment(rigPoints[i],rigPoints[j],sail.pivot);
      ink.stroke();
      for(const node of rigPoints)dot(node,sail.pivot,color,2.5);
      label(rigPoints[4*Math.floor(rigPoints.length/7)+2],sail.pivot,
        (index===0?'Main':'Jib')+' · '+rigPoints.length+' nodes',color);
      const battens=rig.battens?.[index];
      if(sail.battenRows||battens?.[0]>0)drawBattens(sail,rigPoints,battens);
      if(index===0){
        const stations=rig.mastStations;
        const frame=stations?sail.pivot.parent:sail.pivot;
        const count=stations?stations.length/3:6;
        ink.strokeStyle=colors.mast;ink.lineWidth=2;ink.beginPath();
        for(let row=1;row<count;row++){
          if(stations)segment(a.fromArray(stations,3*(row-1)),b.fromArray(stations,3*row),frame);
          else segment(rigPoints[(row-1)*4],rigPoints[row*4],frame);
        }
        ink.stroke();
        for(let row=0;row<count;row++){
          const node=stations?a.fromArray(stations,3*row):rigPoints[row*4];
          dot(node,frame,colors.mast,4);
          label(node,frame,'M'+(row+1),colors.mast,-24,-5);
        }
      }
    }
    drawJoints(rig.joints,.27);
  }
  function drawBattens(sail,rigPoints,battens){
    const count=sail.battenRows||battens[0];
    ink.save();
    ink.lineCap='round';ink.beginPath();
    let anchor;
    if(sail.battenRows){
      for(let row=1;row<=count;row++)for(let col=0;col<3;col++){
        const i=4*row+col;
        segment(rigPoints[i],rigPoints[i+1],sail.pivot);
      }
      anchor=rigPoints[4*(Math.floor(count/2)+1)+3];
    }else{
      const [,luff,leech,rest]=battens;
      let paths=battenPaths.get(battens);
      if(!paths){
        paths=Array.from({length:count},(_,i)=>battenPath(rest,sail.geo.index.array,luff[i],leech[i]));
        battenPaths.set(battens,paths);
      }
      const point=(target,[i,j,k,wi,wj,wk])=>target.copy(rigPoints[i]).multiplyScalar(wi)
        .addScaledVector(rigPoints[j],wj).addScaledVector(rigPoints[k],wk);
      for(const path of paths)for(const {from,to} of path)segment(point(a,from),point(b,to),sail.pivot);
      const middle=paths[Math.floor(count/2)];
      if(middle.length)anchor=point(a,middle.at(-1).to);
    }
    ink.strokeStyle='#071d2b';ink.lineWidth=4.6;ink.stroke();
    ink.strokeStyle=colors.batten;ink.lineWidth=2.2;ink.stroke();
    ink.restore();
    if(anchor)label(anchor,sail.pivot,count+' full-length battens',colors.batten,8,8);
  }
  const shaft=new T.Vector3(),across=new T.Vector3(),perpendicular=new T.Vector3(),end=new T.Vector3(),viewAxis=new T.Vector3();
  const bodyColor='#64ebdf';
  let namesVisible=false;
  const catalogs=new WeakMap();
  function strokePath(color,width){
    ink.strokeStyle='#092331';ink.lineWidth=width+2;ink.stroke();
    ink.strokeStyle=color;ink.lineWidth=width;ink.stroke();
  }
  function drawJoints(joints,length){
    camera.getWorldDirection(viewAxis);
    for(const [joint,axis,name] of joints){
      center.setFromMatrixPosition(joint.matrixWorld);
      const focus=picker.active?.frame===joint&&picker.active.kind==='joint';
      shaft.fromArray(axis).transformDirection(joint.matrixWorld);
      if(!namesVisible&&!focus){
        const p=project(center);
        if(!p)continue;
        const {x,y}=p,tip=project(end.copy(center).addScaledVector(shaft,length));
        if(!tip)continue;
        const turn=Math.atan2(tip.y-y,tip.x-x),edge=Math.abs(viewAxis.dot(shaft));
        // Draw the hinge collar and its short axle. Co-located rotation axes
        // share a pivot but keep their own projected orientation.
        const r=4.5;
        ink.beginPath();
        ink.ellipse(x,y,r,Math.max(1.3,r*edge),turn+Math.PI/2,0,2*Math.PI);
        ink.moveTo(x-5*Math.cos(turn)*(1-edge),y-5*Math.sin(turn)*(1-edge));
        ink.lineTo(x+5*Math.cos(turn)*(1-edge),y+5*Math.sin(turn)*(1-edge));
        strokePath(colors.joint,1.45);
        continue;
      }
      across.set(Math.abs(shaft.z)<.85?0:1,0,Math.abs(shaft.z)<.85?1:0).cross(shaft).normalize();
      perpendicular.crossVectors(shaft,across);
      const radius=.37*length;
      a.copy(center).addScaledVector(across,radius);
      ink.beginPath();
      for(let i=1;i<=18;i++){
        const angle=2*Math.PI*i/18;
        b.copy(center).addScaledVector(across,radius*Math.cos(angle)).addScaledVector(perpendicular,radius*Math.sin(angle));
        segment(a,b);a.copy(b);
      }
      a.copy(center).addScaledVector(shaft,-length*.65);
      end.copy(center).addScaledVector(shaft,length);
      segment(a,end);
      for(const direction of [-1,1]){
        b.copy(end).addScaledVector(shaft,-radius*.75).addScaledVector(across,direction*radius*.48);
        segment(end,b);
      }
      strokePath(colors.joint,1.7);
      dot(center,null,'#192536',4);dot(center,null,colors.joint,2.4);
      if(name||focus)label(center,null,name??picker.active.label,colors.joint,9,-9);
    }
  }
  function rigidMarkers(group,joints){
    const bodies=group.userData.physicsBodies??[];
    ink.beginPath();
    for(const [joint] of joints){
      let parent=joint.parent;
      while(parent&&parent!==group&&!parent.userData.physicsJoint)parent=parent.parent;
      if(parent){
        a.setFromMatrixPosition(parent.matrixWorld);b.setFromMatrixPosition(joint.matrixWorld);
        segment(a,b);
      }
    }
    for(const {frame,center:com} of bodies){
      a.setFromMatrixPosition(frame.matrixWorld);b.fromArray(com).applyMatrix4(frame.matrixWorld);segment(a,b);
    }
    strokePath(bodyColor,1.8);
    for(const {frame,center:com,label:name} of bodies){
      center.fromArray(com).applyMatrix4(frame.matrixWorld);
      const pt=project(center);
      if(!pt)continue;
      const {x,y}=pt;
      const focus=picker.active?.frame===frame&&picker.active.kind==='body',r=focus?5:2.8;
      ink.beginPath();ink.moveTo(x,y-r);ink.lineTo(x+r,y);ink.lineTo(x,y+r);ink.lineTo(x-r,y);ink.closePath();
      ink.fillStyle=bodyColor;ink.fill();ink.lineWidth=1;ink.strokeStyle='#092331';ink.stroke();
      if(name&&(namesVisible||focus))label(center,null,name,bodyColor,9,12);
    }
  }

  function drawBody(body){
    const {group,kind,thrust}=body;
    const scale=kind==='motorboat'?.48:kind==='drone'?.10:kind==='gull'?.12:kind==='sub'?.14:kind==='boat'?.32:kind==='diver'?.13:.42;
    const axes=[[scale,0,0,'F','#ffb278'],[0,scale,0,'L','#a1f1a2'],[0,0,scale,'U','#8ccaff']];
    a.set(0,0,0);
    const showAxes=namesVisible||!group.userData.physicsBodies?.length;
    for(const [x,y,z,name,color] of showAxes?axes:[]){
      b.set(x,y,z);
      ink.strokeStyle=color;ink.lineWidth=2;ink.beginPath();segment(a,b,group);ink.stroke();
      label(b,group,name,color);
    }
    let joints=markCache.get(group);
    if(!joints){
      joints=[];
      group.traverse(object=>{
        const frame=object.userData.physicsJoint;
        if(frame){
          joints.push([object,frame.axis,frame.label]);
          for(const axis of frame.axes??[])joints.push([object,axis]);
        }
      });
      if(joints.length)markCache.set(group,joints);
    }
    const bodies=group.userData.physicsBodies,extra=body.rig?.joints;
    let catalog=catalogs.get(group);
    if(!catalog||catalog.bodies!==bodies||catalog.extra!==extra||catalog.count!==joints.length){
      const parts=[],seen=new Set();
      function add(kind,frame,label,point=[0,0,0]){
        const key=kind+':'+frame.id;
        if(seen.has(key)||!label)return;
        seen.add(key);parts.push({key,kind,frame,label,center:point});
      }
      for(const body of bodies??[])add('body',body.frame,body.label,body.center);
      for(const [joint,,name] of joints)add('joint',joint,name);
      for(const [joint,,name] of extra??[])add('joint',joint,name??joint.name);
      catalog={parts,bodies,extra,count:joints.length};catalogs.set(group,catalog);
    }
    picker.update(group,catalog.parts,camera,width,height);
    rigidMarkers(group,joints);
    drawJoints(joints,kind==='gull'?.07:kind==='drone'?.09:kind==='motorboat'?.34:kind==='shark'?.19:kind==='diver'?.085:.35);
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
  const stripFrame=new T.Matrix4(),stripPosition=new T.Vector3(),stripRotation=new T.Quaternion();
  const stripEuler=new T.Euler(),unitScale=new T.Vector3(1,1,1);
  function drawCruiserStrips(strips,heights,group,pose){
    const [east,north,z,force,volume]=strips;
    if(!east)return;
    if(pose){
      stripPosition.fromArray(pose);
      stripRotation.setFromEuler(stripEuler.set(pose[3],pose[4],pose[5],'ZYX'));
      stripFrame.compose(stripPosition,stripRotation,unitScale).invert().premultiply(group.matrixWorld);
    }else stripFrame.identity();
    for(let i=0;i<east.length;i++){
      const color=volume[i]>0?colors.wet:colors.dry;
      a.set(east[i],north[i],z[i]).applyMatrix4(stripFrame);b.copy(a);b.z+=Math.min(1.4,Math.max(-1.4,force[i]/1800));
      ink.strokeStyle=color;ink.lineWidth=2;ink.beginPath();segment(a,b);ink.stroke();
      dot(a,null,color,3);label(b,null,Math.round(volume[i]*1000)+' L',color);
      if(heights){a.z=heights[i];dot(a,null,'#f4f8ff',2.3);}
    }
  }

  function drawHull(hull,boat){
    const {stations,fractions,separation,volume}=hull;
    const sections=stations.length/6;
    for(let side=0;side<(separation>0?2:1);side++)for(let i=0;i<sections;i++){
      const offset=6*i,x=stations[offset],beam=stations[offset+1],y=(1-2*side)*separation;
      const wet=volume[sections*side+i];
      const color=wet>1e-5?colors.wet:colors.dry;
      ink.strokeStyle=color;ink.lineWidth=1.7;ink.beginPath();
      forEachHullSectionEdge(stations,fractions,i,y,(x,y0,z0,y1,z1)=>segment(a.set(x,y0,z0),b.set(x,y1,z1),boat));
      ink.stroke();
      a.set(x,y+beam,stations[offset+5]);
      if(wet>=.0005&&(sections<=6||i%2===0))label(a,boat,Math.round(wet*1000)+' L',color);
    }
  }

  function drawGrid(field,x,y,tide,color,requireSignal=false){
    const {values,subtract,length,east=0,north=0,cos=1,sin=0,local=false,bounded=false,stride=1,heightAt,emphasis=false}=field;
    const size=field.size??Math.sqrt(values.length),spacing=field.spacing??length/size;
    const width=field.columns??size,height=field.rows??size;
    // Crop the periodic fields around the subject without changing their
    // origin or sample spacing. The near field uses the solver's signed indices.
    const radius=Math.min(12,12*spacing),first=-size/2,last=first+size-1;
    const i0=bounded?0:local?first:Math.ceil((x-east-radius)/spacing);
    const i1=bounded?width-1:local?last:Math.floor((x-east+radius)/spacing);
    const j0=bounded?0:local?first:Math.ceil((y-north-radius)/spacing);
    const j1=bounded?height-1:local?last:Math.floor((y-north+radius)/spacing);
    const columns=Math.floor((i1-i0)/stride)+1;
    const rows=Math.floor((j1-j0)/stride)+1;
    const needed=2*rows*columns;
    if(needed>gridPixels.length)gridPixels=new Float64Array(needed);
    const index=(i)=>(i%size+size)%size;
    ink.strokeStyle=color;ink.lineWidth=emphasis?1.6:local||bounded?1.15:1;
    ink.globalAlpha=emphasis?.9:local||bounded?.77:.48;ink.beginPath();
    let k=0,hasSignal=!requireSignal;
    for(let j=j0;j<=j1;j+=stride)for(let i=i0;i<=i1;i+=stride){
      const e=east+spacing*(i*cos-j*sin),n=north+spacing*(i*sin+j*cos);
      const offset=bounded?j*width+i:index(j)*size+index(i);
      const height=heightAt?heightAt(e,n):values[offset]-(subtract?.[offset]??0);
      hasSignal||=Math.abs(height)>.00001;
      a.set(e,n,tide+height);
      const p=project(a);
      gridPixels[k]=p?.x??NaN;gridPixels[k+1]=p?.y??NaN;
      k+=2;
    }
    if(hasSignal){
      forEachGridEdge(columns,rows,(i,j)=>{
        if(!Number.isFinite(gridPixels[2*i])||!Number.isFinite(gridPixels[2*j]))return;
        ink.moveTo(gridPixels[2*i],gridPixels[2*i+1]);ink.lineTo(gridPixels[2*j],gridPixels[2*j+1]);
      });
      ink.stroke();
    }
    ink.globalAlpha=1;
    return hasSignal?width+'×'+height+' / '+spacing.toPrecision(2)+' m':null;
  }
  function drawSources(field,tide){
    const {sources,east,north,cos,sin}=field;
    if(!sources)return;
    for(let i=0;i<sources.length;i+=6){
      const start=sources[i],across=sources[i+1],flux=sources[i+2];
      if(Math.abs(flux)<.001)continue;
      const end=sources[i+4];
      a.set(east+start*cos-across*sin,north+start*sin+across*cos,tide);
      b.set(east+end*cos-across*sin,north+end*sin+across*cos,tide);
      ink.strokeStyle=flux>0?'#fff3cf':'#ff9cce';ink.lineWidth=2;
      ink.beginPath();segment(a,b);ink.stroke();
      center.copy(a).lerp(b,.5);dot(center,null,ink.strokeStyle,2.3);
    }
  }

  const contourLevels=[-.4,-.2,-.1,-.05,-.02,-.005,.005,.02,.05,.1,.2,.4];
  const cornerX=[0,1,1,0],cornerY=[0,0,1,1],crossings=new Float64Array(8);
  let wakeContours;
  function drawWakeContours(field,x,y,tide){
    const {values,length,east=0,north=0}=field;
    const side=Math.sqrt(values.length),step=length/side;
    const ix=Math.floor((x-east)/step),iy=Math.floor((y-north)/step),radius=Math.min(side/2,Math.ceil(24/step));
    if(wakeContours?.values!==values||wakeContours.ix!==ix||wakeContours.iy!==iy){
      const wrap=index=>(index%side+side)%side;
      const at=(i,j)=>values[wrap(j)*side+wrap(i)];
      const z=new Float64Array(4),paths=contourLevels.map(()=>[]);
      let low=0,high=0;
      for(let j=iy-radius;j<iy+radius;j++)for(let i=ix-radius;i<ix+radius;i++){
        z[0]=at(i,j);z[1]=at(i+1,j);z[2]=at(i+1,j+1);z[3]=at(i,j+1);
        const min=Math.min(...z),max=Math.max(...z),centre=.25*(z[0]+z[1]+z[2]+z[3]);
        low=Math.min(low,min);high=Math.max(high,max);
        for(const [line,level] of contourLevels.entries()){
          if(level<min||level>=max)continue;
          let edges=0;
          for(let k=0;k<4;k++){
            const next=(k+1)%4;
            if((z[k]>level)===(z[next]>level))continue;
            const t=(level-z[k])/(z[next]-z[k]);
            crossings[edges++]=i+cornerX[k]+t*(cornerX[next]-cornerX[k]);
            crossings[edges++]=j+cornerY[k]+t*(cornerY[next]-cornerY[k]);
          }
          const path=paths[line],other=edges===8&&(z[0]>level)!==(centre>level);
          if(edges===4||edges===8)path.push(crossings[0],crossings[1],crossings[other?6:2],crossings[other?7:3]);
          if(edges===8)path.push(crossings[4],crossings[5],crossings[other?2:6],crossings[other?3:7]);
        }
      }
      wakeContours={values,ix,iy,paths,low,high};
    }
    for(const [index,path] of wakeContours.paths.entries()){
      if(!path.length)continue;
      const level=contourLevels[index];
      ink.strokeStyle=level>0?'#ffc582':'#80cdff';ink.lineWidth=1.4;ink.beginPath();
      for(let i=0;i<path.length;i+=4){
        a.set(east+step*path[i],north+step*path[i+1],tide+level);
        b.set(east+step*path[i+2],north+step*path[i+3],tide+level);
        segment(a,b);
      }
      ink.stroke();
    }
    return `Modelica wake elevation ${(100*wakeContours.low).toFixed(1)} to ${(100*wakeContours.high).toFixed(1)} cm\n`+
      'Warm colors above tide · blue below · levels ±0.5, 2, 5, 10, 20, 40 cm';
  }
  function drawPontoonTraces({points,sections}){
    for(let side=0;side<2;side++){
      const offset=3*side*sections;
      ink.strokeStyle=colors.near;ink.lineWidth=1.4;ink.beginPath();
      a.fromArray(points,offset);
      for(let i=1;i<sections;i++){
        b.fromArray(points,offset+3*i);segment(a,b);a.copy(b);
      }
      ink.stroke();
      label(a,null,side===0?'Port water samples':'Starboard water samples',colors.near);
    }
    return sections+' native Modelica water samples per pontoon';
  }
  function drawWater(fields,x,y,layer){
    if(layer==='contours')return fields?.wake?.values?
      drawWakeContours(fields.wake,x,y,fields.tide):'Wake contours require an active displacement field. Use Medium or High graphics.';
    if(layer==='auto')layer=fields?.swimmerKind?'swimmer':fields?.pontoons?'pontoons':'surface';
    if(layer==='near'){
      if(fields?.swimmerKind)layer='swimmer';
      else if(!fields?.near&&fields?.wake)layer='wake';
    }
    if(layer==='pontoons'&&fields?.pontoons)return drawPontoonTraces(fields.pontoons);
    const captions=[];
    if(layer==='swimmer'||layer==='all'){
      if(fields?.swimmer){
        const {swimmer,tide,swimmerKind}=fields;
        const dimensions=drawGrid(swimmer,x,y,tide,colors.swimmer);
        const {sources}=swimmer;
        for(let i=0;i<sources.length;i+=5){
          if(sources[i+2]>.0003)dot(a.set(sources[i],sources[i+1],tide),null,colors.near,2.4);
        }
        const name=swimmerKind==='whale'?'Humpback':'Great white';
        captions.push('Local displacement wake · '+name+' · '+dimensions+' Modelica grid · alternate nodes · elevations relative to tide');
        captions.push('Gold · displaced-water sources');
      }else if(layer==='swimmer'||fields?.swimmerKind){
        captions.push('No active local displacement wake for this view');
      }
    }
    for(const [key,name] of [['wind','Blue wind sea'],['wake','Violet shared displacement wake'],['near','Gold local displacement wake']]){
      if(layer!==key&&layer!=='all')continue;
      const field=fields?.[key];
      if(!field?.values)continue;
      const height=field.height??fields.tide;
      const dimensions=drawGrid(field,x,y,height,colors[key],key==='wake');
      if(!dimensions)continue;
      const frame=field.local?'follows hull heading, offset from incident sea':key==='wake'||field.advected?'current drift':'world axes';
      captions.push(name+' '+dimensions+' · '+frame);
      if(key==='near')drawSources(field,height);
      if(key==='wind')captions.push('Long swell is analytic');
    }
    if((layer==='surface'||layer==='all')&&fields?.surfaceAt){
      surfaceField.heightAt=fields.surfaceAt;
      drawGrid(surfaceField,x,y,0,colors.surface);
      captions.unshift('Pale cyan · Combined sea surface sampled every 2 m · analytic swell, wind sea and active wakes');
    }
    return captions.length?captions.join(' | '):
      'Selected wave field unavailable in this view or quality';
  }
  function drawProbes(probes){
    if(probes?.points){
      for(let i=0;i<probes.points.length;i+=3)dot(a.fromArray(probes.points,i),null,'#f4f8ff',2.5);
      return;
    }
    if(!probes?.heights)return;
    const {heights,strips,east,north,count=heights.length}=probes;
    for(let i=0;i<count;i++){
      a.set(strips?.[3*i]??east[i],strips?.[3*i+1]??north[i],heights[i]);
      dot(a,null,'#f4f8ff',2.3);
    }
  }

  function drawFlow({points,position,velocity,ambient,dimensions,spacing,previous,blend,anchor,water,wet}){
    const [length,width,height]=dimensions;
    airflowOffset.fromArray(anchor).sub(a.fromArray(position));
    const pointAt=(target,i)=>target.fromArray(points,i).add(airflowOffset);
    const corner=(x,y,z)=>3*(((z?height-1:0)*width+(y?width-1:0))*length+(x?length-1:0));
    ink.beginPath();
    for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++){
      pointAt(a,corner(x,y,z));
      if(!x)segment(a,pointAt(b,corner(1,y,z)));
      if(!y)segment(a,pointAt(b,corner(x,1,z)));
      if(!z)segment(a,pointAt(b,corner(x,y,1)));
    }
    ink.strokeStyle='rgba(121, 200, 238, .48)';ink.lineWidth=1;ink.stroke();
    let fastest=water?.35:4;
    const vectorAt=i=>previous?b.fromArray(previous.velocity,i).lerp(priorFlow.fromArray(velocity,i),blend):b.fromArray(velocity,i);
    for(let i=0;i<velocity.length;i+=3)fastest=Math.max(fastest,vectorAt(i).length());
    const scale=.76*spacing/fastest;
    const colors=water?['#91def3','#79dfe2','#6ddac4','#8ed59d','#bcd684','#f3dd7e']:['#94deff','#a6d9e9','#bbd4d3','#d2ceba','#e9c9a1','#ffc281'];
    const arrows=colors.map(()=>[]);
    const dots=colors.map(()=>[]);
    for(let i=0;i<points.length;i+=3){
      pointAt(a,i);
      if(water&&!wet[i/3])continue;
      vectorAt(i);
      const difference=Math.hypot(b.x-ambient[0],b.y-ambient[1],b.z-ambient[2]);
      const band=Math.round((colors.length-1)*Math.min(1,difference/(fastest*.65)));
      b.multiplyScalar(scale).add(a);
      const p=project(a,null);
      if(!p)continue;
      const {x,y}=p,q=project(b,null);
      if(!q)continue;
      const dx=q.x-x,dy=q.y-y,pixels=Math.hypot(dx,dy);
      if(pixels<3){dots[band].push(x,y);continue;}
      const ux=dx/pixels,uy=dy/pixels,head=Math.min(7,pixels*.38);
      arrows[band].push(x,y,q.x,q.y,q.x-head*(ux-.50*uy),q.y-head*(uy+.50*ux),
        q.x-head*(ux+.50*uy),q.y-head*(uy-.50*ux));
    }
    colors.forEach((color,band)=>{
      const segments=arrows[band],centers=dots[band];
      const intensity=band/(colors.length-1);
      if(segments.length){
        ink.beginPath();
        for(let i=0;i<segments.length;i+=8){
          ink.moveTo(segments[i],segments[i+1]);ink.lineTo(segments[i+2],segments[i+3]);
          ink.moveTo(segments[i+4],segments[i+5]);ink.lineTo(segments[i+2],segments[i+3]);
          ink.lineTo(segments[i+6],segments[i+7]);
        }
        ink.globalAlpha=.16+.68*intensity;
        ink.strokeStyle='#0c2232';ink.lineWidth=3;ink.stroke();
        ink.globalAlpha=.36+.64*intensity;
        ink.strokeStyle=color;ink.lineWidth=1+.5*intensity;ink.stroke();
      }
      if(centers.length){
        ink.beginPath();
        for(let i=0;i<centers.length;i+=2){
          ink.moveTo(centers[i]+1.1,centers[i+1]);
          ink.arc(centers[i],centers[i+1],1.1,0,Math.PI*2);
        }
        ink.globalAlpha=.25+.65*intensity;ink.fillStyle=color;ink.fill();
      }
    });
    ink.globalAlpha=1;
  }

  function draw(viewCamera,body,options,hull){
    width=canvas.clientWidth;height=canvas.clientHeight;
    if(!width||!height)return;
    const scale=Math.min(2,devicePixelRatio||1);
    const w=Math.round(width*scale),h=Math.round(height*scale);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ink.setTransform(scale,0,0,scale,0,0);ink.clearRect(0,0,width,height);
    labelRects.length=0;labelsVisible=options.labels!==false;namesVisible=labelsVisible&&options.names===true;
    if(!options.rig)picker.reset();
    const {group}=body;
    camera=viewCamera;camera.updateMatrixWorld();group.updateMatrixWorld(true);
    const captions=[];
    const probes=body.probes;
    if(probes?.points&&hull?.separation>0&&hull.stations.length===6*probes.sections){
      if(pontoonPoints?.length!==probes.points.length)pontoonPoints=new Float64Array(probes.points.length);
      probes.points=alignPontoonSamples(probes.points,hull.stations,hull.separation,group.matrixWorld.elements,pontoonPoints);
    }
    const pontoonTraces=options.water&&body.water?.pontoons&&['auto','pontoons'].includes(options.waveLayer);
    if(options.water)captions.push(drawWater(body.water,group.position.x,group.position.y,options.waveLayer));
    if(options.rig){
      drawBody(body);
      if(body.rig)drawRig(body.rig);
      if(catalogs.get(group)?.parts.length)captions.push('Hover or tap a marker to inspect a part.');
    }
    if(options.hulls){
      if(hull?.stations)drawHull(hull,group);
      if(body.strips)drawCruiserStrips(body.strips,body.stripWater,group,body.stripPose);
      for(let i=0;body.hullPoints&&i<body.hullPoints.length;i+=6){
        a.fromArray(body.hullPoints,i);
        dot(a,null,body.hullPoints[i+5]>0?colors.wet:colors.dry,3);
      }
    }
    if(body.probes&&(options.hulls||pontoonTraces)){
      drawProbes(body.probes);
      captions.push('White dots · Buoyancy surface samples');
    }
    if(body.current){
      drawFlow(body.current);
      const speed=Math.hypot(...body.current.velocity.slice(3*62,3*63));
      captions.push('3D mean water current · '+speed.toFixed(2)+' m/s at '+body.current.label+' · Cyan slow · Yellow fast');
    }else if(body.currentMessage)captions.push(body.currentMessage);
    if(body.airflow){
      drawFlow(body.airflow);
      const {rotor,thrust}=body.airflow;
      captions.push((rotor?'3D rotor wake · Estimated rotor thrust '+thrust.toFixed(1)+' N':'3D sail wake')+
        ' · Blue ambient · Amber disturbed');
    }else if(body.airflowMessage)captions.push(body.airflowMessage);
    if(options.rig&&body.rig?.sails.some(sail=>sail.battenRows))
      captions.push('Yellow · Batten rows in the cloth mesh');
    else if(options.rig&&body.rig?.battens?.some(([count])=>count>0))
      captions.push('Yellow battens · stiffness distributed across cloth rows');
    const caption=captions.join(' | ');
    if(status.textContent!==caption)status.textContent=caption;
    status.hidden=!caption;
  }
  return {draw,reset:picker.reset,selection:picker.selection};
}
