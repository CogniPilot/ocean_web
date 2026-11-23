import {battenPath} from './board/sail-battens.mjs';

// All geometry is projected from the current boat and water state. Keeping the
// annotations in a separate canvas also keeps them out of water captures.
export const cruiserInspectionFields=['stripEast','stripNorth','stripZ','stripForce','stripVolume'];
export const hullInspectionFields=['stationGeometry','beamFraction','halfSpacing','sectionVolume','sectionWater'];
export const refinedHullInspectionFields=['hydroStationGeometry','hydroSectionVolume'];
export const battenInspectionFields=[1,2].flatMap(sail=>
  ['battenCount','battenLuff','battenLeech','mesh'].map(name=>`cloth[${sail}].${name}`));

export function sampleAirflow(model,position,ambient,rotors,sailPeers,sailNpcs){
  const points=new Float64Array(35*3);
  const spacing=rotors ? .8 : 3;
  let [alongEast,alongNorth]=ambient;
  if(rotors?.traffic[0]){
    const [east,north]=rotors.traffic.subarray(1,3);
    if(Math.hypot(east-position[0],north-position[1])>.3){
      alongEast=east-position[0];alongNorth=north-position[1];
    }
  }
  const length=Math.hypot(alongEast,alongNorth);
  const east=length>.01?alongEast/length:1,north=length>.01?alongNorth/length:0;
  for(let row=0;row<7;row++)for(let col=0;col<5;col++){
    const along=(rotors?col-2:row-4)*spacing;
    const across=rotors?0:(col-2)*spacing;
    points.set([position[0]+along*east-across*north,position[1]+along*north+across*east,
      position[2]+(rotors?(row-2)*spacing:0)],3*(5*row+col));
  }
  model.set('mode',Number(Boolean(rotors)));
  model.set('points',points);
  model.set('ambient',ambient);
  if(rotors){
    model.set('rotorTraffic',rotors.traffic);
    model.set('rotorHubs',rotors.hubs);
    model.set('rotorParameters',rotors.parameters);
  }else{
    const traffic=new Float64Array(90);
    if(sailPeers)traffic.set(sailPeers);
    if(sailNpcs)traffic.set(sailNpcs,36);
    model.set('sailTraffic',traffic);
  }
  return {points,ambient,spacing,velocity:model.get('velocity'),vertical:Boolean(rotors)};
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

export function physicsView(T,canvas,status){
  const ink=canvas.getContext('2d');
  const clip=new T.Vector3(),projected=new T.Vector2();
  const colors={main:'#79edff',jib:'#b2ffa8',mast:'#ffd080',joint:'#ff9cce',batten:'#fff07b',
    wet:'#5af2e9',dry:'#a1aab7',wind:'#7ebaff',wake:'#bd96ff',near:'#ffce74',swimmer:'#62ffe3',surface:'#d8faff'};
  const surfaceField={size:32,length:64,emphasis:true};
  let gridPixels=new Float64Array(32*32*2);
  const a=new T.Vector3(),b=new T.Vector3(),center=new T.Vector3();
  let pontoonPoints;
  let width,height,camera;
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
      for(let i=0;i<count;i++){
        const col=i%4;
        if(col<3)edges.push([i,i+1]);
        if(i<count-4){
          edges.push([i,i+4]);
          if(col<3)edges.push([i,i+5]);
        }
      }
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
  function drawJoints(joints,length){
    for(const [joint,axis,name] of joints){
      // The display length is in metres, including for scaled glTF bones.
      center.setFromMatrixPosition(joint.matrixWorld);
      b.fromArray(axis).transformDirection(joint.matrixWorld).multiplyScalar(length);
      a.copy(center).sub(b);b.add(center);
      ink.strokeStyle=colors.joint;ink.lineWidth=2;ink.beginPath();
      segment(a,b);ink.stroke();
      dot(center,null,colors.joint,3);
      if(name)label(center,null,name,colors.joint);
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
    drawJoints(joints,kind==='gull'?.07:kind==='drone'?.09:kind==='motorboat'?.34:kind==='shark'?.19:.35);
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

  function drawHull(hull,boat){
    const {stations,fractions,separation,volume}=hull;
    const sections=stations.length/6;
    for(let side=0;side<(separation>0?2:1);side++)for(let i=0;i<sections;i++){
      const offset=6*i,x=stations[offset],beam=stations[offset+1],y=(1-2*side)*separation;
      const wet=volume[sections*side+i];
      const color=wet>1e-5?colors.wet:colors.dry;
      ink.strokeStyle=color;ink.lineWidth=1.7;ink.beginPath();
      for(const sign of [-1,1])for(let j=0;j<3;j++){
        a.set(x,y+sign*beam*fractions[j],stations[offset+2+j]);
        b.set(x,y+sign*beam*fractions[j+1],stations[offset+3+j]);
        segment(a,b,boat);
      }
      a.set(x,y-beam,stations[offset+5]);b.set(x,y+beam,stations[offset+5]);
      segment(a,b,boat);ink.stroke();
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
      if(p){
        if(i>i0&&Number.isFinite(gridPixels[k-2])){
          ink.moveTo(gridPixels[k-2],gridPixels[k-1]);ink.lineTo(p.x,p.y);
        }
        const above=k-2*columns;
        if(j>j0&&Number.isFinite(gridPixels[above])){
          ink.moveTo(gridPixels[above],gridPixels[above+1]);ink.lineTo(p.x,p.y);
        }
      }
      k+=2;
    }
    if(hasSignal)ink.stroke();
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
      if(key==='near'){
        if(field.refined){
          const detail=layer==='all'?{...field.refined,stride:2}:field.refined;
          const spacing=drawGrid(detail,x,y,height,'#fff2c1');
          captions.push('Bow refinement · '+spacing+(layer==='all'?' · alternate nodes shown':''));
        }
        drawSources(field,height);
      }
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

  function drawAirflow({points,velocity,ambient,spacing}){
    let fastest=4;
    for(let i=0;i<velocity.length;i+=3)fastest=Math.max(fastest,Math.hypot(velocity[i],velocity[i+1],velocity[i+2]));
    const scale=.76*spacing/fastest;
    for(let i=0;i<points.length;i+=3){
      a.fromArray(points,i);
      b.fromArray(velocity,i);
      const difference=Math.hypot(b.x-ambient[0],b.y-ambient[1],b.z-ambient[2]);
      const color=difference>.15?'#ffc281':'#94deff';
      b.multiplyScalar(scale).add(a);
      const p=project(a,null);
      if(!p)continue;
      const {x,y}=p,q=project(b,null);
      if(!q)continue;
      const dx=q.x-x,dy=q.y-y,length=Math.hypot(dx,dy);
      if(length<3){dot(a,null,color,1.5);continue;}
      const ux=dx/length,uy=dy/length,head=Math.min(7,length*.38);
      ink.beginPath();ink.moveTo(x,y);ink.lineTo(q.x,q.y);
      ink.moveTo(q.x-head*(ux-.50*uy),q.y-head*(uy+.50*ux));ink.lineTo(q.x,q.y);
      ink.lineTo(q.x-head*(ux+.50*uy),q.y-head*(uy-.50*ux));
      ink.strokeStyle='#0c2232';ink.lineWidth=3.5;ink.stroke();
      ink.strokeStyle=color;ink.lineWidth=1.5;ink.stroke();
    }
  }

  function draw(viewCamera,body,options,hull){
    width=canvas.clientWidth;height=canvas.clientHeight;
    if(!width||!height)return;
    const scale=Math.min(2,devicePixelRatio||1);
    const w=Math.round(width*scale),h=Math.round(height*scale);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ink.setTransform(scale,0,0,scale,0,0);ink.clearRect(0,0,width,height);
    labelRects.length=0;
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
      if(group.userData.swimmer)captions.push('Pink · rig joints driven by the swimmer model');
    }
    if(options.hulls){
      if(hull?.stations)drawHull(hull,group);
      if(body.strips)drawCruiserStrips(body.strips);
    }
    if(body.probes&&(options.hulls||pontoonTraces)){
      drawProbes(body.probes);
      captions.push('White dots · Buoyancy surface samples');
    }
    if(body.airflow){
      drawAirflow(body.airflow);
      captions.push((body.airflow.vertical?'Vertical rotor-wake slice':'Horizontal sail-wake slice')+' · Blue ambient · Amber disturbed');
    }else if(body.airflowMessage)captions.push(body.airflowMessage);
    if(options.rig&&body.rig?.sails.some(sail=>sail.battenRows))
      captions.push('Yellow · Batten rows in the cloth mesh');
    else if(options.rig&&body.rig?.battens?.some(([count])=>count>0))
      captions.push('Yellow battens · stiffness distributed across cloth rows');
    const caption=captions.join(' | ');
    if(status.textContent!==caption)status.textContent=caption;
    status.hidden=!caption;
  }
  return {draw};
}
