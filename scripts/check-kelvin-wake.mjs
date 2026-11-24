// Sample the deployed Modelica wake from a compact symmetric tow source.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';

const read=async url=>new Response(await readFile(url));
const period=80,depth=24,side=64,spacing=period/side;
const kelvinHalfAngle=Math.asin(1/3)*180/Math.PI;
const wrap=index=>(index%side+side)%side;
const zeros=Array(6).fill(0);

function sample(tile,east,north){
  const u=east/spacing,v=north/spacing,i=Math.floor(u),j=Math.floor(v);
  const x=u-i,y=v-j;
  const at=(column,row)=>tile[wrap(row)*side+wrap(column)];
  return (1-y)*((1-x)*at(i,j)+x*at(i+1,j))+y*((1-x)*at(i,j+1)+x*at(i+1,j+1));
}

async function tow(speed){
  const model=await loadInstance('WakeSpectrum',{
    period,depth,heading:0,separation:0,currentEast:0,currentNorth:0,windEast:0,windNorth:0,seaAmplitude:0,decay:.055,
    stations:[-2.7,-1.8,-.7,-.35,.35,1.6,2.7],beamHalf:Array(7).fill(.35),volume:[0,0,0,.30,0,0,...zeros]
  },read);
  const energy=Array(45).fill(0);
  let distance=0,resistance=0,frames=0,samples=0,asymmetry=0;
  for(let step=1;step<=180;step++){
    distance+=.1*speed*Math.min(1,step/20);
    model.set('east',distance);model.advance(.1);
    if(step<142||step%4!==0)continue;
    const tile=model.get('wakeHeight');
    resistance-=model.get('waveLoad')[0];frames++;
    for(let degrees=0;degrees<energy.length;degrees++){
      const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
      for(let radius=12;radius<=22;radius+=.5){
        const x=distance-radius*c,y=radius*s;
        const a=sample(tile,x,y),b=sample(tile,x,-y);
        asymmetry=Math.max(asymmetry,Math.abs(a-b));
        energy[degrees]+=.5*(a*a+b*b);
      }
    }
    samples+=21;
  }
  const rms=energy.map(sum=>Math.sqrt(sum/samples));
  const near=rms.filter((_,angle)=>Math.abs(angle-kelvinHalfAngle)<=3);
  const outside=rms.filter((_,angle)=>angle>=kelvinHalfAngle+9);
  const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  const ratio=mean(near)/mean(outside);
  const peakAngle=rms.indexOf(Math.max(...rms));
  assert(resistance>0&&asymmetry<1e-9);
  assert(ratio>4,'Expected stronger wake just inside and near the Kelvin boundary than well outside it');
  assert(peakAngle<kelvinHalfAngle+3,'Strongest wave lies beyond the Kelvin sector');
  return {speed,resistanceN:resistance/frames,peakAngleDeg:peakAngle,nearToOutsideRms:ratio,asymmetryM:asymmetry,rms};
}

const cases=[];
for(const speed of [3.25,3.5,3.75])cases.push(await tow(speed));
console.log(JSON.stringify({periodM:period,depthM:depth,kelvinHalfAngleDeg:kelvinHalfAngle,cases},null,2));
