// Metres, +X bill-forward, +Y port. The closed wing sections are lofted through
// the same shoulder and wrist pivots driven by the Modelica strip model.
export function birdMesh(T){
  const group=new T.Group(),wings=[];
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
  loft(torso,[[-.233,.012,.001,.002],[-.190,.010,.034,.028],[-.129,.004,.062,.055],[-.05,0,.076,.078],
    [.033,-.006,.078,.079],[.098,-.004,.066,.068],[.146,.018,.046,.049],[.173,.043,.047,.043],
    [.204,.048,.045,.047],[.231,.045,.039,.043],[.254,.039,.027,.028],[.265,.035,.012,.015]],
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
    loft(torso,[[.202,.054,.001,.002],[.209,.054,.006,.008],[.215,.054,.007,.008],[.222,.054,.001,.001]],
      ()=>0x66523a,side*.041);
    loft(torso,[[.210,.055,.001,.002],[.214,.055,.004,.005],[.218,.055,.001,.001]],()=>0x141618,side*.047);
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
  function wing(b,side,sections,base){
    const n=18;let prev;
    for(const [span,lead,trail,z,thick] of sections){
      const row=[];
      for(let j=0;j<n;j++){
        const a=2*Math.PI*j/n,u=(1-Math.cos(a))*.5,upper=Math.sin(a)>0;
        row.push(b.vertex(lead+(trail-lead)*u,span*side,z+thick*Math.sin(a)+.009*Math.sin(Math.PI*u),
          upper?(u>.81?pearl:base):(u>.82?pearl:white)));
      }
      if(prev)for(let j=0;j<n;j++){const k=(j+1)%n;
        if(side>0)b.quad(prev[j],row[j],row[k],prev[k]);else b.quad(prev[k],row[k],row[j],prev[j]);
      }prev=row;
    }
  }
  for(const side of [-1,1]){
    const arm=new T.Group(),hand=new T.Group();arm.position.set(.009,side*.038,.029);group.add(arm);arm.add(hand);
    hand.position.set(0,side*.303,.033);
    const inner=batch(arm),outer=batch(hand);
    wing(inner,side,[[0,.077,-.149,0,.018],[.09,.085,-.153,.012,.017],[.18,.089,-.139,.027,.014],[.25,.075,-.122,.036,.011],[.304,.062,-.100,.033,.009]],grey);
    for(let j=0;j<9;j++){const u=j/9;
      feather(inner,[.003,side*(.025+.27*u),.006+.026*u],[-.159+.044*u,side*(.04+.274*u),.003+.026*u],.027,0x9da9af);
    }
    wing(outer,side,[[0,.062,-.100,0,.010],[.081,.049,-.093,-.006,.009],[.157,.011,-.111,-.023,.007],[.210,-.030,-.126,-.036,.004],[.273,-.114,-.128,-.050,.002]],grey);
    for(let j=0;j<9;j++){
      const f=j/8;
      feather(outer,[.025-.095*f,side*(.126-.100*f),-.012],[-.123-.052*f,side*(.332-.185*f),-.064+.036*f],.016+.009*f,
        j<5?dark:0x909ba1,j<3);
    }
    inner.finish();outer.finish();wings.push({side,arm,hand});
  }
  group.name='Herring gull';group.visible=false;
  return {group,draw(row){
    group.visible=true;group.position.fromArray(row);group.rotation.set(-row[11],-(row[14]??Math.atan2(row[5],row[4])),row[3],'ZYX');
    for(const {side,arm,hand} of wings){arm.rotation.set(side*row[8],-side*(row[16]??0),0);hand.rotation.set(side*row[9],0,side*row[10],'ZXY');}
  }};
}
