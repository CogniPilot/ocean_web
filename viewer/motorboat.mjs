// Seven-and-a-half metre inboard sportfisher. Bow +X, port +Y, up +Z.
// Underside lens centres in the boat frame, 23 mm below the bottom plating.
export const hullLamps=[-1,1].flatMap(side=>[
  [-3.599,side*.759,-.249],[-2.750,side*.864,-.333],[-.200,side*.905,-.391],
  [1.590,side*.761,-.314],[2.765,side*.395,-.052]
]);
// Broad, overlapping lobes from the paired stern, midship and bow emitters.
// Coordinates/radii are metres in the body frame. The stern pair is brightest.
export const hullGlowLobes=[-1,1].flatMap(side=>[
  {center:[-3.02,side*.76,-.86],radius:[1.52,1.34,.95],weight:.61},
  {center:[-.70,side*.86,-.95],radius:[1.48,1.21,.96],weight:.34},
  {center:[1.62,side*.70,-.76],radius:[1.18,1.10,.82],weight:.27}
]);
export const searchlightHeight=2.74;
// Roof, raked cabin front, foredeck and aft cockpit in boat coordinates.
// For each surface z=base+slope*x; the last pairs are its x and half-beam bounds.
const deckPanels=[
  [2.207,0,-1.24,.82,.98,.93],[2.51,-.728,1.19,1.83,.85,.65],
  [.902,.117,1.18,2.93,1.02,.58],[.824,.137,2.93,3.80,.58,.012],[.54,0,-3.72,1.12,1.05,1.14]
];
function deckHit(origin,d,range){
  let distance=range;
  for(const [base,slope,x0,x1,w0,w1] of deckPanels){
    const denom=d.z-slope*d.x;
    if(Math.abs(denom)<.0001)continue;
    const t=(base+slope*origin.x-origin.z)/denom;
    if(t<=0||t>=distance)continue;
    const x=origin.x+t*d.x;
    if(x>=x0&&x<=x1&&Math.abs(origin.y+t*d.y)<w0+(w1-w0)*(x-x0)/(x1-x0))distance=t;
  }
  return distance;
}
const glslFloat=n=>Number.isInteger(n)?n.toFixed(1):String(n);
export const cruiserBeamGLSL=`
 bool crossesDeck(vec3 origin,vec3 delta,float base,float slope,vec2 ends,vec2 widths){
   float denom=delta.z-slope*delta.x;
   if(abs(denom)<.0001)return false;
   float t=(base+slope*origin.x-origin.z)/denom;
   if(t<=0.||t>=.999)return false;
   vec2 hit=origin.xy+t*delta.xy;
   return hit.x>=ends.x&&hit.x<=ends.y&&abs(hit.y)<mix(widths.x,widths.y,(hit.x-ends.x)/(ends.y-ends.x));
 }
 bool cruiserBlocksBeam(vec3 origin,vec3 point){
   vec3 d=point-origin;
   return ${deckPanels.map(([base,slope,x0,x1,w0,w1])=>
     `crossesDeck(origin,d,${glslFloat(base)},${glslFloat(slope)},vec2(${glslFloat(x0)},${glslFloat(x1)}),vec2(${glslFloat(w0)},${glslFloat(w1)}))`).join('||')};
 }`;

