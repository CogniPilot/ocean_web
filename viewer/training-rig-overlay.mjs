// Physics hinges carry their axes in the model's own joint frames. Rendering
// the collars and parent links in two batches also works for fleets of rigs.
export function trainingRigOverlay(T,scene,capacity){
  const tube=new T.CylinderGeometry(1,1,1,6);
  const ring=new T.TorusGeometry(1,.16,5,16);
  function batch(shape,color){
    const material=new T.MeshBasicMaterial({color,depthTest:false,depthWrite:false});
    const mesh=new T.InstancedMesh(shape,material,capacity);mesh.frustumCulled=false;
    mesh.renderOrder=5;mesh.count=0;scene.add(mesh);return mesh;
  }
  const collars=batch(ring,0xfa98c4),rods=batch(tube,0x7aeee2);
  const z=new T.Vector3(0,0,1),y=new T.Vector3(0,1,0);
  const a=new T.Vector3(),b=new T.Vector3(),axis=new T.Vector3(),local=new T.Object3D(),world=new T.Matrix4();
  function rod(from,to){
    axis.subVectors(to,from);const length=axis.length();if(length<.0001)return;
    local.position.copy(from).lerp(to,.5);local.quaternion.setFromUnitVectors(y,axis.multiplyScalar(1/length));
    local.scale.set(.007,length,.007);local.updateMatrix();rods.setMatrixAt(rods.count++,local.matrix);
  }
  return {clear(){collars.count=rods.count=0;},
    rig(root,hinges){
      for(const hinge of hinges){
        let parent=hinge.parent;
        while(parent!==root&&parent.parent&&!parent.userData.physicsJoint)parent=parent.parent;
        a.setFromMatrixPosition(parent.matrixWorld);b.setFromMatrixPosition(hinge.matrixWorld);rod(a,b);
        local.position.set(0,0,0);local.quaternion.setFromUnitVectors(z,axis.fromArray(hinge.userData.physicsJoint.axis).normalize());
        local.scale.setScalar(.039);local.updateMatrix();world.multiplyMatrices(hinge.matrixWorld,local.matrix);
        collars.setMatrixAt(collars.count++,world);
      }
    },flush(){collars.instanceMatrix.needsUpdate=rods.instanceMatrix.needsUpdate=true;},
    dispose(){for(const m of [collars,rods]){m.removeFromParent();m.geometry.dispose();m.material.dispose();m.dispose();}}
  };
}
