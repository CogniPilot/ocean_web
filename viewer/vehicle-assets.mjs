const shells=new Map();
const pending=new Map();
export function loadVehicleShell(name){
  if(shells.has(name))return;
  if(!pending.has(name)){
    const request=import('./vendor/gltf-loader.mjs').then(async ({GLTFLoader})=>{
      const {scene}=await new GLTFLoader().loadAsync(new URL('./assets/'+name+'.glb',import.meta.url).href);
      scene.rotation.x=Math.PI/2;
      shells.set(name,scene);
    }).finally(()=>pending.delete(name));
    pending.set(name,request);
  }
  return pending.get(name);
}
export function vehicleShell(name){
  const shell=shells.get(name).clone(true);
  shell.traverse(o=>{o.userData.sharedVehicleAsset=true;});
  return shell;
}
