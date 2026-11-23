// Original mesh geometry. The bark and ground surfaces use local photoscans.
const islandTextureRoot=new URL('./assets/island/',document.currentScript.src);
const islandTextureVersion=new URL(document.currentScript.src).search;
const islandCanopy=[
  [-12.7,.6,3.6,1.65],[-10.3,3.4,5.0,2.4],[-8.0,6.1,3.9,1.8],
  [-6.7,-1.8,4.4,2.2],[-5.2,4.9,5.7,2.7],[-2.2,6.9,3.8,1.8],
  [-1.4,2.7,5.4,2.5],[1.3,6.6,4.7,2.2],[4.3,4.5,5.7,2.55],
  [7.8,6.2,3.8,1.7],[8.2,2.0,4.7,2.3],[11.7,3.1,4.0,1.9],
  [12.7,-.5,3.1,1.5]
];

function islandCrownCover(x,y){
  let uncovered=1;
  for(const [east,north,,radius] of islandCanopy){
    const distance=Math.hypot(x-east,y-north);
    const fade=Math.max(0,1-distance/(radius*1.25));
    uncovered*=1-.94*fade**.8;
  }
  return 1-uncovered;
}

function islandFieldNoise(x,y){
  const i=Math.floor(x),j=Math.floor(y),dx=x-i,dy=y-j;
  const u=dx*dx*(3-2*dx),v=dy*dy*(3-2*dy);
  const hash=(a,b)=>{
    const bits=Math.imul(a,0x45d9f3b)^Math.imul(b,0x119de1f3);
    return (Math.imul(bits^(bits>>>16),0x45d9f3b)>>>0)/4294967296;
  };
  const west=hash(i,j)*(1-v)+hash(i,j+1)*v,east=hash(i+1,j)*(1-v)+hash(i+1,j+1)*v;
  return west*(1-u)+east*u;
}

function islandTextures(T){
  const loader=new T.TextureLoader(),ready={value:0},textures=[];
  let groundLoaded=0;
  function load(name,color,ground=false){
    const url=new URL(name+'.webp',islandTextureRoot);
    url.search=islandTextureVersion;
    const texture=loader.load(url.href,()=>{
      if(ground&&++groundLoaded===4)ready.value=1;
    },undefined,()=>console.warn('Island texture unavailable',name));
    texture.name=name;
    texture.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.anisotropy=4;
    textures.push(texture);
    return texture;
  }
  return {
    field:load('field',true,true),litter:load('litter',true,true),sand:load('sand',true,true),
    height:load('ground-height',false,true),ready,
    palmBark:load('palm-bark',true),palmHeight:load('palm-bark-height',false),
    bark:load('tree-bark',true),barkHeight:load('tree-bark-height',false),
    dispose(){for(const texture of textures)texture.dispose();}
  };
}

function islandLeafFinish(shader){
  shader.vertexShader='attribute vec2 leafUV;varying vec2 vLeafUV;\n'+shader.vertexShader
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvLeafUV=leafUV;');
  shader.fragmentShader='varying vec2 vLeafUV;\n'+shader.fragmentShader
    .replace('#include <color_fragment>',`#include <color_fragment>
      float leafCross=abs(vLeafUV.y);
      float veinFade=1.-smoothstep(.008,.065,fwidth(vLeafUV.x));
      float midrib=(1.-smoothstep(.017,.063,leafCross))*(1.-smoothstep(.65,1.,vLeafUV.x));
      float ribPattern=abs(fract(vLeafUV.x*8.-leafCross*.92)-.5);
      float sideVein=(1.-smoothstep(.014,.069,ribPattern))*(1.-leafCross);
      diffuseColor.rgb*=.97+.17*midrib+.055*sideVein*veinFade+.10*leafCross;
      if(!gl_FrontFacing)diffuseColor.rgb*=vec3(1.13,1.19,1.03);`);
}

