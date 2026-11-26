import {readFile, writeFile} from 'node:fs/promises';
import bed from '../../viewer/bathymetry.js';
import {caveSurface} from '../../viewer/abyss-cave.mjs';
import {wreckSites} from '../../viewer/red-sea-sites.mjs';

const [axesPath, output] = process.argv.slice(2);
const axis = [[], [], []];
for (const line of (await readFile(axesPath, 'utf8')).trim().split(/\r?\n/)) {
  const [direction, value] = line.split(/\s+/);
  axis['ENU'.indexOf(direction)].push(Number(value));
}
const centers = axis.map(faces => faces.slice(1).map((v,i) => (v + faces[i]) / 2));
const [nx, ny, nz] = centers.map(a => a.length);
const strides = [1, nx, nx * ny];
const wallMask = new Uint8Array(nx * ny * nz);
let wetCells = 0;
for (let j=0; j<ny; j++) for (let i=0; i<nx; i++) {
  const height = bed.surfaceHeight(centers[0][i], centers[1][j]);
  for (let k=0; k<nz; k++) {
    const id = i + nx*(j+ny*k);
    if (centers[2][k] <= height) wallMask[id] = 127;
    else wetCells++;
  }
}
for (let k=0; k<nz; k++) for (let j=0; j<ny; j++) for (let i=0; i<nx; i++) {
  const coords=[i,j,k], id=i+nx*(j+ny*k);
  if (wallMask[id]&64) continue;
  for (let d=0; d<3; d++) for (let side=0; side<2; side++) {
    const index=coords[d]+(side?1:-1), bit=1<<(2*d+side);
    if (index<0 || index>=centers[d].length) {
      if (d===2) wallMask[id]|=bit; // rigid lid and bottom; open lateral boundaries
    } else if (wallMask[id+(side?1:-1)*strides[d]]&64) {
      wallMask[id]|=bit;
    }
  }
}
const sub=(a,b)=>a.map((v,d)=>v-b[d]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function lowerBound(array, value) {
  let lo=0, hi=array.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(array[mid]<value)lo=mid+1;else hi=mid;}
  return lo;
}
function rasterize(mesh, origin) {
  let links=0;
  const vertex = n=>origin.map((v,d)=>mesh.positions[3*n+d]+v);
  for (let t=0; t<mesh.indices.length; t+=3) {
    const points=mesh.indices.slice(t,t+3).map(vertex);
    const [a,b,c]=points,e1=sub(b,a),e2=sub(c,a);
    for(let d=0; d<3; d++) {
      const unit=[0,0,0];unit[d]=1;
      const h=cross(unit,e2), det=dot(e1,h);
      if(Math.abs(det)<1e-12)continue;
      const lo=axis.map((_,l)=>Math.max(0,lowerBound(centers[l],Math.min(...points.map(p=>p[l]))-1e-8)-(l===d?1:0)));
      const hi=axis.map((_,l)=>Math.min(centers[l].length-(l===d?1:0),lowerBound(centers[l],Math.max(...points.map(p=>p[l]))+1e-8)));
      for(let k=lo[2]; k<hi[2]; k++) for(let j=lo[1]; j<hi[1]; j++) for(let i=lo[0]; i<hi[0]; i++) {
        const id=i+nx*(j+k*ny), next=id+strides[d];
        const index=[i,j,k], p=index.map((idx,l)=>centers[l][idx]), r=sub(p,a), q=cross(r,e1);
        const u=dot(r,h)/det, v=dot(unit,q)/det, l=dot(e2,q)/det;
        if(u< -1e-9 || v< -1e-9 || u+v>1+1e-9 || l< -1e-9 ||
            l>centers[d][index[d]+1]-p[d]+1e-9)continue;
        const bit=1<<(2*d+1);
        if(!(wallMask[id]&bit) && !(wallMask[next]&64))links++;
        wallMask[id]|=bit;
        wallMask[next]|=bit>>1;
      }
    }
  }
  return links;
}
const surfaces={};
for(const site of wreckSites) {
  const mesh=JSON.parse(await readFile(new URL('../../viewer/assets/red-sea/'+site.id+'/collision.json', import.meta.url),'utf8'));
  surfaces[site.id]=rasterize(mesh,[site.east,site.north,bed.height(site.east,site.north)-site.burial]);
}
surfaces.cave=rasterize(caveSurface(bed),[0,0,0]);
const grid={eastFaces:axis[0],northFaces:axis[1],upFaces:axis[2],wallMask:Array.from(wallMask),
  geometry:{method:'Meshing.loftHexMesh + Meshing.stretchFarField, two-sided triangle intersections',wetCells,blockedSurfaceLinks:surfaces}};
await writeFile(output,JSON.stringify(grid));
console.log(JSON.stringify({shape:[nx,ny,nz],...grid.geometry}));
