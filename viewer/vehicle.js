function surveyVehicle(T,housing){
  const sub=new T.Group();
  sub.add(housing);
  const finish=(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const plastic=finish(0x22272b,.12,.4),motor=finish(0x2478b4,.42,.31);
  const windowMaterial=new T.MeshPhysicalMaterial({color:0xcde8f3,roughness:.07,
    transparent:true,opacity:.13,depthWrite:false});
  // Acrylic reflects more light at grazing angles. The camera sits inside the dome.
  windowMaterial.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>', `
      float rim=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),4.);
      outgoingLight+=vec3(.35,.48,.56)*rim;
      diffuseColor.a=mix(diffuseColor.a,.82,rim);
      #include <opaque_fragment>`);
  };
  const dome=new T.Mesh(new T.SphereGeometry(.168,32,16,0,Math.PI*2,0,Math.PI/2),windowMaterial);
  dome.name='Forward acrylic viewport';
  dome.rotation.z=-Math.PI/2;
  dome.position.set(.54,0,.1);
  sub.add(dome);

  function lens(radius,length,x,material){
    const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,length,24),material);
    mesh.rotation.z=Math.PI/2;
    mesh.position.set(x,0,.1);
    sub.add(mesh);
  }
  lens(.044,.04,.558,plastic);
  lens(.031,.009,.582,finish(0x183344,.35,.12));

  // The GLB carries Modelica body-frame coordinates and shaft axes in motor order.
  const carrier=housing.getObjectByProperty('name','PiccardFrame');
  const {mounts,axes}=JSON.parse(carrier.userData.thrusterLayout);
  // Flared, open motor guards. Each profile runs up the outside and back along the bore.
  const profile=[[.092,-.047],[.101,-.040],[.102,.036],[.106,.043],[.106,.048],
    [.095,.048],[.092,.040],[.091,-.039],[.092,-.047]].map(([r,z])=>new T.Vector2(r,z));
  const guardGeometry=new T.LatheGeometry(profile,28);
  guardGeometry.rotateX(Math.PI/2);
  motor.side=T.DoubleSide;
  const linerProfile=[[.092,-.034],[.090,-.032],[.090,-.010],[.092,-.008]]
    .map(([r,z])=>new T.Vector2(r,z));
  const liners=new T.InstancedMesh(new T.LatheGeometry(linerProfile,28).rotateX(Math.PI/2),motor,7);
  const guards=new T.InstancedMesh(guardGeometry,plastic,7);
  const motors=new T.InstancedMesh(new T.CylinderGeometry(.03,.029,.047,16).rotateX(Math.PI/2),motor,7);
  const spokes=new T.InstancedMesh(new T.BoxGeometry(.075,.008,.013),plastic,21);
  const blades=finish(0x202429,.18,.37);
  const up=new T.Vector3(0,0,1),placement=new T.Object3D(),arm=new T.Object3D();
  sub.userData.rotors=mounts.map((center,id)=>{
    placement.position.fromArray(center);
    placement.quaternion.setFromUnitVectors(up,new T.Vector3(...axes[id]));
    placement.updateMatrix();
    liners.setMatrixAt(id,placement.matrix);
    guards.setMatrixAt(id,placement.matrix);
    arm.rotation.z=0;
    arm.position.set(0,0,-.029);
    arm.updateMatrix();
    motors.setMatrixAt(id,new T.Matrix4().multiplyMatrices(placement.matrix,arm.matrix));
    for(let i=0;i<3;i++){
      const angle=2*Math.PI*i/3;
      arm.position.set(.059*Math.cos(angle),.059*Math.sin(angle),-.041);
      arm.rotation.z=angle;
      arm.updateMatrix();
      spokes.setMatrixAt(3*id+i,new T.Matrix4().multiplyMatrices(placement.matrix,arm.matrix));
    }
    return makeRotor(T,sub,id,center,axes[id],blades,plastic);
  });
  sub.add(guards,liners,motors,spokes);
  const light=new T.SpotLight(0xc8f0ff,45,18,.55,.38,1.3);
  light.name='Survey lamp';light.target.name='Survey lamp target';
  light.position.set(.55,.20,.06);light.target.position.set(8,.20,-.52);
  const emitter=new T.Mesh(new T.CircleGeometry(.035,16),new T.MeshBasicMaterial({color:0xe6f9ff,toneMapped:false}));
  emitter.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),light.target.position.clone().sub(light.position).normalize());
  emitter.name="Survey lamp lens";emitter.position.copy(light.position);sub.add(emitter);
  sub.add(light,light.target);
  sub.traverse(mesh=>{
    if(mesh.isMesh){mesh.castShadow=mesh!==dome;mesh.receiveShadow=true;}
  });
  return sub;
}
