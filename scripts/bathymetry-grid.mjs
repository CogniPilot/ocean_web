// Emit north-fast terrain samples in millimetres, matching the rendered vertices.
// A flat literal lets the compiler keep the constant depths in read-only storage.
import {writeFileSync} from 'node:fs';
import bed from '../viewer/bathymetry.js';
const n=(bed.max-bed.min)/bed.step+1;
const rows=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>
  Math.round(1000*bed.node(bed.min+i*bed.step,bed.min+j*bed.step))));
const reference=Math.max(0,...rows.map(row=>Math.max(...row)));
const depths=rows.map(row=>row.map(z=>reference-z).join(',')).join(',\n      ');
writeFileSync(new URL('../Wreck/BedGrid.mo',import.meta.url),`within Wreck;
package BedGrid "Generated from viewer/bathymetry.js by scripts/bathymetry-grid.mjs"
  constant Real datum=${bed.datum},low=${bed.min},high=${bed.max},spacing=${bed.step};
  constant Integer cells=${n-1};
  function adjacent
    input Integer i,j "Zero-based indices of the southwest grid node";
    output Real south,north;
  protected
    constant Integer depthMm[${n*n}]={
      ${depths}};
    Integer k;
  algorithm
    // Clamp the east index as in the original row selector. Index zero signals
    // a missing north neighbor through the ordinary Modelica array bounds check.
    k:=if j>=0 and j<cells then (cells+1)*min(cells,max(0,i))+j+1 else 0;
    south:=.001*(${reference}-depthMm[k]);north:=.001*(${reference}-depthMm[k+1]);
    annotation(Inline=false);
  end adjacent;
end BedGrid;
`);
