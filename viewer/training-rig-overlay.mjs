// Physics hinges carry their axes in the model's own joint frames. Rendering
// the collars and parent links in two batches also works for fleets of rigs.
export function trainingRigOverlay(T,scene,capacity){
  const tube=new T.CylinderGeometry(1,1,1,6);
  const ring=new T.TorusGeometry(1,.16,5,16);
  function batch(shape,color,name){
    const material=new T.MeshBasicMaterial({color,depthTest:false,depthWrite:false});
    const mesh=new T.InstancedMesh(shape,material,capacity);mesh.frustumCulled=false;
    mesh.name=name;mesh.renderOrder=5;mesh.count=0;scene.add(mesh);return mesh;
  }
  const collars=batch(ring,0xfa98c4,'Joint axes'),rods=batch(tube,0x7aeee2,'Body links');
  const z=new T.Vector3(0,0,1),y=new T.Vector3(0,1,0);
  const a=new T.Vector3(),b=new T.Vector3(),axis=new T.Vector3(),local=new T.Object3D(),world=new T.Matrix4();
  function rod(from,to,radius){
    axis.subVectors(to,from);const length=axis.length();if(length<.0001)return;
    local.position.copy(from).lerp(to,.5);local.quaternion.setFromUnitVectors(y,axis.multiplyScalar(1/length));
    local.scale.set(radius,length,radius);local.updateMatrix();rods.setMatrixAt(rods.count++,local.matrix);
  }
  return {clear(){collars.count=rods.count=0;},
    joint(parent,position,direction,radius){
      rod(parent,position,radius*.18);
      local.position.copy(position);local.quaternion.setFromUnitVectors(z,direction);
      local.scale.setScalar(radius);local.updateMatrix();collars.setMatrixAt(collars.count++,local.matrix);
    },
    rig(root,hinges){
      for(const hinge of hinges){
        let parent=hinge.parent;
        while(parent!==root&&parent.parent&&!parent.userData.physicsJoint)parent=parent.parent;
        a.setFromMatrixPosition(parent.matrixWorld);b.setFromMatrixPosition(hinge.matrixWorld);rod(a,b,.007);
        local.position.set(0,0,0);local.quaternion.setFromUnitVectors(z,axis.fromArray(hinge.userData.physicsJoint.axis).normalize());
        local.scale.setScalar(.039);local.updateMatrix();world.multiplyMatrices(hinge.matrixWorld,local.matrix);
        collars.setMatrixAt(collars.count++,world);
      }
    },flush(){collars.instanceMatrix.needsUpdate=rods.instanceMatrix.needsUpdate=true;},
    dispose(){for(const m of [collars,rods]){m.removeFromParent();m.geometry.dispose();m.material.dispose();m.dispose();}}
  };
}

export function trainingLines(T,scene,parts,batches,segments){
  const lines=segments.flatMap(({part,points,color,name})=>{
    const pose=batches[parts.findIndex(entry=>entry.index===part)]?.instanceMatrix;
    if(!pose||!points.length)return [];
    const geometry=new T.InstancedBufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
    geometry.setAttribute('poseMatrix',pose);geometry.instanceCount=0;
    const material=new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{color:{value:new T.Color(color)}},
      vertexShader:`attribute mat4 poseMatrix;
        void main(){gl_Position=projectionMatrix*modelViewMatrix*poseMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 color;
        void main(){gl_FragColor=vec4(color,1.);
          #include <colorspace_fragment>
        }`
    });
    const line=new T.LineSegments(geometry,material);
    line.name=name;line.frustumCulled=false;line.renderOrder=3;
    scene.add(line);return [line];
  });
  return {flush(count){for(const line of lines)line.geometry.instanceCount=count;},
    dispose(){for(const line of lines){line.removeFromParent();line.geometry.dispose();line.material.dispose();}}};
}
