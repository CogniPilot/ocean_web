import {piccardParts,piccardWireframe,viewport} from './piccard-geometry.mjs';

const sphereColor='#8df2fa';

export function subCollisionShapes(){
  const wires=new WeakMap();
  return {draw(painter,group){
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
