import {abyssPlaque} from './abyss-plaque.mjs';

// Coordinates are local harbor east, north and up in metres.
export const abyssCave=Object.freeze({
  armRoot:Object.freeze([-35.30,-27.25]),
  entrance:Object.freeze([-29,-30,-46.1]),lair:Object.freeze([-32,-30,-45.7]),triggerRadius:1.15,
  approach:Object.freeze([-27.50,-30,-45.15]),heading:Math.PI
});

// Roof and passage share one shell for appearance, narrow-phase contact and acoustic rasterization.
export function caveSurface(bed) {
  const positions=[],indices=[],colors=[],passage=[];
  // E, N, half-width, clear arch height, rock thickness and lateral direction.
  // The broad first chamber turns into a blind passage up the pit flank.
  const rings=[
    [-29.05,-30.00,2.03,3.19,.78,0],[-29.55,-29.91,2.23,3.40,1.02,0],
    [-30.40,-30.11,2.48,3.62,1.29,0],[-31.32,-30.06,2.63,3.74,1.55,0],
    [-32.32,-29.92,2.48,3.59,1.81,0],[-33.22,-29.83,1.87,2.88,1.84,0],
    [-34.15,-29.66,1.54,2.91,.97,.18],[-34.90,-29.10,1.30,2.87,.82,.61],
    [-35.35,-28.20,1.26,2.85,.71,1.12],[-35.42,-27.05,1.33,3.02,.76,1.55],
    [-35.12,-25.90,1.47,3.18,.88,1.91],[-34.47,-24.96,1.50,3.12,.83,2.24],
    [-33.74,-24.28,1.11,2.39,.71,2.41],[-33.12,-23.83,.55,1.37,.56,2.50]
  ];
  const arcs=16;
  function vertex(x,y,z,tint) {
    positions.push(x,y,z);
    colors.push(tint*.88,tint*.91,tint);
    return positions.length/3-1;
  }
  function panel(a,b,c,d) {indices.push(a,b,c,a,c,d);}
  const inside=[],outside=[];
  for(const [k,[x,cy,r,h,thick,bend]] of rings.entries()) {
    const inner=[],outer=[],sideX=Math.sin(bend),sideY=Math.cos(bend);
    for(let j=0;j<=arcs;j++) {
      const a=Math.PI*j/arcs,c=Math.cos(a),s=Math.sin(a);
      const joint=.12*Math.sin(4.78*k+1.17*j)+.066*Math.cos(2.27*k+.81*j);
      const side=(r+.34*joint)*c;
      const xInner=x+joint*(k===0?1.7:.71)*sideY+side*sideX;
      const yInner=cy-joint*.71*sideX+side*sideY;
      const floor=bed.height(xInner,k<6?cy:yInner);
      const zInner=floor-.24+Math.pow(s,.76)*(h+.14*Math.sin(2.34*k-1.68*j));
      inner.push(vertex(xInner,yInner,zInner,.42+.19*s+.06*Math.sin(j*.83+k)));
      // A thick, weathered lip broadens into the existing pit slope at the sides.
      const radial=(r+thick*(1.32+.13*Math.sin(j*.87))+joint*.9)*c;
      const axial=(k===0?.48:k===rings.length-1?-.48:0)+joint*1.5;
      const xOuter=x+axial*sideY+radial*sideX;
      const yOuter=cy-axial*sideX+radial*sideY;
      const zOuter=bed.height(xOuter,yOuter)-.41+Math.pow(s,.61)*(h+thick+joint);
      outer.push(vertex(xOuter,yOuter,zOuter,.85+.11*Math.cos(j*1.9+k*.73)));
    }
    inside.push(inner);outside.push(outer);
    if(k) {
      for(let j=0;j<arcs;j++) {
        panel(inside[k-1][j],inner[j],inner[j+1],inside[k-1][j+1]);
        passage.push(...indices.slice(-6));
        panel(outside[k-1][j],outside[k-1][j+1],outer[j+1],outer[j]);
      }
      panel(inside[k-1][0],outside[k-1][0],outer[0],inner[0]);
      panel(inside[k-1][arcs],inner[arcs],outer[arcs],outside[k-1][arcs]);
    }
  }
  for(let j=0;j<arcs;j++)panel(inside[0][j],inside[0][j+1],outside[0][j+1],outside[0][j]);
  // Close the far end behind the bend, including the buried underside of its cap.
  const n=rings.length-1,[x,y,,,,bend]=rings[n],tips=[];
  for(const [row,extension,tint] of [[inside[n],.4,.42],[outside[n],1.05,.81]]) {
    const endX=x-extension*Math.cos(bend),endY=y+extension*Math.sin(bend);
    const tip=vertex(endX,endY,bed.height(endX,endY)-.18,tint);tips.push(tip);
    for(let j=0;j<arcs;j++){
      indices.push(row[j],row[j+1],tip);
      if(row===inside[n])passage.push(row[j],row[j+1],tip);
    }
  }
  panel(inside[n][0],tips[0],tips[1],outside[n][0]);
  panel(outside[n][arcs],tips[1],tips[0],inside[n][arcs]);
  return {positions,indices,colors,passage};
}

