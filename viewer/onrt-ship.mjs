import {metricSurface} from './onrt-materials.mjs';

export async function loadBasinShip(T,materialFor){
  const ship=new T.Group();
  const base=new URL('./assets/onrt/',import.meta.url);
  const [parts,buffer]=await Promise.all([
    fetch(new URL('parts.json',base)).then(r=>r.json()),fetch(new URL('geometry.bin',base)).then(r=>r.arrayBuffer())]);
  const meshes={};
  const colors={bottom:0x45534d,topsides:0x41464a,house:0x555d61,appendages:0x63574b,
    portRudder:0x875648,starboardRudder:0x875648,propeller:0xbf9860};
  for(const [name,{offset,vertices,indices}] of Object.entries(parts)) {
    const encoded=new Int16Array(buffer,offset,3*vertices);
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(Float32Array.from(encoded,v=>v*.0001),3));
    geometry.setIndex(new T.BufferAttribute(new Uint16Array(buffer,offset+6*vertices,indices),1));
    geometry.computeVertexNormals();
    const material=materialFor(name==='propeller'?'bronze':'hull',colors[name]);
    material.side=T.DoubleSide;
    meshes[name]=new T.Mesh(metricSurface(T,geometry),material);
    if(name!=='propeller') ship.add(meshes[name]);
  }
  const rudders=[],props=[];
  for(const side of [-1,1]) {
    const mesh=side<0?meshes.portRudder:meshes.starboardRudder;
    const pivot=new T.Group();
    pivot.position.set(1.625-.955*3.147,-.032,side*.020116*3.147);
    mesh.position.copy(pivot.position).multiplyScalar(-1);
    pivot.add(mesh);ship.add(pivot);rudders.push(pivot);
    const mount=new T.Group();
    mount.position.set(1.625-.9267*3.147,-.03565*3.147,side*.02661*3.147);
    mount.rotation.z=5*Math.PI/180;
    const prop=meshes.propeller.clone();
    prop.scale.z=side;mount.add(prop);ship.add(mount);props.push(prop);
  }

  return {ship,meshes,rudders,props};
}
