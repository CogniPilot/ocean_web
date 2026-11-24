// Subdivide each grid cell about the same body diagonal so adjacent isosurfaces join.
const tetrahedra=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
const edges=[[0,1],[1,2],[2,0],[0,3],[1,3],[2,3]];
const triangles=[[],[0,3,2],[0,1,4],[1,4,2,2,4,3],[1,2,5],[0,3,5,0,5,1],
  [0,2,5,0,5,4],[5,4,3],[3,4,5],[4,5,0,5,2,0],[1,5,0,5,3,0],
  [5,2,1],[3,4,2,2,4,1],[4,1,0],[2,3,0],[]];

export function volumeGeometry(T,grid,values,level,samples,tint){
  const [nx,ny,nz]=grid.dims,[ox,oy,oz]=grid.origin,h=grid.spacing;
  const positions=[],colors=[];
  const corners=[0,1,nx,nx+1,nx*ny,nx*ny+1,nx*ny+nx,nx*ny+nx+1];
  const cell=new Float64Array(8);
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const base=(z*ny+y)*nx+x;
    if(samples){
      if(values[base]>=level){
        positions.push(ox+h*x,oy+h*y,oz+h*z);
        const c=tint(values[base]);colors.push(c.r,c.g,c.b);
      }
      continue;
    }
    if(x===nx-1||y===ny-1||z===nz-1)continue;
    let above=0,valid=true;
    for(let i=0;i<8;i++){
      const v=values[base+corners[i]];
      if(!Number.isFinite(v)){valid=false;break;}
      cell[i]=v;if(v>=level)above++;
    }
    if(!valid||above===0||above===8)continue;
    for(const tet of tetrahedra){
      let mask=0;
      for(let i=0;i<4;i++)if(cell[tet[i]]>=level)mask|=1<<i;
      for(const edge of triangles[mask]){
        const a=tet[edges[edge][0]],b=tet[edges[edge][1]];
        const t=(level-cell[a])/(cell[b]-cell[a]);
        for(let axis=0;axis<3;axis++){
          const p=(a>>axis)&1,q=(b>>axis)&1;
          const index=axis===0?x:axis===1?y:z;
          positions.push(grid.origin[axis]+h*(index+p+t*(q-p)));
        }
      }
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  if(samples)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  else g.computeVertexNormals();
  return g;
}
