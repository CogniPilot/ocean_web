// Drag in the image plane. A pixel of pan spans the same visual angle at every zoom.
export function installOrbit(canvas,camera,offset,distance,orbit,zoom,redraw){
  const touches=new Map();
  const right=new window.THREE.Vector3(),up=new window.THREE.Vector3();
  canvas.oncontextmenu=e=>e.preventDefault();
  canvas.onpointerdown=e=>{
    if(e.button!==0&&e.button!==2)return;
    canvas.focus({preventScroll:true});
    canvas.setPointerCapture(e.pointerId);
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY,pan:e.button===2});
  };
  canvas.onlostpointercapture=e=>touches.delete(e.pointerId);
  canvas.onpointermove=e=>{
    const old=touches.get(e.pointerId);if(!old)return;
    const dx=e.clientX-old.x,dy=e.clientY-old.y;
    const other=[...touches].find(([id])=>id!==e.pointerId)?.[1];
    if(other){
      const span=(x,y)=>Math.hypot(x-other.x,y-other.y);
      zoom(span(old.x,old.y)/Math.max(1,span(e.clientX,e.clientY)));
    }else if(old.pan){
      const scale=2*distance()*Math.tan(camera.fov*Math.PI/360)/canvas.clientHeight;
      camera.updateMatrixWorld();
      offset.addScaledVector(right.setFromMatrixColumn(camera.matrixWorld,0),dx*scale);
      offset.addScaledVector(up.setFromMatrixColumn(camera.matrixWorld,1),dy*scale);
    }else orbit(dx,dy);
    old.x=e.clientX;old.y=e.clientY;redraw();
  };
  canvas.onwheel=e=>{e.preventDefault();zoom(Math.exp(.001*e.deltaY));redraw();};
}
