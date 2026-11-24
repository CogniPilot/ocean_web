export function cameraCones(T){
  const scene=new T.Scene(),cameraUp=new T.Vector3(0,0,1),look=new T.Vector3();
  const outline=(geometry,color)=>new T.LineSegments(geometry,
    new T.LineBasicMaterial({color,transparent:true,opacity:.78,depthTest:false,depthWrite:false}));
  const points=(vertices,edges)=>new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(
    edges.flatMap(([a,b])=>[...vertices[a],...vertices[b]]),3));
  const rectangle=points([[0,0,0],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[0,0,-1]],
    [[0,1],[0,2],[0,3],[0,4],[1,2],[2,3],[3,4],[4,1],[0,5]]);
  const count=24,polar=100*Math.PI/180;
  const ring=Array.from({length:count},(_,i)=>{
    const azimuth=2*Math.PI*i/count;
    return [Math.sin(polar)*Math.cos(azimuth),Math.sin(polar)*Math.sin(azimuth),-Math.cos(polar)];
  });
  const fisheye=points([[0,0,0],...ring,[0,0,-1]],Array.from({length:count},(_,i)=>[i+1,(i+1)%count+1])
    .concat([[0,1],[0,7],[0,13],[0,19],[0,count+1]]));
  const lenses=new Map();
  function lens(name,geometry,color){
    let line=lenses.get(name);
    if(!line){line=outline(geometry,color);line.name=name;lenses.set(name,line);scene.add(line);}
    line.visible=true;
    return line;
  }
  return {
    clear(){for(const line of lenses.values())line.visible=false;},
    perspective(name,eye,range,color){
      const line=lens(name,rectangle,color),rise=range*Math.tan(eye.getEffectiveFOV()*Math.PI/360);
      line.position.copy(eye.position);line.quaternion.copy(eye.quaternion);
      line.scale.set(rise*eye.aspect,rise,range);
    },
    mast(name,group,port,azimuth,range){
      const line=lens(name,fisheye,0xffcb85);
      line.position.fromArray(port);group.localToWorld(line.position);
      line.up.copy(cameraUp).applyQuaternion(group.quaternion);
      look.set(Math.cos(azimuth),Math.sin(azimuth),0).applyQuaternion(group.quaternion).add(line.position);
      // LineSegments look down local +Z; the camera cone points down -Z.
      line.lookAt(look);line.rotateY(Math.PI);line.scale.setScalar(range);
    },
    draw(renderer,eye){
      const autoClear=renderer.autoClear;renderer.autoClear=false;
      try{renderer.render(scene,eye);}finally{renderer.autoClear=autoClear;}
    },
    dispose(){
      rectangle.dispose();fisheye.dispose();
      for(const line of lenses.values())line.material.dispose();
    }
  };
}
