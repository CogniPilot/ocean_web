// One set per finish is shared by the local vehicle, peers, NPCs and repeated hull sections.
const subseaSource=new URL(document.currentScript.src);
const subseaSurfaces=new Map();
function subseaFinish(T,material,kind,relief){
  let maps=subseaSurfaces.get(kind);
  if(!maps){
    const loader=new T.TextureLoader();
    const load=(suffix,color)=>{
      const url=new URL('assets/subsea/'+kind+'-'+suffix+'.webp',subseaSource);
      url.search=subseaSource.search;
      const texture=loader.load(url.href);
      texture.wrapS=texture.wrapT=T.RepeatWrapping;
      texture.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;
      texture.anisotropy=2;
      texture.userData.sharedSubsea=true;
      return texture;
    };
    maps={color:load('color',true),surface:load('surface',false)};
    subseaSurfaces.set(kind,maps);
  }
  material.map=maps.color;
  // Linear height is packed in red, perceptual roughness in green.
  material.bumpMap=material.roughnessMap=maps.surface;
  material.bumpScale=relief;
  material.needsUpdate=true;
  return material;
}
