function surveyVehicle(T,housing){
  const sub=new T.Group();
  sub.add(housing);
  const finish=(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness});
  // The GLB shares its materials across Piccard instances. Its housing already carries UVs.
  housing.traverse(part=>{
    const mat=part.material;
    if(part.isMesh&&part.geometry.hasAttribute('uv')&&mat?.isMeshStandardMaterial&&!mat.map&&!['Machined hardware','Piccard magnetic pickup steel'].includes(mat.name)){
      subseaFinish(T,mat,'piccard',.00012);
    }
  });
  const plastic=finish(0x22272b,.12,.4),motor=finish(0x2478b4,.42,.31);
  for(const mat of [plastic,motor])subseaFinish(T,mat,'piccard',.00009);
  const windowMaterial=new T.MeshPhysicalMaterial({color:0xcde8f3,roughness:.07,
    transparent:true,opacity:.13,depthWrite:false});
  // Acrylic reflects more light at grazing angles. The camera sits inside the dome.
  windowMaterial.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>', `
      float rim=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),4.);
      diffuseColor.a=mix(diffuseColor.a,.55,rim);
      #include <opaque_fragment>`);
  };
  const dome=new T.Mesh(new T.SphereGeometry(.084,32,16,0,Math.PI*2,0,Math.PI/2),windowMaterial);
  dome.name='Forward acrylic viewport';
  dome.rotation.z=-Math.PI/2;
  dome.position.set(.27,0,.05);
  sub.add(dome);

  function lens(radius,length,x,material){
    const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,length,24),material);
    mesh.rotation.z=Math.PI/2;
    mesh.position.set(x,0,.05);
    sub.add(mesh);
  }
  lens(.022,.02,.279,plastic);
  lens(.0155,.0045,.291,finish(0x183344,.35,.12));

  // The GLB carries Modelica body-frame coordinates and shaft axes in motor order.
  const carrier=housing.getObjectByProperty('name','PiccardFrame');
  const {mounts,axes}=JSON.parse(carrier.userData.thrusterLayout);
  // Flared, open motor guards. Each profile runs up the outside and back along the bore.
  const profile=[[.046,-.0235],[.0505,-.020],[.051,.018],[.053,.0215],[.053,.024],
    [.0475,.024],[.046,.020],[.0455,-.0195],[.046,-.0235]].map(([r,z])=>new T.Vector2(r,z));
  const guardGeometry=new T.LatheGeometry(profile,28);
  guardGeometry.rotateX(Math.PI/2);
  motor.side=T.DoubleSide;
  const linerProfile=[[.046,-.017],[.045,-.016],[.045,-.005],[.046,-.004]]
    .map(([r,z])=>new T.Vector2(r,z));
  const liners=new T.InstancedMesh(new T.LatheGeometry(linerProfile,28).rotateX(Math.PI/2),motor,mounts.length);
  const guards=new T.InstancedMesh(guardGeometry,plastic,mounts.length);
  const motors=new T.InstancedMesh(new T.CylinderGeometry(.015,.0145,.0235,16).rotateX(Math.PI/2),motor,mounts.length);
  const spokes=new T.InstancedMesh(new T.BoxGeometry(.0375,.004,.0065),plastic,3*mounts.length);
  const blades=finish(0x2767ab,.18,.37);
  const up=new T.Vector3(0,0,1),placement=new T.Object3D(),arm=new T.Object3D();
  sub.userData.rotors=mounts.map((center,id)=>{
    placement.position.fromArray(center);
    placement.quaternion.setFromUnitVectors(up,new T.Vector3(...axes[id]));
    placement.updateMatrix();
    liners.setMatrixAt(id,placement.matrix);
    guards.setMatrixAt(id,placement.matrix);
    arm.rotation.z=0;
    arm.position.set(0,0,-.0145);
    arm.updateMatrix();
    motors.setMatrixAt(id,new T.Matrix4().multiplyMatrices(placement.matrix,arm.matrix));
    for(let i=0;i<3;i++){
      const angle=2*Math.PI*i/3;
      arm.position.set(.0295*Math.cos(angle),.0295*Math.sin(angle),-.0205);
      arm.rotation.z=angle;
      arm.updateMatrix();
      spokes.setMatrixAt(3*id+i,new T.Matrix4().multiplyMatrices(placement.matrix,arm.matrix));
    }
    return makeRotor(T,sub,id,center,axes[id],blades,plastic);
  });
  sub.add(guards,liners,motors,spokes);
  // The side plates end at x=.3005 m. Each lens clears the leading edge
  // while the bracket still sits over the plate.
  const housingGeometry=new T.CylinderGeometry(.015,.015,.048,20);
  const bracketGeometry=new T.BoxGeometry(.023,.019,.012);
  const lensGeometry=new T.CircleGeometry(.012,20);
  const lensMaterial=new T.MeshBasicMaterial({color:0xe6f9ff,toneMapped:false});
  for(const side of [1,-1]){
    const name=side===1?'Survey lamp':'Starboard survey lamp';
    const beam=new T.Vector3(1,side*.025,-.015).normalize();
    const light=new T.SpotLight(0xc8f0ff,22.5,18,.55,.38,1.3);
    const barrel=new T.Mesh(housingGeometry,plastic);
    barrel.position.set(.301,side*.109,.071);
    barrel.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),beam);
    const bracket=new T.Mesh(bracketGeometry,plastic);
    bracket.position.set(.289,side*.109,.058);
    light.name=name;light.target.name=name+' target';
    light.position.copy(barrel.position).addScaledVector(beam,.0245);
    light.target.position.copy(light.position).addScaledVector(beam,7.5);
    const emitter=new T.Mesh(lensGeometry,lensMaterial);
    emitter.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),beam);
    emitter.name=name+' lens';emitter.position.copy(light.position);
    sub.add(bracket,barrel,emitter,light,light.target);
  }
  sub.traverse(mesh=>{
    if(mesh.isMesh){mesh.castShadow=mesh!==dome;mesh.receiveShadow=true;}
  });
  return sub;
}
