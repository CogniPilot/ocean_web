// Metres, +X bill-forward, +Y port. The closed wing sections are lofted through
// the same shoulder and wrist pivots driven by the Modelica strip model.
export function birdMesh(T){
  const group=new T.Group(),wings=[],legs=[],folded=new T.Group();
  group.add(folded);
  const plumage=new T.MeshStandardMaterial({vertexColors:true,roughness:.88,side:T.DoubleSide});
  const white=0xeaece6,pearl=0xbec6c6,grey=0x929fa9,dark=0x272d32;
  function batch(parent){
    const p=[],c=[],indices=[],color=new T.Color();
    return {
      vertex(x,y,z,tint){p.push(x,y,z);color.setHex(tint);c.push(color.r,color.g,color.b);return p.length/3-1;},
      quad(a,b,d,e){indices.push(a,b,d,a,d,e);},
      finish(){
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));
        g.setIndex(indices);g.computeVertexNormals();parent.add(new T.Mesh(g,plumage));
      }
    };
  }
  // Elliptical sections along the backbone join breast, nape and forehead
  // continuously. The bill has a flattened base and a hooked distal tip.
  function loft(b,stations,tint,offset=0){
    const n=20;
    let old;
    for(const [x,z,width,height] of stations){
      const row=[];
      for(let j=0;j<n;j++){
        const a=2*Math.PI*j/n;
        row.push(b.vertex(x,offset+width*Math.cos(a),z+height*Math.sin(a),tint(x,a)));
      }
      if(old)for(let j=0;j<n;j++){const k=(j+1)%n;b.quad(old[j],old[k],row[k],row[j]);}
      old=row;
    }
  }
  const torso=batch(group);
  loft(torso,[[-.233,.012,.001,.002],[-.190,.010,.034,.029],[-.129,.002,.066,.058],[-.05,-.005,.081,.081],
    [.033,-.007,.083,.085],[.098,-.004,.071,.073],[.146,.016,.049,.056],[.169,.045,.043,.046],
    [.193,.056,.048,.051],[.221,.054,.045,.048],[.242,.047,.037,.040],[.256,.039,.026,.028],[.265,.035,.012,.015]],
    (x,a)=>x<.10&&Math.sin(a)>.43?grey:white);
  // Two tapered mandibles meet along the gape. The culmen narrows into a
  // small overhanging hook, with the red gonys on the shorter lower bill.
  const billSections=[
    // x, half width, gape height, upper height, lower depth
    [.245,.022,.030,.019,.012],[.257,.020,.030,.017,.012],
    [.277,.015,.030,.014,.009],[.295,.011,.030,.011,.008],
    [.308,.008,.029,.009,.009],[.318,.005,.028,.006,.005],
    [.325,.0024,.026,.003,.0012],[.330,.0002,.023,.0004,.0002]
  ];
  for(const upper of [true,false]){
    let previous;
    const sections=upper?billSections:billSections.slice(0,-1);
    for(const [x,width,seam,top,bottom] of sections){
      const row=[];
      for(let j=0;j<=12;j++){
        const a=Math.PI*j/12,height=upper?top:-bottom;
        const edge=j===0||j===12;
        const color=edge?0x977039:upper?0xe2b64e:x>=.304&&x<=.318?0xc15c36:0xd3a24b;
        row.push(torso.vertex(x,width*Math.cos(a),seam+height*Math.sin(a),color));
      }
      if(previous)for(let j=0;j<12;j++){
        if(upper)torso.quad(previous[j],previous[j+1],row[j+1],row[j]);
        else torso.quad(previous[j+1],previous[j],row[j],row[j+1]);
      }
      previous=row;
    }
  }
  for(const side of [-1,1]){
    loft(torso,[[.216,.061,.001,.002],[.223,.061,.006,.007],[.229,.061,.007,.007],[.235,.061,.001,.001]],
      ()=>0xbd9852,side*.043);
    loft(torso,[[.222,.062,.001,.002],[.227,.062,.004,.004],[.231,.062,.001,.001]],()=>0x17171a,side*.049);
  }
  // A narrow rachis and overlapping rounded vanes give the tail and dark
  // outer primaries a feathered outline on both faces of the bird.
  function feather(b,root,tip,width,tint,mirror=false){
    const dx=tip[0]-root[0],dy=tip[1]-root[1],len=Math.hypot(dx,dy);
    let prev;
    for(let j=0;j<=6;j++){
      const u=j/6,w=width*(.035+.965*Math.sin(Math.PI*u)**.61);
      const x=root[0]+dx*u,y=root[1]+dy*u,z=root[2]+(tip[2]-root[2])*u+.008*Math.sin(Math.PI*u);
      const col=mirror&&j>=5?white:tint;
      const row=[b.vertex(x+dy/len*w,y-dx/len*w,z,col),b.vertex(x,y,z+.002,col),b.vertex(x-dy/len*w,y+dx/len*w,z,col)];
      if(prev){b.quad(prev[0],prev[1],row[1],row[0]);b.quad(prev[1],prev[2],row[2],row[1]);}
      prev=row;
    }
  }
  for(let j=-5;j<=5;j++){
    const t=j/5;feather(torso,[-.16,t*.030,.028],[-.324+.036*t*t,.079*t,.011-.012*t*t],.014,j%2?white:0xdde1dc);
  }
  torso.finish();
  const foldedWings=batch(folded);
  for(const side of [-1,1]){
    // The folded coverts follow the back and flank. The dark primaries
    // lie along the tail, with the mirrors peeking out at their tips.
    loft(foldedWings,[[-.299,.031,.006,.004],[-.241,.038,.020,.014],[-.173,.039,.031,.022],
      [-.090,.037,.036,.034],[-.006,.032,.038,.036],[.061,.028,.030,.027],[.101,.022,.008,.010]],
      (x,a)=>x<-.235?pearl:Math.sin(a)<-.28?0xc0c7c7:grey,side*.055);
    for(let i=0;i<5;i++){
      const u=i/4;
      feather(foldedWings,[-.112+.041*u,side*(.06+.026*u),.062-.019*u],
        [-.348+.086*u,side*(.034+.026*u),.045-.017*u],.014,i<3?dark:pearl,i<2);
    }
  }
  foldedWings.finish();
  function wing(b,side,sections,base){
    const n=18;let prev;
    for(const [span,lead,trail,z,thick] of sections){
      const row=[];
      for(let j=0;j<n;j++){
        const a=2*Math.PI*j/n,u=(1-Math.cos(a))*.5,upper=Math.sin(a)>0;
        row.push(b.vertex(lead+(trail-lead)*u,span*side,z+thick*Math.sin(a)+.009*Math.sin(Math.PI*u),
          upper?(u>.92?white:u>.77?pearl:base):(u>.82?pearl:white)));
      }
      if(prev)for(let j=0;j<n;j++){const k=(j+1)%n;
        if(side>0)b.quad(prev[j],row[j],row[k],prev[k]);else b.quad(prev[k],row[k],row[j],prev[j]);
      }prev=row;
    }
  }
  for(const side of [-1,1]){
    const arm=new T.Group(),hand=new T.Group();arm.position.set(.009,side*.038,.029);group.add(arm);arm.add(hand);
    arm.userData.physicsJoint={axis:[1,0,0],label:side>0?'Port shoulder':'Starboard shoulder'};
    hand.userData.physicsJoint={axis:[1,0,0],label:side>0?'Port wrist':'Starboard wrist'};
    hand.position.set(0,side*.303,.033);
    const inner=batch(arm),outer=batch(hand);
    wing(inner,side,[[0,.077,-.149,0,.018],[.09,.088,-.160,.010,.017],[.18,.092,-.151,.025,.014],[.25,.079,-.128,.036,.011],[.304,.062,-.100,.033,.009]],grey);
    for(let j=0;j<9;j++){const u=j/9;
      feather(inner,[.003,side*(.025+.27*u),.006+.026*u],[-.159+.044*u,side*(.04+.274*u),.003+.026*u],.027,0x9da9af);
    }
    wing(outer,side,[[0,.062,-.100,0,.010],[.081,.049,-.093,-.006,.009],[.157,.011,-.111,-.023,.007],[.210,-.030,-.126,-.036,.004],[.273,-.114,-.128,-.050,.002]],grey);
    for(let j=0;j<9;j++){
      const f=j/8;
      feather(outer,[.025-.095*f,side*(.126-.100*f),-.012],[-.123-.052*f,side*(.332-.185*f),-.064+.036*f],.016+.009*f,
        j<5?dark:0x909ba1,j===0||j===2);
    }
    inner.finish();outer.finish();wings.push({side,arm,hand});
    const leg=new T.Group();leg.position.set(-.096,side*.042,-.050);group.add(leg);
    leg.userData.physicsJoint={axis:[0,1,0],label:side>0?'Port leg':'Starboard leg'};
    const foot=batch(leg);
    loft(foot,[[-.082,-.073,.003,.003],[-.058,-.055,.006,.007],[-.030,-.028,.008,.008],
      [0,0,.009,.009],[.009,.006,.001,.001]],()=>0xbd8d83);
    const ankle=foot.vertex(-.077,0,-.073,0xbc8b80),outerToe=foot.vertex(-.030,.023,-.087,0xcd9c8d);
    const middleToe=foot.vertex(-.019,0,-.089,0xd5a390),innerToe=foot.vertex(-.035,-.020,-.087,0xc49083);
    foot.quad(ankle,outerToe,middleToe,innerToe);
    foot.finish();legs.push({side,leg});
  }
  group.name='Herring gull';group.visible=false;
  return {group,draw(row){
    group.visible=true;group.position.fromArray(row);group.rotation.set(-row[11],-(row[14]??Math.atan2(row[5],row[4])),row[3],'ZYX');
    const wet=row[19]??0,swimming=row[22]>0,waterPose=swimming?1:wet;
    const fold=Math.min(1,1.5*waterPose)*(1-row[7]);
    folded.visible=fold>.78;
    for(const {side,arm,hand} of wings){
      arm.visible=!folded.visible;
      arm.rotation.set(side*(row[8]*(1-fold)-.64*fold),-side*(row[16]??0),side*1.30*fold,'ZXY');
      hand.rotation.set(side*(row[9]*(1-fold)+.65*fold),0,side*(row[10]*(1-fold)+1.73*fold),'ZXY');
    }
    const paddle=wet*Math.min(1,Math.abs(row[21]??0)/.55);
    for(const {side,leg} of legs){
      const effort=row[side>0?23:24]??paddle;
      const stroke=row[6]+(side>0?0:Math.PI);
      leg.rotation.y=.54*(1-waterPose)+.46*effort*Math.sin(stroke);
      leg.rotation.z=side*(.11+.12*Math.abs(effort)*(1+Math.cos(stroke)));
    }
  }};
}


// Presentation time stays monotonic between updates, including irregular
// network arrivals. The model and the camera both use this same pose.
export class GullTrack {
  constructor(){
    this.samples=[];
    this.shown=new Float64Array(25);
  }
  clear(){this.samples.length=0;}
  receive(row,now){
    const previous=this.samples.at(-1);
    if(previous?.row===row)return;
    if(previous&&now-previous.at>1000)this.clear();
    this.samples.push({row,at:now});
    if(this.samples.length>10)this.samples.shift();
  }
  at(now,buffer){
    const target=now-buffer;
    while(this.samples.length>2&&this.samples[1].at<target)this.samples.shift();
    const [left,right=left]=this.samples;
    const span=right.at-left.at,f=span>0?Math.max(0,Math.min(1,(target-left.at)/span)):0;
    // Earlier room clients send shorter rows. Preserve those fallbacks.
    const shown=this.shown.subarray(0,right.row.length);
    for(let i=0;i<shown.length;i++){
      const b=right.row[i],a=left.row[i]??b;
      const delta=i===3?Math.atan2(Math.sin(b-a),Math.cos(b-a)):b-a;
      shown[i]=i===22?(f<.5?a:b):a+delta*f;
    }
    return shown;
  }
}
