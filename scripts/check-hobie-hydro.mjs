// Compare the WASM hull integration with a dense integration over the same loft.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {alignPontoonSamples} from '../viewer/physics-view.mjs';

const read=async url=>new Response(await readFile(url));
const root=async path=>import(pathToFileURL(resolve(path,'instance.mjs')));
const {loadInstance}=await root(process.argv[2]??'viewer/fmi3');
const prior=process.argv[3]?await root(process.argv[3]):null;
const shore=await readFile(new URL('../viewer/board/Shore.mo',import.meta.url),'utf8');
const loft=shore.match(/constant Real pontoon\[12,4\]=\[([^\]]+)\]/)[1].split(';')
  .map(row=>row.split(',').map(Number));
const densityGravity=1025*9.80665;
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const rms=values=>Math.sqrt(dot(values,values)/values.length);

function profileAt(x){
  const right=loft.findIndex(row=>row[0]>x);
  const left=loft[right-1],next=loft[right],fraction=(x-left[0])/(next[0]-left[0]);
  return left.slice(1).map((value,i)=>value+(next[i+1]-value)*fraction);
}

function reference(boat,amplitude){
  const names=['stationX','beamFraction','halfSpacing','rotation','surfaceNormal','swellLocal','swellPhase','heave','waveHeight'];
  const [bands,fractions,spacing,rotation,normal,direction,phase,heave,waveHeight]=boat.getMany(names);
  const rotate=(x,y,z)=>[0,3,6].map(i=>dot(rotation.slice(i,i+3),[x,y,z]));
  const projection=-dot(normal,[rotation[2],rotation[5],rotation[8]]);
  const bandVolumes=Array(12).fill(0);
  let lift=0,pitch=0,roll=0;
  for(let band=0;band<6;band++){
    const steps=512,dx=(bands[band+1]-bands[band])/steps;
    for(let i=0;i<steps;i++){
      const x=bands[band]+(i+.5)*dx;
      const [width,deck,keel]=profileAt(x);
      const levels=[0,.10,.44,1].map(fraction=>keel+(deck-keel)*fraction);
      for(const hull of [0,1])for(const side of [-1,1])for(let strip=0;strip<3;strip++){
        const y=(1-2*hull)*spacing+side*width*(fractions[strip]+fractions[strip+1])/2;
        const bottom=(levels[strip]+levels[strip+1])/2,point=rotate(x,y,bottom);
        const wave=amplitude*Math.sin(phase+dot(direction,point.slice(0,2)));
        const depth=Math.max(0,Math.min(deck-bottom,(waveHeight-heave+dot(normal,point)+wave)/projection));
        const volume=depth*dx*width*(fractions[strip+1]-fractions[strip]);
        const arm=rotate(x,y,bottom+.5*depth);
        bandVolumes[6*hull+band]+=volume;
        lift+=volume*densityGravity;
        pitch-=arm[0]*volume*densityGravity;
        roll+=arm[1]*volume*densityGravity;
      }
    }
  }
  return {lift,pitch,roll,bandVolumes};
}

async function errors(loader,options){
  const boat=await loader('Hobie16',{launchEast:-135,launchNorth:-80,launchHeading:0,manualHelm:1,
    swellBearing:0,windEast:0,windNorth:0,...options},read);
  const referenceLoads=reference(boat,options.swellAmplitude??0);
  const [lift,pitch,hullRoll,volume]=boat.getMany(['buoyancy','pitchBuoyancy','hullRoll','sectionVolume']);
  const roll=hullRoll[0]+hullRoll[1];
  if(boat.has('hydroSectionVolume')){
    const [native,bounds,geometry]=boat.getMany(['hydroSectionVolume','hydroStationBounds','hydroStationGeometry']);
    assert.equal(native.length,24);
    assert.equal(bounds.length,13);
    assert.equal(geometry.length,72);
    for(let i=0;i<12;i++){
      assert(Math.abs(volume[i]-native[2*i]-native[2*i+1])<1e-12,'Wake strips conserve summed native volume');
      assert(Math.abs(geometry[6*i]-.5*(bounds[i]+bounds[i+1]))<1e-12,'Telemetry reports the integration stations');
    }
  }
  const bandError=rms(volume.map((value,i)=>value-referenceLoads.bandVolumes[i]));
  return {lift:lift-referenceLoads.lift,pitch:pitch-referenceLoads.pitch,roll:roll-referenceLoads.roll,bandError};
}