// The cruiser projection stores the first deck hit rather than a colour cookie.
// Compare in the standard material lighting path so the deck still receives
// light up to that surface, while the beam and geometry beyond it stay dark.
function installSearchlightDepth(T){
  const original='directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;';
  if(!T.ShaderChunk.lights_fragment_begin.includes(original))return;
  T.ShaderChunk.lights_fragment_begin=T.ShaderChunk.lights_fragment_begin.replace(original,`
    if(inSpotLightMap){
      if(spotColor.a>.0015&&spotColor.a<.006){
        float blocker=48.*dot(spotColor.rg,vec2(65280.,255.))/65535.;
        directLight.color*=1.-smoothstep(blocker+.035,blocker+.10,length(spotLight.position-geometryPosition));
      }else directLight.color*=spotColor.rgb;
    }`);
}
export function cabinCruiser(T,sonarCanvas){
  const group=new T.Group();group.name='Cabin cruiser';group.rotation.order='ZYX';
  const ivory=0xe7e9df,white=0xf4f4eb,wood=0x966943,plank=0xae865d,trim=0x253b40,
    steel=0xb8c9c8,brass=0xb29255,upholstery=0xdfddca;
  const solid=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.62}),
    metal=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.33,metalness:.35}),
    glass=new T.MeshPhongMaterial({color:0x6e9da2,transparent:true,opacity:.32,specular:0xccdfe4,
      shininess:85,side:T.DoubleSide,depthWrite:false});
  // Hull, pilothouse and fittings are fixed relative to one another. Bake them
  // by surface finish so a distant peer's grab rails take a single draw call.
  const batches=new Map(),v3=(x,y,z)=>new T.Vector3(x,y,z);
  function part(geometry,color,pos,rot,scale,material=solid){
    const matrix=new T.Matrix4().compose(v3(...(pos??[0,0,0])),
      new T.Quaternion().setFromEuler(rot??new T.Euler()),v3(...(scale??[1,1,1])));
    geometry.applyMatrix4(matrix);
    const posAttr=geometry.attributes.position,norm=geometry.attributes.normal;
    let batch=batches.get(material);
    if(!batch){batch={p:[],n:[],c:[],ix:[]};batches.set(material,batch);}
    const offset=batch.p.length/3,c=new T.Color(color);
    for(let i=0;i<posAttr.count;i++){
      batch.p.push(posAttr.getX(i),posAttr.getY(i),posAttr.getZ(i));
      batch.n.push(norm.getX(i),norm.getY(i),norm.getZ(i));batch.c.push(c.r,c.g,c.b);
    }
    const index=geometry.index;
    for(let i=0;i<(index?.count??posAttr.count);i++)batch.ix.push(offset+(index?index.getX(i):i));
    geometry.dispose();
  }
  function box(x,y,z,l,w,h,color,rotation){
    part(new T.BoxGeometry(l,w,h),color,[x,y,z],rotation);
  }
  function rod(a,b,r,color,material=metal){
    const start=v3(...a),end=v3(...b),dir=end.clone().sub(start);
    const rot=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(v3(0,1,0),dir.clone().normalize()));
    part(new T.CylinderGeometry(r,r,dir.length(),8),color,start.lerp(end,.5).toArray(),rot,null,material);
  }
  function pad(x,y,z,l,w,h,color,material=solid){
    part(new T.SphereGeometry(1,16,10),color,[x,y,z],null,[l,w,h],material);
  }
  function cushion(x,y,z,l,w,h,color){
    const r=Math.min(.075,l*.18,w*.18),c=new T.Shape();
    c.moveTo(-l/2+r,-w/2);c.lineTo(l/2-r,-w/2);c.quadraticCurveTo(l/2,-w/2,l/2,-w/2+r);
    c.lineTo(l/2,w/2-r);c.quadraticCurveTo(l/2,w/2,l/2-r,w/2);
    c.lineTo(-l/2+r,w/2);c.quadraticCurveTo(-l/2,w/2,-l/2,w/2-r);
    c.lineTo(-l/2,-w/2+r);c.quadraticCurveTo(-l/2,-w/2,-l/2+r,-w/2);
    part(new T.ExtrudeGeometry(c,{depth:h,bevelSize:.018,bevelThickness:.018,bevelSegments:3}),color,[x,y,z]);
  }
  function surface(rows,color,material=solid){
    const g=new T.BufferGeometry(),n=rows[0].length,indices=[];
    for(let i=1;i<rows.length;i++)for(let j=1;j<n;j++){
      const a=(i-1)*n+j-1,b=a+n;indices.push(a,b,a+1,a+1,b,b+1);
    }
    g.setAttribute('position',new T.Float32BufferAttribute(rows.flat(2),3));
    g.setIndex(indices);g.computeVertexNormals();part(g,color,null,null,null,material);
  }
  // Separate topside and bottom plating at the hard chine. Curved stations
  // carry the flare forward and the stem rakes outward above the waterline.
  const controls=[[-3.74,1.07,.77,-.39],[-3.53,1.19,.78,-.44],[-2.75,1.29,.80,-.52],
    [-1.55,1.36,.84,-.57],[-.20,1.35,.91,-.61],[1.05,1.24,1.00,-.58],[2.1,1.00,1.11,-.49],
    [2.93,.67,1.20,-.32],[3.49,.33,1.27,-.06],[3.80,.018,1.32,.25]];
  const widths=new T.CatmullRomCurve3(controls.map(([x,w,top])=>v3(x,w,top))),
    keels=new T.CatmullRomCurve3(controls.map(([x,w,top,k])=>v3(x,k,0)));
  const sections=[];
  for(let i=0;i<=36;i++){
    const {x,y:w,z:top}=widths.getPoint(i/36),k=keels.getPoint(i/36).y;
    const rake=Math.max(0,(x-1.5)/2.3)**2*.8,round=Math.max(0,(-3.39-x)/.35)*.14;
    function point(side,f,t){return [x-rake*(1-t)+round*f*f,side*w*f,k+(top-k)*t];}
    sections.push({x,w,top,k,point});
  }
  for(const side of [-1,1]){
    const row=(k,f,t)=>k.point(side,f,t);
    surface(sections.map(k=>[row(k,1,1),row(k,.993,.87),row(k,.972,.65),row(k,.931,.43),row(k,.85,.23)]),ivory);
    surface(sections.map(k=>[row(k,.85,.23),row(k,.57,.12),row(k,.27,.045),row(k,0,0)]),0x635950);
    // The bootstripe follows the design waterline, including the raked forefoot.
    function stripe(k,z){
      const t=Math.max(0,Math.min(1,(z-k.k)/(k.top-k.k)));
      const f=t>.43?.931+(t-.43)*.041/.22:t>.23?.85+(t-.23)*.081/.20:.85*t/.23;
      return row(k,f+.005,t);
    }
    surface(sections.map(k=>[stripe(k,.070),stripe(k,.025)]),trim);
    surface(sections.map(k=>[row(k,1.003,.986),row(k,1.006,.946)]),trim);
    surface(sections.map(k=>[row(k,1,1),row(k,.83,1)]),white);
    const window=sections.filter(k=>k.x>-.55&&k.x<2.5);
    surface(window.map((k,i)=>{
      const u=i/(window.length-1),height=.092*Math.sqrt(Math.max(0,Math.sin(Math.PI*u)));
      const mid=.77+.055*u;
      return [row(k,.975+(mid+height-.65)*.09,mid+height),row(k,.975+(mid-height-.65)*.09,mid-height)];
    }),0x22383f);
  }
  const stern=sections[0],stem=sections.at(-1);
  for(const end of [stern,stem])surface([[-1,1].map(s=>end.point(s,1,1)),[-1,1].map(s=>end.point(s,.93,.43)),[-1,1].map(s=>end.point(s,.85,.23)),[-1,1].map(s=>end.point(s,0,0))],ivory);
  surface(sections.filter(k=>k.x>1.15).map(k=>[k.point(1,.86,1),[k.x,0,k.top+.035],k.point(-1,.86,1)]),white);
  // Recessed cockpit sole, coamings, varnished cap rail and engine box.
  box(-1.28,0,.49,4.80,2.29,.09,plank);
  for(let i=-8;i<=8;i++)box(-2.31,i*.126,.541,2.63,.009,.006,wood);
  box(-3.59,0,.76,.15,2.14,.11,wood);
  for(const s of [-1,1]){
    surface(sections.filter(k=>k.x<-.8).map(k=>[k.point(s,.84,1),[k.x,s*k.w*.84,.50]]),ivory);
    surface(sections.filter(k=>k.x<-.8).map(k=>[[k.x,s*k.w*.85,k.top+.006],[k.x,s*k.w*.97,k.top+.006]]),wood);
    for(const x of [-3.23,-2.94])rod([x,s*1.08,.78],[x+.04,s*1.05,.95],.022,steel);
    rod([-3.26,s*1.05,.96],[-2.87,s*1.05,.96],.025,steel);
  }
  // Low engine hatch leaves the middle of the fishing cockpit clear.
  box(-2.13,0,.55,1.03,.75,.026,wood);
  for(let j=-2;j<=2;j++)box(-2.13,j*.126,.568,1.01,.011,.006,plank);
  for(const side of [-1,1]){
    box(-2.52,side*.84,.68,1.70,.43,.24,ivory);
    for(const x of [-2.94,-2.11])cushion(x,side*.84,.80,.79,.43,.076,upholstery);
    cushion(-2.53,side*1.045,.87,1.64,.09,.16,upholstery);
  }
  cushion(-3.35,0,.71,.38,1.52,.09,upholstery);
  // Rounded swim platform, inset transom gate, folding boarding ladder.
  const platform=new T.Shape();platform.moveTo(-3.65,-1.06);platform.lineTo(-4.05,-1.04);
  platform.quadraticCurveTo(-4.18,-1.03,-4.18,-.85);platform.lineTo(-4.18,.85);
  platform.quadraticCurveTo(-4.18,1.03,-4.05,1.04);platform.lineTo(-3.65,1.06);platform.closePath();
  part(new T.ExtrudeGeometry(platform,{depth:.072,bevelEnabled:true,bevelSize:.025,bevelThickness:.014,bevelSegments:2}),white,[0,0,.10]);
  for(const side of [-1,1])rod([-4.10,side*.85,.12],[-3.62,side*.70,-.10],.022,steel);
  for(const y of [-.84,-.38]){rod([-3.80,y,.21],[-4.16,y,.21],.020,steel);rod([-4.16,y,.21],[-4.18,y,-.25],.020,steel);}
  for(const z of [.10,-.09,-.25])rod([-4.18,-.84,z],[-4.18,-.38,z],.017,steel);
  box(-3.745,.18,.55,.033,1.12,.40,trim);box(-3.766,.18,.55,.034,1.085,.375,white);
  rod([-3.79,-.20,.63],[-3.79,-.05,.63],.016,steel);
  for(const side of [-1,1])for(let i=0;i<4;i++)box(-2.59+.10*i,side*.618,.67,.05,.012,.080,trim);
  // The pilothouse is open aft. Sloping solid quarter panels carry the roof,
  // while the wheelhouse side windows and two raked screens remain see-through.
  for(const s of [-1,1]){
    surface([[[-1.85,s*1.06,.77],[-1.75,s*1.04,1.02],[-1.63,s*1.01,1.14]],
      [[-1.18,s*1.05,.79],[-1.18,s*1.01,1.42],[-1.12,s*.99,1.24]],
      [[-.83,s*1.05,.82],[-.83,s*1.005,1.24],[-.83,s*1.00,1.34]]],white);
    surface([[[-.84,s*1.05,.82],[-.83,s*1.00,1.34]],[[.50,s*.98,.94],[.50,s*.94,1.57]],[[1.26,s*.88,1.0],[1.19,s*.85,1.65]],[[1.82,s*.65,1.10],[1.83,s*.64,1.19]]],white);
    const A=[-.83,s*1.00,1.34],B=[1.19,s*.85,1.65],C=[.63,s*.83,2.09],D=[-.35,s*.89,2.14];
    surface([[A,D],[B,C]],0xffffff,glass);
    for(const [u,v] of [[A,D],[A,B],[C,D],[B,C],[[.27,s*.92,1.51],[-.08,s*.866,2.13]]])rod(u,v,.029,trim);
    surface([[[-1.82,s*1.035,.93],[-1.54,s*1.035,1.07]],
      [[-1.57,s*1.01,1.28],[-1.31,s*1.01,1.38]],
      [[-1.33,s*.97,1.68],[-1.09,s*.97,1.74]],
      [[-1.17,s*.93,2.01],[-.94,s*.93,2.02]],
      [[-1.21,s*.90,2.13],[-.96,s*.90,2.14]]],white);
    rod([-.83,s*1.00,1.34],[-.35,s*.89,2.14],.021,steel);
    rod([-1.56,s*1.02,1.10],[.51,s*.86,2.12],.016,steel);
    for(const x of [.74,1.34]){
      const y=x<1?.957:.847,z=1.225;
      pad(x,s*y,z,.158,.027,.058,steel,metal);pad(x,s*(y+.025),z,.123,.015,.038,trim);
    }
    const forward=sections.filter((k,i)=>k.x>-.65&&(i%2===0||i===36));
    const rail=forward.map(k=>[k.x,s*k.w*.94,k.top+.39]);
    rail.forEach((a,i)=>{if(i)rod(rail[i-1],a,.017,steel);if(i%3===0||i===rail.length-1)rod([a[0]-.035,a[1],a[2]-.39],a,.015,steel);});
    rod([-.75,s*.82,2.24],[.48,s*.77,2.23],.019,steel);
    for(const x of [-.75,.48])rod([x,s*.80,2.16],[x,s*.80,2.24],.015,steel);
  }
  const B=[1.19,-.85,1.65],C=[.63,-.83,2.09],D=[.63,.83,2.09],A=[1.19,.85,1.65];
  surface([[B,C],[A,D]],0xffffff,glass);
  for(const [u,v] of [[B,A],[A,D],[D,C],[C,B],[[1.19,0,1.65],[.63,0,2.09]]])rod(u,v,.030,trim);
  for(const s of [-1,1]){
    rod([1.13,s*.56,1.70],[.96,s*.33,1.83],.009,trim);
    rod([1.05,s*.55,1.76],[.83,s*.16,1.93],.011,trim);
  }
  surface([[[1.19,-.85,1.65],[1.19,.85,1.65]],[[1.83,-.65,1.19],[1.83,.65,1.19]],[[2.04,-.48,1.10],[2.04,.48,1.10]]],ivory);
  // Cambered roof with rounded corners and a dark drip moulding.
  const rim=new T.Shape();rim.moveTo(-1.24,-.78);rim.quadraticCurveTo(-1.24,-1.02,-1.01,-1.02);
  rim.lineTo(.57,-.95);rim.quadraticCurveTo(.82,-.95,.82,-.70);rim.lineTo(.82,.70);
  rim.quadraticCurveTo(.82,.95,.57,.95);rim.lineTo(-1.01,1.02);rim.quadraticCurveTo(-1.24,1.02,-1.24,.78);rim.closePath();
  for(const [z,color,depth] of [[2.12,trim,.026],[2.15,white,.046]])
    part(new T.ExtrudeGeometry(rim,{depth,bevelEnabled:true,bevelSegments:2,bevelSize:.022,bevelThickness:.012}),color,[0,0,z]);
  // Visible interior, including the companionway and the starboard helm.
  box(.39,0,.97,.68,1.79,.83,ivory);box(.0,.37,1.05,.03,.62,.52,trim);
  box(.33,-.39,1.40,.37,1.00,.21,trim);
  // Twin recessed helm displays face the seated operator. Draw bezel, chart,
  // sonar trace and separate switch bank on a single instrument face.
  const consoleTilt=new T.Euler(0,-.26,0);
  if(!sonarCanvas)for(const y of [-.61,-.19]){
    box(.101,y,1.54,.048,.39,.245,trim,consoleTilt);
    box(.064,y,1.54,.012,.342,.195,y<-.5?0x1d393d:0x427487,consoleTilt);
    for(let i=0;i<6;i++){
      const yy=y-.14+.050*i,zz=y<-.5?1.50+.03*Math.sin(i*1.7):1.49+.01*i;
      box(.052,yy,zz,.010,.04,.017,y<-.5?0xd9ad64:0x99ac70,consoleTilt);
    }
  }
  box(.025,-.48,1.26,.065,.87,.16,trim);
  box(.013,-.02,1.28,.06,.04,.20,wood);
  box(.00,-.90,1.18,.33,.18,.105,ivory);
  pad(-.01,-.90,1.238,.12,.061,.043,steel,metal);
  rod([-.04,-.90,1.23],[.019,-.90,1.37],.016,steel);
  pad(.019,-.90,1.38,.044,.032,.026,trim);
  for(let i=0;i<6;i++){
    const y=-.61+i*.076;
    box(-.014,y,1.27,.018,.041,.063,0x364144);
    pad(-.023,y,1.29,.007,.009,.005,i%3?0xaec3bb:0xe2b568);
  }
  const wheelCenter=v3(-.11,-.51,1.37);
  rod([.06,-.51,1.30],wheelCenter.toArray(),.045,trim);
  pad(-.128,-.51,1.37,.027,.042,.042,steel,metal);
  part(new T.TorusGeometry(.143,.012,8,40),steel,wheelCenter.toArray(),new T.Euler(0,Math.PI/2,0),null,metal);
  part(new T.TorusGeometry(.146,.009,8,40),trim,[-.115,-.51,1.37],new T.Euler(0,Math.PI/2,0));
  for(let i=0;i<3;i++){const a=i*2.094;rod(wheelCenter.toArray(),[-.11,-.51+.14*Math.cos(a),1.37+.14*Math.sin(a)],.008,steel);}
  for(const s of [-1,1]){
    rod([-.62,s*.53,.54],[-.62,s*.53,.90],.055,steel);
    cushion(-.63,s*.53,.90,.49,.44,.09,upholstery);cushion(-.83,s*.53,1.00,.11,.44,.22,upholstery);
    box(-1.06,s*.923,1.34,.23,.05,.092,wood);
  }
  rod([-.28,.18,2.22],[-.47,.18,3.00],.018,steel);
  rod([-.45,.18,2.87],[-.49,.18,3.18],.007,steel);
  rod([.09,-.51,2.22],[-.20,-.51,3.64],.009,steel);
  pad(.17,0,2.24,.21,.17,.065,white);
  rod([.17,0,2.23],[.17,0,2.40],.046,white);
  const radar=new T.Mesh(new T.SphereGeometry(1,18,8),new T.MeshStandardMaterial({color:white,roughness:.42}));
  radar.name='Rotating radar scanner';radar.position.set(.17,0,2.43);radar.scale.set(.075,.35,.044);group.add(radar);
  // Recessed hull ports behind stainless bezels.
  for(const side of [-1,1]){
    pad(-1.61,side*1.33,.62,.18,.027,.047,steel,metal);
    pad(-1.61,side*1.355,.62,.147,.012,.032,trim);
  }
  for(const s of [-1,1]){pad(.67,s*.91,2.14,.083,.027,.038,s>0?0x9a2926:0x277e50);}
  rod([-1.30,0,-.4],[-3.10,0,-.76],.043,brass);
  rod([-2.71,0,-.42],[-3.02,0,-.74],.037,brass);
  const propeller=new T.Group();propeller.position.set(-3.11,0,-.76);group.add(propeller);
  const fixed=(geometry,color,parent=group,basic=false)=>{
    const material=basic?new T.MeshBasicMaterial({color}):new T.MeshStandardMaterial({color,roughness:.44});
    const m=new T.Mesh(geometry,material);parent.add(m);return m;
  };
  for(let i=0;i<3;i++){
    const blade=fixed(new T.SphereGeometry(1,10,8),brass,propeller),a=2*Math.PI*i/3;
    blade.position.set(0,.14*Math.cos(a),.14*Math.sin(a));blade.scale.set(.040,.169,.078);blade.rotation.set(a,.26,.20,'XYZ');
  }
  const rudder=fixed(new T.BoxGeometry(.34,.056,.43),brass);rudder.position.set(-3.45,0,-.61);
  // Round, flush-mounted downlights. The lens face, opaque-scene light and
  // optical scattering use the same position and boat-frame negative Z axis.
  const bezel=new T.CylinderGeometry(.081,.081,.025,16);bezel.rotateX(Math.PI/2);
  const disk=new T.CircleGeometry(.063,16);disk.rotateY(Math.PI);
  const emitters=new T.InstancedMesh(disk,new T.MeshBasicMaterial({color:0xffd38a}),hullLamps.length);
  emitters.name='Underwater downlight lenses';group.add(emitters);
  const underwaterLamps=hullLamps.map(([x,y,z],i)=>{
    part(bezel.clone(),steel,[x,y,z+.015],null,null,metal);
    emitters.setMatrixAt(i,new T.Matrix4().makeTranslation(x,y,z));
    const flood=i===1||i===8;
    const led=new T.SpotLight(0xffc476,flood?122:62,flood?22:11,.91,.89,1.25);
    led.name='Hull downlight '+(i+1);
    led.userData.scatterGain=.24;led.userData.diffuseHullOnly=!flood;
    if(!flood)led.layers.set(31); // Overlapping hull glow carries these fixtures in the water.
    led.position.set(x,y,z-.002);led.target.position.set(x,y,z-1.002);
    group.add(led,led.target);return led;
  });
  bezel.dispose();
  // Hull-mounted camera housings terminate just behind their optical ports.
  for(const [x,y,z,sign,base] of [[2.68,-.38,-.74,1,-.25],[-3.74,.63,-.73,-1,-.20]]){
    rod([x-.12*sign,y,base],[x-.08*sign,y,z],.041,steel);
    rod([x-.16*sign,y,z+.066],[x+.066*sign,y,z-.027],.067,trim);
  }
  const swivel=new T.Group();swivel.name='Roof searchlight';swivel.position.set(.56,0,searchlightHeight);group.add(swivel);
  rod([.56,0,2.18],[.56,0,searchlightHeight-.035],.043,steel);
  const housing=fixed(new T.CylinderGeometry(.116,.129,.18,18),steel,swivel);
  housing.rotation.z=-Math.PI/2;
  const lens=fixed(new T.CircleGeometry(.11,20),0xfff1c6,swivel,true);
  lens.rotation.y=Math.PI/2;lens.position.x=.096;
  const light=new T.SpotLight(0xffedcd,125,48,.21,.65,1.25);light.position.set(.097,0,0);
  light.name='Roof searchlight emitter';
  light.target.position.set(1,0,0);swivel.add(light,light.target);
  installSearchlightDepth(T);
  const resolution=64,depthPixels=new Uint8Array(4*resolution*resolution);
  const depthMap=new T.DataTexture(depthPixels,resolution,resolution);light.map=depthMap;light.shadow.camera.near=.055;
  const worldOrigin=new T.Vector3(),direction=new T.Vector3(),inverseBody=new T.Quaternion();
  let lastBearing,lastTilt;
  function updateSearchDepth(){
    light.updateWorldMatrix(true,false);light.target.updateWorldMatrix(true,false);
    group.getWorldQuaternion(inverseBody);light.shadow.camera.up.set(0,0,1).applyQuaternion(inverseBody);
    light.shadow.updateMatrices(light);
    if(lastBearing===swivel.rotation.z&&lastTilt===swivel.rotation.y)return;
    lastBearing=swivel.rotation.z;lastTilt=swivel.rotation.y;inverseBody.invert();
    light.getWorldPosition(worldOrigin);
    const origin=beam.material.uniforms.lensInHull.value;
    for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
      direction.set((2*x+1)/resolution-1,(2*y+1)/resolution-1,.5).unproject(light.shadow.camera)
        .sub(worldOrigin).normalize().applyQuaternion(inverseBody);
      const depth=Math.round(65535*deckHit(origin,direction,48)/48),k=4*(y*resolution+x);
      depthPixels[k]=depth>>8;depthPixels[k+1]=depth&255;depthPixels[k+3]=1;
    }
    depthMap.needsUpdate=true;
  }
  const beam=new T.Mesh(new T.ConeGeometry(1,1,24,1,true),new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.FrontSide,
    uniforms:{beamToHull:{value:new T.Matrix4()},lensInHull:{value:new T.Vector3()}},
    vertexShader:'uniform mat4 beamToHull;varying vec3 localPoint;varying vec2 v;void main(){v=uv;localPoint=(beamToHull*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`${cruiserBeamGLSL}
     uniform vec3 lensInHull;varying vec3 localPoint;varying vec2 v;void main(){
       if(cruiserBlocksBeam(lensInHull,localPoint))discard;
       gl_FragColor=vec4(1.,.91,.72,.10*pow(v.y,2.));
     }`}));swivel.add(beam);
  beam.geometry.rotateZ(Math.PI/2);beam.scale.set(15,2.6,2.6);beam.position.x=7.61;
  for(const [material,b] of batches){
    const g=new T.BufferGeometry();
    for(const [attribute,data] of [['position',b.p],['normal',b.n],['color',b.c]])g.setAttribute(attribute,new T.Float32BufferAttribute(data,3));
    g.setIndex(b.ix);const m=new T.Mesh(g,material);group.add(m);
  }
  // Fit a live echogram and chart to the local helm. The display faces aft and
  // slightly upward, allowing the helmsman to see through the windshield.
  let panel,lastPanel=-Infinity;
  if(sonarCanvas){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=176;
    const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);
    texture.colorSpace=T.SRGBColorSpace;
    const face=new T.Mesh(new T.PlaneGeometry(.82,.265),new T.MeshBasicMaterial({map:texture}));
    face.position.set(.033,-.40,1.55);
    face.rotation.set(Math.PI/2,0,-Math.PI/2,'ZXY');
    face.rotateX(-.28);group.add(face);
    panel=(rpm)=>{
      const heading=group.rotation.z,pos=group.position;
      ctx.fillStyle='#152028';ctx.fillRect(0,0,512,176);
      ctx.drawImage(sonarCanvas,8,27,235,117);
      ctx.fillStyle='#285366';ctx.fillRect(267,27,237,117);
      function chart(x,y){return [387+(x-pos.x)*2.4,86-(y-pos.y)*2.4];}
      ctx.save();ctx.beginPath();ctx.rect(267,27,237,117);ctx.clip();
      ctx.strokeStyle='#4b7381';ctx.lineWidth=1;
      for(let i=-3;i<=3;i++){
        const gx=387+24*i-(pos.x*2.4)%24,gy=86+24*i+(pos.y*2.4)%24;
        ctx.beginPath();ctx.moveTo(gx,27);ctx.lineTo(gx,144);ctx.moveTo(267,gy);ctx.lineTo(504,gy);ctx.stroke();
      }
      const [ix,iy]=chart(36,40);ctx.fillStyle='#99a77d';ctx.beginPath();ctx.ellipse(ix,iy,41,26,0,0,Math.PI*2);ctx.fill();
      ctx.translate(387,86);ctx.rotate(Math.PI/2-heading);ctx.fillStyle='#fff2bd';ctx.beginPath();
      ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.restore();
      ctx.fillStyle='#d6e8ec';ctx.font='bold 14px sans-serif';
      ctx.fillText('3D IMAGING SONAR',10,19);ctx.fillText('HARBOR CHART',271,19);
      ctx.font='13px monospace';ctx.fillText('0–36 m',10,163);ctx.fillText(Math.round(Math.abs(rpm))+' RPM',133,163);
      const bearing=(450-heading*180/Math.PI)%360;
      ctx.fillText('HDG '+Math.round(bearing)+'°',270,163);ctx.fillText('10 m/div',428,163);
      texture.needsUpdate=true;
    };
  }
  let previousTime,shaftRPM=0;
  function update(t,rpm,steer,settings,seaTime=t){
    radar.rotation.z=(seaTime%2.5)*(2*Math.PI/2.5);
    if(previousTime!==undefined)propeller.rotation.x+=(t-previousTime)*rpm*Math.PI/30;
    previousTime=t;shaftRPM=rpm;rudder.rotation.z=steer;
    if(panel&&t-lastPanel>=.2){panel(rpm);lastPanel=t;}
    emitters.visible=Boolean(settings[1]);
    for(const led of underwaterLamps)led.visible=emitters.visible;
    swivel.rotation.set(0,settings[3],settings[2],'ZYX');
    swivel.updateMatrix();beam.updateMatrix();
    beam.material.uniforms.beamToHull.value.multiplyMatrices(swivel.matrix,beam.matrix);
    beam.material.uniforms.lensInHull.value.copy(light.position).applyMatrix4(swivel.matrix);
    if(settings[0])updateSearchDepth();
    light.visible=beam.visible=lens.visible=Boolean(settings[0]);
  }
  function dispose(){
    depthMap.dispose();
    const geometries=new Set(),materials=new Set();
    group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    for(const g of geometries)g.dispose();
    for(const m of materials){m.map?.dispose();m.dispose();}
  }
  const lamps=[{swivel,light,beam,lens,under:underwaterLamps[1]},{under:underwaterLamps[8]}];
  return {group,update,lamps,searchlight:{swivel,light},underwaterLamps,dispose,get shaftRPM(){return shaftRPM;}};
}
