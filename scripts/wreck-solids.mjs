// Export the exact Three.js oriented boxes in the MultiBodyLie world-to-shape convention.
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url), T=require('../viewer/vendor/three.min.js');
const wreck=require('../viewer/wreck.js')(T,{});
const rows=wreck.children.map(m=>{
 const rot=new T.Matrix4().makeRotationFromQuaternion(m.quaternion),e=rot.elements;
 const axes=[e[0],e[1],e[2],e[4],e[5],e[6],e[8],e[9],e[10]];
 const half=m.scale.clone().multiplyScalar(.5).toArray();
 const bounds=[0,1,2].map(j=>half.reduce((v,r,k)=>v+r*Math.abs(axes[3*k+j]),0));
 return [...m.position.toArray(),...half,...axes,...bounds].map(x=>Math.abs(x)<1e-12?'0':x.toFixed(8)).join(',');
});
// A row accessor keeps the generated compiler from repeatedly expanding an entire
// constant matrix for each subscript in the contact loop.
function branches(first,last,indent){
 if(first===last)return indent+'box:={'+rows[first]+'};';
 const mid=Math.floor((first+last)/2);
 return [indent+'if index<='+String(mid+1)+' then',branches(first,mid,indent+'  '),
   indent+'else',branches(mid+1,last,indent+'  '),indent+'end if;'].join('\n');
}
// Split the static broad phase at expanded AABB faces. A box that spans a
// split belongs to both children. Thus every possible contact is in the leaf
// selected by the vehicle position, including at cell boundaries. Keep the
// finite seabed as candidate 1 everywhere; its normal AABB test still applies.
const guardExtent = 0.8;
const candidates = rows.map((row, i) => {
  const values = row.split(',').map(Number);
  const margin = values.slice(15,18).map(x => x + guardExtent + 1e-6);
  return {id:i+1, low:margin.map((m,k)=>values[k]-m), high:margin.map((m,k)=>values[k]+m)};
}).slice(1);
let maxCandidates = 0;
function partition(boxes, depth) {
  let best;
  if (boxes.length > 8 && depth < 12) {
    for (let axis=0; axis<3; axis++) {
      const faces = new Set(boxes.flatMap(box=>[box.low[axis],box.high[axis]]));
      for (const split of faces) {
        const left = boxes.filter(box=>box.low[axis]<split);
        const right = boxes.filter(box=>box.high[axis]>=split);
        if (left.length===boxes.length || right.length===boxes.length) continue;
        const cost = Math.max(left.length,right.length) + .25*(left.length+right.length);
        if (!best || cost<best.cost) best={cost,axis,split,left,right};
      }
    }
  }
  if (best) return {axis:best.axis,split:best.split,left:partition(best.left,depth+1),right:partition(best.right,depth+1)};
  const ids = [1,...boxes.map(box=>box.id)];
  maxCandidates = Math.max(maxCandidates,ids.length);
  return {ids};
}
const root = partition(candidates,0);
function emitPartition(node,indent) {
  if (node.ids) {
    const ids = [...node.ids,...Array(maxCandidates-node.ids.length).fill(0)];
    return indent+'ids:={'+ids.join(',')+'};';
  }
  return [indent+'if pos['+(node.axis+1)+']<'+node.split+' then',
    emitPartition(node.left,indent+'  '),indent+'else',emitPartition(node.right,indent+'  '),indent+'end if;'].join('\n');
}
const exterior=[1,...Array(maxCandidates-1).fill(0)];
// Use the same conservative bounds before entering the narrow-phase function.
// Keep the large seabed separate so it cannot enlarge the wreck's guard volume.
const vectorLiteral=values=>'{'+values.join(',')+'}';
const bed=rows[0].split(',').map(Number);
const boundsConstants=[
  ['wreckLow',[0,1,2].map(i=>Math.min(...candidates.map(v=>v.low[i])))],
  ['wreckHigh',[0,1,2].map(i=>Math.max(...candidates.map(v=>v.high[i])))],
  ['bedLow',[0,1,2].map(i=>bed[i]-bed[15+i]-guardExtent-1e-6)],
  ['bedHigh',[0,1,2].map(i=>bed[i]+bed[15+i]+guardExtent+1e-6)]
].map(([name,values])=>'  constant Real '+name+'[3]='+vectorLiteral(values)+';');
const hullBounds=[0,1,2].map(i=>'pos['+(i+1)+']>='+Math.min(...candidates.map(x=>x.low[i]))+
    ' and pos['+(i+1)+']<='+Math.max(...candidates.map(x=>x.high[i]))).join(' and ');
