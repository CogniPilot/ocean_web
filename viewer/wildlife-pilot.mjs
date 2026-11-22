// The host evaluates encounter geometry. Animals propel and turn themselves in Modelica.
export function wildlifePilot(){
  const tracked=new Map();
  return function guide(kind,pose,speed,craft,time){
    const whale=kind==='whale',clearance=whale?15:9,notice=whale?85:65;
    const [x,y,z,heading]=pose;
    const range=v=>Math.hypot(v.x-x,v.y-y);
    const episode=Math.floor(time/68),visiting=time%68<51;
    const visible=craft.filter(v=>range(v)<notice && (v.kind!=='drone'||v.z<16));
    const previous=tracked.get(kind);
    let target=visiting && previous?.episode===episode && visible.find(v=>v.id===previous.id);
    if(visiting&&!target){
      const subs=whale?[]:visible.filter(v=>v.kind==='sub');
      const candidates=subs.length?subs:visible.filter(v=>v.player);
      target=candidates.find(v=>v.local)||candidates[episode%Math.max(1,candidates.length)];
    }
    tracked.set(kind,{id:target?.id,episode});
    let bearing=heading,pace=1.7;
    if(target){
      const d=range(target),cruise=Math.hypot(target.ve,target.vn);
      const radius=clearance+(whale?8:5);
      if(cruise>.6 && target.kind==='boat'){
        // Join the nearest side of the moving lane. Latch the side through a pass.
        const ux=target.ve/cruise,uy=target.vn/cruise;
        const side=previous?.id===target.id && previous.side?previous.side:
          (Math.sign(ux*(y-target.y)-uy*(x-target.x))||(whale?1:-1));
        tracked.get(kind).side=side;
        const ex=target.x-side*uy*radius-x,ny=target.y+side*ux*radius-y;
        const along=Math.max(.45,cruise+.12*(ex*ux+ny*uy));
        const across=.18*(-ex*uy+ny*ux);
        bearing=Math.atan2(along*uy+across*ux,along*ux-across*uy);
        pace=Math.min(4.4,Math.max(1.3,cruise+.14*(ex*ux+ny*uy)));
      }else{
        const inward=Math.atan2(target.y-y,target.x-x);
        bearing=inward+Math.PI/2-Math.atan(.14*(d-radius));
      }
    }
    // Predict closest approach against every vessel, including the NPC Hobie.
    // A player can still deliberately intercept an animal.
    let safety=0,awayX=0,awayY=0,breachClear=1;
    for(const v of craft){
      if(v.kind==='drone'&&v.z>2)continue;
      const dx=x-v.x,dy=y-v.y,vx=speed*Math.cos(heading)-v.ve,vy=speed*Math.sin(heading)-v.vn;
      const lead=Math.max(0,Math.min(whale?10:5,-(dx*vx+dy*vy)/(vx*vx+vy*vy+.01)));
      const px=dx+lead*vx,py=dy+lead*vy,d=Math.hypot(px,py);
      if(d<35 && v.z>-5)breachClear=0;
      if(Math.abs(z-v.z)>6 || d>clearance+5)continue;
      const strength=Math.max(0,Math.min(1,(clearance+5-d)/5));
      const side=Math.sign(-dy*vx+dx*vy)||1;
      awayX+=strength*(px-.35*side*vy);awayY+=strength*(py+.35*side*vx);
      safety=Math.max(safety,strength);
    }
    if(safety){
      const escape=Math.atan2(awayY,awayX);
      bearing+=safety*Math.atan2(Math.sin(escape-bearing),Math.cos(escape-bearing));
    }
    return [Number(Boolean(target)||safety>0),bearing,pace,breachClear,
      target?.kind==='sub'?target.z:0,Number(target?.kind==='sub')];
  };
}
