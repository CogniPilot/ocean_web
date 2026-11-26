// Local ENU metres. Heights are millimetre-rounded grid samples about the harbor datum.
const harborBed = {
  abyss:{east:-30,north:-30,eastRadius:15,northRadius:12},
  datum:-13.7, min:-72, max:12, step:2,
  node(east,north) {
    const {min,max,datum}=this;
    if(east<=min || east>=max || north<=min || north>=max)return datum;
    const smooth=t=>{t=Math.min(1,Math.max(0,t));return t*t*(3-2*t);};
    const rim=smooth(Math.min(east-min,max-east,north-min,max-north)/8);
    const bench=smooth((Math.hypot(east-10,north)-30)/14);
    const basin=this.abyss;
    const u=((east-basin.east)/basin.eastRadius)**2+((north-basin.north)/basin.northRadius)**2;
    const abyss=34*Math.max(0,1-u)**2;
    const furrows=bench*rim*(.34*(1-Math.cos(.44*north+.065*east+.65*Math.sin(.085*east)))+
      .15*(1-Math.cos(.26*east-.21*north)));
    return Math.round((datum-abyss-furrows)*1000)/1000;
  },
  // Creases follow the southwest to northeast diagonal of each rendered cell.
  height(east,north) {
    const {min,max,step,datum}=this;
    if(east<=min||east>=max||north<=min||north>=max)return datum;
    const x=min+step*Math.floor((east-min)/step),y=min+step*Math.floor((north-min)/step);
    const u=(east-x)/step,v=(north-y)/step;
    const a=this.node(x,y),d=this.node(x+step,y+step);
    if(u>=v)return (1-u)*a+(u-v)*this.node(x+step,y)+v*d;
    return (1-v)*a+(v-u)*this.node(x,y+step)+u*d;
  }
};
// The continuous terrain retains this native island grid. Cache its Float32
// elevations and sample the rendered diagonals for physics and cameras.
harborBed.shelf={
  center:[36,40],width:58,height:46,columns:74,rows:62,
  vertex(x,y){
    const smooth=t=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
    const h=17.3-4.2*((x/17)**2+(y/11)**2)+.34*Math.sin(x*.64)*Math.cos(y*.55)+.37*Math.cos(.34*x-.51*y);
    return -13.7+Math.max(0,h)*smooth(h/.8)*smooth((29-Math.abs(x))/7)*smooth((23-Math.abs(y))/7);
  },
  plane(east,north){
    const {columns,rows,width,height,center}=this,dx=width/columns,dy=height/rows;
    const x=(east-center[0]+width/2)/dx,y=(north-center[1]+height/2)/dy;
    if(x<0||y<0||x>columns||y>rows)return null;
    if(!this.samples){
      this.samples=new Float32Array((columns+1)*(rows+1));
      for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++)
        this.samples[j*(columns+1)+i]=this.vertex(Math.fround(i*dx-width/2),Math.fround(j*dy-height/2));
    }
    const i=Math.min(columns-1,Math.floor(x)),j=Math.min(rows-1,Math.floor(y)),u=x-i,v=y-j;
    const k=j*(columns+1)+i,a=this.samples[k],d=this.samples[k+columns+2];
    const b=this.samples[k+1],c=this.samples[k+columns+1];
    // PlaneGeometry indexes SW to NE along the diagonal (its rows run north to south).
    const gx=u>=v?b-a:d-c,gy=u>=v?d-b:c-a;
    const nx=-gx/dx,ny=-gy/dy,length=Math.hypot(nx,ny,1);
    return {height:a+gx*u+gy*v,normal:[nx/length,ny/length,1/length]};
  }
};
harborBed.surfaceHeight=function(east,north){
  return Math.max(this.height(east,north),this.shelf.plane(east,north)?.height??-Infinity);
};
if(typeof module!=='undefined')module.exports=harborBed;
if(typeof module==="undefined")globalThis.harborBed=harborBed;
