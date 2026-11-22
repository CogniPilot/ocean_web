export const sonarRanges=[100,200,350];
export const sonarHalfBearing=Math.PI/4;
export const sonarMount=[1,0,-.81];
const bearings=21,elevations=11;
const tilt=34*Math.PI/180;
const sin=Math.sin(tilt),cos=Math.cos(tilt);
const colours=['','#64b9a6','#edc477','#f7e3a1','#ff9d5d'];

// View from astern and above. Positive bearing is port, to the left on screen.
function project([ahead,port,up],range){
  ahead*=36/range;port*=36/range;
  const depth=46+cos*ahead-sin*up;
  const scale=510/depth;
  return [320-scale*port,173-scale*(sin*ahead+cos*up-7.3),depth];
}

function connected(a,b){
  const r=Math.min(a.r,b.r);
  // The grazing beams can be far apart along the same shallow-sloping bottom.
  if(a.kind===1)return Math.abs(a.xyz[2]-b.xyz[2])<=1.1+
    .26*Math.hypot(a.xyz[0]-b.xyz[0],a.xyz[1]-b.xyz[1]);
  return Math.hypot(a.xyz[0]-b.xyz[0],a.xyz[1]-b.xyz[1],a.xyz[2]-b.xyz[2])<=
    Math.max(.8,r*.23);
}

// Join neighboring returns of the same kind. Missing beams and discontinuities
// leave gaps where the sonar has no continuous surface measurement.
export function sonarFaces(points){
  const beams=new Array(bearings*elevations),faces=[];
  for(const point of points)if(point.kind<=2)beams[point.beam]=point;
  function triangle(a,b,c){
    if(a&&b&&c&&a.kind===b.kind&&a.kind===c.kind&&connected(a,b)&&connected(b,c)&&connected(c,a)){
      faces.push([a,b,c]);
    }
  }
  for(let row=0;row<elevations-1;row++){
    for(let column=0;column<bearings-1;column++){
      const i=row*bearings+column;
      const a=beams[i],b=beams[i+1],c=beams[i+bearings],d=beams[i+bearings+1];
      triangle(a,b,c);triangle(b,d,c);
    }
  }
  return faces;
}

function faceColour([a,b,c]){
  const [ax,ay,az]=a.xyz,[bx,by,bz]=b.xyz,[cx,cy,cz]=c.xyz;
  const x=(by-ay)*(cz-az)-(bz-az)*(cy-ay);
  const y=(bz-az)*(cx-ax)-(bx-ax)*(cz-az);
  const z=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
  const sign=z<0?-1:1;
  const light=.77+.22*sign*(.23*x+.46*y+.86*z)/(Math.hypot(x,y,z)||1);
  const depth=Math.min(1,-(az+bz+cz)/54);
  const rgb=a.kind===1?[90-24*depth,172-29*depth,150-12*depth]:
    [229-42*depth,176-40*depth,105-20*depth];
  return 'rgb('+rgb.map(v=>Math.round(v*light)).join(',')+')';
}

function line(c,points){
  c.beginPath();
  c.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)c.lineTo(points[i][0],points[i][1]);
  c.stroke();
}

function arc(metres,depth,range){
  const radius=Math.sqrt(metres**2-depth**2);
  return Array.from({length:25},(_,i)=>{
    const bearing=sonarHalfBearing*(i/12-1);
    return project([radius*Math.cos(bearing),radius*Math.sin(bearing),-depth],range);
  });
}

const bow=project([0,0,0],100);

