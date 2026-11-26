import {abyssSite} from './harbor-sites.mjs';
import {wreckSites} from './red-sea-sites.mjs';
import {contour} from './cruiser-chart.mjs';

export function harborMap(canvas,terrain,race,summary,abyss=abyssSite,signal){
  const ctx=canvas.getContext('2d');
  const shores=terrain?[-10,-6,-3,-1,0,1,2].map(level=>contour(terrain,level)):[];
  let width,height,scale,fitScale,east,north,manual=false,lastFrame,pins=[];
  const tiles=[];
  async function loadScenery(){
    const manifest=new URL('./assets/chart/harbor.json',import.meta.url);
    manifest.search=new URL(import.meta.url).search;
    const response=await fetch(manifest,{signal});
    if(!response.ok)throw Error('Chart scenery '+response.status);
    const layers=await response.json();
    await Promise.all(layers.map(async (tile,layer)=>{
      const url=new URL(tile.file,manifest);url.search=manifest.search;
      const image=new Image();image.src=url.href;
      await image.decode();
      if(!signal?.aborted){
        tiles.push({...tile,image,layer});tiles.sort((a,b)=>a.layer-b.layer);redraw();
      }
    }));
  }
  if(canvas.ownerDocument)loadScenery().catch(error=>{
    if(!signal?.aborted)console.warn('Harbor chart scenery unavailable',error);
  });

  function draw(ownEast,ownNorth,spawns=[],selected=null){
    lastFrame=[ownEast,ownNorth,spawns,selected];
    width=canvas.clientWidth??canvas.width;height=canvas.clientHeight??canvas.height;
    if(!width||!height)return;
    const dpr=Math.min(globalThis.devicePixelRatio||1,2);
    if(canvas.width!==Math.round(width*dpr))canvas.width=Math.round(width*dpr);
    if(canvas.height!==Math.round(height*dpr))canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const pin=race&&[race.get('pinEast'),race.get('pinNorth')];
    const committee=race&&[race.get('committeeEast'),race.get('committeeNorth')];
    const start=race&&pin.map((x,i)=>(x+committee[i])/2);
    const northings=race?.get('markNorth');
    const marks=race?Array.from(race.get('markEast'),(x,i)=>[x,northings[i]]):[];
    const dive=spawns.some(p=>p.sub);
    const positions=[...(shores[0]??[]),...wreckSites.flatMap(s=>[[s.east-s.halfLength,s.north],[s.east+s.halfLength,s.north]]),
      [abyss.east-abyss.eastRadius,abyss.north-abyss.northRadius],...spawns.map(s=>[s.x,s.y])];
    for(const tile of tiles){
      positions.push([tile.west,tile.south],[tile.east,tile.north]);
    }
    const located=Number.isFinite(ownEast)&&Number.isFinite(ownNorth);
    if(located)positions.push([ownEast,ownNorth]);
    if(race&&!dive)positions.push(pin,committee,...marks);
    const xs=positions.map(p=>p[0]),ys=positions.map(p=>p[1]);
    const left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);
    fitScale=Math.min(Math.max(60,width-108)/Math.max(55,right-left),Math.max(50,height-72)/Math.max(50,top-bottom));
    if(!manual){east=(left+right)/2;north=(bottom+top)/2;scale=fitScale;}
    else{
      east=Math.max(left-width/(2*scale),Math.min(right+width/(2*scale),east));
      north=Math.max(bottom-height/(2*scale),Math.min(top+height/(2*scale),north));
    }
    const px=x=>width/2+(x-east)*scale,py=y=>height/2-(y-north)*scale;
    function path(points){
      ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(px(x),py(y)):ctx.moveTo(px(x),py(y)));
    }
    function dot(x,y,r,fill,stroke){
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
      if(stroke){ctx.lineWidth=1.5;ctx.strokeStyle=stroke;ctx.stroke();}
    }
    ctx.fillStyle='#234957';ctx.fillRect(0,0,width,height);
    const colors=['#335c63','#426f71','#648d86','#90a99a','#b5b197','#929c73','#667d5c'];
    for(const [i,outline] of shores.entries()){
      path(outline);ctx.closePath();ctx.fillStyle=colors[i];ctx.fill();ctx.lineWidth=.8;ctx.strokeStyle='#c5d3bc55';ctx.stroke();
    }
    for(const tile of tiles){
      ctx.drawImage(tile.image,px(tile.west),py(tile.north),(tile.east-tile.west)*scale,(tile.north-tile.south)*scale);
    }
    let grid=5;while(grid*scale<50)grid*=2;
    ctx.strokeStyle='#ccf0ec24';ctx.lineWidth=1;ctx.beginPath();
    for(let x=Math.floor((east-width/(2*scale))/grid)*grid;px(x)<=width;x+=grid){
      ctx.moveTo(px(x),0);ctx.lineTo(px(x),height);
    }
    for(let y=Math.floor((north-height/(2*scale))/grid)*grid;py(y)>=0;y+=grid){
      ctx.moveTo(0,py(y));ctx.lineTo(width,py(y));
    }
    ctx.stroke();
    if(race){
      ctx.strokeStyle=dive?'#d9a38960':'#e2a38c';ctx.lineWidth=1.25;ctx.setLineDash([5,5]);
      path([start,...marks,start]);ctx.stroke();ctx.setLineDash([]);path([pin,committee]);ctx.stroke();
    }
    const occupied=[],places=[];
    const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
    function label(text,x,y,primary=false,active=false){
      ctx.font=primary?'600 12px system-ui':'11px system-ui';
      const w=Math.ceil(ctx.measureText(text).width)+10,h=19;
      for(const [dx,dy] of [[12,-h/2],[-12-w,-h/2],[12,-h-10],[-12-w,-h-10],[12,10],[-12-w,10]]){
        const box={x:x+dx,y:y+dy,w,h};
        if(box.x<2||box.y<2||box.x+w>width-2||box.y+h>height-2||occupied.some(b=>overlaps(b,box)))continue;
        occupied.push(box);
        if(primary){
          ctx.fillStyle=active?'#eebc64':'#0c2834ea';ctx.beginPath();ctx.roundRect(box.x,box.y,w,h,4);ctx.fill();
        }
        ctx.fillStyle=active?'#202c2e':primary?'#f2f7f4':'#d0dbda';
        ctx.textBaseline='middle';ctx.fillText(text,box.x+5,box.y+h/2);return box;
      }
    }
    // Spread close pins in screen space and retain a leader to the real site.
    pins=[];
    for(const s of spawns){
      const x=px(s.x),y=py(s.y);
      if(x<0||y<0||x>width||y>height)continue;
      let cx=Math.max(14,Math.min(width-14,x)),cy=Math.max(14,y-15);
      for(const [dx,dy] of [[0,-15],[0,17],[-23,-17],[23,-17],[-28,10],[28,10],[-45,-10],[45,-10]]){
        const a=Math.max(14,Math.min(width-14,x+dx)),b=Math.max(14,Math.min(height-14,y+dy));
        if(pins.every(p=>Math.hypot(a-p.cx,b-p.cy)>=28)){cx=a;cy=b;break;}
      }
      pins.push({id:s.id,text:s.label,x,y,cx,cy,active:s.id===selected});
      occupied.push({x:cx-12,y:cy-12,w:24,h:24});
    }
    for(const p of pins){
      const color=p.active?'#ffc770':'#6dd3bc';
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.cx,p.cy);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
      const dx=p.x-p.cx,dy=p.y-p.cy,length=Math.hypot(dx,dy)||1;
      const r=p.active?12:10;
      ctx.beginPath();ctx.moveTo(p.cx-r*dy/length,p.cy+r*dx/length);
      ctx.lineTo(p.x,p.y);ctx.lineTo(p.cx+r*dy/length,p.cy-r*dx/length);
      ctx.fillStyle=color;ctx.fill();
      dot(p.cx,p.cy,r,color,'#102c39');
      dot(p.cx,p.cy,4.5,'#173440');
      dot(p.cx,p.cy,1.8,color);
      p.box=label(p.text,p.cx,p.cy,true,p.active);
    }
    for(const [i,[x,y]] of marks.entries()){
      dot(px(x),py(y),3,'#ecab8a');places.push(['Mark '+(i+1),px(x),py(y)]);
    }
    if(start)places.push(['Start / finish',px(start[0]),py(start[1])]);
    if(!pins.some(pin=>pin.id==='abyss'&&pin.box))places.push(['Abyss',px(abyss.east),py(abyss.north)]);
    if(terrain)places.push(['Island',px(terrain.center[0]),py(terrain.center[1])]);
    for(const site of wreckSites){
      places.push([site.name,px(site.east),py(site.north)]);
    }
    if(located)dot(px(ownEast),py(ownNorth),4.5,'#ffe7a1','#172c37');
    for(const [name,x,y] of places)label(name,x,y);
    ctx.textBaseline='alphabetic';ctx.font='600 11px system-ui';ctx.fillStyle='#e9f3eb';
    ctx.fillText('N',width-22,18);
    ctx.beginPath();ctx.moveTo(width-18,22);ctx.lineTo(width-22,32);ctx.lineTo(width-14,32);ctx.closePath();ctx.fill();
    ctx.fillRect(10,height-9,grid*scale,2);ctx.fillText(grid+' m',10,height-15);
    if(!summary||!located)return;
    const coordinates=Math.round(ownEast)+' E  ·  '+Math.round(ownNorth)+' N';
    if(summary.textContent!==coordinates)summary.textContent=coordinates;
  }
  function redraw(){if(lastFrame)draw(...lastFrame);}
  return {draw,fit(){manual=false;redraw();},
    pan(dx,dy){if(!scale)return;manual=true;east-=dx/scale;north+=dy/scale;redraw();},
    zoom(factor,x=width/2,y=height/2){
      if(!scale)return;
      const next=Math.min(fitScale*32,Math.max(fitScale*.5,scale*factor));
      east+=(x-width/2)*(1/scale-1/next);north-=(y-height/2)*(1/scale-1/next);
      manual=true;scale=next;redraw();
    },
    pick(x,y){
      const nearest=pins.reduce((best,p)=>Math.hypot(x-p.cx,y-p.cy)<Math.hypot(x-best.cx,y-best.cy)?p:best,{cx:Infinity,cy:Infinity});
      if(Math.hypot(x-nearest.cx,y-nearest.cy)<=15)return nearest.id;
      const label=pins.find(({box:b})=>b&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
      return label?.id??pins.find(p=>Math.hypot(x-p.x,y-p.y)<=8)?.id;
    }
  };
}
