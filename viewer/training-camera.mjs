// Capture one pointer so orbit and pan continue when the drag leaves the view.
export function trainingCameraDrag(canvas,signal,{orbit,pan}){
  let pointer;
  const on=(name,handler)=>canvas.addEventListener(name,handler,{signal});
  on('pointerdown',event=>{
    if(pointer||(event.button!==0&&event.button!==2))return;
    canvas.setPointerCapture(event.pointerId);
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,pan:event.button===2};
  });
  on('pointermove',event=>{
    if(pointer?.id!==event.pointerId)return;
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    pointer.x=event.clientX;pointer.y=event.clientY;
    if(pointer.pan)pan(dx,dy);else orbit(dx,dy);
  });
  function release(event){if(pointer?.id===event.pointerId)pointer=null;}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])on(name,release);
  on('contextmenu',event=>event.preventDefault());
}
