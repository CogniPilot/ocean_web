import {showInLowWaterCapture} from './render-layers.mjs';
import {wreckShoalLanes} from './wreck-fish.mjs';
import {createFishCollisionOverlay,fishBodyShape} from './fish-body.mjs';

// Patch centres follow the submerged island shelf. The spaces between them are bare sand.
const patches = [
  [-16.3,-12.8,0],[-13.0,-14.0,2],[-20,-9.1,1],[-22,-5.9,3],
  [-22.2,4,2],[-16,11.5,0],[-10.5,14.3,1],[1.8,15.8,2],
  [13.2,13.0,0],[20.4,8.1,3],[22.2,-3.8,1],[17.5,-11.2,2],[4.6,-15.7,0]
];
const names = ['Staghorn', 'Finger coral', 'Foliose plate coral', 'Sea fan'];
const palettes = [
  [0xbd755f,0x9c78a0,0x997448,0xb08b71],
  [0xd19a56,0xac7369,0xb79d80,0x828a68],
  [0x84755f,0xb56c62,0xc19755,0x6f9684],
  [0xaf689b,0xc98079,0x946f93,0xb7886a]
];

function randomSequence(seed) {
  return () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function colonyGeometry(T,kind,detailed) {
  const xyz=[], rgb=[], triangles=[];
  const random=randomSequence(1627+kind*71);
  function vertex(x,y,z,brightness) {
    xyz.push(x,y,z); rgb.push(brightness,brightness*.983,brightness*.957);
    return xyz.length/3-1;
  }
  function tube(a,b,r0,r1,sides,light=1) {
    const axis=b.clone().sub(a).normalize();
    const x=axis.clone().cross(Math.abs(axis.z)>.88?new T.Vector3(0,1,0):new T.Vector3(0,0,1)).normalize();
    const y=axis.clone().cross(x);
    const start=xyz.length/3;
    for (const [p,r,tone] of [[a,r0,light*.82],[b,r1,light]]) {
      for (let k=0;k<sides;k++) {
        const angle=2*Math.PI*k/sides,c=Math.cos(angle)*r,s=Math.sin(angle)*r;
        vertex(p.x+x.x*c+y.x*s,p.y+x.y*c+y.y*s,p.z+x.z*c+y.z*s,tone);
      }
    }
    const tip=vertex(b.x+axis.x*r1*.52,b.y+axis.y*r1*.52,b.z+axis.z*r1*.52,light*1.12);
    for(let k=0;k<sides;k++) {
      const i=start+k,j=start+(k+1)%sides;
      triangles.push(i,j,j+sides,i,j+sides,i+sides,i+sides,j+sides,tip);
    }
  }
  const v=(x,y,z)=>new T.Vector3(x,y,z);
  const polar=(a,r,z)=>v(r*Math.cos(a),r*Math.sin(a),z);
  const origin=v(0,0,-.035);
  if(kind<2) {
    // One encrusting basal sheet joins the uprights of each living colony.
    const sides=detailed?12:8,r=kind===1?.34:.19;
    const base=xyz.length/3;
    for(const [radius,z,tone] of [[r,-.06,.65],[r*.79,.043,.79],[r*.28,.093,.93]]) {
      for(let i=0;i<sides;i++) {
        const a=2*Math.PI*i/sides,edge=1+.09*Math.sin(3*a+.4);
        vertex(radius*edge*Math.cos(a),radius*.84*edge*Math.sin(a),z+.009*Math.cos(3*a),tone);
      }
    }
    const crown=vertex(0,0,.092,.92);
    for(let i=0;i<sides;i++) {
      const a=base+i,b=base+(i+1)%sides;
      for(let j=0;j<2;j++){const u=a+j*sides,w=b+j*sides;triangles.push(u,w,w+sides,u,w+sides,u+sides);}
      triangles.push(crown,a+2*sides,b+2*sides);
    }
  }
  if(kind===0) {
    const arms=detailed?8:6;
    for(let i=0;i<arms;i++) {
      const a=i*2.39996+.38*random(),r=.21+.20*random(),h=.21+.19*random();
      const elbow=polar(a,r*.53,h*.55),out=polar(a+.23,r,h);
      tube(origin,elbow,.081,.055,detailed?6:4,.91);
      tube(elbow,out,.058,.036,detailed?6:4,1.04);
      const forks=detailed?3:2;
      for(let j=0;j<forks;j++) {
        const start=j===0?elbow:out,bearing=a+(j-1)*1.07+.35*random();
        const end=start.clone().add(polar(bearing,.09+.10*random(),.095+.095*random()));
        tube(start,end,.039,.019,detailed?5:3,1.17);
        if(detailed&&j!==0) {
          const midway=start.clone().lerp(end,.57);
          tube(midway,midway.clone().add(polar(bearing-.90,.049,.058)),.019,.009,4,1.12);
          tube(end,end.clone().add(polar(bearing+.85,.047,.068)),.021,.011,4,1.18);
        }
      }
    }
  } else if(kind===1) {
    const count=detailed?13:8,sides=detailed?7:5;
    for(let i=0;i<count;i++) {
      const a=i*2.39996,r=.29*Math.sqrt(i/count),h=.31+.23*random()-.24*r;
      const finger=polar(a,r,.02),knuckle=polar(a+.11,r*1.20+.025,h*.64),tip=polar(a+.06,r*1.35+.034,h);
      const radius=.055+.027*random();
      tube(finger,knuckle,radius,radius*.90,sides,.90);
      tube(knuckle,tip,radius*.92,radius*.67,sides,1.11);
    }
  } else if(kind===2) {
    const plates=detailed?8:5,sides=detailed?16:9;
    for(let i=0;i<plates;i++) {
      const az=i*2.39996,h=.035+i*.035,centre=polar(az,.14*(1-i/plates),h);
      const radius=(.24+.15*random())*(1-.45*i/plates);
      const middle=vertex(centre.x,centre.y,h+.026,.75),first=xyz.length/3;
      for(const [ratio,rise,tone] of [[.56,.044,.94],[1,.081,1.13],[1,.06,.77]]) {
        for(let j=0;j<sides;j++) {
          const a=2*Math.PI*j/sides;
          const wave=(.032*Math.sin(3*a+az)+.018*Math.cos(5*a-az))*ratio;
          const r=ratio*radius*(1+.16*Math.cos(a-az)+.08*Math.sin(4*a+az));
          vertex(centre.x+r*Math.cos(a),centre.y+r*.81*Math.sin(a),h+rise+wave+.23*r*Math.cos(a-az),tone);
        }
      }
      const underside=vertex(centre.x,centre.y,h,.60);
      for(let j=0;j<sides;j++) {
        const a=first+j,b=first+(j+1)%sides;
        triangles.push(middle,a,b,a,a+sides,b+sides,a,b+sides,b,a+sides,a+2*sides,b+2*sides,a+sides,b+2*sides,b+sides,underside,b+2*sides,a+2*sides);
      }
    }
  } else {
    const ribs=detailed?11:7,layers=detailed?4:3;
    const net=[];
    for(let i=0;i<ribs;i++) {
      const angle=-1.06+2.12*i/(ribs-1),ray=[origin];
      for(let j=1;j<=layers;j++) {
        const t=j/layers;
        ray.push(v(.58*t*Math.sin(angle),.082*Math.sin(3*angle+3*t)*t,
          .68*t*Math.cos(.79*angle)+.025*t*Math.sin(7*angle)));
        tube(ray[j-1],ray[j],.031*(1-.70*(j-1)/layers),.025*(1-.74*t),detailed?5:3,.85+.27*t);
        if(i>0&&j>1) {
          tube(net[i-1][j],ray[j],.010,.008,detailed?4:3,1.09);
          if(detailed&&(i+j)%2===0)tube(net[i-1][j-1],ray[j],.007,.005,3,1.15);
        }
      }
      net.push(ray);
    }
  }
  const geom=new T.BufferGeometry();
  geom.setAttribute('position',new T.Float32BufferAttribute(xyz,3));geom.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
  geom.setIndex(triangles);geom.computeVertexNormals();geom.computeBoundingSphere();
  return geom;
}

// Each colony has a fitted oriented box. The two-metre grid also covers colonies
// outside the camera's draw distance, so all peers simulate the same obstacles.
export function reefObstacles(T,colonies,bounds){
  const bins=new Map(),key=(x,y)=>x+512*y,index=x=>Math.floor(x/2);
  for(const colony of colonies){
    const box=bounds[colony.form],world=box.clone().applyMatrix4(colony.matrix);
    const inverse=colony.matrix.clone().invert().elements;
    const lengths=[0,1,2].map(i=>Math.hypot(inverse[i],inverse[i+4],inverse[i+8]));
    const body={matrix:colony.matrix,inverse,lengths,lo:box.min.toArray(),hi:box.max.toArray(),world,stamp:0};
    for(let x=index(world.min.x);x<=index(world.max.x);x++)
      for(let y=index(world.min.y);y<=index(world.max.y);y++){
        const k=key(x,y);
        if(!bins.has(k))bins.set(k,[]);
        bins.get(k).push(body);
      }
  }
  let stamp=0;
  function sweep(x,y,z,ex,ey,ez,r){
    const dx=ex-x,dy=ey-y,dz=ez-z;
    let best=null;
    stamp++;
    for(let ix=index(Math.min(x,ex)-r);ix<=index(Math.max(x,ex)+r);ix++)
      for(let iy=index(Math.min(y,ey)-r);iy<=index(Math.max(y,ey)+r);iy++){
        const candidates=bins.get(key(ix,iy));if(!candidates)continue;
        for(const b of candidates){
          if(b.stamp===stamp)continue;b.stamp=stamp;
          if(Math.min(z,ez)>b.world.max.z+r||Math.max(z,ez)<b.world.min.z-r)continue;
          let enter=0,exit=1,inside=true,depth=Infinity,axis=0,sign=1,hitAxis=0,hitSign=1;
          const m=b.inverse;
          for(let i=0;i<3&&enter<=exit;i++){
            const scale=b.lengths[i],p=m[i]*x+m[i+4]*y+m[i+8]*z+m[i+12];
            const v=m[i]*dx+m[i+4]*dy+m[i+8]*dz,lo=b.lo[i]-r*scale,hi=b.hi[i]+r*scale;
            if(p<lo||p>hi)inside=false;
            if((p-lo)/scale<depth){depth=(p-lo)/scale;axis=i;sign=-1;}
            if((hi-p)/scale<depth){depth=(hi-p)/scale;axis=i;sign=1;}
            if(Math.abs(v)<1e-12){if(p<lo||p>hi)exit=-1;continue;}
            const a=(lo-p)/v,c=(hi-p)/v,near=Math.min(a,c);
            if(near>enter){enter=near;hitAxis=i;hitSign=v>0?-1:1;}
            exit=Math.min(exit,Math.max(a,c));
          }
          if(enter>exit)continue;
          if(!inside){axis=hitAxis;sign=hitSign;depth=0;}
          if(best&&(enter>best.fraction||enter===best.fraction&&depth<=best.penetration))continue;
          const n=sign/b.lengths[axis];
          best={fraction:enter,penetration:depth,nx:n*m[axis],ny:n*m[axis+4],nz:n*m[axis+8]};
        }
      }
    return best;
  }
  function triangles(box,visit){
    stamp++;
    for(let ix=index(box[0]);ix<=index(box[3]);ix++)for(let iy=index(box[1]);iy<=index(box[4]);iy++){
      for(const body of bins.get(key(ix,iy))??[]){
        if(body.stamp===stamp)continue;body.stamp=stamp;
        const {min,max}=body.world;
        if(max.x<box[0]||min.x>box[3]||max.y<box[1]||min.y>box[4]||max.z<box[2]||min.z>box[5])continue;
        const v=Array.from({length:8},(_,i)=>new T.Vector3(i&1?body.hi[0]:body.lo[0],i&2?body.hi[1]:body.lo[1],i&4?body.hi[2]:body.lo[2]).applyMatrix4(body.matrix).toArray());
        for(const [a,b,c,d] of [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]){
          visit([v[a],v[b],v[c]]);visit([v[a],v[c],v[d]]);
        }
      }
    }
  }
  return {sweep,triangles,top(x,y,r){
    let z=-Infinity;
    for(let i=index(x-r);i<=index(x+r);i++)for(let j=index(y-r);j<=index(y+r);j++){
      for(const b of bins.get(key(i,j))??[]){
        const w=b.world;
        if(x+r>=w.min.x&&x-r<=w.max.x&&y+r>=w.min.y&&y-r<=w.max.y)z=Math.max(z,w.max.z);
      }
    }
    return z;
  }};
}

export function fringingReef(T,parent,terrain,mobile,webgl2,signal,nearbyActors,fishWaterLimits,fishSchools,isCollisionVisible) {
  const group=new T.Group();group.name='Island fringing reef';parent.add(group);
  const random=randomSequence(73151),normal=new T.Vector3(),vertical=new T.Vector3(0,0,1),pose=new T.Object3D();
  const colonies=[],center=terrain.center;
  for(const [cx,cy,species] of patches) {
    for(let i=0;i<25;i++) {
      const a=random()*Math.PI*2,r=Math.sqrt(random());
      const x=cx+Math.cos(a)*r*3.8,y=cy+Math.sin(a)*r*2.4;
      const z=terrain.height(x,y);
      const form=random()<.66?species:Math.floor(random()*4),size=.50+random()**1.8*.93;
      const rotation=random()*Math.PI*2,tint=palettes[form][Math.floor(random()*4)];
      if(z> -1.8||z< -10.3||colonies.some(c=>(c.x-center[0]-x)**2+(c.y-center[1]-y)**2<(.38*(c.size+size))**2))continue;
      normal.set(terrain.height(x-.20,y)-terrain.height(x+.20,y),terrain.height(x,y-.20)-terrain.height(x,y+.20),.40).normalize();
      pose.position.set(center[0]+x,center[1]+y,z-.035);
      pose.quaternion.setFromUnitVectors(vertical,normal);pose.rotateZ(rotation);
      pose.scale.set(size,size*(.83+.31*random()),size*(.81+.31*random()));pose.updateMatrix();
      colonies.push({form,size,x:pose.position.x,y:pose.position.y,z,matrix:pose.matrix.clone(),color:new T.Color(tint)});
    }
  }
  const material=new T.MeshStandardMaterial({roughness:.93,metalness:0,vertexColors:true});
  // Use colony coordinates so polyp spacing follows the scaled branches and plates.
  if(webgl2)material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 coralPosition,coralNormal;\n'+shader.vertexShader
      .replace('#include <begin_vertex>','#include <begin_vertex>\n coralPosition=position;coralNormal=normal;');
    shader.fragmentShader=`varying vec3 coralPosition,coralNormal;
      float calices(vec2 uv){
        uv=uv*84.;float pixel=max(fwidth(uv.x),fwidth(uv.y));
        uv.y+=.14*sin(uv.x*.77);uv.x+=.5*mod(floor(uv.y),2.);
        float r=length(fract(uv)-.5);
        float rim=1.-smoothstep(.03,.12,abs(r-.26));
        return (.19*rim-.32*(1.-smoothstep(.08,.22,r)))*(1.-smoothstep(.18,.60,pixel));
      }\n`+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 axes=pow(abs(coralNormal),vec3(4.));axes/=max(.001,dot(axes,vec3(1.)));
        float polyp=dot(axes,vec3(calices(coralPosition.yz),calices(coralPosition.xz),calices(coralPosition.xy)));
        diffuseColor.rgb*=1.+polyp;`);
  };
  const batches=[];
  for(const detailed of [true,false]) {
    for(let form=0;form<4;form++) {
      const mesh=new T.InstancedMesh(colonyGeometry(T,form,detailed),material,colonies.filter(c=>c.form===form).length);
      mesh.name=names[form]+(detailed?' near':' far');mesh.count=0;mesh.visible=false;
      mesh.frustumCulled=false;
      showInLowWaterCapture(mesh);
      batches.push(mesh);group.add(mesh);
    }
  }
  const bounds=batches.slice(0,4).map((near,i)=>{
    near.geometry.computeBoundingBox();batches[i+4].geometry.computeBoundingBox();
    return near.geometry.boundingBox.clone().union(batches[i+4].geometry.boundingBox);
  });
  const obstacles=reefObstacles(T,colonies,bounds);
  fishWaterLimits?.setReef?.(obstacles);
  const fish=reefFish(T,group,terrain,mobile,webgl2,signal,fishSchools,isCollisionVisible,obstacles);
  const last=new T.Vector3(Infinity,Infinity,Infinity);
  const near=mobile?5.5:9,far=mobile?21:34;
  function update(eye,time) {
    fish.update(eye,time);
    if(eye.distanceToSquared(last)<.6*.6)return;
    last.copy(eye);
    for(const mesh of batches)mesh.count=0;
    for(const c of colonies) {
      const distance=(eye.x-c.x)**2+(eye.y-c.y)**2+(eye.z-c.z)**2;
      if(distance>far*far)continue;
      const mesh=batches[c.form+(distance<near*near?0:4)];
      mesh.setMatrixAt(mesh.count,c.matrix);mesh.setColorAt(mesh.count,c.color);mesh.count++;
    }
    for(const mesh of batches) {
      mesh.visible=mesh.count>0;
      if(mesh.visible){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
    }
  }
  return {update,dispose(){
    for(const mesh of batches){mesh.geometry.dispose();mesh.dispose();}
    fishWaterLimits?.setReef?.(null);fish.dispose();material.dispose();group.removeFromParent();
  }};
}

function reefFish(T,group,terrain,mobile,webgl2,signal,fishSchools,isCollisionVisible,obstacles) {
  const random=randomSequence(832417),shoals=[],batches=[],textures=[];
  const pose=new T.Object3D(),lastEye=new T.Vector3(Infinity,Infinity,Infinity);
  let load,overlay,disposed=false,stamp=-Infinity;
  const loadRadius=mobile?23:32,viewRadius=mobile?13:19;
  function addShoal(cx,cy,species,count,rise){
    const members=[];
    for(let k=0;k<count;k++)members.push({
      along:random()*2.8-1.4,cross:random()*.9-.45,up:.45+random()*.55,
      scale:.86+.35*random(),offset:random()*Math.PI*2
    });
    shoals.push({cx,cy,members,species,rise,offset:random()*Math.PI*2,speed:.16+random()*.14});
  }
  for(const [index,[cx,cy]] of patches.entries()){
    if(index%3!==2)addShoal(cx,cy,index%2,7);
  }
  for(const lane of wreckShoalLanes()){
    addShoal(lane.east-terrain.center[0],lane.north-terrain.center[1],lane.species,12,lane.rise);
  }
  fishSchools?.registerReef(shoals,terrain,obstacles);
  const asset=name=>{
    const url=new URL('./assets/subsea/'+name,import.meta.url);
    url.search=new URL(import.meta.url).search;
    if(name.endsWith('.json'))url.searchParams.set('swim','2');
    return url.href;
  };
  async function build() {
    const files=await Promise.all(['reef-fish-1.json','reef-fish-2.json'].map(async name=>{
      const response=await fetch(asset(name),{signal});
      if(!response.ok)throw new Error(name+' '+response.status);return response.json();
    }));
    if(disposed||signal?.aborted)return;
    const loader=new T.TextureLoader();
    for(const [i,file] of files.entries()) {
      const atlas='reef-fish-'+(i+1);
      const albedo=loader.load(asset(atlas+'-albedo.webp')),surface=loader.load(asset(atlas+'-surface.webp'));
      albedo.colorSpace=T.SRGBColorSpace;
      textures.push(albedo,surface);
      const phase={value:0},cycle=file.swimProfile?.cycle??1.2;
      const geometry=fishGeometry(T,file,true),material=schoolFishMaterial(T,phase,webgl2,undefined,true);
      material.vertexColors=false;material.roughness=.79;material.map=albedo;material.roughnessMap=surface;material.bumpMap=surface;material.bumpScale=.00024;
      const count=shoals.filter(s=>s.species===i).reduce((n,s)=>n+s.members.length,0);
      let batch;
      if(webgl2) {
        const offsets=new T.InstancedBufferAttribute(new Float32Array(count*3),3);
        geometry.setAttribute('swimOffset',offsets.setUsage(T.DynamicDrawUsage));
        const mesh=new T.InstancedMesh(geometry,material,count);
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.count=0;
        mesh.morphTargetInfluences=new Array(file.frames.length).fill(0);mesh.frustumCulled=false;
        batch={root:mesh,geometry,material,phase,cycle,offsets,count:0};
      } else {
        const fallback=new T.Group();
        for(let j=0;j<Math.min(10,count);j++)fallback.add(new T.Mesh(geometry,material));
        batch={root:fallback,geometry,material,phase,cycle,count:0};
      }
      batch.root.name=i?'Reef fish shoal 2':'Reef fish shoal 1';batch.root.visible=false;
      group.add(batch.root);batches.push(batch);
    }
    stamp=-Infinity;
  }
  function update(eye,time) {
    if(disposed)return;
    const close=shoals.some(s=>Math.hypot(eye.x-terrain.center[0]-s.cx,eye.y-terrain.center[1]-s.cy)<loadRadius&&eye.z<(s.rise===undefined?8:0));
    if(close&&!load) load=build().catch(err=>{
      if(!signal?.aborted&&!disposed)console.warn('Reef fish unavailable',err);
    });
    if(!batches.length)return;
    const showCollision=close&&isCollisionVisible?.();
    if(overlay&&!showCollision){overlay.dispose();overlay=undefined;}
    if(!close){
      for(const batch of batches)batch.root.visible=false;
      stamp=-Infinity;
      return;
    }
    if(showCollision&&!overlay){
      const capacity=shoals.reduce((n,s)=>n+s.members.length,0);
      overlay=createFishCollisionOverlay(T,group,capacity);
      stamp=-Infinity;
    }
    for(const b of batches)b.phase.value=Number.isFinite(stamp)?Math.max(0,time-stamp):0;
    if(time>=stamp&&time-stamp<(mobile?.05:.033)&&eye.distanceToSquared(lastEye)<.16)return;
    lastEye.copy(eye);stamp=time;
    for(const b of batches)b.phase.value=0;
    overlay?.begin();
    for(const b of batches)b.count=0;
    let wreckCount=0;
    for(const [id,s] of shoals.entries()) {
      const wreck=s.rise!==undefined;
      if(wreck&&(eye.z>=0||wreckCount>=(mobile?32:72)))continue;
      const ex=eye.x-terrain.center[0]-s.cx,ey=eye.y-terrain.center[1]-s.cy;
      if(ex*ex+ey*ey>(viewRadius+5)**2)continue;
      const angle=time*s.speed+s.offset,dx=2.45*Math.cos(angle),dy=1.28*Math.sin(angle);
      const yaw=Math.atan2(1.28*Math.cos(angle),-2.45*Math.sin(angle));
      const forwardX=Math.cos(yaw),forwardY=Math.sin(yaw);
      const batch=batches[s.species];
      if(!batch)continue;
      const packet=fishSchools?.reef(id,time);
      const visibleCount=mobile?(wreck?8:4):s.members.length;
      for(let j=0;j<visibleCount;j++){
        const fish=s.members[j];
        const lane=fish.cross+.11*Math.sin(1.2*time+fish.offset);
        const observed=packet?fishSchools.position(packet,j):null;
        const x=observed?observed[0]-terrain.center[0]:s.cx+dx+fish.along*forwardX-lane*forwardY;
        const y=observed?observed[1]-terrain.center[1]:s.cy+dy+fish.along*forwardY+lane*forwardX;
        const bed=terrain.height(x,y),heading=observed?observed[3]:yaw;
        const worldX=terrain.center[0]+x,worldY=terrain.center[1]+y;
        const z=observed?observed[2]:Math.max(obstacles.top(worldX,worldY,.29)+.13,
          Math.min(-.9,bed+(s.rise??0)+fish.up+.22*Math.sin(.6*time+fish.offset)+.32));
        if(z<bed+.15||Math.hypot(eye.x-worldX,eye.y-worldY,eye.z-z)>viewRadius)continue;
        if(!webgl2&&batch.count===batch.root.children.length)continue;
        const f=webgl2?pose:batch.root.children[batch.count];
        f.position.set(worldX,worldY,z);
        const ahead=terrain.height(x+.16*Math.cos(heading),y+.16*Math.sin(heading));
        f.rotation.set(0,-Math.atan((ahead-bed)/.16)*.58,heading,'ZYX');f.scale.setScalar(fish.scale);
        if(overlay)overlay.add(worldX,worldY,z,heading,fish.contactShape??=fishBodyShape(s.species,fish.scale));
        const stroke=packet&&fishSchools.stroke?.(packet,j);
        const frame=stroke?stroke[0]:(time*8/batch.cycle+fish.offset*4/Math.PI)%8;
        const gain=stroke?stroke[1]/(fish.scale*batch.geometry.userData.tailExcursion):1;
        const rate=stroke?stroke[2]:8/batch.cycle;
        if(webgl2){f.updateMatrix();batch.root.setMatrixAt(batch.count,f.matrix);batch.offsets.setXYZ(batch.count,frame,gain,rate);}
        else setSchoolMorph(f,frame,gain);
        batch.count++;
        if(wreck&&++wreckCount>=(mobile?32:72))break;
      }
    }
    for(const b of batches) {
      b.root.visible=b.count>0;
      if(webgl2){b.root.count=b.count;b.root.instanceMatrix.needsUpdate=true;b.offsets.needsUpdate=true;}
      else b.root.children.forEach((mesh,i)=>{mesh.visible=i<b.count;});
    }
    overlay?.end();
  }
  return {update,dispose(){
    disposed=true;
    overlay?.dispose();
    for(const b of batches){b.geometry.dispose();b.material.dispose();b.root.dispose?.();}
    for(const texture of textures)texture.dispose();
  }};
}