const contactTree=['  constant Integer maxCandidates='+maxCandidates+';',
  '  constant Real guardExtent='+guardExtent+';',...boundsConstants,
  '  function contactCandidates','    input Real pos[3];','    output Integer ids[maxCandidates];','  algorithm',
  '    if '+hullBounds+' then',emitPartition(root,'      '),'    else','      ids:={'+exterior.join(',')+'};',
  '    end if;','    annotation(Inline=false);','  end contactCandidates;'].join('\n');
// Build a median-split bounding-volume hierarchy for the calibrated sensor rays.
// Constant bounds and leaf frames in Modelica let Rumoca specialize each subtree.
// All leaves share the exact oriented-box intersection used by the headless model.
let rayId=0;
function makeRayTree(solids) {
  const id=++rayId;
  const low=[0,1,2].map(k=>Math.min(...solids.map(row=>row[k]-row[15+k]))-1e-6);
  const high=[0,1,2].map(k=>Math.max(...solids.map(row=>row[k]+row[15+k]))+1e-6);
  if(solids.length===1)return {id,low,high,plate:solids[0]};
  const span=[0,1,2].map(k=>Math.max(...solids.map(row=>row[k]))-Math.min(...solids.map(row=>row[k])));
  const axis=span.indexOf(Math.max(...span));
  solids.sort((a,b)=>a[axis]-b[axis]);
  const mid=Math.floor(solids.length/2);
  return {id,low,high,left:makeRayTree(solids.slice(0,mid)),right:makeRayTree(solids.slice(mid))};
}
const tree=makeRayTree(rows.map(row=>row.split(',').map(Number)));
const rayFunctions=[];
const vector=values=>'{'+values.map(x=>x.toFixed(9)).join(',')+'}';
function emitRayNode(node,level,indent){
  if(node.plate){
    const p=node.plate;
    const rotation='['+[6,9,12].map(i=>p.slice(i,i+3).map(x=>x.toFixed(8)).join(',')).join(';')+']';
    return [indent+'distance:=Perception.plateRange(o,d,'+vector(p.slice(0,3))+','+vector(p.slice(3,6))+','+rotation+',distance);'];
  }
  const makeFunction=level%3===0;
  const bodyIndent=makeFunction?'    ':indent;
  const body=[bodyIndent+'if Perception.intersectsBounds(o,d,'+vector(node.low)+','+vector(node.high)+',distance) then',
    ...emitRayNode(node.left,level+1,bodyIndent+'  '),...emitRayNode(node.right,level+1,bodyIndent+'  '),bodyIndent+'end if;'];
  if(!makeFunction)return body;
  const name=level===0?'beamRange':'beamNode'+node.id;
  rayFunctions.push(['  function '+name,'    input Real o[3],d[3],limit;','    output Real distance;',
    '  algorithm','    distance:=limit;',...body,'  end '+name+';'].join('\n'));
  return [indent+'distance:='+name+'(o,d,distance);'];
}
emitRayNode(tree,0,'');
const src=['within Wreck;','package WreckSolids "Generated by scripts/wreck-solids.mjs"',
 '  constant Integer count='+rows.length+';','  function getBox','    input Integer index;',
 '    output Real box[18];','  algorithm',branches(0,rows.length-1,'    '),
 '    annotation(Inline=false);','  end getBox;',contactTree,...rayFunctions,'end WreckSolids;',''].join('\n');
writeFileSync(new URL('../Wreck/WreckSolids.mo',import.meta.url),src);
