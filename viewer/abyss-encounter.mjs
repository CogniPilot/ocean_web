// The local pilot owns the vehicle damage latch. The creature stays in its cave.
import {abyssCave,caveWaterColumn} from './abyss-cave.mjs';

function fracture(T,vehicle){
  const dome=vehicle.getObjectByName('Forward acrylic viewport');
  if(!dome)return;
  const positions=[],normals=[];
  const radius=dome.geometry.parameters.radius+.00015;
  function vertex(a,b){
    const inv=1/Math.hypot(1,a,b);
    const normal=[-a*inv,inv,b*inv];
    positions.push(...normal.map(x=>x*radius));normals.push(...normal);
  }
  // Each tapered sliver lies on the acrylic. Its rough faces scatter incident
  // light and remain attached to the glass in both the pilot and chase views.
  function sliver(a,b,x,y,width){
    const length=Math.hypot(x-a,y-b);
    const du=(y-b)*width/length,dv=(a-x)*width/length;
    vertex(a+du,b+dv);vertex(a-du,b-dv);vertex(x+du*.73,y+dv*.73);
    vertex(x+du*.73,y+dv*.73);vertex(a-du,b-dv);vertex(x-du*.73,y-dv*.73);
  }
  for(const [i,angle] of [.12,1.48,2.21,3.83,4.66,5.70].entries()){
    let a=.41,b=.26;
    const count=3+i%4;
    for(let j=0;j<count;j++){
      const length=.047+.047*(1+Math.sin(8*i+12*j));
      const heading=angle+.24*Math.sin(17*i+5*j);
      const x=a+length*Math.cos(heading),y=b+length*Math.sin(heading);
      const width=.0022*(1-.75*j/count);
      sliver(a,b,x,y,width);
      if(j===1||j===3)sliver(x,y,x+.08*Math.cos(heading+.62),y+.08*Math.sin(heading+.62),width*.55);
      a=x;b=y;
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  const material=new T.MeshStandardMaterial({color:0xa1afb0,roughness:.53,transparent:true,opacity:.47,
    depthWrite:false,side:T.DoubleSide});
  material.forceSinglePass=true;
  const cracks=new T.Mesh(geometry,material);
  cracks.name='Acrylic stress fractures';cracks.renderOrder=dome.renderOrder+1;dome.add(cracks);
  return {dispose(){cracks.removeFromParent();geometry.dispose();material.dispose();}};
}

// Each station is east, north, and clearance over the cave floor in metres.
function armStations(T,bed,active){
  const [x,y]=abyssCave.armRoot;
  const stations=active?[
    [x,y+1.5,-2.5],[x-.12,y,1.0],[-35.42,-28.13,1.32],[-35.05,-29.22,1.3],
    [-34.18,-30.00,1.25],[-33.45,-30.42,1.35],[-32.97,-30.70,1.28],
    [-32.49,-30.88,1.17],[-32.03,-30.78,1.04],[-31.91,-30.44,1.15],[-32.04,-30.14,1.31]
  ]:[
    [x+.22,y+1.9,-2.6],[x+.20,y+.15,.79],[-35.03,-28.12,1.01],[-34.62,-28.93,1.03],
    [-34.10,-29.42,1.05],[-33.52,-29.51,1.08],[-33.06,-29.35,1.05],
    [-32.63,-29.23,1.02],[-32.27,-29.32,.99],[-32.15,-29.59,1.03],[-32.31,-29.84,1.20]
  ];
  return stations.map(([x,y,h])=>new T.Vector3(x,y,bed.height(x,y)+h));
}

// Drive the original skinned mesh along the passage. Each joint preserves the
// cross section of the arm; only the free distal joints participate in a lash.
function denArm(T,source,parent,bed,active){
  const rest=armStations(T,bed,active),curve=new T.CatmullRomCurve3(rest.map(v=>v.clone()));
  const mesh=new T.SkinnedMesh(source.geometry,source.material);
  mesh.name=active?'Lashing arm':'Resting arm';mesh.frustumCulled=false;
  const bind=source.skeleton.boneInverses;
  const joints=bind.map((inverse,i)=>{
    const bone=new T.Bone();bone.name=source.skeleton.bones[i].name;bone.matrixAutoUpdate=false;mesh.add(bone);
    const basis=inverse.clone().invert(),center=new T.Vector3().setFromMatrixPosition(basis);
    // Remove the bind-space translation to rotate the section about its center.
    basis.premultiply(new T.Matrix4().makeTranslation(-center.x,-center.y,-center.z));
    return {bone,basis,height:center.y};
  });
  mesh.bind(new T.Skeleton(joints.map(j=>j.bone),bind),new T.Matrix4());parent.add(mesh);
  const position=mesh.geometry.attributes.position;
  let tipIndex=0;
  for(let i=1;i<position.count;i++)if(position.getY(i)>position.getY(tipIndex))tipIndex=i;
  const tipHeight=position.getY(tipIndex);
  for(const joint of joints){
    const next=joints.find(j=>j.height>joint.height+.01&&j.bone.name.startsWith('Tentacle'));
    const nextHeight=next?.height??tipHeight;
    joint.u=curve.getUtoTmapping(Math.max(0,joint.height/tipHeight));
    // The steep rear bend has less rock-normal clearance than the open chamber.
    // Blend the section radius along the path while preserving the free tip.
    joint.thickness=(active?.49:.39)*(.54+.46*T.MathUtils.smoothstep(joint.u,.30,.59));
    joint.nextU=curve.getUtoTmapping(nextHeight/tipHeight);
    joint.length=Math.max(.001,nextHeight-joint.height);
  }
  const p=new T.Vector3(),next=new T.Vector3(),along=new T.Vector3(),across=new T.Vector3(),oral=new T.Vector3();
  const up=new T.Vector3(0,0,1),tangent=new T.Vector3(),bend=new T.Vector3();
  const phase=active?0:2.4;
  function pose(t,curl,reach,target){
    const points=curve.points,last=points.length-1;
    for(let i=6;i<=last;i++){
      const free=(i-5)/(last-5);
      const v=points[i].copy(rest[i]);
      v.y+=free*.073*Math.sin(.79*t+phase-.88*i);
      v.z+=free*.047*Math.sin(.61*t+phase-1.06*i);
      if(!active)continue;
      v.x-=curl*free*free*.28;v.z+=curl*free*free*.21;
      if(reach){
        // Lead with the free tip, unfurling from the last braced elbow.
        const start=points[6],w=Math.max(0,(i-6)/(last-6));
        bend.lerpVectors(start,target,w);bend.z+=.19*Math.sin(Math.PI*w);
        v.lerp(bend,reach*w*(2-w));
      }
    }
    for(const j of joints){
      curve.getPoint(j.u,p);curve.getPoint(j.nextU,next);
      along.subVectors(next,p);tangent.copy(along).normalize();
      across.crossVectors(tangent,up).normalize();
      // Roll the oral face towards the open chamber as the distal arm curls.
      const roll=(active?.78:-.83)+.16*Math.sin(4*j.u+phase);
      across.applyAxisAngle(tangent,roll);oral.crossVectors(across,tangent);
      j.bone.matrix.makeBasis(across.multiplyScalar(j.thickness),along.divideScalar(j.length),oral.multiplyScalar(j.thickness))
        .setPosition(p).multiply(j.basis);
      j.bone.matrixWorldNeedsUpdate=true;
    }
    mesh.updateWorldMatrix(true,true);
  }
  return {mesh,pose,tip(out){mesh.getVertexPosition(tipIndex,out);return mesh.localToWorld(out);}};
}

export function abyssEncounter(T,parent,signal,bed=globalThis.harborBed){
  const lair=new T.Vector3(...abyssCave.lair),ceiling=caveWaterColumn(bed);
  const root=new T.Group();root.name='Abyss tentacle';root.visible=false;parent.add(root);
  const target=new T.Vector3(),tip=new T.Vector3(),previousTip=new T.Vector3(),keelA=new T.Vector3(-.227,0,.05),keelB=new T.Vector3(.27,0,.05);
  const ray=new T.Ray(),a=new T.Vector3(),b=new T.Vector3(),closest=new T.Vector3();
  let attacking,resting,pending=false,retryAt=0,previousTime,stage='idle',age=0,withdrawFrom=0,broken,glass;
  function reset(){stage='idle';age=0;withdrawFrom=0;}
  async function load(t){
    pending=true;
    try{
      const {GLTFLoader}=await import('./vendor/gltf-loader.mjs');
      if(signal.aborted)return;
      const url=new URL('./assets/subsea/abyss-tentacle.glb',import.meta.url);url.search=new URL(import.meta.url).search;
      const {scene}=await new GLTFLoader().loadAsync(url.href);
      const source=scene.getObjectByProperty('isSkinnedMesh',true);
      const free=()=>{
        const textures=new Set(Object.values(source.material).filter(v=>v?.isTexture));
        for(const texture of textures)texture.dispose();
        source.geometry.dispose();source.material.dispose();source.skeleton.dispose();
        attacking?.mesh.skeleton.dispose();resting?.mesh.skeleton.dispose();
      };
      if(signal.aborted){free();return;}
      signal.addEventListener('abort',free,{once:true});
      attacking=denArm(T,source,root,bed,true);resting=denArm(T,source,root,bed,false);
      attacking.pose(t,0,0,target);resting.pose(t,0,0,target);
    }catch(error){retryAt=t+15;if(!signal.aborted)console.warn('Could not load abyss tentacle',error);}
    finally{pending=false;}
  }
  function inWater(p){return p.z>bed.height(p.x,p.y)&&p.z<ceiling(p.x,p.y);}
  function aim(sub){
    sub.mesh.updateWorldMatrix(true,false);
    a.copy(tip);sub.mesh.worldToLocal(a);
    target.set(Math.min(keelB.x,Math.max(keelA.x,a.x)),0,.05);
    target.addScaledVector(a.sub(target).normalize(),.075);
    sub.mesh.localToWorld(target);
    return inWater(target);
  }
  function insideHull(point){
    const x=T.MathUtils.clamp(point.x,keelA.x,keelB.x);
    return (point.x-x)**2+point.y**2+(point.z-keelA.z)**2<=.13**2;
  }
  function touches(sub){
    sub.mesh.worldToLocal(a.copy(previousTip));sub.mesh.worldToLocal(b.copy(tip));
    // The nearest point on an infinite ray may lie beyond this sample even
    // when its endpoint is already inside the hull capsule.
    if(insideHull(a)||insideHull(b))return true;
    ray.origin.copy(a);ray.direction.subVectors(b,a);const length=ray.direction.length();
    if(length<1e-7)return false;
    ray.direction.multiplyScalar(1/length);
    const radius=.13;
    return ray.distanceSqToSegment(keelA,keelB,closest)<=radius*radius&&closest.distanceToSquared(a)<=length*length+1e-8;
  }
  signal.addEventListener('abort',()=>{glass?.dispose();root.removeFromParent();},{once:true});
  return function update(sub,t){
    if(broken&&(broken!==sub||!sub?.breached)){glass?.dispose();glass=undefined;broken=undefined;}
    if(sub?.breached&&broken!==sub){broken=sub;glass=fracture(T,sub.mesh);}
    const dt=previousTime===undefined?0:Math.max(0,t-previousTime);previousTime=t;
    const pos=sub?.mesh.position,near=sub?.active&&pos&&pos.distanceToSquared(lair)<16*16;
    root.visible=Boolean(near&&attacking);
    if(!near){reset();return;}
    if(!attacking){if(!pending&&t>=retryAt)void load(t);return;}
    resting.pose(t,0,0,target);
    if(stage==='idle'){
      attacking.pose(t,0,0,target);attacking.tip(tip);
      if(sub.breached||sub.seatedOnLift||pos.distanceToSquared(lair)>=abyssCave.triggerRadius**2||!inWater(pos)||!aim(sub))return;
      stage='aim';age=0;
    }
    // Substep the striking tip so contact remains swept at fast playback.
    let left=Math.min(dt,2);
    while(left>1e-6){
      const step=Math.min(left,1/60);left-=step;age+=step;
      let curl=0,reach=0;
      if(stage==='aim'){
        curl=T.MathUtils.smoothstep(age,0,.5);
        if(curl===1){stage='lash';age=0;}
      }else if(stage==='lash'){
        reach=T.MathUtils.smoothstep(age,0,.49);curl=1-reach;
      }else if(stage==='withdraw'){
        reach=withdrawFrom*(1-T.MathUtils.smoothstep(age,0,.78));
        if(age>=.78){stage='rest';age=0;}
      }else if(stage==='rest'&&age>=1.2){reset();break;}
      attacking.tip(previousTip);attacking.pose(t-left,curl,reach,target);attacking.tip(tip);
      if(stage==='lash'){
        const hit=!sub.breached&&inWater(pos)&&inWater(tip)&&touches(sub);
        if(hit)sub.breach();
        if(hit||reach>=1){stage='withdraw';withdrawFrom=reach;age=0;}
      }
    }
  };
}
