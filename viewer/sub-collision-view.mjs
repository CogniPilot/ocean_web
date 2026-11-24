import {piccardParts,piccardWireframe,viewport} from './piccard-geometry.mjs';

const center=[0,0,0],halfBox=[.5,.5,.5];
const wreckColor='rgba(255,183,91,.65)',bedColor='#a8bdea',sphereColor='#8df2fa';

export function subCollisionShapes(T,wreck){
  // The unbatched makeWreck boxes are the source of WreckSolids.getBox.
  // Keep their complete world transforms, including each plate's rotated
  // local axes and full dimensions, for the unit box drawn by the painter.
  wreck.updateMatrixWorld(true);
  const plates=wreck.children.map(part=>{
    const frame=new T.Object3D();
    frame.matrixAutoUpdate=false;
    frame.matrix.copy(part.matrixWorld);
    frame.matrixWorld.copy(frame.matrix);
    return frame;
  });

  const wires=new WeakMap();
  return {draw(painter,group){
    for(let i=0;i<plates.length;i++)
      painter.box(plates[i],center,halfBox,i===0?bedColor:wreckColor);
    if(!group)return;
    group.updateWorldMatrix(true,false);
    if(!wires.has(group)){
      const carrier=group.getObjectByName('PiccardFrame');
      const {mounts,axes}=JSON.parse(carrier.userData.thrusterLayout);
      wires.set(group,piccardWireframe(piccardParts(mounts,axes)));
    }
    painter.lines(group,wires.get(group),sphereColor);
    painter.sphere(group,viewport.center,viewport.radius,sphereColor);
  }};
}
