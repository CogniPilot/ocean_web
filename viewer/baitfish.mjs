// One atlas keeps the body, ray-finned membranes and eyes in the same school draw.
const surfaces=new WeakMap();
export function baitfishMaterial(T){
  let material=surfaces.get(T);
  if(material)return material;
  const loader=new T.TextureLoader();
  function texture(suffix,srgb){
    const t=loader.load(new URL('./assets/subsea/school-flank-'+suffix+'.webp',import.meta.url).href);
    t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;
    t.anisotropy=4;
    return t;
  }
  const detail=texture('surface',false);
  material=new T.MeshStandardMaterial({map:texture('albedo',true),roughnessMap:detail,bumpMap:detail,
    bumpScale:.00019,roughness:.78,metalness:.09,side:T.DoubleSide});
  material.name='Silvery baitfish scales and fins';
  surfaces.set(T,material);
  return material;
}
