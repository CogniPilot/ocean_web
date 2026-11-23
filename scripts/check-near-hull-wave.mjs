// Compare the 25 cm local Modelica field with the metre-scale wake.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openFmuSession} from '../.deps/microduck_web/site/fmu-session.js';
import {fileFetch} from '../.deps/microduck_web/scripts/fmu-test-support.mjs';
import {scalarNames} from '../.deps/microduck_web/site/fmu-page-contract.js';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
import {bowFoamGrid} from '../viewer/bow-grid.mjs';

const base=pathToFileURL(resolve(process.argv[2]??'build/pages/sailing')+'/');
const manifest=JSON.parse(await readFile(new URL('manifest.json',base)));
const index=JSON.parse(await readFile(new URL(manifest.index,base)));
const field=await loadInstance('BowWavePatch',{breakingBows:1},async url=>new Response(await readFile(url)));
const size=32,spacing=.25;
assert.deepEqual(field.get('foamOrigin'),[bowFoamGrid.x,bowFoamGrid.y]);
assert.equal(field.get('foamSpacing'),bowFoamGrid.spacing);
const wrap=(k,n)=>(k%n+n)%n;
const datum=(field,i,j,n)=>field[wrap(j,n)*n+wrap(i,n)];
function interpolate(field,x,y,n){
  const i=Math.floor(x),j=Math.floor(y),a=x-i,b=y-j;
  const at=(dx,dy)=>datum(field,i+dx,j+dy,n);
  return (1-b)*((1-a)*at(0,0)+a*at(1,0))+b*((1-a)*at(0,1)+a*at(1,1));
}

// Keep only one bow wet. The water must divide on its two shoulders, and a
// lifted hull or a stationary boat must add no breaking foam or spray.
const isolatedBow=new Float64Array(14*6);
isolatedBow.set([1.55,1.02,.08,.012,2.25,.49],5*6);
field.set('sources',isolatedBow);
field.set('relativeSpeed',[6,0]);
field.advance(.01);
const [foam,jets]=field.getMany(['foamCoverage','sprayRelease']);
function coverage(x,y){
  const {x:originX,y:originY,columns,spacing}=bowFoamGrid;
  return foam[Math.round((y-originY)/spacing)*columns+Math.round((x-originX)/spacing)];
}
assert(coverage(1.7,.75)>.45&&coverage(1.7,1.3)>.45,'Water should split to both sides of the wet bow');
assert(coverage(1.0,1.7)>.10,'The foam must retain the shoulder aft of the old bow patch');
assert(coverage(1.7,1.02)<.01&&coverage(1.7,-1.02)===0,'A dry bow and the gap between crests should remain clear');
assert(jets[3]>0&&jets[9]<0&&jets[4]>0&&jets[10]>0&&jets[5]>0&&jets[11]>0);
assert(jets[17]===0&&jets[23]===0,'The lifted bow must release no spray');
field.set('relativeSpeed',[0,0]);
field.advance(.01);
assert(field.get('foamCoverage').every(value=>value===0));
assert(field.get('sprayRelease').filter((_,i)=>i%6===5).every(value=>value===0));

for(const launchSpeed of [3,6,8,13]){
  const parameters={'boat.launchSpeed':launchSpeed,'boat.launchEast':-130,'boat.launchNorth':-90,
    'boat.launchHeading':0,prevailingBearing:Math.PI/2};
  const fmu=await openFmuSession({index,base,fetch:fileFetch,parameters});
  function observe(name,shape){
    const binding=fmu.bind_outputs(JSON.stringify(scalarNames(name,shape)));
    return ()=>fmu.read_bound(binding);
  }
  try{
    fmu.set_inputs(JSON.stringify([['sailingManual',1],['windSpeed',11],['windBearing',Math.PI/2],['seaState',0]]));
    const frame=observe('bowFrame',[4]),sources=observe('bowSources',[14,6]),speed=observe('bowSpeed',[2]);
    const wake=observe('waves.wakeHeight',[64,64]);
    const motion=fmu.bind_outputs(JSON.stringify(['boat.surge','waves.driftE','waves.driftN']));
    let peakCoarse=0,peakOverlay=0,peakCombined=0,meanSpeed=0;
    let sternPeak=0,sternSlope=0;
    const samples=24;
    for(let sample=0;sample<samples;sample++){
      for(let j=0;j<10;j++)fmu.step(.01);
      const [east,north,c,s]=frame(),[surge,de,dn]=fmu.read_bound(motion);
      const rows=sources();
      for(let hull=0;hull<2;hull++){
        let flux=0;
        for(let row=0;row<7;row++)flux+=rows[(7*hull+row)*6+2];
        assert(Math.abs(flux)<1e-9,'Wetted-area sources conserve flux on each hull');
      }
      field.set('sources',rows);
      field.set('relativeSpeed',speed());
      field.advance(.01);
      const near=field.get('height'),coarse=wake();
      assert.equal(near.length,size*size);
      assert(near.every(Number.isFinite));
      assert(Math.abs(c*c+s*s-1)<1e-10);
      meanSpeed+=surge/samples;
      for(let j=-16;j<16;j++)for(let i=-16;i<16;i++){
        const z=datum(near,i,j,size),x=i*spacing,y=j*spacing;
        if(Math.hypot(x,y)>=3.8)assert.equal(Math.abs(z),0,'The bow field must reach zero before the texture seam');
        const hullEdge=Math.abs(Math.abs(y)-1.02);
        if(x<=-1.95&&hullEdge<.60){
          sternPeak=Math.max(sternPeak,z);
          sternSlope=Math.max(sternSlope,Math.abs(z-datum(near,i-1,j,size))/spacing,
            Math.abs(z-datum(near,i,j-1,size))/spacing);
        }
        if(x<1.75||x>3.25||hullEdge<.25||hullEdge>1.25)continue;
        const base=interpolate(coarse,east-de+c*x-s*y,north-dn+s*x+c*y,64);
        peakCoarse=Math.max(peakCoarse,base);
        peakOverlay=Math.max(peakOverlay,z);
        peakCombined=Math.max(peakCombined,base+z);
      }
    }
    console.log({launchSpeed,meanSpeed,peakCoarse,peakOverlay,peakCombined,sternPeak,sternSlope});
    if(launchSpeed>=6)assert(peakOverlay>.025&&peakCombined>peakCoarse+.01,'Expected a visible near-field crest outside the bows');
    assert(sternPeak<.25&&sternSlope<.45,'A ventilating transom must shed a broad wake without a steep local crest');
    fmu.set_inputs(JSON.stringify([['omitWake',1]]));
    for(let i=0;i<11;i++)fmu.step(.01);
    assert(sources().every(x=>x===0)&&frame().every(x=>x===0),'Low must skip the near-field calculation');
  }finally{fmu.free();}
}
