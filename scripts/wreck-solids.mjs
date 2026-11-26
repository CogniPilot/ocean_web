// Rasterize actual occupied survey triangles, including their inferred keels, for FMI ray queries.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {caveSurface} from '../viewer/abyss-cave.mjs';
import {wreckSites} from '../viewer/red-sea-sites.mjs';
const require=createRequire(import.meta.url),T=require('../viewer/vendor/three.min.js'),bed=require('../viewer/bathymetry.js');
const spacing=.24,sites=[];
for(const site of [...wreckSites,{id:"abyssCave"}]){
  const name=site.id;
  const cave=name==='abyssCave';
  const {positions,indices}=cave?caveSurface(bed):JSON.parse(readFileSync(new URL('../viewer/assets/red-sea/'+name+'/collision.json',import.meta.url)));
  const offset=cave?new T.Vector3():new T.Vector3(site.east,site.north,bed.height(site.east,site.north)-site.burial);
  const pts=Array.from({length:positions.length/3},(_,j)=>new T.Vector3().fromArray(positions,3*j).add(offset));
  const bounds=new T.Box3().setFromPoints(pts),origin=bounds.min.toArray().map(v=>spacing*Math.floor(v/spacing));
  const dims=bounds.max.toArray().map((v,i)=>Math.floor((v-origin[i])/spacing)+1);
  const [nx,ny,nz]=dims,bands=Math.ceil(nz/24),masks=new Int32Array(nx*ny*bands);
  const box=new T.Box3(),tri=new T.Triangle();
  for(let n=0;n<indices.length;n+=3){
    tri.set(pts[indices[n]],pts[indices[n+1]],pts[indices[n+2]]);
    const range=box.setFromPoints([tri.a,tri.b,tri.c]);
    const cell=p=>p.toArray().map((v,k)=>Math.floor((v-origin[k])/spacing));
    const low=cell(range.min),high=cell(range.max);
    for(let i=low[0];i<=high[0];i++)for(let j=low[1];j<=high[1];j++)for(let k=low[2];k<=high[2];k++){
      box.min.set(origin[0]+i*spacing,origin[1]+j*spacing,origin[2]+k*spacing);
      box.max.copy(box.min).addScalar(spacing);
      if(box.intersectsTriangle(tri))masks[(i*ny+j)*bands+Math.floor(k/24)]|=1<<(k%24);
    }
  }
  sites.push({name,origin,dims,bands,masks});console.log(name,dims,indices.length/3+' scan triangles');
}
const matrix=rows=>'['+rows.map(r=>r.join(',')).join(';')+']';
const lines=['within Wreck;','package ScanOccupancy "Generated from the registered collision scans and abyss cave by scripts/wreck-solids.mjs"',
 '  constant Real spacing='+spacing+';', '  constant Real low[3,3]='+matrix(sites.map(s=>s.origin.map(v=>+v.toFixed(8))))+';',
 '  constant Integer dims[3,3]='+matrix(sites.map(s=>s.dims))+';',
 '  constant Real high[3,3]='+matrix(sites.map(s=>s.origin.map((v,k)=>+(v+s.dims[k]*spacing).toFixed(8))))+';'];
for(const [site,s] of sites.entries()){
 const [nx,ny]=s.dims,rows=ny*s.bands;
 for(let start=0;start<nx;start+=8){
   const end=Math.min(nx,start+8),len=(end-start)*rows;
   const table=Array.from({length:end-start},(_,i)=>Array.from(s.masks.subarray((start+i)*rows,(start+i+1)*rows)).join(','));
   lines.push('  function block'+site+'x'+start,'    input Integer idx; output Integer bits;',
     '  protected constant Integer data['+len+']={\n      '+table.join(',\n      ')+'};',
     '  algorithm bits:=data[idx];','    annotation(Inline=false);','  end block'+site+'x'+start+';');
 }
 lines.push('  function '+s.name+'Column','    input Integer i,j,band; output Integer bits;','  algorithm');
 for(let start=0;start<nx;start+=8)lines.push('    '+(start===0?'if':'elseif')+' i<'+(start+8)+' then bits:=block'+site+'x'+start+'((i-'+start+')*'+rows+'+j*'+s.bands+'+band+1);');
 lines.push('    else bits:=0;end if;','    annotation(Inline=false);','  end '+s.name+'Column;');
}
lines.push('  function occupied','    input Integer site,i,j,k; output Boolean value;',
 '  protected Integer bits; constant Integer bit[24]={'+Array.from({length:24},(_,i)=>2**i).join(',')+'};','  algorithm',
 '    value:=false;','    if i>=0 and i<dims[site,1] and j>=0 and j<dims[site,2] and k>=0 and k<dims[site,3] then',
 '      bits:=if site==1 then '+sites[0].name+'Column(i,j,div(k,24)) elseif site==2 then '+sites[1].name+'Column(i,j,div(k,24)) else '+sites[2].name+'Column(i,j,div(k,24));',
 '      value:=mod(div(bits,bit[mod(k,24)+1]),2)==1;','    end if;','    annotation(Inline=false);','  end occupied;','end ScanOccupancy;','');
writeFileSync(new URL('../Wreck/ScanOccupancy.mo',import.meta.url),lines.join('\n'));
