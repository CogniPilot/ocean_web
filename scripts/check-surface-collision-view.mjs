import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {surfaceCollisionShapes} from '../viewer/surface-collision-view.mjs';

const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js');
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [visuals,shore,cruiser]=await Promise.all([
  read('viewer/visuals.js'),read('viewer/board/Shore.mo'),read('models/OceanMotorboat.mo')
]);
function table(source,name){
  const match=source.match(new RegExp('constant Real '+name+'\\[\\d+,\\d+\\]=\\[([^\\]]+)\\]'));
  return match[1].split(';').map(row=>row.split(',').map(Number));
}
const rocks=table(shore,'rocks'),pontoon=table(shore,'pontoon'),cruiserProbes=table(cruiser,'probes').flat();
const scene=new T.Scene(),scope={T,scene};
runInNewContext(visuals+'\nbatchScenery=()=>{}; land=coast(T,scene,true);',scope);
const island=scope.land,committee=new T.Group(),marks=Array.from({length:3},()=>new T.Group());
const hobie=new T.Group(),motor=new T.Group(),drone=new T.Group();
for(const [i,group] of [committee,...marks,hobie,motor,drone].entries()){
  group.position.set(i,-i/2,.8*i);
  group.rotation.set(.2,-.27,.18*i,'ZYX');
}
function near(actual,expected,tolerance=1e-6){
  assert.equal(actual.length,expected.length);
  for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<tolerance,actual[i]+' vs '+expected[i]);
}
const shapes=surfaceCollisionShapes(T,island,committee,marks);
const boxes=[],spheres=[],points=[],wires=[];
const painter={
  box:(...args)=>boxes.push(args),sphere:(...args)=>spheres.push(args),
  points:(...args)=>points.push(args),lines:(...args)=>wires.push(args)
};
shapes.draw(painter,hobie,{cat:true},motor,drone);
assert.deepEqual(boxes.slice(0,3).map(([frame,center,half])=>[frame===committee,center,half]),[
  [true,[-1.98,0,.66],[.98,.86,.12]],[true,[1.54,0,.66],[.55,.67,.12]],[true,[2.42,0,.66],[.34,.32,.12]]
]);
assert.deepEqual(boxes[3].slice(0,3),[hobie,[-.425,0,.40],[.975,.97,.014]]);
assert.equal(spheres.length,4);
assert.deepEqual(spheres.map(([group,center,radius])=>[group===drone,center,radius]),[
  [true,[.17,-.17,-.085],.015],[true,[.17,.17,-.085],.015],
  [true,[-.17,-.17,-.085],.015],[true,[-.17,.17,-.085],.015]
]);
assert.equal(points[0][1].length,78*3);
near(points[0][1].slice(0,9),[
  pontoon[0][0],1.02-.69*pontoon[0][1],pontoon[0][2]+.77*(pontoon[0][3]-pontoon[0][2]),
  pontoon[0][0],1.02,pontoon[0][3],
  pontoon[0][0],1.02+.69*pontoon[0][1],pontoon[0][2]+.77*(pontoon[0][3]-pontoon[0][2])
]);
assert.deepEqual(points[1].slice(0,2),[motor,cruiserProbes]);

const [sandFrame,sand]=wires.shift();
assert.equal(sandFrame,island);
assert.equal(sand.length,6*(74*63+75*62+74*62));
// Verify the u+v=1 diagonal shared by the first pair of Shore contact triangles.
const dx=58/74,dy=46/62,terrain=island.userData.chartTerrain.height;
near(sand.slice(12,18),[-29+dx,-23,terrain(-29+dx,-23),-29,-23+dy,terrain(-29,-23+dy)],3e-6);
assert.equal(wires.length,49);
for(let i=0;i<rocks.length;i++){
  const [frame]=wires[i],matrix=frame.matrixWorld;
  const inverse=new T.Matrix3().setFromMatrix4(matrix).invert().transpose();
  near(new T.Vector3().setFromMatrixPosition(matrix).toArray(),rocks[i].slice(0,3),3e-6);
  near(inverse.elements,rocks[i].slice(4),3e-6);
}
for(const [i,[frame,local]] of wires.slice(46).entries()){
  assert.equal(frame,marks[i]);
  assert.equal(local.length,36);
  for(let n=0;n<local.length;n+=3){
    const [x,y,z]=local.slice(n,n+3),lateral=.85/(2*1.75)*(z-1.65);
    const outside=Math.max(y+lateral,Math.sqrt(3)/2*x-.5*y+lateral,-Math.sqrt(3)/2*x-.5*y+lateral,-z-.10);
    assert(Math.abs(outside)<1e-9);
  }
}
const sloop=new T.Group();
shapes.draw(painter,sloop,{cat:false},null,null);
assert.deepEqual(boxes.at(-1).slice(0,3),[sloop,[-.27,0,.154],[.37,.20,.0045]]);
assert.equal(points.at(-1)[1].length,39*3);
console.log('Verified the three buoy proxies, landing shapes, 46 baked rock frames, sand diagonals and hull probes.');
