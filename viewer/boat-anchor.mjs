export function boatAnchorView(T,group){
  const anchorMesh=new T.Group();anchorMesh.name='Bow anchor';anchorMesh.visible=false;group.add(anchorMesh);
  const anchorMetal=new T.MeshStandardMaterial({color:0x8f9a9a,roughness:.43,metalness:.53});
  function part(geometry,position){
    const object=new T.Mesh(geometry,anchorMetal);
    object.position.fromArray(position);anchorMesh.add(object);
    return object;
  }
  const v3=()=>new T.Vector3();
  part(new T.BoxGeometry(.028,.032,.29),[0,0,-.12]);
  part(new T.CylinderGeometry(.014,.014,.29,10),[0,0,-.23]);
  for(const sign of [-1,1]){
    const fluke=part(new T.BoxGeometry(.16,.12,.016),[.045,sign*.102,-.24]);
    fluke.rotation.y=-.44;
  }
  // Nominal 12 mm braid. A WebGL line occupies a full render pixel even
  // when its projected diameter is much smaller than a pixel.
  const rodeSegments=16,rodeRadius=.006;
  const rode=new T.InstancedMesh(new T.CylinderGeometry(rodeRadius,rodeRadius,1,8,1,true),
    new T.MeshStandardMaterial({color:0x928775,roughness:.94}),rodeSegments);
  rode.name='Anchor rode';rode.instanceMatrix.setUsage(T.DynamicDrawUsage);
  rode.frustumCulled=false;rode.visible=false;group.add(rode);
  const link=new T.Object3D(),from=v3(),to=v3(),along=v3(),localY=new T.Vector3(0,1,0);
  const anchorPoint=v3(),rollerPoint=v3(),anchorRotation=new T.Quaternion();
  const firstGuide=v3(),secondGuide=v3();
  function setAnchor(row,guides){
    if(!row){anchorMesh.visible=false;rode.visible=false;return;}
    anchorMesh.visible=true;
    group.updateWorldMatrix(true,false);
    const paid=row[10];
    anchorPoint.fromArray(row);rollerPoint.fromArray(row,7);
    group.worldToLocal(anchorPoint);group.worldToLocal(rollerPoint);
    anchorMesh.position.copy(anchorPoint);
    anchorMesh.quaternion.copy(group.quaternion).invert().multiply(anchorRotation.fromArray([row[4],row[5],row[6],row[3]]));
    rode.visible=paid>.22;
    if(!rode.visible)return;
    if(guides){
      group.worldToLocal(firstGuide.fromArray(guides));
      group.worldToLocal(secondGuide.fromArray(guides,3));
    }else{
      firstGuide.copy(rollerPoint);
      secondGuide.copy(rollerPoint);
    }
    const lead=rollerPoint.distanceTo(firstGuide)+firstGuide.distanceTo(secondGuide);
    const slack=Math.min(1.4,.22*Math.max(0,paid-lead-anchorPoint.distanceTo(secondGuide)));
    from.copy(rollerPoint);
    let index=0;
    function segment(endpoint){
      along.subVectors(endpoint,from);
      const length=along.length();
      if(length<.001)return;
      link.scale.y=length;
      link.quaternion.setFromUnitVectors(localY,along.divideScalar(length));
      link.position.lerpVectors(from,endpoint,.5);
      link.updateMatrix();
      rode.setMatrixAt(index++,link.matrix);
      from.copy(endpoint);
    }
    segment(firstGuide);
    segment(secondGuide);
    const freeSegments=rodeSegments-index;
    for(let i=1;i<=freeSegments;i++){
      const u=i/freeSegments;
      to.lerpVectors(secondGuide,anchorPoint,u);
      to.z-=4*u*(1-u)*(1-u)*slack;
      segment(to);
    }
    rode.count=index;
    rode.instanceMatrix.needsUpdate=true;
  }
  setAnchor.dispose=()=>{
    anchorMesh.removeFromParent();
    rode.removeFromParent();
    for(const item of anchorMesh.children)item.geometry.dispose();
    anchorMetal.dispose();
    rode.geometry.dispose();
    rode.material.dispose();
    rode.dispose();
  };
  return setAnchor;
}
