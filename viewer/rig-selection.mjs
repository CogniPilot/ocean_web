// Screen-space selection shares the orbit viewport without capturing gestures.
export function rigSelection(T,viewport,select,signal){
  const world=new T.Vector3();
  let group,parts=[],pinned=null,hover=null,pointer=null,down=null;
  function choose(part){
    pinned=part??null;hover=null;
    if(select)select.value=pinned?.key??'';
  }
  function reset(){
    choose(null);group=null;parts=[];pointer=null;down=null;
    if(select)select.closest('label').hidden=true;
  }
  function available(x,y,radius){
    return parts.filter(p=>p.visible&&Math.hypot(x-p.x,y-p.y)<=radius)
      .sort((a,b)=>Math.hypot(x-a.x,y-a.y)-Math.hypot(x-b.x,y-b.y)||a.depth-b.depth);
  }
  function local(e){
    const rect=viewport.getBoundingClientRect();
    return [e.clientX-rect.left,e.clientY-rect.top];
  }
  const options={signal};
  viewport?.addEventListener('pointermove',e=>{
    if(e.pointerType==='mouse')pointer=e.buttons?null:local(e);
    if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)down=null;
  },options);
  viewport?.addEventListener('pointerleave',()=>{pointer=null;hover=null;},options);
  viewport?.addEventListener('pointercancel',()=>{down=null;},options);
  viewport?.addEventListener('pointerdown',e=>{
    if(!e.isPrimary||e.button!==0){down=null;return;}
    down={id:e.pointerId,x:e.clientX,y:e.clientY};pointer=null;
  },options);
  viewport?.addEventListener('pointerup',e=>{
    const tap=down?.id===e.pointerId&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<=6;
    down=null;
    if(!tap||!group)return;
    const hits=available(...local(e),e.pointerType==='touch'?22:12);
    // Cycle coincident markers so both axes of a hip can be inspected on touch.
    const activeIndex=hits.indexOf(pinned);
    choose(hits[activeIndex>=0?(activeIndex+1)%hits.length:0]);
  },options);
  select?.addEventListener('change',()=>choose(parts.find(part=>part.key===select.value)),options);

  function update(subject,catalog,camera,width,height){
    if(subject!==group||parts!==catalog){
      const retain=subject===group?pinned?.key:null;
      group=subject;parts=catalog;pointer=null;choose(null);
      if(select){
        select.replaceChildren(new Option('Overview',''));
        for(const [kind,label] of [['body','Rigid bodies'],['joint','Joints']]){
          const entries=parts.filter(part=>part.kind===kind);
          if(!entries.length)continue;
          const section=document.createElement('optgroup');section.label=label;
          for(const part of entries)section.append(new Option(part.label,part.key));
          select.append(section);
        }
        select.closest('label').hidden=parts.length===0;
      }
      if(retain)choose(parts.find(part=>part.key===retain));
    }
    for(const part of parts){
      world.fromArray(part.center).applyMatrix4(part.frame.matrixWorld).project(camera);
      part.x=(world.x+1)*width/2;part.y=(1-world.y)*height/2;part.depth=world.z;
      part.visible=world.z>=-1&&world.z<1&&part.x>=0&&part.y>=0&&part.x<=width&&part.y<=height;
    }
    hover=pointer?available(...pointer,12)[0]:null;
  }
  return {update,reset,get active(){return pinned??hover;},selection:subject=>subject===group?pinned:null};
}
