import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
const base={east:-9,north:-7,meanEast:10,meanNorth:4};
const w=await loadInstance('MarineWind',base,read);
const period=w.get('period'),cell=period/48;
const shift={east:3,north:-2};
const shifted=await loadInstance('MarineWind',{...base,advectionAnchor:[0,cell*shift.east,cell*shift.north,0,0]},read);
for(let i=0;i<6;i++){w.advance(.25);shifted.advance(.25);}
const field=w.get('field'),other=shifted.get('field');
assert(field.every(Number.isFinite));
const wrap=i=>(i%48+48)%48;
const at=(grid,x,y,k)=>grid[(48*wrap(y)+wrap(x))*3+k];
function probe(x,y,k){
  const u=x/cell,v=y/cell,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
  return (1-b)*((1-a)*at(field,i,j,k)+a*at(field,i+1,j,k))+
    b*((1-a)*at(field,i,j+1,k)+a*at(field,i+1,j+1,k));
}
for(const [i,name] of ['localEast','localNorth'].entries()){
  assert(Math.abs(w.get(name)-probe(base.east,base.north,i))<1e-8);
}
let error=0;
for(let j=0;j<48;j++)for(let i=0;i<48;i++)for(let k=0;k<3;k++){
  error=Math.max(error,Math.abs(at(field,i,j,k)-at(other,i+shift.east,j+shift.north,k)));
}
assert(error<1e-7,'Translated gust and roughness fields must follow the room anchor');
w.set('droneEast',7*cell);w.set('droneNorth',cell);w.advance(.25);
const grid=w.get('field');
assert.deepEqual(w.get('droneWind'),[at(grid,7,1,0),at(grid,7,1,1),0]);
const rough=field.filter((_,k)=>k%3===2);
assert(Math.max(...rough)-Math.min(...rough)>3);
console.log({period,cell,minimum:Math.min(...rough),maximum:Math.max(...rough),translationError:error});