// Vertical clearance in the surveyed passage. Index the actual interior triangles
// by 1 m square so a strike can check nearby rock without querying the whole scene.
export function caveWaterColumn(bed){
  const {positions,passage}=caveSurface(bed),columns=new Map();
  const key=(x,y)=>32*(Math.floor(x)+40)+Math.floor(y)+40;
  for(let i=0;i<passage.length;i+=3){
    const [a,b,c]=passage.slice(i,i+3).map(id=>positions.slice(3*id,3*id+3));
    const ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1],det=ux*vy-uy*vx;
    if(Math.abs(det)<1e-10)continue;
    const tri=[a,ux,uy,vx,vy,1/det,b[2]-a[2],c[2]-a[2]];
    for(let x=Math.floor(Math.min(a[0],b[0],c[0]));x<=Math.max(a[0],b[0],c[0]);x++)
      for(let y=Math.floor(Math.min(a[1],b[1],c[1]));y<=Math.max(a[1],b[1],c[1]);y++){
        const k=key(x,y);if(!columns.has(k))columns.set(k,[]);columns.get(k).push(tri);
      }
  }
  return function ceiling(x,y){
    let z=Infinity;
    for(const [a,ux,uy,vx,vy,id,uz,vz] of columns.get(key(x,y))??[]){
      const dx=x-a[0],dy=y-a[1],u=(dx*vy-dy*vx)*id,v=(ux*dy-uy*dx)*id;
      if(u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001)z=Math.min(z,a[2]+u*uz+v*vz);
    }
    return z===Infinity?-Infinity:z;
  };
}

export function abyssCaveScenery(T,parent,bed) {
  const {positions,indices,colors}=caveSurface(bed);
  const indexed=new T.BufferGeometry();
  indexed.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  indexed.setAttribute('color',new T.Float32BufferAttribute(colors,3));indexed.setIndex(indices);
  indexed.computeVertexNormals();
  const geom=indexed.toNonIndexed();indexed.dispose();
  // Project each triangle onto its widest coordinate plane so ceilings and sides retain the same stone grain.
  const xyz=geom.getAttribute('position'),uv=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  for(let i=0;i<xyz.count;i+=3) {
    a.fromBufferAttribute(xyz,i);b.fromBufferAttribute(xyz,i+1);c.fromBufferAttribute(xyz,i+2);
    const n=b.sub(a).cross(c.sub(a)),x=Math.abs(n.x),y=Math.abs(n.y),z=Math.abs(n.z);
    for(let j=i;j<i+3;j++) {
      if(x>y&&x>z)uv.push(.62*xyz.getY(j),.62*xyz.getZ(j));
      else if(y>z)uv.push(.62*xyz.getX(j),.62*xyz.getZ(j));
      else uv.push(.62*xyz.getX(j),.62*xyz.getY(j));
    }
  }
  geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geom.computeBoundingSphere();
  const loader=new T.TextureLoader();
  const textures=['albedo','surface'].map(kind=>{
    const url=new URL('./assets/subsea/reef-rubble-'+kind+'.webp',import.meta.url);
    url.search=new URL(import.meta.url).search;
    const map=loader.load(url.href);
    map.wrapS=map.wrapT=T.RepeatWrapping;
    if(kind==='albedo')map.colorSpace=T.SRGBColorSpace;
    return map;
  });
  const mat=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,map:textures[0],roughnessMap:textures[1],
    bumpMap:textures[1],bumpScale:.032,roughness:1,color:0x758181});
  const mesh=new T.Mesh(geom,mat);mesh.name='Abyss rock cave';parent.add(mesh);
  mesh.visible=false;
  const plaque=abyssPlaque(T,parent,bed,textures);
  return {update(eye){plaque.update(eye);mesh.visible=eye.z< -10 && Math.hypot(eye.x+32,eye.y+30,eye.z+45)<44;},
    dispose(){plaque.dispose();mesh.removeFromParent();geom.dispose();mat.dispose();for(const t of textures)t.dispose();}};
}
