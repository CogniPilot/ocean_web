// A pinned chain of inextensible tape segments with free hinges between them.
// The sail membrane supplies the local aerodynamic load at the attachment.
export function sailTelltale(T,port,phase){
  const links=5,length=.047;
  const points=Array.from({length:links+1},()=>new T.Vector3());
  const previous=points.map(p=>p.clone());
  const geometry=new T.BufferGeometry();
  const coords=new T.BufferAttribute(new Float32Array((links+1)*6),3).setUsage(T.DynamicDrawUsage);
  const indices=[];
  for(let i=0;i<links;i++){const j=2*i;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
  geometry.setIndex(indices);geometry.setAttribute('position',coords);
  const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color:port?0xc83e44:0x5bb873,roughness:.88,side:T.DoubleSide}));
  mesh.frustumCulled=false;mesh.visible=false;
  const face=new T.Vector3(),driving=new T.Vector3(),direction=new T.Vector3();
  const equivalent=new T.Vector3(),twistAxis=new T.Vector3(),prior=new T.Vector3();
  let stamp;

  function update(anchor,normal,gravity,load,time){
    mesh.visible=true;
    const elapsed=time-(stamp??time);
    face.copy(normal).multiplyScalar(port?1:-1);
    driving.copy(load).multiplyScalar(.75).clampLength(0,65);
    const wind=driving.length();
    // Hold the ribbon on its own face, including when it hangs slack.
    const outward=driving.dot(face);
    if(outward<0)driving.addScaledVector(face,-outward);
    if(stamp===undefined||elapsed<0||elapsed>.24){
      for(let i=0;i<=links;i++){
        points[i].copy(anchor).addScaledVector(gravity,i*length/9.81);
        previous[i].copy(points[i]);
      }
    }
    points[0].copy(anchor);
    if(elapsed>0&&elapsed<=.24){
      const substeps=Math.ceil(elapsed*120),dt=elapsed/substeps;
      for(let step=0;step<substeps;step++){
        const clock=time-elapsed+(step+1)*dt;
        for(let i=1;i<=links;i++){
          const p=points[i],old=previous[i];
          direction.subVectors(p,old).multiplyScalar(Math.exp(-11*dt));
          old.copy(p);
          const bending=wind*(.04+.026*i)*
            (Math.sin(clock*32-1.4*i+phase)+.43*Math.sin(clock*49+.7*i+phase));
          p.add(direction).addScaledVector(gravity,dt*dt).addScaledVector(driving,dt*dt)
            .addScaledVector(face,bending*dt*dt);
        }
        // Propagate hinge corrections in both directions, with the tack fixed.
        for(let pass=0;pass<4;pass++)for(let i=1;i<=links;i++){
          const a=points[i-1],b=points[i];
          direction.subVectors(b,a);
          const error=direction.length()-length;
          direction.normalize().multiplyScalar(error*(i===1?1:.5));
          if(i>1)a.add(direction);
          b.sub(direction);
          const penetration=equivalent.subVectors(b,anchor).dot(face);
          if(penetration<0)b.addScaledVector(face,-penetration);
        }
      }
    }
    stamp=time;
    for(let i=0;i<=links;i++){
      const p=points[i];
      direction.subVectors(points[Math.min(links,i+1)],points[Math.max(0,i-1)]).normalize();
      twistAxis.crossVectors(direction,face).normalize();
      twistAxis.applyAxisAngle(direction,.52*Math.sin(11*time-i+phase)*Math.min(1,wind/8));
      const halfWidth=.0055*(i===0?.48:1);
      prior.copy(p).addScaledVector(twistAxis,-halfWidth);
      coords.setXYZ(2*i,prior.x,prior.y,prior.z);
      prior.copy(p).addScaledVector(twistAxis,halfWidth);
      coords.setXYZ(2*i+1,prior.x,prior.y,prior.z);
    }
    coords.needsUpdate=true;
    geometry.computeVertexNormals();
  }
  return {mesh,update};
}
