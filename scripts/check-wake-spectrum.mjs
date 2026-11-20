import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadInstance} from '../viewer/fmi3/instance.mjs';
const read=async url=>new Response(await readFile(url));
const section=[.009,.02,.027,.028,.015,.003];
const parameters={beamHalf:[.09,.156,.185,.184,.155,.093,.009],volume:[...section,...section],stations:[-2.55,-1.9,-.9,.15,1.12,1.95,2.55],separation:1.02};
const water=await loadInstance('WakeSpectrum',parameters,read);
const maxAbs=a=>a.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
for(let i=0;i<3;i++)water.advance(.1);
assert(maxAbs(water.get('height'))<1e-12);
for(let tick=1;tick<=100;tick++){
  water.set('east',.2*tick);
  water.advance(.1);
}
const stopped=water.get('height');
const tileAtOrigin=field=>maxAbs(field.slice(0,6));
assert(maxAbs(water.get('modesR'))>1e-3);
assert(tileAtOrigin(stopped)>1e-5,'Expected wake at least 15 m astern');
for(let tick=0;tick<20;tick++)water.advance(.1);
const later=water.get('height');
assert(tileAtOrigin(later.map((v,i)=>v-stopped[i]))>1e-5,'Waves should travel after the hull stops');
assert(Math.abs(later.reduce((a,b)=>a+b)/later.length)<1e-10);
const wind=await loadInstance('WakeSpectrum',{...parameters,windEast:10},read);
wind.advance(.1);
const windHeight=wind.get('height'),probe=wind.get('incident')[0];
assert(maxAbs(windHeight)>1e-4);
assert(Math.abs(windHeight[0]-probe)<1e-9,'Inverse FFT must agree with analytical wind-wave probe');
console.log({sternRippleMetres:tileAtOrigin(stopped),afterStoppingMetres:tileAtOrigin(later),windProbeMetres:probe});
// Translated identical hulls have a known interference factor. It must apply at
// oblique headings too, including when one of the two hulls is entirely dry.
for(const heading of [0,.73]){
  const center=await loadInstance('WakeSpectrum',{...parameters,heading,separation:0,volume:[...section,...section.map(()=>0)]},read);
  const twin=await loadInstance('WakeSpectrum',{...parameters,heading},read);
  const single=await loadInstance('WakeSpectrum',{...parameters,heading,volume:[...section,...section.map(()=>0)]},read);
  for(const m of [center,twin,single]){m.set('east',.23);m.advance(.1);}
  const spectra=[center,twin,single].map(m=>[m.get('displacementR'),m.get('displacementI')]);
  for(const [mx,my] of [[2,3],[4,15],[7,1]]){
    const i=my*64+mx,phase=(my*Math.cos(heading)-mx*Math.sin(heading))*2*Math.PI/64*parameters.separation;
    const [re,im]=spectra[0].map(a=>a[i]);
    const factor=2*Math.cos(phase);
    assert(Math.abs(spectra[1][0][i]-re*factor)<1e-10 && Math.abs(spectra[1][1][i]-im*factor)<1e-10);
    assert(Math.abs(spectra[2][0][i]-(re*Math.cos(phase)+im*Math.sin(phase)))<1e-10);
  }
}