function islandForest(T,land,terrain,textures){
  let seed=97649;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const tau=2*Math.PI,up=new T.Vector3(0,0,1);
  const batch=()=>({positions:[],colors:[],indices:[]});
  const trunks={...batch(),uv:[]},leaves={...batch(),uv:[]},grass=batch();
  const moss=new T.Color(0xada889),wood=new T.Color(0xe1c8a4);
  const shade=new T.Color(0x354923),tipGreen=new T.Color(0x9bab50),deep=new T.Color(0x3e6632);
  const grassBase=new T.Color(0x52672b),grassTip=new T.Color(0xa5b15c);
  function vertex(part,p,color,u=0,v=0){
    const i=part.positions.length/3;
    part.positions.push(p.x,p.y,p.z);
    part.colors.push(color.r,color.g,color.b);
    part.uv?.push(u,v);
    return i;
  }
  function stem(base,tip,radius,endRadius,sides,lean){
    const axis=tip.clone().sub(base),length=axis.length(),dir=axis.clone().normalize();
    const u=dir.clone().cross(Math.abs(dir.z)>.9?new T.Vector3(0,1,0):up).normalize();
    const v=dir.clone().cross(u),start=trunks.positions.length/3,rings=sides>=8?6:3;
    for(let i=0;i<=rings;i++){
      const t=i/rings,point=base.clone().addScaledVector(axis,t).addScaledVector(u,lean*Math.sin(t*Math.PI));
      const r=(radius*(1-t)+endRadius*t)*(1+.28*Math.exp(-t*12));
      for(let j=0;j<=sides;j++){
        const az=tau*j/sides,swell=r*(1+.09*Math.cos(5*az));
        const p=point.clone().addScaledVector(u,swell*Math.cos(az)).addScaledVector(v,swell*Math.sin(az));
        const color=moss.clone().lerp(wood,Math.min(1,t+.42));
        vertex(trunks,p,color,j/sides*2*Math.PI*radius,length*t);
        if(i&&j){
          const n=start+i*(sides+1)+j,b=n-sides-1;
          trunks.indices.push(b-1,b,n-1,b,n,n-1);
        }
      }
    }
  }
  function foliage(base,az,length,width,pitch,color){
    const forward=new T.Vector3(Math.cos(az),Math.sin(az),pitch);
    const across=new T.Vector3(-forward.y,forward.x,.22*Math.sin(2*az));
    const middle=base.clone().addScaledVector(forward,length*.48);
    const end=base.clone().addScaledVector(forward,length);
    end.z-=length*.18;
    const n=vertex(leaves,base,color.clone().multiplyScalar(.75));
    vertex(leaves,middle.clone().addScaledVector(across,width),color,.48,1);
    vertex(leaves,middle.clone().addScaledVector(across,-width),color.clone().multiplyScalar(.89),.48,-1);
    middle.z+=width*.37;
    vertex(leaves,middle,color.clone().multiplyScalar(1.10),.48,0);
    vertex(leaves,end,color,1,0);
    leaves.indices.push(n,n+1,n+3,n,n+3,n+2,n+3,n+1,n+4,n+3,n+4,n+2);
  }
  for(const [x,y,height,radius] of islandCanopy){
    const base=new T.Vector3(x,y,terrain(x,y)-.16),turn=random()*tau;
    const lean=.16+.30*random(),leanX=lean*Math.cos(turn),leanY=lean*Math.sin(turn);
    const crown=base.clone().add(new T.Vector3(leanX,leanY,height-.33));
    const width=height*(.034+.011*random());
    stem(base,crown,width,.043,9,.23*(random()-.5));
    for(let root=0;root<4;root++){
      const az=turn+root*1.57,reach=.36+.33*random();
      const rx=x+reach*Math.cos(az),ry=y+reach*Math.sin(az);
      stem(base.clone().add(new T.Vector3(0,0,.37)),new T.Vector3(rx,ry,terrain(rx,ry)-.05),width*.51,.025,6,.06);
    }
    for(let branch=0;branch<8;branch++){
      const az=turn+branch*2.39996,climb=.44+.057*branch;
      const root=base.clone().lerp(crown,climb),reach=radius*(1.04-.051*branch)*(.85+.23*random());
      const fork=root.clone().add(new T.Vector3(Math.cos(az)*reach,Math.sin(az)*reach,
        height*(.19+.085*random())));
      stem(root,fork,width*(.43-.026*branch),.017,6,.11);
      for(let twig=0;twig<6;twig++){
        const t=.39+twig*.119,angle=az+(twig%2?1:-1)*(.55+.46*random());
        const begin=root.clone().lerp(fork,t),length=radius*(.14+.22*random());
        const top=begin.clone().add(new T.Vector3(length*Math.cos(angle),length*Math.sin(angle),.24+.43*random()));
        stem(begin,top,.023,.005,5,.035);
        for(let leaf=0;leaf<17;leaf++){
          const center=begin.clone().lerp(top,.42+.58*random());
          center.x+=length*(random()-.5)*.78;
          center.y+=length*(random()-.5)*.78;
          center.z+=length*(random()-.5)*.46;
          const size=.19+.27*random();
          const tone=shade.clone().lerp(branch>4?tipGreen:deep,.26+.72*random());
          foliage(center,angle+leaf*2.39996,size,size*(.18+.14*random()),.50*(random()-.43),tone);
        }
      }
    }
  }
  function grassBlade(x,y,z,az,height,width,tone){
    const direction=new T.Vector3(Math.cos(az),Math.sin(az),0),side=new T.Vector3(-direction.y,direction.x,0);
    const root=new T.Vector3(x,y,z),middle=root.clone().addScaledVector(direction,.20*height);
    middle.z+=height*.57;
    const n=vertex(grass,root.clone().addScaledVector(side,width),grassBase);
    vertex(grass,root.clone().addScaledVector(side,-width),grassBase);
    vertex(grass,middle.clone().addScaledVector(side,width*.53),tone);
    vertex(grass,middle.clone().addScaledVector(side,-width*.53),tone);
    vertex(grass,root.addScaledVector(direction,height*.56).addScaledVector(up,height),tone);
    grass.indices.push(n,n+1,n+2,n+2,n+1,n+3,n+2,n+3,n+4);
  }
  for(let i=0;i<3350;i++){
    const x=(random()-.5)*38,y=(random()-.5)*24,z=terrain(x,y);
    if(z<.94+.29*random())continue;
    const cover=islandCrownCover(x,y);
    const patch=.26+.51*islandFieldNoise(x*.69,y*.69)+.23*islandFieldNoise(x*1.51+42,y*1.51-11);
    if(random()>patch*(1-.77*cover))continue;
    const height=(.10+.26*random())*(1-.29*cover);
    const tone=grassBase.clone().lerp(grassTip,.25+.66*random());
    for(let blade=0;blade<6;blade++){
      const bx=x+(random()-.5)*.21,by=y+(random()-.5)*.21;
      grassBlade(bx,by,terrain(bx,by)-.035,tau*random(),height*(.65+.63*random()),.008+.010*random(),tone);
    }
  }
  function mesh(name,data,finish){
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(data.colors,3));
    if(finish.map)geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));
    geometry.setIndex(data.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material=new T.MeshStandardMaterial({vertexColors:true,...finish});
    if(data===leaves){
      geometry.setAttribute('leafUV',new T.Float32BufferAttribute(data.uv,2));
      material.onBeforeCompile=islandLeafFinish;
    }
    const part=new T.Mesh(geometry,material);
    part.name=name;
    land.add(part);
  }
  mesh('Broadleaf stems and roots',trunks,{map:textures.bark,bumpMap:textures.barkHeight,bumpScale:.065,roughness:.92});
  mesh('Broadleaf canopy',leaves,{roughness:.61,side:T.DoubleSide});
  mesh('Field grass blades',grass,{roughness:.89,side:T.DoubleSide});
}