const cases=[
  {launchHeight:.20},{launchHeight:.12,launchPitch:.03,waveRoll:.18},
  {launchHeight:.20,launchPitch:.12,waveRoll:.12},{launchHeight:.11,launchPitch:-.02,waveRoll:.34},
  {launchHeight:.35,launchPitch:.19,swellAmplitude:1.2,launchEast:(2.75-10*Math.PI)/(2*Math.PI/30.48)},
  {launchHeight:.20,launchPitch:-.13,waveRoll:.10},
];
const candidate=[],baseline=[];
for(const options of cases){
  candidate.push(await errors(loadInstance,options));
  if(prior)baseline.push(await errors(prior.loadInstance,options));
}
const totals=rows=>Object.fromEntries(Object.keys(rows[0]).map(key=>[key,rms(rows.map(row=>row[key]))]));
const result=totals(candidate);
assert(result.lift<20&&result.pitch<40&&result.roll<25,'Resolved hull loads agree with the dense reference');
if(prior){
  const before=totals(baseline);
  console.log({before,after:result});
  assert(result.lift<.6*before.lift&&result.pitch<.6*before.pitch&&result.bandError<.8*before.bandError,
    'Refinement converges toward the dense reference');
}else console.log(result);

const legacyWater=await loadInstance('Hobie16',{manualHelm:1,useSectionWater:1,
  previousWater:[.1,.2,.3,.4,.5,.6,-.1,-.2,-.3,-.4,-.5,-.6]},read);
const [bounds,geometry,water]=legacyWater.getMany(['stationX','hydroStationGeometry','hydroSectionWater']);
const midpoint=Array.from({length:6},(_,i)=>.5*(bounds[i]+bounds[i+1]));
for(let panel=0;panel<12;panel++){
  const x=geometry[6*panel],right=midpoint.findIndex(value=>value>x);
  const expected=right===0?.1:right===-1?.6:.1*(right+(x-midpoint[right-1])/(midpoint[right]-midpoint[right-1]));
  assert(Math.abs(water[panel]-expected)<1e-12&&Math.abs(water[panel+12]+expected)<1e-12,
    'The old coarse water inputs interpolate to the refined stations');
}

// Old world locations must never displace the dots from the rendered slices.
const stale=Float64Array.from({length:72},(_,i)=>i%3===2?Math.sin(i):1000+i);
const yaw=.65,heel=.4,pitch=-.3,separation=1.02;
const c=Math.cos(yaw),s=Math.sin(yaw),sx=Math.sin(heel),cx=Math.cos(heel),sy=Math.sin(pitch),cy=Math.cos(pitch);
const transform=[c*cy,s*cy,-sy,0,c*sy*sx-s*cx,s*sy*sx+c*cx,cy*sx,0,0,0,0,0,35,-70,.8,1];
const aligned=alignPontoonSamples(stale,geometry,separation,transform,new Float64Array(stale.length));
for(let i=0;i<24;i++){
  const x=geometry[6*(i%12)],y=i<12?separation:-separation;
  const forward=x*cy+y*sx*sy,port=y*cx;
  assert(Math.abs(aligned[3*i]-(35+forward*c-port*s))<1e-12);
  assert(Math.abs(aligned[3*i+1]-(-70+forward*s+port*c))<1e-12);
  assert.equal(aligned[3*i+2],stale[3*i+2]);
}