function guides(c,grid,depthGrid,ranges){
  c.lineWidth=1.2;c.strokeStyle='#aac7c477';
  for(const ring of grid)line(c,ring);
  const outer=grid.at(-1);
  line(c,[outer[0],bow,outer.at(-1)]);
  line(c,[bow,outer[12]]);
  c.strokeStyle='#b3cfcb4d';
  for(const ring of depthGrid)line(c,ring);
  for(const i of [0,12,24])line(c,[outer[i],...depthGrid.map(ring=>ring[i])]);

  c.font='600 17px system-ui';
  c.lineWidth=3;c.lineJoin='round';c.strokeStyle='#08171b';
  function label(text,x,y,fill){
    c.strokeText(text,x,y);c.fillStyle=fill;c.fillText(text,x,y);
  }
  c.textAlign='left';
  grid.forEach((ring,i)=>label(ranges[i]+' m',ring[0][0]+7,ring[0][1]+2,'#dfeddf'));
  c.textAlign='right';
  depthGrid.forEach((ring,i)=>label(6*(i+1)+' m',ring.at(-1)[0]-7,ring.at(-1)[1]+5,'#a8c4c2'));
  c.textAlign='left';

  const [x,y]=bow;
  c.fillStyle='#132a32';c.strokeStyle='#dae7e1';c.lineWidth=1.5;
  c.beginPath();c.moveTo(x,y-11);c.lineTo(x+6,y-1);c.lineTo(x+5,y+8);
  c.lineTo(x-5,y+8);c.lineTo(x-6,y-1);c.closePath();c.fill();c.stroke();
}

export function sonarView(canvas){
  const c=canvas.getContext('2d');
  let points=[],layers=[],range,grid,depthGrid,ranges;
  function setRange(metres){
    range=metres;
    ranges=metres===350?[100,200,300,350]:[metres*.25,metres*.5,metres*.75,metres];
    grid=ranges.map(r=>arc(r,0,range));
    depthGrid=[6,12,18].map(depth=>arc(range,depth,range));
  }
  setRange(sonarRanges[0]);
  function update(echoes){
    points=echoes;
    const surfaces=sonarFaces(points);
    const covered=new Set(surfaces.flat());
    for(const p of points)p.screen=project(p.xyz,range);
    layers=surfaces.map(face=>({
      face,colour:faceColour(face),depth:face.reduce((sum,p)=>sum+p.screen[2],0)/3
    }));
    for(const p of points)if(!covered.has(p))layers.push({point:p,depth:p.screen[2]});
    layers.sort((a,b)=>b.depth-a.depth);
  }
  function draw(selected){
    c.fillStyle='#08171b';c.fillRect(0,0,canvas.width,canvas.height);
    for(const {face,point,colour} of layers){
      if(face){
        c.fillStyle=c.strokeStyle=colour;c.lineWidth=.8;
        c.beginPath();
        for(const [i,p] of face.entries()){
          const [x,y]=p.screen;
          if(i===0)c.moveTo(x,y);else c.lineTo(x,y);
        }
        c.closePath();c.fill();c.stroke();
      }else{
        const [x,y]=point.screen,kind=point.kind,r=kind===4?5:kind>=2?3.4:1.8;
        c.fillStyle=colours[kind];c.beginPath();
        c.moveTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.lineTo(x-r,y);c.closePath();c.fill();
      }
    }
    guides(c,grid,depthGrid,ranges);
    if(selected){
      const [x,y]=selected.screen;
      c.strokeStyle='#fff5d6';c.lineWidth=1.6;
      c.beginPath();c.arc(x,y,6,0,2*Math.PI);c.stroke();
    }
    c.font='600 17px system-ui';c.fillStyle='#99bdba';
    c.fillText('Depth below transducer',18,330);
    c.textAlign='right';
    c.fillText('Slant range · '+range+' m',622,330);
    c.textAlign='left';
  }
  function pick(event){
    const rect=canvas.getBoundingClientRect();
    let nearest=15**2,chosen;
    for(const p of points){
      const [x,y]=p.screen;
      const d=(event.clientX-rect.left-x*rect.width/canvas.width)**2+
        (event.clientY-rect.top-y*rect.height/canvas.height)**2;
      if(d<nearest){nearest=d;chosen=p;}
    }
    return chosen;
  }
  return {setRange,update,draw,pick};
}
