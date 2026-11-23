// Original mesh geometry. The bark and ground surfaces use local photoscans.
const islandTextureRoot=new URL('./assets/island/',document.currentScript.src);
const islandTextureVersion=new URL(document.currentScript.src).search;
function islandTextures(T){
  const loader=new T.TextureLoader(),ready={value:0},textures=[];
  let groundLoaded=0;
  function load(name,color,ground=false){
    const url=new URL(name+'.webp',islandTextureRoot);
    url.search=islandTextureVersion;
    const texture=loader.load(url.href,()=>{
      if(ground&&++groundLoaded===2)ready.value=1;
    },undefined,()=>console.warn('Island texture unavailable',name));
    texture.name=name;
    texture.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.anisotropy=4;
    textures.push(texture);
    return texture;
  }
  return {
    sand:load('sand',true,true),height:load('sand-height',false,true),ready,
    palmBark:load('palm-bark',true),palmHeight:load('palm-bark-height',false),
    dispose(){for(const texture of textures)texture.dispose();}
  };
}

// Low coastal scrub is clustered behind the open beach.
function islandScrub(T,land,terrain){
  const positions=[],indices=[],colors=[];
  let seed=714;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const olive=new T.Color(0x40502b),leaves=new T.Color(0x687744),growth=new T.Color(0x879652);
  function leaf(x,y,z,angle,length,width,tilt,tone){
    const dx=Math.cos(angle)*length,dy=Math.sin(angle)*length,sx=Math.sin(angle)*width,sy=Math.cos(angle)*width;
    const middle=z+tilt*.51,i=positions.length/3;
    positions.push(x,y,z,x+.48*dx-sx,y+.48*dy+sy,middle,
      x+.52*dx+sx,y+.52*dy-sy,middle,x+.49*dx,y+.49*dy,middle+.37*width,
      x+dx,y+dy,z+tilt);
    indices.push(i,i+1,i+3,i,i+3,i+2,i+3,i+1,i+4,i+3,i+4,i+2);
    for(const s of [.67,.91,1,1.10,.98])colors.push(tone.r*s,tone.g*s,tone.b*s);
  }
  for(let i=0;i<54;i++){
    const x=-13+26*random(),y=.6+7.6*random()-1.6*(x/13)**2,z=terrain(x,y);
    if(z<1.0)continue;
    const radius=.60+.58*random(),height=.40+.87*random();
    for(let branch=0;branch<10;branch++){
      const az=branch*2.39996+random(),reach=radius*(.52+.54*random());
      const dx=Math.cos(az)*reach,dy=Math.sin(az)*reach;
      for(let j=0;j<11;j++){
        const u=.16+.83*random(),angle=az+(j%2?1:-1)*(.3+1.48*random());
        const size=(.13+.21*random())*(.7+.3*height);
        const tone=olive.clone().lerp(u>.7?growth:leaves,.26+.62*random());
        leaf(x+dx*u+(random()-.5)*.31,y+dy*u+(random()-.5)*.31,
          z+height*(Math.sin(u*1.85)*(.59+.33*random())+.06),
          angle,size,size*(.25+.16*random()),size*(random()-.47),tone);
      }
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.79,side:T.DoubleSide}));
  mesh.name='Coastal scrub';
  land.add(mesh);
}
