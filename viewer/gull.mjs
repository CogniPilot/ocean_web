import {baitfishMaterial} from './baitfish.mjs';
// Metres, +X bill-forward, +Y port. The closed wing sections are lofted through
// the same shoulder and wrist pivots driven by the Modelica strip model.
const featherMaterials=new WeakMap();
function gullMaterials(T){
  if(featherMaterials.has(T))return featherMaterials.get(T);
  function surface(name,gain,bump){
    const loader=new T.TextureLoader();
    function texture(map,srgb){
      const t=loader.load(new URL('./assets/gull/'+name+'-'+map+'.webp',import.meta.url).href);
      t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;t.wrapS=t.wrapT=T.MirroredRepeatWrapping;t.anisotropy=2;
      return t;
    }
    const relief=texture('surface',false);
    const material=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,map:texture('albedo',true),
      roughnessMap:relief,bumpMap:relief,bumpScale:bump,roughness:1});
    material.name='Gull '+name+' plumage';material.color.setScalar(gain);return material;
  }
  const materials={contour:surface('contour',1.26,.00027),mantle:surface('mantle',2.60,.00045),
    flight:surface('flight',1,.00016),
    cornea:new T.MeshPhysicalMaterial({vertexColors:true,roughness:.19,clearcoat:1,clearcoatRoughness:.09,side:T.DoubleSide}),
    bare:new T.MeshStandardMaterial({vertexColors:true,roughness:.76,side:T.DoubleSide})};
  featherMaterials.set(T,materials);return materials;
}
export function birdMesh(T,index=0){
  const group=new T.Group(),wings=[],legs=[],feet=[],panels=[],folded=new T.Group();
  group.add(folded);
  const plumage=gullMaterials(T);
  const white=0xf3f2ed,pearl=0xc9cbcf,grey=0xa0a5b0,dark=0x292a33;
  function batch(parent,surface=plumage.bare){
    const p=[],c=[],uv=[],indices=[],color=new T.Color();
    return {
      vertex(x,y,z,tint,u=x*8,v=Math.abs(y)*8+z*3){p.push(x,y,z);if(surface.map)uv.push(u,v);color.setHex(tint);c.push(color.r,color.g,color.b);return p.length/3-1;},
      quad(a,b,d,e){indices.push(a,b,d,a,d,e);},
      finish(neckBone){
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));
        if(uv.length)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
        g.setIndex(indices);g.computeVertexNormals();
        if(!neckBone){const mesh=new T.Mesh(g,surface);parent.add(mesh);return mesh;}
        // The breast, throat and crown share a continuous feather skin as the bill dips.
        const bones=[],weights=[];
        for(let i=0;i<p.length;i+=3){
          const w=T.MathUtils.smoothstep(p[i],.054,.185);
          bones.push(0,1,0,0);weights.push(1-w,w,0,0);
        }
        g.setAttribute('skinIndex',new T.Uint16BufferAttribute(bones,4));
        g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
        const skin=new T.SkinnedMesh(g,surface),bodyBone=new T.Bone();
        parent.add(bodyBone,skin);parent.updateMatrixWorld(true);
        skin.bind(new T.Skeleton([bodyBone,neckBone]));
        skin.computeBoundingSphere();skin.boundingSphere.radius+=.16;
      }
    };
  }
  // Elliptical sections along the backbone join breast, nape and forehead
  // continuously. The bill has a flattened base and a hooked distal tip.
  function loft(b,stations,tint,offset=0){
    const n=20;
    let old;
    const rings=[];
    for(let i=0;i<stations.length-1;i++){
      const a=stations[i],b=stations[i+1],prev=stations[Math.max(0,i-1)],next=stations[Math.min(stations.length-1,i+2)];
      rings.push(a);
      const mid=[(a[0]+b[0])/2];
      for(let k=1;k<4;k++){
        const dx=(b[0]-a[0])/8;
        const value=(a[k]+b[k])/2+dx*((b[k]-prev[k])/(b[0]-prev[0])-(next[k]-a[k])/(next[0]-a[0]));
        mid.push(Math.max(Math.min(a[k],b[k]),Math.min(Math.max(a[k],b[k]),value)));
      }
      rings.push(mid);
    }
    rings.push(stations.at(-1));
    for(const [x,z,width,height] of rings){
      const row=[];
      for(let j=0;j<n;j++){
        const a=2*Math.PI*j/n;
        const y=offset+width*Math.cos(a),up=z+height*Math.sin(a);
        // Both flanks flow toward the tail; the crown and breast meet smoothly at the midline.
        row.push(b.vertex(x,y,up,tint(x,a),x*10,(up+.45*Math.abs(y-offset))*10));
      }
      if(old)for(let j=0;j<n;j++){const k=(j+1)%n;b.quad(old[j],old[k],row[k],row[j]);}
      old=row;
    }
  }
  function joint(parent,name,x,y,z,pivot=new T.Group()){
    const frame=new T.Group();
    pivot.name=name;pivot.position.set(x,y,z);frame.position.set(-x,-y,-z);
    parent.add(pivot);pivot.add(frame);return {pivot,frame};
  }
  const neck=joint(group,'Gull neck',.115,0,-.011,new T.Bone());
  const torso=batch(group,plumage.contour),face=batch(neck.frame);

  loft(torso,[[-.243,.029,.001,.002],[-.202,.024,.038,.029],[-.149,.012,.062,.051],
    [-.085,.005,.079,.066],[-.018,.003,.085,.078],[.049,.004,.081,.080],[.101,.012,.071,.073],
    [.138,.022,.062,.066],[.162,.039,.057,.060],[.183,.050,.054,.056],[.202,.061,.052,.053],
    [.222,.071,.052,.051],[.240,.073,.047,.048],[.256,.071,.037,.039],[.267,.062,.029,.029],
    [.277,.055,.019,.018],[.284,.052,.009,.012]],(x,a)=>{
      const back=(x<.055?1:Math.max(0,1-(x-.055)/.080))*Math.max(0,(Math.sin(a)-.30)/.7);
      return back>.76?0x9d9fa4:back>.46?0xb4b5b8:back>.23?0xdbdcd9:white;
    });
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
        const spot=!upper&&x>=.304&&x<=.318&&Math.abs(Math.cos(a))>.50;
        const color=edge?0xa87e43:spot?0xd44828:upper?(x>.321?0xbf8936:0xf3c04a):0xe6aa36;
        row.push(face.vertex(x+.016,width*Math.cos(a),seam+.019+height*Math.sin(a),color));
      }
      if(previous)for(let j=0;j<12;j++){
        if(upper)face.quad(previous[j],previous[j+1],row[j+1],row[j]);
        else face.quad(previous[j+1],previous[j],row[j],row[j+1]);
      }
      previous=row;
    }
  }
  // Nested elliptical rings describe the eye and orbital skin flush with the face.
  function eyeDisc(side,x,y,z,rx,rz,rings){
    let prev;
    for(const [radius,lift,tint] of rings){
      const row=[];
      for(let i=0;i<24;i++){
        const phi=2*Math.PI*i/24,dx=rx*radius*Math.cos(phi),dz=rz*radius*Math.sin(phi);
        row.push(face.vertex(x+dx,side*(y+lift-dx*.24-dz*.09),z+dz,tint));
      }
      if(prev)for(let i=0;i<24;i++){const k=(i+1)%24;face.quad(prev[i],prev[k],row[k],row[i]);}
      prev=row;
    }
  }
  for(const side of [-1,1]){
    // The lids taper into the plumage at both corners. The dome's changing
    // surface normal catches the scene light as the gull turns its head.
    const eye=batch(neck.frame,plumage.cornea);
    const rings=[[1,0,0xd8c8af],[.88,.00035,0xc98147],[.76,.00065,0x8d674b],
      [.69,.00092,0xcbb484],[.59,.00132,0xe6d7a7],[.35,.00158,0xc6b68b],
      [.29,.00165,0x463e32],[.26,.00172,0x151516],[.001,.0019,0x111215]];
    let previous;
    for(const [r,depth,color] of rings){
      const row=[];
      for(let j=0;j<48;j++){
        const angle=j*Math.PI/24,c=Math.cos(angle),h=Math.sin(angle);
        const dx=.0078*r*c;
        const lid=Math.max(0,(r-.69)/.31);
        const dz=.0063*r*h*(1-lid*.38*c*c)+.15*dx*lid;
        const pigment=r>.3&&r<.7?.86+.14*Math.sin(16*angle+.7*Math.sin(7*angle)):1;
        const tint=new T.Color(color).multiplyScalar(pigment*(h>0&&r>.74?.9:1));
        row.push(eye.vertex(.230+dx,side*(.0504+depth-.24*dx-.09*dz),.080+dz,tint.getHex()));
      }
      if(previous)for(let j=0;j<48;j++){
        const k=(j+1)%48;
        if(side>0)eye.quad(previous[k],previous[j],row[j],row[k]);
        else eye.quad(previous[j],previous[k],row[k],row[j]);
      }
      previous=row;
    }
    eye.finish();
    eyeDisc(side,.290,.0151,.0565,.0033,.00115,[[1,0,0xc09b49],[.63,.00025,0x79582e],[.01,.00035,0x6c532e]]);
  }
  face.finish();
  const billTip=new T.Object3D();billTip.name='Gull bill tip';billTip.position.set(.346,0,.042);neck.frame.add(billTip);
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
  // One draw call for twelve overlapping rectrices. Their roots stay attached
  // while the fan opens; curved tips give the deployed edge its rounded arc.
  const tailPitch=new T.Group(),tailCant=new T.Group();
  tailPitch.name='Gull tail incidence';tailPitch.position.set(-.158,0,.024);
  tailPitch.userData.physicsJoint={axis:[0,-1,0],label:'Tail incidence'};
  tailCant.name='Gull tail cant';tailCant.userData.physicsJoint={axis:[1,0,0],label:'Tail cant'};
  group.add(tailPitch);tailPitch.add(tailCant);
  function tailFeathers(halfAngle){
    const surface=batch(tailCant,plumage.contour);
    for(let j=0;j<12;j++){
      const relative=(j-5.5)/5.5,angle=relative*halfAngle,length=.18-.016*relative**2;
      const rootY=.027*relative,rootZ=.007*(1-relative**2);
      feather(surface,[0,rootY,rootZ],[-length*Math.cos(angle),rootY+length*Math.sin(angle),.011-.009*relative**2],
        .019,j%2?white:0xe6e6e3);
    }
    return surface.finish();
  }
  const fan=tailFeathers(.30),spreadFan=tailFeathers(.89);
  fan.geometry.morphAttributes.position=[spreadFan.geometry.attributes.position];
  fan.geometry.morphAttributes.normal=[spreadFan.geometry.attributes.normal];
  fan.updateMorphTargets();fan.name='Gull rectrices';
  spreadFan.removeFromParent();
  spreadFan.geometry.dispose();
  torso.finish(neck.pivot);
  for(const side of [-1,1]){
    const panel=joint(folded,'Gull folded wing',.065,side*.051,.029);
    panels.push({side,pivot:panel.pivot});
    const foldedWings=batch(panel.frame,plumage.mantle);
    // The folded coverts follow the back and flank. The dark primaries
    // lie along the tail, with the mirrors peeking out at their tips.
    const coverts=[[-.286,.043,.006,.005],[-.242,.047,.016,.014],[-.177,.050,.030,.023],
      [-.107,.048,.039,.033],[-.039,.044,.046,.039],[.023,.037,.041,.041],[.065,.035,.033,.034],
      [.090,.037,.021,.023],[.102,.038,.005,.006]];
    loft(foldedWings,coverts,(x,a)=>x<-.247?pearl:Math.sin(a)<-.54?0xb6bbc2:grey,side*.048);
    // Scapulars and greater coverts lie against the curved side. Their tapered
    // margins overlap, so the gray mantle has feather groups even from abeam.
    function mantlePoint(x,angle,lift,tint){
      let k=1;while(k<coverts.length-1&&x>coverts[k][0])k++;
      const a=coverts[k-1],b=coverts[k],t=(x-a[0])/(b[0]-a[0]);
      const z=a[1]+t*(b[1]-a[1]),w=a[2]+t*(b[2]-a[2]),h=a[3]+t*(b[3]-a[3]);
      return foldedWings.vertex(x,side*(.048+(w+lift)*Math.cos(angle)),z+(h+lift)*Math.sin(angle),tint,x*10,(z+(h+lift)*Math.sin(angle)+.45*(w+lift)*Math.cos(angle))*10);
    }
    for(let tier=0;tier<3;tier++)for(let i=0;i<6;i++){
      const start=.064-.023*i+.005*tier,reach=.075+.006*i+.010*tier;
      let prev;
      for(let j=0;j<=7;j++){
        const t=j/7,x=start-reach*t,angle=-.70+.49*tier+.12*i+.31*t;
        const width=.28*Math.sin(Math.PI*(.035+.94*t))**.68;
        const lift=.0008+.001*tier+.003*Math.sin(Math.PI*t);
        const shade=[0x9da2ac,0xa4a7b0,0xaaadb6][(i+tier)%3];
        const row=[mantlePoint(x,angle-width,lift,0xb4b7bf),mantlePoint(x,angle,lift+.0007,shade),
          mantlePoint(x,angle+width,lift,shade)];
        if(prev){foldedWings.quad(prev[0],prev[1],row[1],row[0]);foldedWings.quad(prev[1],prev[2],row[2],row[1]);}
        prev=row;
      }
    }
    for(let i=0;i<5;i++){
      const u=i/4;
      feather(foldedWings,[-.105+.041*u,side*(.057+.027*u),.063-.013*u],
        [-.343+.075*u,side*(.025+.032*u),.060-.014*u],.018,i<3?dark:pearl,i<2);
    }
    foldedWings.finish();
  }
  const innerSections=[[0,.079,-.142,0,.018],[.09,.097,-.161,.012,.018],[.18,.112,-.156,.027,.015],
    [.25,.108,-.143,.036,.012],[.303,.091,-.116,.033,.010]];
  const outerSections=[[-.023,.085,-.109,.000,.009],[0,.091,-.116,0,.010],[.075,.078,-.112,-.005,.009],[.145,.043,-.116,-.014,.007],
    [.202,.006,-.107,-.026,.006],[.252,-.052,-.092,-.037,.003]];
  function sectionAt(sections,span){
    let i=1;
    while(i<sections.length-1 && span>sections[i][0])i++;
    const a=sections[i-1],b=sections[i],t=Math.max(0,Math.min(1,(span-a[0])/(b[0]-a[0])));
    return a.map((v,j)=>v+t*(b[j]-v));
  }
  function skinHeight(section,x,upper){
    const [,lead,trail,z,thickness]=section;
    const u=Math.min(1,Math.max(0,(x-lead)/(trail-lead)));
    return z+.006*Math.sin(Math.PI*u)+upper*2*thickness*Math.sqrt(u*(1-u))*(1.22-.50*u);
  }
  function wing(b,side,sections){
    let prev;
    for(const section of sections){
      const [span,lead,trail]=section,row=[];
      for(let j=0;j<24;j++){
        const angle=j*Math.PI/12,u=(1-Math.cos(angle))*.5,x=lead+(trail-lead)*u;
        const upper=j<12?1:-1;
        const color=upper>0?0x9ca0a5:0xe8e7e2;
        row.push(b.vertex(x,side*span,skinHeight(section,x,upper),color,span*8,u*2));
      }
      if(prev)for(let j=0;j<24;j++){
        const k=(j+1)%24;
        if(side>0)b.quad(prev[j],row[j],row[k],prev[k]);else b.quad(prev[k],row[k],row[j],prev[j]);
      }
      prev=row;
    }
  }
  // Each remex has two asymmetric vanes joined at the shaft. The outer
  // primaries carry black subterminal fields and white mirrors on P9 and P10.
  function flightFeather(b,side,sections,root,tip,width,number,covert=false){
    const dx=tip[0]-root[0],ds=tip[1]-root[1],length=Math.hypot(dx,ds);
    const rows=[0,.28,.52,.65,.72,.78,.82,.86,.90,.935,.966,.986,1];
    const across=[-1,-.57,0,.57,1];
    for(const upper of [1,-1]){
      let previous;
      for(const t of rows){
        const round=number<5?.065:.15,shoulder=1-round;
        const breadth=t<shoulder?.40+.60*Math.sin(.5*Math.PI*t/shoulder)**.6:Math.sqrt(Math.max(0,1-((t-shoulder)/round)**2));
        const row=[];
        for(const v of across){
          const w=v*width*breadth*(v>0?.70:1);
          const x=root[0]+dx*t+ds*w/length,span=root[1]+ds*t-dx*w/length;
          const section=sectionAt(sections,span),off=Math.max(0,span-sections.at(-1)[0]);
          const lift=(covert?.0019:.0011)+.0007*(1-Math.abs(v))+.001*Math.sin(Math.PI*t);
          // Beyond the leading-edge skin the quills themselves form the airfoil.
          const z=skinHeight(section,x,upper)-.19*off+upper*lift;
          const type=covert?0:number+1;
          const tileRow=(upper>0?0:2)+Math.floor(type/6),tileCol=type%6;
          // Four texels of padding around each vane keep adjacent pigments
          // out of the mip-filtered white mirrors and subterminal bands.
          const u=(tileCol+(4.5+207*(v+1)/2)/216)/6;
          const uvTip=(tileRow+(4.5+207*t)/216)/4;
          row.push(b.vertex(x,side*span,z,0xffffff,u,uvTip));
        }
        if(previous)for(let j=0;j<across.length-1;j++){
          if(side*upper>0)b.quad(previous[j],previous[j+1],row[j+1],row[j]);
          else b.quad(previous[j+1],previous[j],row[j],row[j+1]);
        }
        previous=row;
      }
    }
  }
  for(const side of [-1,1]){
    const arm=new T.Group(),hand=new T.Group();arm.position.set(.009,side*.038,.029);group.add(arm);arm.add(hand);
    arm.userData.physicsJoint={axis:[side,0,0],label:side>0?'Port shoulder':'Starboard shoulder'};
    hand.userData.physicsJoint={axis:[side,0,0],label:side>0?'Port wrist':'Starboard wrist'};
    hand.position.set(0,side*.303,.033);
    const inner=batch(arm,plumage.mantle),outer=batch(hand,plumage.mantle);
    wing(inner,side,innerSections);wing(outer,side,outerSections);
    inner.finish();outer.finish();
    const secondaries=batch(arm,plumage.flight),primaries=batch(hand,plumage.flight);
    for(let j=0;j<12;j++){
      const span=.014+.0245*j,section=sectionAt(innerSections,span);
      flightFeather(secondaries,side,innerSections,[section[1]-.044,span],
        [section[2]-.020,.012+.0254*j],.020,0);
      flightFeather(secondaries,side,innerSections,[section[1]-.018,span],
        [section[2]+.054,.029+.0241*j],.018,0,true);
    }
    for(let j=0;j<4;j++){
      const span=.005+.024*j,section=sectionAt(outerSections,span);
      flightFeather(primaries,side,outerSections,[section[1]-.035,span],[-.155-.016*j/3,.005+.032*j],.022,0);
    }
    const tips=[[-.170,.130],[-.183,.161],[-.192,.192],[-.197,.222],[-.194,.252],
      [-.187,.278],[-.177,.303],[-.167,.324],[-.155,.343],[-.142,.354]];
    for(const [j,tip] of tips.entries()){
      const span=.028+.0135*j,section=sectionAt(outerSections,span);
      flightFeather(primaries,side,outerSections,[section[1]-.031,span],tip,.024-.0004*j,j+1);
      flightFeather(primaries,side,outerSections,[section[1]-.012,span],
        [section[2]+.012-.002*j,span+.052+.004*j],.0168,0,true);
    }
    secondaries.finish();primaries.finish();wings.push({side,arm,hand});
    const leg=new T.Group();leg.position.set(-.096,side*.042,-.050);group.add(leg);
    leg.userData.physicsJoint={axis:[0,1,0],label:side>0?'Port leg':'Starboard leg'};
    const ankleJoint=joint(leg,'Gull ankle',-.077,0,-.073);
    const shin=batch(leg),foot=batch(ankleJoint.frame);
    loft(shin,[[-.082,-.073,.003,.003],[-.058,-.055,.006,.007],[-.030,-.028,.008,.008],
      [0,0,.009,.009],[.009,.006,.001,.001]],(x,a)=>Math.cos(45*x)>.65?0xab8982:0xc29a90);
    // Three raised toes support two shallow scallops of interdigital webbing.
    const toes=[[-.012,-.036,-.085],[.004,0,-.089],[-.012,.036,-.085]];
    for(let i=0;i<2;i++){
      const a=toes[i],b=toes[i+1];
      let prior;
      for(const t of [0,.38,.72,1]){
        const row=[];
        for(const v of [0,.25,.5,.75,1]){
          const arc=Math.sin(Math.PI*v),rad=t*(1-.21*arc*t);
          const x=-.079+rad*((1-v)*a[0]+v*b[0]+.079);
          const y=rad*((1-v)*a[1]+v*b[1]);
          const z=-.074+rad*((1-v)*a[2]+v*b[2]+.074)-.0015*arc*t;
          row.push(foot.vertex(x,y,z,arc>.8?0xc8a69d:0xb28a82));
        }
        if(prior)for(let j=0;j<row.length-1;j++)foot.quad(prior[j],row[j],row[j+1],prior[j+1]);
        prior=row;
      }
    }
    for(const [x,y,z] of toes){
      let prev;
      for(const [t,w] of [[0,.0022],[.44,.0026],[.80,.0016],[1,.0008],[1.035,.00015]]){
        const xx=-.079+t*(x+.079),zz=-.073+t*(z+.073)-Math.max(0,t-.97)*.021,yy=t*y;
        const tint=t>=1?0x554e4f:0xc39c90;
        const row=[foot.vertex(xx,yy-w,zz,tint),foot.vertex(xx,yy,zz+w,tint),foot.vertex(xx,yy+w,zz,tint)];
        if(prev){foot.quad(prev[0],prev[1],row[1],row[0]);foot.quad(prev[1],prev[2],row[2],row[1]);}
        prev=row;
      }
    }
    shin.finish();foot.finish();
    const web=new T.Object3D();web.name='Gull web';web.position.set(-.034,0,-.081);ankleJoint.frame.add(web);
    feet.push(web);legs.push({side,leg,ankle:ankleJoint.pivot});

  }
  // The fish hangs vertically from its head during extraction, then slides
  // into the gape as the gull tips its head back to swallow.
  const billForward=billTip.position.x-neck.pivot.position.x,billUp=billTip.position.z-neck.pivot.position.z;
  const billReach=Math.hypot(billForward,billUp),billBearing=Math.atan2(billUp,billForward);
  const catchPivot=new T.Group();catchPivot.name='Gull caught fish';billTip.add(catchPivot);
  const catchSurface=baitfishMaterial(T),catchBody=batch(catchPivot,catchSurface);
  loft(catchBody,[[-.004,0,.001,.001],[.006,0,.005,.006],[.020,0,.006,.010],
    [.039,0,.004,.007],[.049,0,.002,.003],[.061,0,.001,.007]],(x,a)=>Math.sin(a)>.3?0x708d94:0xdbe7df);
  catchBody.finish();
  const caughtFish=catchPivot.children[0],pos=caughtFish.geometry.attributes.position,uv=caughtFish.geometry.attributes.uv;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i);
    if(x>=.049)uv.setXY(i,.762+.22*(x-.049)/.012,.30+.58*(z+.008)/.016);
    else uv.setXY(i,.009+.714*(x+.004)/.065,.155+.807*(z+.011)/.022);
  }
  for(const side of [-1,1]){
    const eye=new T.SphereGeometry(1,10,6),p=eye.attributes.position;
    for(let i=0;i<p.count;i++)eye.attributes.uv.setXY(i,.50+.055*p.getX(i),.072+.061*p.getZ(i));
    const lens=new T.Mesh(eye,catchSurface);lens.position.set(.006,.0047*side,.0019);
    lens.scale.set(.0013,.00065,.0013);catchPivot.add(lens);
  }
  const clamp=value=>Math.max(0,Math.min(1,value));
  function ease(start,end,x){
    const t=clamp((x-start)/(end-start));return t*t*(3-2*t);
  }
  let onWater,lastTime,landing=-Infinity,launching=false,pushAt=-Infinity;
  function reset(){onWater=undefined;lastTime=undefined;landing=-Infinity;pushAt=-Infinity;launching=false;}
  // Modelica body order is torso, port arm/hand, starboard arm/hand, legs.
  // Use the feather-bearing hinges themselves for every inspection layer.
  const links=[{frame:group,label:'Torso'}];
  for(const {side,arm,hand} of wings.slice().reverse()){
    const name=side>0?'Port':'Starboard';
    links.push({frame:arm,label:name+' inner wing'},{frame:hand,label:name+' outer wing'});
  }
  for(const {side,leg} of legs.slice().reverse()){
    links.push({frame:leg,label:side>0?'Port leg':'Starboard leg'});
  }
  function setBodyProperties(data,wingProducts){
    const bodies=data.length>=56?[...links,{frame:tailCant,label:'Tail fan'}]:links;
    group.userData.physicsBodies=bodies.map(({frame,label},i)=>{
      const moments=data.slice(7*i+4,7*i+7);
      const body={frame,label,mass:data[7*i],center:data.slice(7*i+1,7*i+4),moments};
      if(i>=1&&i<=4&&wingProducts?.length===12){
        const [xy,xz,yz]=wingProducts.slice(3*(i-1),3*i);
        body.tensor=[moments[0],xy,xz,xy,moments[1],yz,xz,yz,moments[2]];
      }
      return body;
    });
  }
  group.name='Herring gull';group.visible=false;
  return {group,feet,reset,setBodyProperties,draw(row,time=0,seaLevel=0){
    const wet=clamp(row[19]??0),swimming=(row[22]??0)>0,water=swimming||wet>.48;
    const pitch=row[14]??Math.atan2(row[5],row[4]),phase=row[6]??0,amplitude=row[7]??0;
    const height=row[2]-seaLevel;
    if(lastTime!==undefined&&(time<lastTime-.001||time-lastTime>2))reset();
    if(water&&!onWater&&onWater!==undefined)landing=time;
    if(!water&&onWater)landing=-Infinity;
    lastTime=time;onWater=water;
    const activeLaunch=swimming&&amplitude>.32&&(row[5]>.1||Math.abs(row[21]??0)>1.25)
      &&(row[23]??0)+(row[24]??0)>.05;
    if(activeLaunch&&!launching)pushAt=time;
    launching=activeLaunch;
    const pushAge=time-pushAt;
    const launch=activeLaunch?ease(.32,.72,amplitude):0;
    const takeoffPush=launch*(1-ease(.115,.29,height))*(.55+.45*Math.cos(phase));
    const wetPose=(swimming?1:wet)*(1-launch);
    const fold=clamp(1.5*(swimming?1:wet))*(1-clamp(amplitude));
    const landingAge=time-landing;
    const settle=landingAge>=0&&landingAge<2.2?Math.exp(-1.5*landingAge)*Math.sin(Math.PI*landingAge/2.2):0;
    group.visible=true;group.position.fromArray(row);group.rotation.set(-row[11],-pitch,row[3],'ZYX');

    tailPitch.rotation.y=-(row[92]??row[17]??0);
    tailCant.rotation.x=row[93]??0;
    const spread=row[96]??.30;
    fan.morphTargetInfluences[0]=clamp((spread-.30)/.59);
    const tailBody=group.userData.physicsBodies?.[7];
    if(tailBody){
      const width=.054+.36*Math.sin(spread),length=.18*(.65+.35*Math.cos(spread)),scale=tailBody.mass/12;
      tailBody.center[0]=-.50*length;
      tailBody.moments[0]=scale*(width**2+.008**2);
      tailBody.moments[1]=scale*(length**2+.008**2);
      tailBody.moments[2]=scale*(width**2+length**2);
    }
    folded.visible=fold>.78;
    for(const {side,arm,hand} of wings){
      arm.visible=!folded.visible;
      const j=side>0?25:27;
      arm.rotation.set(side*(row[j]??row[8]),-side*(row[16]??0),side*1.30*fold,'ZYX');
      hand.rotation.set(side*(row[j+1]??row[9]),0,side*(row[10]*(1-fold)+1.73*fold),'ZYX');
    }
    for(const {side,pivot} of panels){
      const adjust=settle>0?settle*(.5+.5*Math.cos(8*landingAge+side*.75)):0;
      pivot.rotation.set(side*.44*adjust,wetPose*(.025+.25*Math.max(0,pitch))+.16*adjust,side*.13*adjust);
    }
    const legacyPaddle=wet*Math.min(1,Math.abs(row[21]??0)/.55);
    const port=row[23]??legacyPaddle,starboard=row[24]??legacyPaddle;
    // The model publishes the same stroke phase and side commands to the
    // host, seated players and spectators, including reverse turning strokes.
    const landingLegs=!water&&row[5]<.12?1-ease(.15,.60,height):0;
    const launchLegs=activeLaunch?1-ease(.13,.32,height):
      (1-ease(.22,.65,pushAge))*(1-ease(.18,.4,height));
    for(const {side,leg,ankle} of legs){
      const effort=side>0?port:starboard,strength=Math.min(1,Math.abs(effort))*wetPose;
      const cycle=phase*Math.sign(effort)+(side>0?0:Math.PI);
      const swing=Math.sin(cycle),recovery=.5+.5*Math.cos(cycle);
      const flying=1-wetPose,support=Math.max(landingLegs,launchLegs);
      if(row.length>=91){
        leg.rotation.set(0,row[side>0?29:30],0);
        ankle.rotation.set(0,row[side>0?87:88],0);
        ankle.scale.y=row[side>0?89:90];
        continue;
      }
      leg.rotation.y=row[side>0?29:30]??(.47*wetPose+1.18*flying-.7*strength*swing);
      leg.rotation.y+=( -.63-.23*Math.cos(phase)-leg.rotation.y)*support;
      leg.rotation.z=side*(.09+.19*strength*recovery);
      ankle.rotation.y=-.23*wetPose+.48*flying+.82*strength*recovery;
      ankle.rotation.y+=(-leg.rotation.y-.14-ankle.rotation.y)*support;
    }
    // Small independent differences in timing keep an entire flock from
    // dipping in unison. One in three foraging gestures can lift prey.
    const period=9.4+(index%5)*.67,clock=time+index*4.31;
    const pass=Math.floor(clock/period),age=clock-period*pass;
    const rest=water&&!activeLaunch&&Math.max(Math.abs(port),Math.abs(starboard))<.12
      &&Math.abs(row[21]??0)<.70&&landingAge>2.2;
    const nip=rest?ease(2,2.53,age)*(1-ease(2.57,2.91,age)):0;
    const caught=rest&&(pass+index)%3===1&&age>=2.55&&age<4.02;
    const swallow=caught?ease(3.41,3.8,age):0;
    const up=caught?ease(2.7,3.05,age)*(1-ease(3.8,4.02,age)):0;
    const restingNeck=-.18*wetPose;
    // Head rotation is expressed in body coordinates. Solve for the
    // waterline under the bill so a pitching bird can still reach its prey.
    const pivotHeight=height+neck.pivot.position.x*Math.sin(pitch)+neck.pivot.position.z*Math.cos(pitch);
    const reachAngle=pitch+billBearing+Math.asin(Math.min(.94,Math.max(-.94,(pivotHeight+.006)/billReach)));
    neck.pivot.rotation.y=restingNeck+(reachAngle-restingNeck)*nip-.51*up;
    catchPivot.visible=caught;
    if(caught){
      catchPivot.position.set(-.055*swallow,0,.006*swallow);
      catchPivot.rotation.y=Math.PI/2+pitch-neck.pivot.rotation.y-.92*swallow;
      catchPivot.scale.setScalar(1-swallow);
    }
    return row.length>=91?launch*(1-ease(.12,.30,height)):takeoffPush;
  }};
}


// Presentation time stays monotonic between updates, including irregular
// network arrivals. The model and the camera both use this same pose.
export class GullTrack {
  constructor(){
    this.samples=[];
    this.shown=new Float64Array(98);
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
