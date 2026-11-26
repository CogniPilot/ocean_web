// Simple torso envelopes fitted in metres to the animated meshes' longitudinal bounds.
// Each row gives the middle sphere's x offset, spacing to the other centres, and radius.
const baitBody=[0,.15,.085];
const reefBodies=[[-.05,.075,.085],[-.025,.055,.060]];

export function baitfishScale(index){
  return .68+.4*Math.abs(Math.sin(index));
}

export function fishBodyShape(species,scale=1){
  const dimensions=species==='bait'?baitBody:reefBodies[species];
  return dimensions.map(value=>value*scale);
}

// Only the main camera enables this layer. Diagnostics stay out of the sensor images.
export const fishCollisionLayer=4;

export function createFishCollisionOverlay(T,parent,capacity){
  const geometry=new T.SphereGeometry(1,8,6);
  const material=new T.MeshBasicMaterial({color:0x8fe5ef,wireframe:true,toneMapped:false,transparent:true,opacity:.75,depthWrite:false,depthTest:false});
  const mesh=new T.InstancedMesh(geometry,material,capacity*3);
  mesh.name='Fish collision shapes';
  mesh.layers.set(fishCollisionLayer);
  mesh.renderOrder=10;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.count=0;
  mesh.frustumCulled=false;
  parent.add(mesh);
  const matrix=new T.Matrix4();
  return {
    begin(){mesh.count=0;},
    add(x,y,z,yaw,[center,span,radius]){
      const dx=Math.cos(yaw),dy=Math.sin(yaw);
      matrix.makeScale(radius,radius,radius);
      for(let j=-1;j<=1;j++){
        const offset=center+j*span;
        matrix.setPosition(x+offset*dx,y+offset*dy,z);
        mesh.setMatrixAt(mesh.count++,matrix);
      }
    },
    end(){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;},
    dispose(){mesh.removeFromParent();mesh.dispose();geometry.dispose();material.dispose();}
  };
}
