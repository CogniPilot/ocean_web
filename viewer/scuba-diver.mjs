import {diverTriangleSkin,meshLoad} from './diver-mesh-contact.mjs';
import {diverBind} from './scuba-bind.mjs';
import {diverProbes,diverLoad} from './diver-contact.mjs';
import {divePacket} from './npc-room.mjs';
// Swimming diver in metres, +X forward, +Y port, +Z up. The shared geometry
// retains the Quaternius humanoid weights; each swimmer owns its bone poses.
let assetPromise,users=0;
function releaseAsset(asset) {
  if(--users>0)return;
  assetPromise=undefined;
  const geometries=new Set(),materials=new Set(),skeletons=new Set();
  asset.traverse(o=>{
    if(o.geometry)geometries.add(o.geometry);
    if(o.material)for(const m of [].concat(o.material))materials.add(m);
    if(o.skeleton)skeletons.add(o.skeleton);
  });
  for(const item of [...geometries,...materials,...skeletons])item.dispose();
}
async function getAsset(){
  const {GLTFLoader}=await import('./vendor/gltf-loader.mjs');
  const url=new URL('./assets/subsea/scuba-diver.glb',import.meta.url);
  url.search=new URL(import.meta.url).search;
  const result=await new GLTFLoader().loadAsync(url.href);
  return result.scene;
}
// The solved respiratory phase advances only while the regulator delivers air.
// Fixed phase crossings keep each breath's puff intact between network updates.
function regulatorExhaust(T,group,playSound) {
  const capacity=64,geometry=new T.IcosahedronGeometry(1,1);
  const material=new T.MeshStandardMaterial({
    color:0xd7e8ed,roughness:.17,metalness:.19,transparent:true,opacity:.87,depthWrite:false,
  });
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
       float rim=1.0-abs(dot(normalize(vViewPosition),normal));
       diffuseColor.a*=0.15+0.85*pow(rim,1.45);`);
  };
  const cloud=new T.InstancedMesh(geometry,material,capacity);
  cloud.name='Regulator exhaust';cloud.count=0;cloud.frustumCulled=false;
  cloud.instanceMatrix.setUsage(T.DynamicDrawUsage);group.add(cloud);
  const particles=Array.from({length:capacity},()=>({origin:new T.Vector3(),born:-Infinity}));
  const previousVents=[new T.Vector3(),new T.Vector3()],inverse=new T.Matrix4(),point=new T.Vector3(),instance=new T.Matrix4();
  let prevTime,prevBreath,hadAir=false,next=0;
  const random=n=>{const v=Math.sin(n*127.1+53.3)*43758.5453;return v-Math.floor(v);};
  function update(vents,time,breath,effort,venting,surfaceZ){
    const dt=time-prevTime,db=breath-prevBreath,lifetime=2.12;
    const continuous=dt>=0 && db>=0 && db<=2 && vents[0].distanceToSquared(previousVents[0])<9;
    if(!continuous)for(const b of particles)b.born=-Infinity;
    if(continuous&&venting&&hadAir&&dt>0&&db>0){
      // A mouthful of air vents in seven short pulses, followed by a much
      // longer interval with no births. Catch up only the still-visible puffs.
      const earliest=Math.max(prevBreath,breath-db*lifetime/dt);
      for(let cycle=Math.floor(earliest);cycle<=Math.floor(breath);cycle++){
        for(let pulse=0;pulse<7;pulse++){
          const at=cycle+.12+.035*pulse;
          if(at<=earliest||at>breath)continue;
          const fraction=(at-prevBreath)/db,born=prevTime+dt*fraction;
          if(pulse===0 && time-born<.15 && vents[0].z<surfaceZ)
            playSound?.('exhale',vents[0],.7+.3*effort);
          const count=5+Math.round(2*effort)+(pulse<2?2:0);
          for(let k=0;k<count;k++){
            const b=particles[next++%capacity],seed=cycle*79+pulse*9+k;
            const angle=2*Math.PI*random(seed+2.17),spread=.035+.085*random(seed+3.9);
            const side=(k+pulse)%2;
            b.origin.lerpVectors(previousVents[side],vents[side],fraction);
            b.born=born;b.phase=angle;b.dx=spread*Math.cos(angle);b.dy=spread*Math.sin(angle);
            b.radius=(k===0?.017+.007*random(seed+4.4):.005+.010*random(seed+5.2))*(1+.13*effort);
            b.rise=.36+6.8*b.radius+.085*random(seed+.57);
          }
        }
      }
    }
    inverse.copy(group.matrixWorld).invert();
    let visible=0;
    for(const b of particles){
      const age=time-b.born;
      if(age<0||age>=lifetime)continue;
      const spread=age*(.6+.35*age),sway=.016*age;
      point.copy(b.origin);
      point.x+=spread*b.dx+sway*Math.sin(7*age+b.phase);
      point.y+=spread*b.dy+sway*Math.cos(6*age+b.phase);
      point.z+=b.rise*age+.025*Math.sin(Math.min(age,.32)*4);
      if(point.z+b.radius>=surfaceZ){b.born=-Infinity;continue;}
      const r=b.radius*(.8+.22*Math.min(age,.9)+.08*age);
      const wobble=.10*Math.sin(9*age+b.phase);
      instance.makeScale(r*(1+wobble),r*(1-wobble),r*(.90-.09*Math.min(age,1)));
      instance.setPosition(point).premultiply(inverse);cloud.setMatrixAt(visible++,instance);
    }
    cloud.count=visible;cloud.visible=visible>0;
    if(visible)cloud.instanceMatrix.needsUpdate=true;
    previousVents[0].copy(vents[0]);previousVents[1].copy(vents[1]);prevTime=time;prevBreath=breath;hadAir=venting;
  }
  return {update,dispose(){cloud.dispose();geometry.dispose();material.dispose();}};
}

function wristDisplay(T,bone,transform){
  if(!transform)return;
  const canvas=document.createElement('canvas');canvas.width=224;canvas.height=184;
  const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;
  const material=new T.MeshBasicMaterial({map:texture,toneMapped:false});
  const screen=new T.Mesh(new T.PlaneGeometry(.035,.033),material);
  screen.name='Dive computer LCD';screen.matrix.fromArray(transform);screen.matrixAutoUpdate=false;bone.add(screen);
  let stamp=-1;
  function update(row){
    const second=Math.floor(row[0]);if(second===stamp)return;stamp=second;
    const [depth,ndl]=row.slice(divePacket.computer);
    const seconds=Math.max(0,Math.floor(row[divePacket.start+19]-row[divePacket.log+4]));
    const time=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    const ceiling=row[divePacket.gauge+2],air=Math.round(row[divePacket.gauge]);
    ctx.fillStyle='#0a2226';ctx.fillRect(0,0,224,184);
    ctx.fillStyle='#a0c9c0';ctx.font='21px sans-serif';ctx.fillText('DEPTH  m',10,25);
    ctx.fillStyle='#f0fff6';ctx.font='bold 50px monospace';ctx.fillText(depth.toFixed(1),8,75);
    ctx.font='24px monospace';ctx.fillText('TIME '+time,10,108);
    ctx.fillText(ceiling>.1?'CEIL '+ceiling.toFixed(1)+'m':'NDL '+(ndl>=99?'99+':ndl<1?'<1':Math.floor(ndl))+'min',10,139);
    ctx.fillStyle=air<=50?'#f6bd73':'#a0ded2';ctx.fillText('AIR '+air+'bar',10,170);
    texture.needsUpdate=true;
  }
  return {update,dispose(){screen.removeFromParent();screen.geometry.dispose();material.dispose();texture.dispose();}};
}

export async function scubaDiver(T,playSound,{training=false}={}) {
  users++;
  let asset;
  try{asset=await (assetPromise??=getAsset());}
  catch(error){if(--users===0)assetPromise=undefined;throw error;}
  return dressedRig(T,asset,false,playSound,training);
}

// Metre-scale frames mirror DiverTree.forwardDynamics, including its two zero-mass
// joint carriers per side. Clothing and skinning blend weights do not move the inertias.
export function inspectionRig(T,group,{mass,moments}={}){
  const torso=new T.Group(),registry=[];
  group.add(torso);
  function body(index,frame,center,label){
    if(mass)registry.push({frame,center,mass:mass[index],moments:moments[index],label});
  }
  const neutral=.003,total=(mass?.[0]??55.6)/1025,torsoVolume=total-neutral-.0056-.0135;
  body(0,torso,[(.135*torsoVolume+.55*.0056+.05*.0135+.055*neutral)/total,0,
    (.03*.0056+.24*.0135+.13*neutral)/total-.003],'Torso and equipment');
  function hinge(parent,offset,axis,label){
    const f=new T.Group();f.position.fromArray(offset);parent.add(f);
    f.userData.physicsJoint={axis,label};return f;
  }
  const sides=[1,-1].map((side,k)=>{
    const name=side>0?'Left ':'Right ',base=7*k;
    const hip=hinge(torso,[-.208800,side*.114305,.036000],[0,0,-1],name+'hip sweep');
    const hipFlex=hinge(hip,[0,0,0],[0,1,0],name+'hip flexion');
    const thigh=hinge(hipFlex,[0,0,0],[-1,0,0],name+'hip axial rotation');
    const shin=hinge(thigh,[-.428800,0,0],[0,1,0],name+'knee');
    const ankle=hinge(shin,[-.458788,0,0],[0,1,0],name+'ankle');
    const soleMount=new T.Group();ankle.add(soleMount);
    const foot=hinge(soleMount,[0,0,0],[-1,0,0],name+'fin cant');
    const upper=hinge(torso,[.25,side*.24,-.045],[0,0,-side],name+'shoulder');
    const elbow=hinge(upper,[-.25,0,0],[0,side,0],name+'elbow');
    const lower=hinge(elbow,[0,0,0],[-side,0,0],name+'forearm pronation');
    body(base+2,thigh,[-.195,0,0],name+'thigh');
    body(base+3,shin,[-.205,0,0],name+'shin');
    body(base+5,foot,[-.115,0,0],name+'foot and fin');
    body(base+6,upper,[-.115,0,0],name+'upper arm');
    body(base+7,lower,[-.125,0,0],name+'forearm and hand');
    return {hip,hipFlex,thigh,shin,ankle,soleMount,foot,upper,elbow,lower};
  });
  group.userData.physicsBodies=registry;
  const contactFrames=[group,...sides.flatMap(s=>[s.hip,s.thigh,s.shin,s.ankle,s.foot,s.upper,s.lower])];
  return {torso,sides,contactFrames,update(row){
    const upright=(row[21]??0)>0?(row[divePacket.posture]??0):0;
    torso.rotation.set(0,-Math.PI/2*upright,0);
    sides.forEach(({hip,hipFlex,thigh,shin,ankle,soleMount,foot,upper,elbow,lower},k)=>{
      const i=divePacket.joints+5*k,j=divePacket.lateral+2*k,side=k===0?1:-1;
      hip.rotation.z=-(row[j]??0);hipFlex.rotation.y=row[i]??0;thigh.rotation.x=-(row[divePacket.axial+2*k]??0);shin.rotation.y=row[i+1]??0;
      soleMount.rotation.y=-(row.length>=divePacket.torch?1:(row[21]??0))*Math.PI/2;
      ankle.rotation.y=row[i+2]??0;foot.rotation.x=-(row[j+1]??0);
      upper.rotation.z=-side*(row[i+3]??0);elbow.rotation.y=side*(row[i+4]??0);lower.rotation.x=-side*(row[divePacket.axial+2*k+1]??0);
    });
  }};
}

function dressedRig(T,asset,physics,playSound,training=false){
  const group=new T.Group();group.name=physics?'Diver contact rig':'Scuba diver';
  const model=asset.clone(true),bones=new Map(),skeletons=[];
  model.traverse(o=>{
    if(o.isBone)bones.set(o.name,o);
    if(o.userData.exteriorOnly)group.userData.exteriorOnly=o;
  });
  model.traverse(o=>{
    if(!o.isSkinnedMesh)return;
    // Bind-pose bounds describe the upright source character.
    o.frustumCulled=false;
    const source=o.skeleton;
    const skeleton=skeletons.find(entry=>entry.source===source)?.instance;
    if(skeleton){o.bind(skeleton,o.bindMatrix);return;}
    const instance=new T.Skeleton(source.bones.map(b=>bones.get(b.name)),source.boneInverses);
    skeletons.push({source,instance});
    o.bind(instance,o.bindMatrix);
  });
  model.position.fromArray(asset.userData.offset);
  model.quaternion.fromArray(asset.userData.orientation);
  const trimFrame=new T.Group();trimFrame.name='Diver trim';trimFrame.add(model);group.add(trimFrame);

  group.updateMatrixWorld(true);
  const leg=name=>{
    const b=bones.get(name);
    const stance=b.userData.standing;
    const sole=stance.sole?.map(point=>new T.Vector3().fromArray(point));
    const chord=sole&&sole[1].clone().lerp(sole[2],.5).sub(sole[0]).normalize();
    return {b,axis:new T.Vector3().fromArray(b.userData.kickAxis),chord,origin:b.position.clone(),rest:b.quaternion.clone(),
      stance:new T.Quaternion().fromArray(stance.rotation),stanceAxis:new T.Vector3().fromArray(stance.axis),
      sole};
  };
  const legs=['l','r'].map(side=>['thigh','calf','foot'].map(name=>leg(name+'_'+side)));
  group.updateMatrixWorld(true);
  // Store bend axes in each joint's bind-pose coordinates. Additive motion stays
  // relative to the dressed swimmer's prone pose, even when the vehicle banks.
  const probes=diverProbes(T,bones),triangles=diverTriangleSkin(bones);
  const rotate=new T.Quaternion();
  function joint(name,axis){
    const bone=bones.get(name);
    const localAxis=axis.applyQuaternion(bone.getWorldQuaternion(new T.Quaternion()).invert()).normalize();
    const rest=bone.quaternion.clone();
    return angle=>bone.quaternion.copy(rest).multiply(rotate.setFromAxisAngle(localAxis,angle));
  }
  const torso=joint('spine_01',new T.Vector3(1,0,0));
  const chest=joint('spine_02',new T.Vector3(0,1,0));
  const neck=joint('neck_01',new T.Vector3(0,0,1));
  const head=bones.get('Head'),neckBone=bones.get('neck_01');
  const neckPitchAxis=new T.Vector3(0,1,0).applyQuaternion(neckBone.getWorldQuaternion(new T.Quaternion()).invert());
  const headPitch=joint('Head',new T.Vector3(0,1,0));
  const arms=['l','r'].map((side,i)=>{
    const sign=i===0?1:-1;
    const hinge=name=>joint(name+'_'+side,new T.Vector3(0,1,0));
    const finger=name=>joint(name+'_'+side,new T.Vector3(0,0,sign));
    // Fit a broad palm from its own bind geometry. Keep each finger base in
    // place, bringing the long axes toward the middle finger without overlap.
    const paddles=[];
    if(!physics){
      const direction=(a,b)=>bones.get(b+'_'+side).getWorldPosition(new T.Vector3())
        .sub(bones.get(a+'_'+side).getWorldPosition(new T.Vector3())).normalize();
      const middle=direction('middle_01','middle_03');
      for(const name of ['index','middle','ring','pinky']){
        for(const segment of ['01','02']){
          const bone=bones.get(name+'_'+segment+'_'+side);
          const from=direction(name+'_'+segment,name+(segment==='01'?'_02':'_03'));
          const inverse=bone.getWorldQuaternion(new T.Quaternion()).invert();
          const delta=new T.Quaternion().setFromUnitVectors(from.applyQuaternion(inverse),middle.clone().applyQuaternion(inverse));
          paddles.push({bone,target:bone.quaternion.clone().multiply(delta)});
        }
      }
    }
    const hand=bones.get('hand_'+side);
    const wristBendAxis=new T.Vector3(0,1,0).applyQuaternion(hand.getWorldQuaternion(new T.Quaternion()).invert());
    const forearm=bones.get('lowerarm_'+side);
    const twistAxis=hand.getWorldPosition(new T.Vector3()).sub(forearm.getWorldPosition(new T.Vector3())).normalize()
      .applyQuaternion(forearm.getWorldQuaternion(new T.Quaternion()).invert());
    return {hand,forearm,twistAxis,paddles,wristBendAxis,shoulder:joint('upperarm_'+side,new T.Vector3(0,0,sign)),
      elbow:hinge('lowerarm'),wrist:joint('hand_'+side,new T.Vector3(sign,.15,0)),
      thumb:physics?null:joint('thumb_02_'+side,new T.Vector3(0,-1,sign*.25)),
      fingers:physics?[]:['index','middle','ring','pinky'].map(f=>['01','02','03'].map(n=>finger(f+'_'+n)))};

  });
  const links=inspectionRig(T,group,asset.userData.bodyInertia);
  // The skin is authored in a bent swimming pose. Calibrate the axis of each
  // segment against its actual bind geometry, once, in the model's metre frame.
  const aft=new T.Vector3(-1,0,0),point=new T.Vector3(),parentQ=new T.Quaternion();
  const bindLegs=legs.map(chain=>chain.map(({b,chord},i)=>{
    const bind=b.getWorldQuaternion(new T.Quaternion());
    const direction=i===2?chord.clone().applyQuaternion(bind):
      chain[i+1].b.getWorldPosition(new T.Vector3()).sub(b.getWorldPosition(point)).normalize();
    return new T.Quaternion().setFromUnitVectors(direction,aft).multiply(bind);
  }));
  const bootBinds=legs.map(chain=>{
    const foot=chain[2].b,bind=foot.getWorldQuaternion(new T.Quaternion());
    const [heel,left,right]=foot.userData.standing.sole.map(v=>new T.Vector3(...v).applyQuaternion(bind));
    const width=right.clone().sub(left).normalize();
    // The authored heel and tip probes include the blade's molded camber.
    // Recover the shoe's longitudinal axis separately from its sloping blade.
    const sole=left.lerp(right,.5).sub(heel);
    sole.addScaledVector(width,-sole.dot(width)).normalize().applyAxisAngle(width,-Math.atan2(.09365,.591));
    const upright=new T.Vector3().crossVectors(sole,width);
    const source=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(sole,width,upright));
    const target=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI);
    return target.multiply(source.invert()).multiply(bind);
  });
  const legFrames=links.sides.map(({thigh,shin,foot})=>[thigh,shin,foot]);
  function fitLegs(anatomical){
    for(let side=0;side<2;side++)for(let i=0;i<3;i++){
      const bone=legs[side][i].b,frame=legFrames[side][i];
      // Preserve the authored hip socket and bone lengths throughout the stroke.
      bone.position.copy(legs[side][i].origin);
      bone.parent.getWorldQuaternion(parentQ).invert();
      frame.getWorldQuaternion(bone.quaternion).multiply(anatomical&&i===2?bootBinds[side]:bindLegs[side][i]).premultiply(parentQ);
    }
  }
  const mask=new T.Object3D();mask.name='Diver eye';if(!physics)mask.matrix.fromArray(asset.userData.maskView);
  mask.matrixAutoUpdate=false;if(!physics)head.add(mask);
  const gaitRotation=new T.Quaternion(),legBend=new T.Quaternion(),solePoint=new T.Vector3();
  const soleUp=new T.Vector3();
  const exhaust=physics||training?null:regulatorExhaust(T,group,playSound),mouth=exhaust?new T.Vector3().fromArray(asset.userData.mouth):null;
  const vents=!exhaust?[]:asset.userData.outlets?asset.userData.outlets.map(p=>new T.Vector3().fromArray(p)):
    [-.038,.038].map(y=>mouth.clone().add(new T.Vector3(0,y,-.008)));
  const ventLocal=vents.map(p=>head.worldToLocal(p.clone()));
  const computer=physics||training?null:wristDisplay(T,bones.get('lowerarm_l'),asset.userData.screenPose);
  const up=new T.Vector3(0,0,1),port=new T.Vector3(0,1,0);
  const orientation=new T.Quaternion();
  const palmBlend=[0,0];
  function pose(phase,effort=1,breath=phase/(Math.PI*5),time=phase/3.8,surfaceTrim=0,venting=surfaceTrim<.98,surfaceZ=Infinity,ground=0,bedHeight,joints=null,footLoad=null,lateral=null,axial=null){
    const trim=ground>0?T.MathUtils.clamp(surfaceTrim,0,1):0,treadBlend=0;
    group.getWorldQuaternion(orientation);
    if(joints)trimFrame.quaternion.copy(links.torso.quaternion);
    else trimFrame.quaternion.setFromAxisAngle(port,-Math.PI/2*trim);
    trimFrame.position.set(0,0,0);
    const strength=Math.min(1,Math.max(0,effort));
    const restfulness=1-strength,breathWave=Math.sin(2*Math.PI*breath);
    // Neutral buoyancy leaves small breathing and balance motions between kicks.
    torso((.018+.035*restfulness)*Math.sin(.69*time+.4));
    chest(.020*breathWave+.012*Math.sin(.43*time));
    neck(.058*Math.sin(.32*time)+.027*Math.sin(.77*time));
    neckBone.quaternion.multiply(rotate.setFromAxisAngle(neckPitchAxis,.40*trim));
    headPitch(.62*trim);
    for(let side=0;side<2;side++){
      const arm=arms[side],offset=side*1.83,j=side*5;
      const scull=Math.sin(.88*time+offset),slow=Math.sin(.46*time+1.6*side);
      const stroke=1.65*time+offset,step=phase+side*Math.PI;
      // Leave clearance between the glove mesh and the outside of the fitted thigh.
      arm.shoulder(joints?-.20-joints[j+3]:.026*scull+.012*slow-treadBlend*(.32+.16*Math.sin(stroke))-ground*.12);
      arm.elbow(joints?-joints[j+4]:.035*Math.sin(.88*time+offset-.8)+.018*breathWave-treadBlend*(.80+.20*Math.cos(stroke))
        -ground*(.17+.12*strength*Math.sin(step)));
      // Let a relaxed hand turn at the wrist, open, then loosely curl again.
      // Offset both hands and the individual fingers to avoid moving them in lockstep.
      const idle=restfulness*(1-.65*treadBlend);
      const opening=.5+.5*Math.sin(.95*time+offset+.48*slow);
      if(axial)arm.forearm.quaternion.multiply(rotate.setFromAxisAngle(arm.twistAxis,(side===0?1:-1)*axial[2*side+1]));
      arm.wrist((axial?0:1)*(.055*slow+idle*(.20*scull+.13*slow)+treadBlend*(.19+.27*Math.cos(stroke))+.035*ground*Math.cos(step)));
      arm.hand.quaternion.multiply(rotate.setFromAxisAngle(arm.wristBendAxis,idle*(.13*slow+.065*breathWave)));
      const paddle=palmBlend[side];
      arm.thumb?.((1-paddle)*(.18+.06*Math.sin(.67*time+offset)+idle*(.17-.35*opening))+.11*paddle);
      arm.fingers.forEach(([base,mid,tip],finger)=>{
        const curl=.22+.052*finger+.046*Math.sin(.68*time+offset+.22*finger)
          +idle*(.18-.30*opening+.085*Math.sin(1.31*time+offset-.42*finger));
        const open=treadBlend*(.095+.05*Math.cos(stroke));
        base(curl-open);mid(1.13*curl-open);tip(.53*curl*(1-paddle)+.06*paddle);
      });
      for(const {bone,target} of arm.paddles)bone.quaternion.slerp(target,paddle*.93);
      if(joints)continue;
      const a=phase+side*Math.PI;
      const angles=[.31*Math.sin(a),.53*Math.sin(a-.9),-.29*Math.sin(a-1.57)];
      const tread=1.95*time+side*Math.PI;
      const treading=[-.12+.37*Math.sin(tread),.43+.42*Math.sin(tread-1.0),-.26+.31*Math.sin(tread-1.62)];
      // The planted foot travels aft relative to the body. During recovery,
      // shorten the leg to lift the entire blade, then put the heel down first.
      const cycle=((a/(2*Math.PI))%1+1)%1,swing=cycle>=.5?(cycle-.5)*2:0;
      const active=T.MathUtils.clamp(strength/.45,0,1);
      const forward=.205*active*(cycle<.5?1-4*cycle:-Math.cos(Math.PI*swing));
      const lift=.245*active*Math.sin(Math.PI*swing)**2;
      const reach=.822-lift,hip=-Math.atan2(forward,reach)-Math.acos(Math.min(1,Math.hypot(forward,reach)/.86));
      const knee=2*Math.acos(Math.min(1,Math.hypot(forward,reach)/.86));
      const toeUp=-.16-.16*active*Math.sin(Math.PI*swing);
      const walk=[hip,knee,toeUp-hip-knee];
      for(let i=0;i<3;i++){
        const {b,axis,origin,rest,stance,stanceAxis}=legs[side][i];
        b.position.copy(origin);
        const swim=angles[i]*strength+.08*restfulness*Math.sin(.52*time+side*1.8-i*.63);
        b.quaternion.copy(rest).multiply(rotate.setFromAxisAngle(axis,T.MathUtils.lerp(swim,treading[i],trim)));
        if(ground>0)b.quaternion.slerp(gaitRotation.copy(stance).multiply(legBend.setFromAxisAngle(stanceAxis,walk[i])),ground);
      }
    }
    if(joints)fitLegs(axial!=null);
    if(!joints && ground>0 && bedHeight && (!footLoad || footLoad[0]+footLoad[1]>2)){
      let shift=-Infinity;
      for(const chain of legs){
        const foot=chain[2];
        foot.b.updateWorldMatrix(true,false);
        for(const sample of foot.sole){
          solePoint.copy(sample).applyMatrix4(foot.b.matrixWorld);
          shift=Math.max(shift,bedHeight(solePoint.x,solePoint.y)-solePoint.z);
        }
      }
      // Translate the complete skeleton (including the eye) by the measured sole contact.
      trimFrame.position.addScaledVector(soleUp.copy(up).applyQuaternion(orientation),ground*shift);
    }
    if(!exhaust){group.updateMatrixWorld(true);return;}
    for(let i=0;i<2;i++)head.localToWorld(vents[i].copy(ventLocal[i]));
    exhaust.update(vents,time,breath,strength,venting,surfaceZ);
  }
  const previousHip=[NaN,NaN],previousSweepRate=[NaN,NaN],finPosition=new T.Vector3();
  let lastStrokeTime;
  function finSounds(row,surface){
    // Each blade crosses the neutral hip angle once on its power stroke.
    // Use measured motion so a resting diver or a dry boot stays quiet.
    for(let side=0;side<2;side++){
      const index=side*5,angle=row[divePacket.joints+index],rate=row[divePacket.rates+index];
      const sign=side===0?1:-1;
      const sweepRate=sign*(row[divePacket.lateralRates+side*2]??0);
      const flutter=previousHip[side]>=0&&angle<0&&rate<-.28;
      const lateral=previousSweepRate[side]<.45&&sweepRate>=.45;
      if((flutter||lateral)&&row[0]>lastStrokeTime&&row[0]-lastStrokeTime<.35){
        legs[side][2].b.getWorldPosition(finPosition);
        if(finPosition.z<surface-.03)playSound('fin',finPosition,Math.min(1,lateral?sweepRate:Math.abs(rate)/3.5));
      }
      previousHip[side]=angle;previousSweepRate[side]=sweepRate;
    }
    lastStrokeTime=row[0];
  }
  let disposed=false;
  function dispose(){
    if(disposed)return;disposed=true;
    group.removeFromParent();exhaust?.dispose();computer?.dispose();
    for(const {instance} of skeletons)instance.dispose();
    if(!physics)releaseAsset(asset);
  }
  pose(0,0,0,0);
  function applyFrame(row,surface,bed){
    group.position.fromArray(row,1);group.rotation.set(row[9],-row[8],row[7],'ZYX');
    const wet=row[20]>.5;
    const parts=row.length>=divePacket.lateral;
    links.update(row);
    for(let side=0;side<2;side++){
      const j=divePacket.joints+side*5,r=divePacket.rates+side*5;
      const movement=Math.abs(row[r+3]??0)+.6*Math.abs(row[r+4]??0);
      const reach=Math.max(0,Math.abs(row[j+3]??0)-.15);
      palmBlend[side]=T.MathUtils.smoothstep(movement+reach,.24,.92)*(1-(row[21]??0));
    }
    pose(row[13],row[14],row[16],row[0],row[divePacket.posture]??0,wet&&(row[divePacket.gauge]??1)>.01,
      surface,row[21]??0,bed,parts?row.slice(divePacket.joints,divePacket.rates):null,parts?row.slice(divePacket.footLoads,divePacket.lateral):null,
      row.length>=divePacket.vest?row.slice(divePacket.lateral,divePacket.lateralRates):null,
      row.length>=divePacket.torch?row.slice(divePacket.axial,divePacket.axialRates):null);
    if(playSound&&parts)finSounds(row,surface);
  }
  let wires;
  group.userData.diverProbes=()=>{
    group.updateWorldMatrix(true,true);
    wires=probes.points(wires);return wires;
  };
  group.userData.diverParts=probes.kinds;
  group.userData.diverTriangles=draw=>{group.updateWorldMatrix(true,true);triangles.wires(draw);};
  return {group,pose,applyFrame,probes,triangles,contactFrames:links.contactFrames,dispose,setComputer:computer?.update};
}

// The room host can collide a diver while the detailed mesh is still loading,
// while its own camera looks elsewhere, or on a device without a WebGL context.
export function diverContactRig(T){
  const asset=new T.Group();asset.userData={offset:diverBind.offset,orientation:diverBind.orientation};
  const bones=diverBind.bones.map(([name,,p,q,s,extras])=>{
    const b=new T.Bone();b.name=name;b.position.fromArray(p);b.quaternion.fromArray(q);b.scale.fromArray(s);
    b.userData=extras??{};return b;
  });
  diverBind.bones.forEach(([,parent],i)=>(parent<0?asset:bones[parent]).add(bones[i]));
  const rig=dressedRig(T,asset,true),quaternion=new T.Quaternion(),delta=new T.Quaternion();
  const axis=new T.Vector3(),euler=new T.Euler(0,0,0,'ZYX');
  let a,b,oldProbes,newProbes;
  function spawnHeight(start,heading,water,bed){
    // On a steep slope the prone fin tips can start inside the terrain even
    // when the pelvis clears it. Use the same starting joint pose as the FMU.
    const rest=new Float64Array(divePacket.length);
    rest.set(start,1);rest[7]=heading;
    rig.applyFrame(rest,water,bed);
    const points=rig.triangles.snapshot();
    let lift=0;
    for(let i=0;i<points.length;i+=3){
      const gap=points[i+2]-bed(points[i],points[i+1]);
      lift=Math.max(lift,.08-gap);
    }
    return start[2]+lift;
  }
  return {rig,spawnHeight,sample(row,surface,bed,sweep,dt){
    // Two swept segments capture a moving fin's curved trajectory between
    // host samples. Predict the joints from measured rates in the FMU packet.
    const next=Float64Array.from(row),origin=Float64Array.from(row.subarray?row.subarray(0,7):row.slice(0,7));
    const mesh=Boolean(sweep.triangles);
    rig.applyFrame(row,surface,bed);
    if(mesh)a=rig.triangles.points(a);else oldProbes=rig.probes.points(oldProbes);
    let best,score=-1,self,selfScore=-1;
    for(let i=1;i<=2;i++){
      const t=.5*i*dt;
      next[0]=row[0]+t;
      for(let j=0;j<3;j++)next[1+j]=row[1+j]+t*row[4+j];
      axis.set(row[12],-row[11],row[10]);
      const speed=axis.length();
      quaternion.setFromEuler(euler.set(row[9],-row[8],row[7],'ZYX'));
      if(speed>0)quaternion.multiply(delta.setFromAxisAngle(axis.multiplyScalar(1/speed),t*speed));
      euler.setFromQuaternion(quaternion,'ZYX');next[7]=euler.z;next[8]=-euler.y;next[9]=euler.x;
      if(row.length>=divePacket.lateral)for(let j=0;j<10;j++)
        next[divePacket.joints+j]=row[divePacket.joints+j]+t*row[divePacket.rates+j];
      if(row.length>=divePacket.torch)for(let j=0;j<4;j++)
        next[divePacket.axial+j]=row[divePacket.axial+j]+t*row[divePacket.axialRates+j];
      if(row.length>=divePacket.vest)for(let j=0;j<4;j++)
        next[divePacket.lateral+j]=row[divePacket.lateral+j]+t*row[divePacket.lateralRates+j];
      next[13]=row[13]+2*Math.PI*t*(row[17]??0);
      rig.applyFrame(next,surface,bed);
      if(mesh)b=rig.triangles.points(b);else newProbes=rig.probes.points(newProbes);
      for(let j=0;j<3;j++)origin[1+j]=row[1+j]+(t-.5*dt)*row[4+j];
      const result=mesh?meshLoad(rig.triangles,a,b,origin,.5*dt,sweep,row[21],t-.5*dt):
        diverLoad(oldProbes,newProbes,rig.probes.kinds,origin,.5*dt,sweep,row[21],t-.5*dt);
      if(mesh&&result.selfScore>selfScore){self=result.meshSelfContact;selfScore=result.selfScore;}
      if(result.score>score){
        best=result;score=result.score;
        if(result.materialPoint){
          const local=rig.contactFrames[result.contactLink-1].worldToLocal(new T.Vector3(...result.materialPoint));
          best.contactWitness=[1,...local.toArray(),result.planeAtStart,...result.obstacleVelocity,row[0]];
        }
      }
      if(mesh){const temp=a;a=b;b=temp;}
      else{const temp=oldProbes;oldProbes=newProbes;newProbes=temp;}
    }
    if(mesh)best.meshSelfContact=self;
    return best;
  }};
}
