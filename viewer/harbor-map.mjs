import {contour} from './cruiser-chart.mjs';

const palette={you:'#e97618',player:'#005997',npc:'#644495',course:'#a03731'};

export function harborMap(canvas,terrain,race,summary){
  const ctx=canvas.getContext('2d');
  const coast=contour(terrain,0);
  const shoal=contour(terrain,-3);
  const {width,height}=canvas;
  let previousRows='';

  function draw(entities){
    const pin=[race.get('pinEast'),race.get('pinNorth')];
    const committee=[race.get('committeeEast'),race.get('committeeNorth')];
    const start=pin.map((x,i)=>(x+committee[i])/2);
    const northings=race.get('markNorth');
    const marks=Array.from(race.get('markEast'),(x,i)=>[x,northings[i]]);
    const positions=[...coast,pin,committee,...marks,...entities.map(({x,y})=>[x,y])];
    const east=positions.map(p=>p[0]),north=positions.map(p=>p[1]);
    const left=Math.min(...east),right=Math.max(...east),bottom=Math.min(...north),top=Math.max(...north);
    const scale=Math.min((width-110)/Math.max(160,right-left),(height-114)/Math.max(140,top-bottom));
    const px=x=>width*.5+(x-.5*(left+right))*scale;
    const py=y=>height*.5-(y-.5*(bottom+top))*scale;
    let grid=20;
    while(grid*scale<52)grid*=2;
    ctx.fillStyle='#aed5dc';ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#51798145';ctx.lineWidth=1;ctx.beginPath();
    for(let x=Math.floor(left/grid)*grid;px(x)<width;x+=grid){
      ctx.moveTo(px(x),0);ctx.lineTo(px(x),height);
    }
    for(let y=Math.floor(bottom/grid)*grid;py(y)>0;y+=grid){
      ctx.moveTo(0,py(y));ctx.lineTo(width,py(y));
    }
    ctx.stroke();

    function path(points){
      ctx.beginPath();
      points.forEach(([x,y],i)=>i===0?ctx.moveTo(px(x),py(y)):ctx.lineTo(px(x),py(y)));
    }
    function text(label,x,y,color='#183942'){
      ctx.font='600 15px system-ui';ctx.fillStyle=color;ctx.fillText(label,x,y);
    }
    for(const [outline,fill,line] of [[shoal,'#c8e7e5','#6e9d9e'],[coast,'#e8dfb3','#877853']]){
      path(outline);ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=line;ctx.stroke();
    }
    text('Island',px(terrain.center[0])-18,py(terrain.center[1])+5);
    ctx.strokeStyle=palette.course;ctx.lineWidth=2;ctx.setLineDash([6,5]);
    path([start,...marks,start]);ctx.stroke();ctx.setLineDash([]);
    path([pin,committee]);ctx.lineWidth=4;ctx.stroke();
    function marker(x,y,color,radius){
      ctx.beginPath();ctx.arc(x,y,radius,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();
      ctx.strokeStyle='#f2f9ea';ctx.lineWidth=1.5;ctx.stroke();
    }
    for(const [i,[x,y]] of marks.entries()){
      marker(px(x),py(y),palette.course,6);
      text('Mark '+(i+1),px(x)+10,py(y)-7,palette.course);
    }
    text('Start / finish',px(start[0])+10,py(start[1])-9,palette.course);
    for(const type of ['npc','player','you'])for(const point of entities){
      if(point.type!==type)continue;
      const x=px(point.x),y=py(point.y);
      marker(x,y,palette[type],type==='you'?7:5);
      if(type==='you')text('You',x+10,y+15,palette.you);
    }
    ctx.fillStyle='#284c56';ctx.fillRect(17,40,grid*scale,2);
    ctx.fillRect(17,36,2,9);ctx.fillRect(17+grid*scale,36,2,9);text(grid+' m',17,31);
    text('N',width-29,29);
    ctx.beginPath();ctx.moveTo(width-23,35);ctx.lineTo(width-30,53);ctx.lineTo(width-16,53);ctx.closePath();ctx.fill();

    const rows=entities.map(p=>({type:p.type,name:p.name,x:Math.round(p.x),y:Math.round(p.y)}));
    const key=JSON.stringify(rows);
    if(key===previousRows)return;
    previousRows=key;
    summary.replaceChildren(...rows.map(p=>{
      const item=document.createElement('li');
      item.dataset.mapType=p.type;
      item.textContent=p.name+' · '+p.x+' E, '+p.y+' N';
      return item;
    }));
  }
  return {draw};
}
