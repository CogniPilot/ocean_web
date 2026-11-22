// The seam layout follows the reference Hobie 16 sail plan from tack to head.
const design=[
  {span:7.15,foot:2.78,rake:0,clewDrop:-.3713,
    girth:[1,.945,.855,.746,.53,.015],
    luff:[.09,.20,.30,.40,.50,.61,.72,.86],leech:[.16,.263,.357,.455,.557,.666,.774,.886]},
  {span:4.56,foot:1.98,rake:4.56*1.82/5.1,clewDrop:0,
    girth:[1,.803,.606,.409,.212,.015],
    luff:[.12,.33,.51,.70],leech:[.19,.38,.55,.73]}
];

export function sailTopology(rows){
  const indices=[];
  for(let row=0;row<rows-1;row++)for(let col=0;col<3;col++){
    const i=4*row+col;
    indices.push(i,i+1,i+5,i,i+5,i+4);
  }
  return new Uint16Array(indices);
}

export const clothTopology=sailTopology(6);

export const sailPanelFields=[1,2].map(sail=>
  ['rowLuff','rowLeech','telltalePanelRows','vertex'].map(name=>`cloth[${sail}].${name}`));

export function sailPanelTexture(luff,leech,telltaleRows){
  const uv=[],pockets=[];
  for(let row=0;row<luff.length;row++){
    const path=[];
    for(let col=0;col<4;col++){
      const u=col/3,v=luff[row]+u*(leech[row]-luff[row]);
      uv.push(u,v);
      path.push([u,1-v]);
    }
    if(row>0&&row<luff.length-1)pockets.push(path);
  }
  const windows=telltaleRows.map(row=>{
    const i=8*row;
    return 1-(.40*uv[i+1]+.12*uv[i+3]+.48*uv[i+11]);
  });
  return {uv,pockets,windows};
}

export function battenPath(mesh,triangles,luff,leech){
  function edgePoint(span,col){
    const height=5*span,row=Math.min(4,Math.floor(height)),f=height-row;
    const i=3*(4*row+col),next=i+12;
    return [mesh[i]+f*(mesh[next]-mesh[i]),mesh[i+2]+f*(mesh[next+2]-mesh[i+2])];
  }
  // Cut a straight seam in the flat cloth pattern. A diagonal in normalized
  // UV space backtracks near the head because the last sail panel tapers so far.
  const ends=[edgePoint(luff,0),edgePoint(leech,3)],segments=[];
  for(let face=0;face<triangles.length;face+=3){
    const [i,j,k]=triangles.subarray(face,face+3);
    const x=mesh[3*i],z=mesh[3*i+2];
    const jx=mesh[3*j]-x,jz=mesh[3*j+2]-z,kx=mesh[3*k]-x,kz=mesh[3*k+2]-z;
    const det=jx*kz-jz*kx;
    if(Math.abs(det)<1e-12)continue;
    const [start,delta]=ends.map(([px,pz])=>{
      const wj=((px-x)*kz-(pz-z)*kx)/det,wk=(jx*(pz-z)-jz*(px-x))/det;
      return [1-wj-wk,wj,wk];
    });
    let first=0,last=1;
    for(let c=0;c<3;c++){
      delta[c]-=start[c];
      // Inside the triangle all three barycentric coordinates are nonnegative.
      if(delta[c]>1e-12)first=Math.max(first,-start[c]/delta[c]);
      else if(delta[c]<-1e-12)last=Math.min(last,-start[c]/delta[c]);
      else if(start[c]<-1e-12)last=first;
    }
    if(last-first<=1e-9)continue;
    const at=t=>[i,j,k,...start.map((base,c)=>base+t*delta[c])];
    segments.push({first,from:at(first),to:at(last)});
  }
  return segments.sort((a,b)=>a.first-b.first);
}

const texturePaths=[];
export function battenTexturePaths(sail){
  if(texturePaths[sail])return texturePaths[sail];
  // Nominal unstrained cloth for drawing the same pockets on local and remote boats.
  const {span,foot,rake,clewDrop,girth,luff,leech}=design[sail];
  const rest=[];
  for(let row=0;row<6;row++)for(let col=0;col<4;col++){
    const v=row/5,u=col/3;
    rest.push(-v*rake-u*foot*girth[row],0,span*v+clewDrop*(1-v)*u);
  }
  function uv([i,j,k,wi,wj,wk]){
    const u=((i%4)*wi+(j%4)*wj+(k%4)*wk)/3;
    const v=(Math.floor(i/4)*wi+Math.floor(j/4)*wj+Math.floor(k/4)*wk)/5;
    return [u,1-v];
  }
  texturePaths[sail]=luff.map((height,i)=>{
    const path=battenPath(rest,clothTopology,height,leech[i]);
    return [uv(path[0].from),...path.map(section=>uv(section.to))];
  });
  return texturePaths[sail];
}
