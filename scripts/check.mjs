import {startDive} from '../viewer/live.mjs';
const dive=await startDive();
let maxX=-Infinity,sum=0,loss=0,visual=0,minZ=0;
for(let i=1;i<=625;i++){
 const f=dive.advance();
 sum+=(f.pos[0]-f.est[0])**2+(f.pos[1]-f.est[1])**2;
 maxX=Math.max(maxX,f.pos[0]);minZ=Math.min(minZ,f.pos[2]);loss+=!f.lock;visual+=f.visualWeight>0;
}
const end=dive.frame.pos,rmse=Math.sqrt(sum/625);
console.log({maxX,minZ,end,rmse,loss,visual});
if(maxX<20 || Math.hypot(end[0]+5,end[1])>1.5 || rmse>.9 || !loss || !visual)throw Error('Dive qualification failed');
