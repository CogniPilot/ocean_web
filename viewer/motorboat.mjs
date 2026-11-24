import {sonarMount} from './cruiser-sonar-view.mjs';

// Seven-and-a-half metre inboard sportfisher. Bow +X, port +Y, up +Z.
// Underside lens centres in the boat frame, 23 mm below the bottom plating.
export const hullLamps=[-1,1].flatMap(side=>[
  [-3.599,side*.759,-.288],[-2.750,side*.864,-.380],[-.200,side*.905,-.437],
  [1.590,side*.761,-.358],[2.765,side*.395,-.083]
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
const hullSections=[[-3.74,1.07,.77,-.39],[-3.53,1.19,.78,-.44],[-2.75,1.29,.80,-.52],
  [-1.55,1.36,.84,-.57],[-.20,1.35,.91,-.61],[1.05,1.24,1.00,-.58],[2.1,1.00,1.11,-.49],
  [2.93,.67,1.20,-.32],[3.49,.33,1.27,-.06],[3.80,.018,1.32,.25]];
const hullPlating=[[1,1],[.993,.87],[.972,.65],[.931,.43],[.85,.23],[.57,.12],[.27,.045],[0,0]];
const cabinPorts={stations:[1.64,2.15],height:.69,radiusX:.157,radiusZ:.118};
// Use an inset of the same stations as the render hull to exclude the
// exterior water surface from the sealed hull and recessed cockpit.
export const cruiserHullGLSL=`
 uniform vec2 cruiserTilt[5];uniform int cruiserCount;uniform vec4 cruiserPose[5],cruiserAim[5];
 vec3 cruiserLocal(vec3 surface,vec4 pose,vec2 tilt){
   vec2 forward=vec2(cos(pose.w),sin(pose.w)),delta=surface.xy-pose.xy;
   vec2 horizontal=vec2(dot(delta,forward),dot(delta,vec2(-forward.y,forward.x)));
   float dz=surface.z-pose.z;
   float unpitchedZ=sin(tilt.y)*horizontal.x+cos(tilt.y)*dz;
   return vec3(cos(tilt.y)*horizontal.x-sin(tilt.y)*dz,
               cos(tilt.x)*horizontal.y+sin(tilt.x)*unpitchedZ,
               -sin(tilt.x)*horizontal.y+cos(tilt.x)*unpitchedZ);
 }
 vec3 cruiserSectionAt(float station){
   ${hullSections.slice(1).map(([end,...right],i)=>{
     const [start,...left]=hullSections[i];
     return `${i?'else ':''}if(station<=${glslFloat(end)})return mix(vec3(${left.map(glslFloat).join(',')}),vec3(${right.map(glslFloat).join(',')}),clamp((station-(${glslFloat(start)}))/${glslFloat(end-start)},0.,1.));`;
   }).join('\n')}
   return vec3(.018,1.32,.25);
 }
 float cruiserStemX(float station,float z,vec3 shape){
   float rake=.8*pow(max(0.,(station-1.5)/2.3),2.);
   float alongHeight=clamp((z-shape.z)/(shape.y-shape.z),0.,1.);
   return station-rake*(1.-alongHeight);
 }
 bool cruiserWaterExcluded(vec3 world){
   for(int i=0;i<5;i++){
     if(i>=cruiserCount)break;
     vec4 pose=cruiserPose[i];
     vec2 d=world.xy-pose.xy;
     if(dot(d,d)>18.)continue;
     vec3 p=cruiserLocal(world,pose,cruiserTilt[i]);
     if(p.x < -3.74 || p.x > 3.72 || abs(p.y)>1.37 || p.z < -.76 || p.z > 1.36)continue;
     float station=p.x;
     if(p.x>1.5){
       // Invert the forefoot's station-dependent rake at this height, just as
       // the hull loft moves each section aft below the deck line.
       if(p.x>=cruiserStemX(3.8,p.z,cruiserSectionAt(3.8))-.006)continue;
       float lo=p.x,hi=3.8;
       for(int stepIndex=0;stepIndex<7;stepIndex++){
         float mid=(lo+hi)*.5;
         if(cruiserStemX(mid,p.z,cruiserSectionAt(mid))<p.x)lo=mid;
         else hi=mid;
       }
       station=(lo+hi)*.5;
     }
     vec3 section=cruiserSectionAt(station);
     float transom=-3.74+.14*pow(min(1.,abs(p.y)/1.07),2.);
     if(p.x<transom+.004)continue;
     float keel=section.z-.18*clamp((3.5-station)/2.1,0.,1.);
     if(p.z<=keel || p.z>=section.y+.045)continue;
     float t=(p.z-keel)/(section.y-keel);
     float shape=mix(.80,.987,smoothstep(.2,1.,t))*min(1.,t/.31);
     if(abs(p.y)<section.x*shape-.018)return true;
   }
   return false;
 }`;
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
export function cabinCruiser(T,sonarCanvas,chartCanvas){
  const group=new T.Group();group.name='Cabin cruiser';group.rotation.order='ZYX';
  const ivory=0xe7e9df,white=0xf4f4eb,wood=0x966943,plank=0xae865d,trim=0x253b40,
    steel=0xb8c9c8,brass=0xb29255,upholstery=0xdfddca;
  const solid=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.62}),
    metal=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.33,metalness:.35}),
    glass=new T.MeshPhongMaterial({color:0x6e9da2,transparent:true,opacity:.32,specular:0xccdfe4,
      shininess:85,side:T.DoubleSide,depthWrite:false});
  const panelCentres=[-2.56,-.25,2.10,-2.56,-.25,2.10];
  const integrity=panelCentres.map(()=>({value:100})),breachRadius=panelCentres.map(()=>({value:0}));
  const panelMaterials=[...integrity].map((condition,index)=>{
    const material=solid.clone();
    material.name='Hull panel '+(index+1);
    material.onBeforeCompile=shader=>{
      shader.uniforms.panelCondition=condition;
      shader.uniforms.holeRadius=breachRadius[index];
      shader.uniforms.holeX={value:panelCentres[index]};
      shader.vertexShader='varying vec3 hullPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n hullPoint=position;');
      shader.fragmentShader='varying vec3 hullPoint;uniform float panelCondition,holeRadius,holeX;\n'+
        shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          vec2 portSize=vec2(${cabinPorts.radiusX},${cabinPorts.radiusZ});
          vec2 portA=(hullPoint.xz-vec2(${cabinPorts.stations[0]},${cabinPorts.height}))/portSize;
          vec2 portB=(hullPoint.xz-vec2(${cabinPorts.stations[1]},${cabinPorts.height}))/portSize;
          if(abs(hullPoint.y)>.54&&min(dot(portA,portA),dot(portB,portB))<1.)discard;
          vec2 rel=hullPoint.xz-vec2(holeX,-.30);
          float bearing=atan(rel.y,rel.x);
          float edge=holeRadius*(1.+.15*sin(9.*bearing)+.12*sin(17.*bearing));
          float gap=length(rel);
          if(holeRadius>0.&&gap<edge)discard;
          float rim=(1.-smoothstep(edge,edge+.10,gap))*step(.001,holeRadius);
          float worn=1.-panelCondition/100.;
          float pores=sin(132.*hullPoint.x+19.*hullPoint.z)*sin(96.*hullPoint.z);
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.62,.53,.43),.50*worn+.30*rim);
          diffuseColor.rgb*=1.-.16*worn*step(.6,pores);
        `);
    };
    return material;
  });
  const panelMeshes=[];
  // Hull, pilothouse and fittings are fixed relative to one another. Bake them
  // by surface finish so a distant peer's grab rails take a single draw call.
  const batches=new Map(),v3=(x,y,z)=>new T.Vector3(x,y,z);
  function collectPart(geometry,color,matrix,material,collection){
    geometry.applyMatrix4(matrix);
    let batch=collection.get(material);
    if(!batch){
      batch={attributes:{position:[],normal:[],color:[]},indices:[]};
      if(material.map)batch.attributes.uv=[];
      collection.set(material,batch);
    }
    const positions=geometry.attributes.position,offset=batch.attributes.position.length/3;
    const rgb=new T.Color(color);
    for(const [name,data] of Object.entries(batch.attributes)){
      if(name==='color'){
        for(let i=0;i<positions.count;i++)data.push(rgb.r,rgb.g,rgb.b);
      }else{
        const source=geometry.attributes[name];
        for(let i=0;i<source.array.length;i++)data.push(source.array[i]);
      }
    }
    const index=geometry.index;
    for(let i=0;i<(index?.count??positions.count);i++)batch.indices.push(offset+(index?index.getX(i):i));
    geometry.dispose();
  }
  function part(geometry,color,pos,rot,scale,material=solid){
    const matrix=new T.Matrix4().compose(v3(...(pos??[0,0,0])),
      new T.Quaternion().setFromEuler(rot??new T.Euler()),v3(...(scale??[1,1,1])));
    collectPart(geometry,color,matrix,material,batches);
  }
  function addBatch(parent,material,batch){
    const geometry=new T.BufferGeometry();
    for(const [name,data] of Object.entries(batch.attributes))
      geometry.setAttribute(name,new T.Float32BufferAttribute(data,name==='uv'?2:3));
    geometry.setIndex(batch.indices);
    const mesh=new T.Mesh(geometry,material);
    parent.add(mesh);
    return mesh;
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
  function roundedSeat(l,w,h){
    const r=Math.min(.075,l*.18,w*.18),c=new T.Shape();
    c.moveTo(-l/2+r,-w/2);c.lineTo(l/2-r,-w/2);c.quadraticCurveTo(l/2,-w/2,l/2,-w/2+r);
    c.lineTo(l/2,w/2-r);c.quadraticCurveTo(l/2,w/2,l/2-r,w/2);
    c.lineTo(-l/2+r,w/2);c.quadraticCurveTo(-l/2,w/2,-l/2,w/2-r);
    c.lineTo(-l/2,-w/2+r);c.quadraticCurveTo(-l/2,-w/2,-l/2+r,-w/2);
    return new T.ExtrudeGeometry(c,{depth:h,bevelSize:.015,bevelThickness:.015,bevelSegments:3});
  }
  function cushion(x,y,z,l,w,h,color){
    part(roundedSeat(l,w,h),color,[x,y,z]);
  }
  function surface(rows,color,material=solid){
    const g=new T.BufferGeometry(),n=rows[0].length,indices=[];
    for(let i=1;i<rows.length;i++)for(let j=1;j<n;j++){
      const a=(i-1)*n+j-1,b=a+n;indices.push(a,b,a+1,a+1,b,b+1);
    }
    g.setAttribute('position',new T.Float32BufferAttribute(rows.flat(2),3));
    g.setIndex(indices);g.computeVertexNormals();part(g,color,null,null,null,material);
  }
  // Keep the deck and chine fixed while deepening the keel below the chine.
  // The forefoot rises into the raked stem. Port and starboard share the keel.
  const widths=new T.CatmullRomCurve3(hullSections.map(([x,w,top])=>v3(x,w,top))),
    keels=new T.CatmullRomCurve3(hullSections.map(([x,w,top,k])=>v3(x,k,0)));
  const sections=[];
  for(let i=0;i<=36;i++){
    const {x,y:w,z:top}=widths.getPoint(i/36),k=keels.getPoint(i/36).y;
    const rake=Math.max(0,(x-1.5)/2.3)**2*.8,round=Math.max(0,(-3.39-x)/.35)*.14;
    const keelDrop=.18*Math.min(1,Math.max(0,(3.5-x)/2.1));
    function point(side,f,t){
      return [x-rake*(1-t)+round*f*f,side*w*f,k+(top-k)*t-keelDrop*Math.max(0,1-t/.23)];
    }
    sections.push({x,w,top,k,point});
  }
  for(const side of [-1,1]){
    const row=(k,f,t)=>k.point(side,f,t);
    const splits=[0,sections.findIndex(k=>k.x>=-1.40),sections.findIndex(k=>k.x>=.95),sections.length-1];
    for(let i=0;i<3;i++){
      const plating=sections.slice(splits[i],splits[i+1]+1),material=panelMaterials[i+(side>0?0:3)];
      surface(plating.map(k=>hullPlating.slice(0,5).map(([f,t])=>row(k,f,t))),ivory,material);
      surface(plating.map(k=>hullPlating.slice(4).map(([f,t])=>row(k,f,t))),0x9f9e96,material);
    }
    // Molded lifting strakes fade into the forward V rather than extending
    // all the way to the bow. The bottom remains one continuous plating mesh.
    for(const [fraction,t,slope] of [[.27,.045,.25],[.57,.12,.393]]){
      surface(sections.filter(k=>k.x<2.8).map(k=>{
        const fade=Math.min(1,Math.max(0,(2.8-k.x)/1.4));
        const width=.06*fade,outer=row(k,fraction+width,t+slope*width);
        const upper=row(k,fraction,t);
        return [upper,[outer[0],outer[1],outer[2]-.033*fade],outer];
      }),0xb9bab0);
    }
    // The bootstripe follows the design waterline, including the raked forefoot.
    function stripe(k,z){
      const t=Math.max(0,Math.min(1,(z-k.k)/(k.top-k.k)));
      const f=t>.43?.931+(t-.43)*.041/.22:t>.23?.85+(t-.23)*.081/.20:.85*t/.23;
      return row(k,f+.005,t);
    }
    surface(sections.map(k=>[stripe(k,.070),stripe(k,.025)]),trim);
    surface(sections.map(k=>[row(k,1.003,.986),row(k,1.006,.946)]),trim);
    surface(sections.map(k=>[row(k,1,1),row(k,.83,1)]),white);
    const window=sections.filter(k=>k.x>-.55&&k.x<1.43);
    surface(window.map((k,i)=>{
      const u=i/(window.length-1),height=.092*Math.sqrt(Math.max(0,Math.sin(Math.PI*u)));
      const mid=.77+.055*u;
      return [row(k,.975+(mid+height-.65)*.09,mid+height),row(k,.975+(mid-height-.65)*.09,mid-height)];
    }),0x22383f);
  }
  const stern=sections[0],stem=sections.at(-1);
  for(const end of [stern,stem])surface([[-1,1].map(s=>end.point(s,1,1)),[-1,1].map(s=>end.point(s,.93,.43)),[-1,1].map(s=>end.point(s,.85,.23)),[-1,1].map(s=>end.point(s,0,0))],ivory);
  const [sonarX,sonarY,sonarZ]=sonarMount;
  pad(sonarX-.06,sonarY,sonarZ+.029,.17,.095,.047,trim);
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
  surface([[[1.19,-.85,1.65],[1.19,.85,1.65]],[[1.83,-.65,1.19],[1.83,.65,1.19]],[[2.04,-.48,1.10],[2.04,.48,1.10]]],ivory);
  // Cambered roof with rounded corners and a dark drip moulding.
  const rim=new T.Shape();rim.moveTo(-1.24,-.78);rim.quadraticCurveTo(-1.24,-1.02,-1.01,-1.02);
  rim.lineTo(.57,-.95);rim.quadraticCurveTo(.82,-.95,.82,-.70);rim.lineTo(.82,.70);
  rim.quadraticCurveTo(.82,.95,.57,.95);rim.lineTo(-1.01,1.02);rim.quadraticCurveTo(-1.24,1.02,-1.24,.78);rim.closePath();
  for(const [z,color,depth] of [[2.12,trim,.026],[2.15,white,.046]])
    part(new T.ExtrudeGeometry(rim,{depth,bevelEnabled:true,bevelSegments:2,bevelSize:.022,bevelThickness:.012}),color,[0,0,z]);
  // Visible interior, including the companionway and the starboard helm.
  box(.39,0,.97,.68,1.79,.83,ivory);
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
  const propeller=new T.Group();propeller.position.set(-3.11,0,-.76);propeller.userData.physicsJoint={axis:[1,0,0],label:'Propeller shaft'};group.add(propeller);
  const fixed=(geometry,color,parent=group,basic=false)=>{
    const material=basic?new T.MeshBasicMaterial({color}):new T.MeshStandardMaterial({color,roughness:.44});
    const m=new T.Mesh(geometry,material);parent.add(m);return m;
  };
  const cabin=new T.Group();cabin.name='Forward cabin';group.add(cabin);
  const cabinObjects=new Map();
  let electricalPower=true;
  function cabinPart(g,color,position,parent=cabin,basic=false){
    const piece=fixed(g,color,parent,basic);
    piece.position.set(...position);return piece;
  }
  const deckObjects=new Map(),helmIndicators=new Map(),wiperPivots=[];
  const companionway=new T.Group();companionway.name='Companionway door';
  companionway.position.set(-.020,.42,1.02);group.add(companionway);
  cabinPart(new T.BoxGeometry(.055,.63,.61),0x4c3a2b,[0,0,0],companionway);
  cabinPart(new T.BoxGeometry(.025,.55,.53),0x8f724e,[-.036,0,0],companionway);
  for(let i=0;i<4;i++)cabinPart(new T.BoxGeometry(.012,.50,.006),0x6b5139,
    [-.051,0,-.173+i*.106],companionway);
  const latch=cabinPart(new T.CylinderGeometry(.013,.013,.105,10),0xbac5c5,[-.069,.15,.072],companionway);
  latch.rotation.x=Math.PI/2;deckObjects.set('cabin',companionway);
  for(const [i,id] of ['search','underwater','wipers','anchor'].entries()){
    const mount=new T.Group();
    mount.name=id+' switch';mount.position.set(-.034,-.62+i*.101,1.275);group.add(mount);
    cabinPart(new T.BoxGeometry(.020,.066,.061),0x293d40,[0,0,0],mount);
    const rocker=cabinPart(new T.BoxGeometry(.016,.043,.038),0x5b6765,[-.014,0,0],mount);
    const light=cabinPart(new T.BoxGeometry(.009,.022,.009),0x61726a,[-.024,0,.012],mount);
    helmIndicators.set(id,{rocker,light});deckObjects.set(id,mount);
  }
  function setHelmSwitch(id,on){
    const {rocker,light}=helmIndicators.get(id);
    rocker.rotation.y=on?.23:-.23;
    light.material.emissive.setHex(on&&electricalPower?0x44e7a9:0);
    light.material.emissiveIntensity=on&&electricalPower?.85:0;
  }
  const upWindshield=v3(-.56,0,.44).normalize(),acrossWindshield=v3(0,1,0);
  const glassFrame=new T.Matrix4().makeBasis(acrossWindshield,upWindshield,
    v3(0,0,0).crossVectors(acrossWindshield,upWindshield));
  for(const side of [-1,1]){
    const mount=new T.Group();mount.position.set(1.176,side*.43,1.676);
    mount.quaternion.setFromRotationMatrix(glassFrame);group.add(mount);
    cabinPart(new T.CylinderGeometry(.031,.031,.025,14),trim,[0,0,0],mount).rotation.x=Math.PI/2;
    const pivot=new T.Group();pivot.name='Windshield wiper';mount.add(pivot);wiperPivots.push(pivot);
    cabinPart(new T.BoxGeometry(.012,.24,.015),trim,[0,.122,.014],pivot);
    cabinPart(new T.BoxGeometry(.020,.31,.015),0x121416,[.018,.287,.005],pivot);
  }
  function setWiper(angle){for(const pivot of wiperPivots)pivot.rotation.z=angle-.68;}
  setWiper(0);
  const anchorMesh=new T.Group();anchorMesh.name='Bow anchor';anchorMesh.visible=false;group.add(anchorMesh);
  const anchorMetal=0x8f9a9a;
  cabinPart(new T.BoxGeometry(.028,.032,.29),anchorMetal,[0,0,-.12],anchorMesh);
  cabinPart(new T.CylinderGeometry(.014,.014,.29,10),anchorMetal,[0,0,-.23],anchorMesh);
  for(const sign of [-1,1]){
    const fluke=cabinPart(new T.BoxGeometry(.16,.12,.016),anchorMetal,[.045,sign*.102,-.24],anchorMesh);
    fluke.rotation.y=-.44;
  }
  const rodeGeometry=new T.BufferGeometry(),rodePositions=new Float32Array(17*3);
  rodeGeometry.setAttribute('position',new T.BufferAttribute(rodePositions,3).setUsage(T.DynamicDrawUsage));
  const rode=new T.Line(rodeGeometry,new T.LineBasicMaterial({color:0x8e8d75}));
  rode.frustumCulled=false;rode.visible=false;group.add(rode);
  const anchorPoint=v3(0,0,0),rollerPoint=v3(0,0,0),anchorRotation=new T.Quaternion();
  function setAnchor(row){
    if(!row){anchorMesh.visible=false;rode.visible=false;return;}
    anchorMesh.visible=true;
    group.updateWorldMatrix(true,false);
    const paid=row[10];
    anchorPoint.fromArray(row);rollerPoint.fromArray(row,7);
    group.worldToLocal(anchorPoint);group.worldToLocal(rollerPoint);
    anchorMesh.position.copy(anchorPoint);
    anchorMesh.quaternion.copy(group.quaternion).invert().multiply(anchorRotation.fromArray([row[4],row[5],row[6],row[3]]));
    rode.visible=paid>.22;
    if(!rode.visible)return;
    const slack=Math.min(1.4,.22*Math.max(0,paid-anchorPoint.distanceTo(rollerPoint)));
    for(let i=0;i<17;i++){
      const u=i/16;
      rodePositions[3*i]=T.MathUtils.lerp(rollerPoint.x,anchorPoint.x,u);
      rodePositions[3*i+1]=T.MathUtils.lerp(rollerPoint.y,anchorPoint.y,u);
      rodePositions[3*i+2]=T.MathUtils.lerp(rollerPoint.z,anchorPoint.z,u)-4*u*(1-u)*(1-u)*slack;
    }
    rodeGeometry.attributes.position.needsUpdate=true;
  }
  // Intersect the rendered plating triangles so fittings and joinery follow
  // both the narrowing bow in plan and the V of the lower hull in section.
  const bowPlating=sections.filter(section=>section.x>1)
    .map(section=>hullPlating.map(([f,t])=>v3(...section.point(1,f,t))));
  const mouldRay=new T.Ray(v3(0,2,0),v3(0,-1,0)),mouldHit=v3(0,0,0);
  function bowHalfBeam(x,z){
    mouldRay.origin.set(x,2,z);
    for(let i=1;i<bowPlating.length;i++){
      const aft=bowPlating[i-1],forward=bowPlating[i];
      if(x<aft.at(-1).x||x>forward[0].x)continue;
      for(let j=1;j<aft.length;j++){
        if(mouldRay.intersectTriangle(aft[j-1],forward[j-1],aft[j],false,mouldHit)||
           mouldRay.intersectTriangle(aft[j],forward[j-1],forward[j],false,mouldHit))return mouldHit.y;
      }
    }
    return 0;
  }
  const cabinWood=0x805538,ivoryLining=0xe9e1cd;
  const cabinAft=1.19,cabinFore=2.80,cabinSole=.23,cabinInset=.052;
  const cabinRoof=x=>.963+.118*(x-cabinAft);
  const innerBeam=(x,z)=>bowHalfBeam(x,z)-cabinInset;
  function cabinSurface(geometry,color,name,place){
    const points=geometry.attributes.position;
    for(let i=0;i<points.count;i++)points.setXYZ(i,...place(points.getX(i),points.getY(i),points.getZ(i)));
    geometry.computeVertexNormals();
    const mesh=cabinPart(geometry,color,[0,0,0]);
    mesh.name=name;mesh.material.side=T.DoubleSide;
    return mesh;
  }
  for(const [name,height,color] of [['Cabin sole',()=>cabinSole,0xa17e5b],['Cabin ceiling',cabinRoof,ivoryLining]]){
    cabinSurface(new T.PlaneGeometry(cabinFore-cabinAft,2,24,1),color,name,(u,v)=>{
      const x=u+(cabinAft+cabinFore)/2,z=height(x);
      return [x,v*innerBeam(x,z),z];
    });
  }
  for(let i=-5;i<=5;i++){
    cabinSurface(new T.PlaneGeometry(cabinFore-cabinAft,.004,24,1),0x624a35,'Cabin sole seam',(u,v)=>{
      const x=u+(cabinAft+cabinFore)/2;
      return [x,i*.175*innerBeam(x,cabinSole)+v,cabinSole+.0015];
    });
  }
  cabinSurface(new T.PlaneGeometry(2,1,1,16),cabinWood,'Cabin forward bulkhead',(u,v)=>{
    const z=T.MathUtils.lerp(cabinSole,cabinRoof(cabinFore),v+.5);
    return [cabinFore,u*innerBeam(cabinFore,z),z];
  });
  const {stations:portStations,height:portHeight,radiusX,radiusZ}=cabinPorts;
  const portRim=.013;
  for(const side of [-1,1]){
    const lining=new T.Shape();
    lining.moveTo(cabinAft,cabinSole);lining.lineTo(cabinFore,cabinSole);
    lining.lineTo(cabinFore,cabinRoof(cabinFore));lining.lineTo(cabinAft,cabinRoof(cabinAft));lining.closePath();
    for(const x of portStations){
      const hole=new T.Path();hole.absellipse(x,portHeight,radiusX,radiusZ,0,2*Math.PI,true);lining.holes.push(hole);
    }
    cabinSurface(new T.ShapeGeometry(lining,24),ivoryLining,'Cabin side liner',
      (x,z)=>[x,side*innerBeam(x,z),z]);
    for(const station of portStations){
      for(const [name,offset] of [['Cabin inner port rim',-cabinInset-.004],['Cabin outer port rim',.003]]){
        const rim=cabinSurface(new T.TorusGeometry(radiusX,portRim,10,36),0xa6a9a2,name,(u,v,w)=>{
          const x=station+u,z=portHeight+v*radiusZ/radiusX;
          return [x,side*(bowHalfBeam(x,z)+offset+w),z];
        });
        rim.material.metalness=.62;
      }
      const pane=cabinSurface(new T.CircleGeometry(radiusX,36),0xa6d4e0,'Cabin port glass',(u,v)=>{
        const x=station+u,z=portHeight+v*radiusZ/radiusX;
        return [x,side*(bowHalfBeam(x,z)-cabinInset/2),z];
      });
      pane.material.dispose();pane.material=glass.clone();pane.material.opacity=.18;
    }
  }
  // Port settee and a drop-leaf table leave a narrow central aisle.
  const oatCloth=0xd3c9b0,piping=0xa99479,cabinetEdge=0x573925;
  cabinPart(new T.BoxGeometry(.97,.30,.148),cabinWood,[2.08,.431,.305]);
  for(const x of [1.78,2.08,2.38]){
    cabinPart(roundedSeat(.271,.277,.044),oatCloth,[x,.434,.384]).material.roughness=.88;
    cabinPart(roundedSeat(.271,.199,.037),oatCloth,[x,.556,.487]).rotation.x=Math.PI/2;
    cabinPart(new T.BoxGeometry(.242,.005,.009),piping,[x,.281,.423]);
  }
  const table=cabinPart(roundedSeat(.48,.235,.020),0xdbceae,[1.99,.205,.568]);
  table.material.roughness=.54;
  const tableLeg=cabinPart(new T.CylinderGeometry(.015,.020,.307,16),steel,[2.05,.208,.394]);
  tableLeg.rotation.x=Math.PI/2;tableLeg.material.metalness=.62;

  // Starboard galley. The pale worktop and steel rim catch the cabin light.
  cabinPart(new T.BoxGeometry(.88,.305,.319),cabinWood,[2.10,-.437,.390]).material.roughness=.33;
  cabinPart(roundedSeat(.858,.305,.025),0xe2d9bf,[2.10,-.438,.553]).material.roughness=.41;
  for(const x of [1.81,2.10,2.39]){
    cabinPart(new T.BoxGeometry(.251,.018,.230),cabinetEdge,[x,-.277,.388]);
    cabinPart(new T.BoxGeometry(.230,.018,.204),cabinWood,[x,-.269,.388]).material.roughness=.34;
    cabinPart(new T.SphereGeometry(.014,12,8),steel,[x+.077,-.250,.450]).material.metalness=.69;
  }
  const sink=cabinPart(new T.SphereGeometry(1,20,12),0x525956,[2.26,-.447,.578]);
  sink.scale.set(.119,.093,.007);sink.material.roughness=.30;sink.material.metalness=.66;
  const sinkRim=cabinPart(new T.TorusGeometry(.119,.009,8,36),0xc0c8c2,[2.26,-.447,.580]);
  sinkRim.scale.y=.80;sinkRim.material.metalness=.72;sinkRim.material.roughness=.28;
  const faucet=new T.CubicBezierCurve3(v3(2.27,-.555,.582),v3(2.27,-.556,.745),
    v3(2.24,-.412,.741),v3(2.23,-.430,.647));
  const tap=cabinPart(new T.TubeGeometry(faucet,16,.009,8,false),steel,[0,0,0]);
  tap.material.metalness=.78;tap.material.roughness=.26;
  cabinPart(new T.BoxGeometry(.22,.164,.016),0x252828,[1.88,-.447,.584]).material.roughness=.25;
  for(const x of [1.83,1.93]){
    cabinPart(new T.TorusGeometry(.033,.003,6,24),0x596360,[x,-.45,.594]);
  }
  cabinPart(new T.BoxGeometry(.27,.155,.243),cabinWood,[2.60,-.420,.829]).material.roughness=.34;
  cabinPart(new T.BoxGeometry(.244,.015,.217),cabinetEdge,[2.60,-.335,.828]);
  cabinPart(new T.BoxGeometry(.227,.015,.201),cabinWood,[2.60,-.326,.828]);
  cabinPart(new T.SphereGeometry(.013,12,8),steel,[2.52,-.307,.790]).material.metalness=.69;
  // Corner trim and two companionway treads hug the lining.
  for(const [x,z] of [[1.34,.296],[1.25,.431]]){
    cabinPart(roundedSeat(.111,.288,.024),cabinWood,[x,.454,z]);
    cabinPart(new T.BoxGeometry(.041,.257,.005),0xc1b19b,[x,.454,z+.041]);
  }
  for(const x of [1.50,2.70]){
    const z=cabinRoof(x)-.012;
    cabinPart(new T.BoxGeometry(.024,2*innerBeam(x,z)-.018,.022),ivoryLining,[x,0,z]);
  }
  const radio=new T.Group();radio.name='Cabin radio';radio.position.set(2.46,.15,.75);cabin.add(radio);
  cabinPart(roundedSeat(.245,.428,.019),cabinetEdge,[2.49,.15,.608]);
  cabinPart(new T.BoxGeometry(.20,.39,.23),0x332924,[0,0,0],radio);
  cabinPart(new T.BoxGeometry(.013,.354,.197),0x795739,[-.106,0,0],radio);
  for(let i=-3;i<=3;i++)cabinPart(new T.BoxGeometry(.006,.102,.007),0x322e2a,[-.114,.099,.019*i],radio);
  const display=cabinPart(new T.BoxGeometry(.012,.12,.068),0x465150,[-.116,-.074,.037],radio);
  const dial=cabinPart(new T.CylinderGeometry(.039,.039,.026,18),0xc0b58e,[-.119,-.083,-.042],radio);
  dial.rotation.z=Math.PI/2;
  const radioHitArea=cabinPart(new T.BoxGeometry(.245,.46,.28),0x332924,[-.016,0,0],radio);
  radioHitArea.visible=false;
  cabinObjects.set('radio',radio);
  const dome=new T.Group();dome.name='Cabin lamp';dome.position.set(2.05,-.11,cabinRoof(2.05)-.02);cabin.add(dome);
  const bezelCabin=cabinPart(new T.CylinderGeometry(.12,.126,.032,32),0x9d8e71,[0,0,0],dome);
  bezelCabin.rotation.x=Math.PI/2;
  const filament=cabinPart(new T.SphereGeometry(1,24,12),0xbdb69d,[0,0,-.022],dome);
  filament.scale.set(.106,.106,.040);
  const cabinLamp=new T.PointLight(0xffdfbc,1.9,2.6,2);
  cabinLamp.name='Cabin lamp emitter';cabinLamp.position.copy(dome.position);cabinLamp.position.z-=.14;
  cabinLamp.visible=false;cabin.add(cabinLamp);
  cabinObjects.set('light',dome);
  function setCabinLight(on){
    on=on&&electricalPower;
    cabinLamp.visible=on;filament.material.emissive.setHex(on?0xffc77a:0);filament.material.emissiveIntensity=on?.8:0;
  }
  function setRadio(on){display.material.emissive.setHex(on&&electricalPower?0x6dcc91:0);}
  const grainSize=128,grainPixels=new Uint8Array(grainSize*grainSize*4);
  for(let y=0;y<grainSize;y++)for(let x=0;x<grainSize;x++){
    const u=2*Math.PI*x/grainSize,v=2*Math.PI*y/grainSize;
    const rings=45*v+.65*Math.sin(u)+.27*Math.sin(2*u+3*v);
    const tone=224+13*Math.sin(rings)+8*Math.sin(2*rings+.7)+7*Math.cos(3*v+u);
    grainPixels.set([tone,tone,tone,255],4*(y*grainSize+x));
  }
  const woodGrain=new T.DataTexture(grainPixels,grainSize,grainSize);
  woodGrain.colorSpace=T.SRGBColorSpace;woodGrain.generateMipmaps=true;
  woodGrain.minFilter=T.LinearMipmapLinearFilter;woodGrain.magFilter=T.LinearFilter;
  woodGrain.needsUpdate=true;
  cabin.traverse(part=>{
    const color=part.material?.color?.getHex();
    if(color===cabinWood||color===cabinetEdge||color===0xa17e5b){
      part.material.map=woodGrain;
    }
  });
  // Furniture and lining share finishes. Keep the transparent ports and
  // interactive fixtures as separate objects for sorting and picking.
  const cabinFinishes=new Map(),cabinBatches=new Map();
  for(const piece of [...cabin.children]){
    const material=piece.material;
    if(!material?.isMeshStandardMaterial||material.transparent||piece.name==='Cabin outer port rim')continue;
    const finish=[material.side,material.roughness,material.metalness,material.map?.uuid].join('/');
    let shared=cabinFinishes.get(finish);
    if(!shared){
      shared=material.clone();
      shared.color.set(0xffffff);shared.vertexColors=true;
      cabinFinishes.set(finish,shared);
    }
    piece.updateMatrix();
    collectPart(piece.geometry,material.color,piece.matrix,shared,cabinBatches);
    cabin.remove(piece);material.dispose();
  }
  for(const [material,batch] of cabinBatches)addBatch(cabin,material,batch);
  const cabinWaterSegments=24;
  const cabinWater=cabinPart(new T.PlaneGeometry(1,2,cabinWaterSegments,1),0x4d9eac,[0,0,0],group);
  cabinWater.name='Cabin flood surface';
  cabinWater.frustumCulled=false;
  cabinWater.material.side=T.DoubleSide;
  cabinWater.material.transparent=true;
  cabinWater.material.opacity=.58;
  cabinWater.material.depthWrite=false;
  const cabinWaterPositions=cabinWater.geometry.attributes.position;
  let cabinWaterLevel=-Infinity;
  function setCabinWater(level){
    if(level===cabinWaterLevel)return;
    cabinWaterLevel=level;
    cabinWater.visible=level>cabinSole&&level<cabinRoof(cabinFore);
    if(!cabinWater.visible)return;
    const aft=Math.max(cabinAft,cabinAft+(level-cabinRoof(cabinAft))/.118);
    for(let i=0;i<=cabinWaterSegments;i++){
      const x=T.MathUtils.lerp(aft,cabinFore,i/cabinWaterSegments),y=Math.max(0,innerBeam(x,level)-.01);
      cabinWaterPositions.setXYZ(i,x,y,level);
      cabinWaterPositions.setXYZ(i+cabinWaterSegments+1,x,-y,level);
    }
    cabinWaterPositions.needsUpdate=true;
  }
  cabinWater.visible=false;
  const floodingEffects=panelCentres.map((x,index)=>{
    const sign=index<3?1:-1,particles=new Float32Array(60*3),geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(particles,3).setUsage(T.DynamicDrawUsage));
    const spray=new T.Points(geometry,new T.PointsMaterial({color:0x8ad4e7,size:.061,transparent:true,
      opacity:.72,depthWrite:false}));
    spray.name='Flood inflow '+(index+1);spray.frustumCulled=false;spray.visible=false;group.add(spray);
    const level=cabinPart(new T.PlaneGeometry(2.18,.94),0x4d9eac,[x,sign*.46,-.65],group);
    level.material.transparent=true;level.material.opacity=.58;level.material.depthWrite=false;level.visible=false;
    return {sign,spray,particles,level};
  });
  function updateDamage(health,flood,panels,time){
    setCabinWater(.5*(flood[13]+flood[28]));
    for(let i=0;i<floodingEffects.length;i++){
      integrity[i].value=health[i];
      breachRadius[i].value=Math.sqrt(Math.max(0,flood[5*i+2])/Math.PI);
      if(panelMeshes[i])panelMeshes[i].visible=health[i]>.01;
      const {sign,spray,particles,level}=floodingEffects[i],rate=flood[5*i+1],o=3*i;
      level.position.z=flood[5*i+3];
      level.visible=flood[5*i]>.025&&(i%3!==2||level.position.z<cabinSole);
      spray.visible=rate>.002&&(i%3!==2||cabinWaterLevel<cabinRoof(cabinFore));
      if(!spray.visible)continue;
      for(let k=0;k<60;k++){
        const u=(k/60+time*(1.0+rate*1.7))%1,splay=Math.sin(k*2.3);
        particles[3*k]=panels[o]+splay*(.022+.20*u);
        particles[3*k+1]=panels[o+1]-sign*.68*u;
        particles[3*k+2]=(flood[5*i+2]>0?panels[o+2]:.47)+.05*u*Math.cos(k*8.2)-.47*u*u;
      }
      spray.geometry.attributes.position.needsUpdate=true;
      spray.material.opacity=Math.min(.82,.25+rate*8);
    }
  }
  for(let i=0;i<3;i++){
    const blade=fixed(new T.SphereGeometry(1,10,8),brass,propeller),a=2*Math.PI*i/3;
    blade.position.set(0,.14*Math.cos(a),.14*Math.sin(a));blade.scale.set(.040,.169,.078);blade.rotation.set(a,.26,.20,'XYZ');
  }
  const rudder=fixed(new T.BoxGeometry(.34,.056,.43),brass);rudder.position.set(-3.45,0,-.61);rudder.userData.physicsJoint={axis:[0,0,1],label:'Rudder hinge'};
  // Round, flush-mounted downlights. The lens face, opaque-scene light and
  // optical scattering use the same position and boat-frame negative Z axis.
  const bezel=new T.CylinderGeometry(.081,.081,.025,16);bezel.rotateX(Math.PI/2);
  const disk=new T.CircleGeometry(.063,16);disk.rotateY(Math.PI);
  const emitters=new T.InstancedMesh(disk,new T.MeshBasicMaterial({color:0xffd38a}),hullLamps.length);
  emitters.name='Underwater downlight lenses';emitters.visible=false;group.add(emitters);
  const underwaterLamps=hullLamps.map(([x,y,z],i)=>{
    part(bezel.clone(),steel,[x,y,z+.015],null,null,metal);
    emitters.setMatrixAt(i,new T.Matrix4().makeTranslation(x,y,z));
    const flood=i===1||i===8;
    const led=new T.SpotLight(0xffc476,flood?122:62,flood?22:11,.91,.89,1.25);
    led.name='Hull downlight '+(i+1);led.visible=false;
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
  const swivel=new T.Group();swivel.name='Roof searchlight';swivel.userData.physicsJoint={axis:[0,0,1],label:'Searchlight swivel'};swivel.position.set(.56,0,searchlightHeight);group.add(swivel);
  rod([.56,0,2.18],[.56,0,searchlightHeight-.035],.043,steel);
  const housing=fixed(new T.CylinderGeometry(.116,.129,.18,18),steel,swivel);
  housing.rotation.z=-Math.PI/2;
  const lens=fixed(new T.CircleGeometry(.11,20),0xfff1c6,swivel,true);
  lens.rotation.y=Math.PI/2;lens.position.x=.096;
  const light=new T.SpotLight(0xffedcd,125,48,.21,.65,1.25);light.position.set(.097,0,0);
  light.name='Roof searchlight emitter';light.visible=lens.visible=false;
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
  for(const [material,batch] of batches){
    const m=addBatch(group,material,batch);
    const panel=panelMaterials.indexOf(material);if(panel>=0)panelMeshes[panel]=m;
  }
  // Fit the sonar view and chart to the local helm. The display faces aft and
  // slightly upward, allowing the helmsman to see through the windshield.
  let panel,panelScreen,lastPanel=-Infinity;
  if(sonarCanvas){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=176;
    const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);
    texture.colorSpace=T.SRGBColorSpace;
    const face=new T.Mesh(new T.PlaneGeometry(.82,.265),new T.MeshBasicMaterial({map:texture}));
    panelScreen=face.material;
    face.position.set(.033,-.40,1.55);
    face.rotation.set(Math.PI/2,0,-Math.PI/2,'ZXY');
    face.rotateX(-.28);group.add(face);
    panel=(rpm)=>{
      const heading=group.rotation.z;
      ctx.fillStyle='#152028';ctx.fillRect(0,0,512,176);
      ctx.drawImage(sonarCanvas,22,27,208,117);
      ctx.drawImage(chartCanvas,307,27,156,117);
      ctx.fillStyle='#d6e8ec';ctx.font='bold 14px sans-serif';
      ctx.fillText('3D IMAGING SONAR',10,19);ctx.fillText('HARBOR CHART',271,19);
      ctx.font='13px monospace';ctx.fillText('0–'+sonarCanvas.dataset.range+' m',10,163);ctx.fillText(Math.round(Math.abs(rpm))+' RPM',133,163);
      const bearing=(450-heading*180/Math.PI)%360;
      ctx.fillText('HDG '+Math.round(bearing)+'°',270,163);
      texture.needsUpdate=true;
    };
  }
  beam.visible=false;
  function setElectricalPower(on){
    if(electricalPower===on)return;
    electricalPower=on;
    panelScreen?.color.setHex(on?0xffffff:0x000000);
    if(on)return;
    setCabinLight(false);setRadio(false);
    emitters.visible=light.visible=beam.visible=lens.visible=false;
    for(const led of underwaterLamps)led.visible=false;
    for(const indicator of helmIndicators.values())indicator.light.material.emissiveIntensity=0;
  }
  function positionSearchlight(bearing,tilt){
    swivel.rotation.set(0,tilt,bearing,'ZYX');
    swivel.updateMatrix();beam.updateMatrix();
    beam.material.uniforms.beamToHull.value.multiplyMatrices(swivel.matrix,beam.matrix);
    beam.material.uniforms.lensInHull.value.copy(light.position).applyMatrix4(swivel.matrix);
  }
  async function preloadLighting(bearing,tilt,compile){
    positionSearchlight(bearing,tilt);
    updateSearchDepth();
    const fixtures=[cabinLamp,light,beam,lens,emitters,...underwaterLamps];
    const visibility=fixtures.map(fixture=>fixture.visible);
    try{
      for(let state=0;state<8;state++){
        cabinLamp.visible=Boolean(state&1);
        light.visible=beam.visible=lens.visible=Boolean(state&2);
        emitters.visible=Boolean(state&4);
        for(const led of underwaterLamps)led.visible=emitters.visible;
        await compile(state+1,8);
      }
    }finally{
      fixtures.forEach((fixture,index)=>{fixture.visible=visibility[index];});
    }
  }
  let previousTime,shaftRPM=0;
  function update(t,rpm,steer,settings,seaTime=t){
    if(electricalPower)radar.rotation.z=(seaTime%2.5)*(2*Math.PI/2.5);
    if(previousTime!==undefined)propeller.rotation.x+=(t-previousTime)*rpm*Math.PI/30;
    previousTime=t;shaftRPM=rpm;rudder.rotation.z=steer;
    if(electricalPower&&panel&&t-lastPanel>=.2){panel(rpm);lastPanel=t;}
    emitters.visible=electricalPower&&Boolean(settings[1]);
    for(const led of underwaterLamps)led.visible=emitters.visible;
    positionSearchlight(settings[2],settings[3]);
    light.visible=beam.visible=lens.visible=electricalPower&&Boolean(settings[0]);
    if(light.visible)updateSearchDepth();
  }
  function dispose(){
    depthMap.dispose();
    const geometries=new Set(),materials=new Set();
    group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    for(const g of geometries)g.dispose();
    for(const m of materials){m.map?.dispose();m.dispose();}
  }
  const lamps=[{swivel,light,beam,lens,under:underwaterLamps[1]},{under:underwaterLamps[8]}];
  return {group,update,updateDamage,cabinObjects,deckObjects,setCabinLight,setRadio,setElectricalPower,setWiper,setHelmSwitch,setAnchor,lamps,searchlight:{swivel,light},underwaterLamps,preloadLighting,dispose,
    get cabinWaterLevel(){return cabinWaterLevel;},get shaftRPM(){return shaftRPM;}};
}
