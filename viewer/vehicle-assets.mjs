
const shells=new Map();
export async function loadVehicleShells(){
  const {GLTFLoader}=await import('./vendor/gltf-loader.mjs');
  const loader=new GLTFLoader();
  await Promise.all(['hobie-hulls','sloop-hull','survey-pressure-housing'].map(async name=>{
    const {scene}=await loader.loadAsync(new URL('./assets/'+name+'.glb',import.meta.url).href);
    scene.rotation.x=Math.PI/2;
    shells.set(name,scene);
  }));
}
export function vehicleShell(name){
  const shell=shells.get(name).clone(true);
  shell.traverse(o=>{o.userData.sharedVehicleAsset=true;});
  return shell;
}
