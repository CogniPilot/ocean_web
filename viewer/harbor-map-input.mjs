// Chart navigation uses CSS pixels. Keep the world point under the cursor or
// the two-finger midpoint fixed while zooming, including during a moving pinch.
export function chartNavigation(canvas,chart,select,signal){
  const pointers=new Map();
  let origin,dragged=false;
  const local=event=>{
    const rect=canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  };
  const listen=(type,fn,options)=>canvas.addEventListener(type,fn,{signal,...options});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  listen('pointerdown',event=>{
    if(event.button!==0||pointers.size>=2)return;
    const p=local(event);
    if(!pointers.size){origin=p;dragged=false;}
    else dragged=true;
    pointers.set(event.pointerId,p);
    canvas.focus({preventScroll:true});
    canvas.setPointerCapture(event.pointerId);
  });
  listen('pointermove',event=>{
    const p=local(event),previous=pointers.get(event.pointerId);
    if(!previous){
      if(event.pointerType==='mouse')canvas.style.cursor=chart.pick(p.x,p.y)?'pointer':'grab';
      return;
    }
    if(!dragged&&distance(origin,p)<5)return;
    dragged=true;canvas.style.cursor='grabbing';
    pointers.set(event.pointerId,p);
    const other=[...pointers].find(([id])=>id!==event.pointerId)?.[1];
    if(other){
      const x=(other.x+previous.x)/2,y=(other.y+previous.y)/2;
      chart.zoom(distance(other,p)/Math.max(1,distance(other,previous)),x,y);
      chart.pan((p.x-previous.x)/2,(p.y-previous.y)/2);
    }else chart.pan(p.x-previous.x,p.y-previous.y);
  });
  function finish(event){
    if(!pointers.has(event.pointerId))return;
    const p=local(event);
    if(event.type==='pointerup'&&!dragged&&distance(p,origin)<5){
      const id=chart.pick(p.x,p.y);
      if(id)select(id);
    }
    pointers.delete(event.pointerId);
    if(!pointers.size)canvas.style.cursor='grab';
  }
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(type,finish);
  listen('wheel',event=>{
    event.preventDefault();
    const {x,y}=local(event),unit=event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1;
    chart.zoom(Math.exp(-Math.max(-300,Math.min(300,event.deltaY*unit))*.0035),x,y);
  },{passive:false});
  listen('keydown',event=>{
    const step=event.shiftKey?100:36;
    switch(event.key){
      case 'ArrowLeft':chart.pan(step,0);break;
      case 'ArrowRight':chart.pan(-step,0);break;
      case 'ArrowUp':chart.pan(0,step);break;
      case 'ArrowDown':chart.pan(0,-step);break;
      case '+': case '=':chart.zoom(1.5);break;
      case '-':chart.zoom(1/1.5);break;
      case 'Home':chart.fit();break;
      default:return;
    }
    event.preventDefault();
  });
}
