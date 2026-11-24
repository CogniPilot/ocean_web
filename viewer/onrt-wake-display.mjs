// Reconstruct the periodic solver field in translating (east/north) coordinates.
// A feature travelling with the hull then has the same texture coordinates in
// both snapshots, even while the hull crosses a world grid cell.
export function createWakeDisplayGrid(size,period) {
  const temp=new Float64Array(size*size);
  const weightsX=new Float64Array(size),weightsY=new Float64Array(size);
  const modeScale=Float64Array.from({length:size/2+1},(_,k)=>
    3/(2+Math.cos(2*Math.PI*k/size)));
  function weights(position,out) {
    const cells=position*size/period;
    const base=Math.floor(cells),fraction=cells-base;
    // Periodic trigonometric interpolation. The inverse cubic B-spline
    // response converts point samples to the coefficients used by the GPU.
    for(let j=0;j<size;j++){
      const angle=2*Math.PI*(fraction-j)/size;
      let value=1+modeScale[size/2]*Math.cos(size/2*angle);
      for(let k=1;k<size/2;k++)value+=2*modeScale[k]*Math.cos(k*angle);
      out[(j+base)&(size-1)]=value/size;
    }
  }
  // Transpose the output so both separable passes traverse contiguous rows.
  function shiftRows(input,w,output){
    for(let row=0;row<size;row++){
      const start=row*size;
      for(let col=0;col<size;col++){
        let sum=0;
        for(let j=0;j<size;j++)sum+=input[start+j]*w[(j-col)&(size-1)];
        output[col*size+row]=sum;
      }
    }
  }
  return (tile,east,north)=>{
    weights(east,weightsX);weights(north,weightsY);
    const display=new Float32Array(tile.length);
    shiftRows(tile,weightsX,temp);shiftRows(temp,weightsY,display);
    return display;
  };
}

// Each bilinear texture lookup combines four of the sixteen cubic weights.
// Both height channels share the same sampling position and contour levels.
export const wakeSamplingGLSL=`
    uniform sampler2D field;
    uniform vec2 origin,heightScale;
    uniform float basin,frameMix;
    float sampleWake(vec2 en){
      vec2 rel=en-origin;
      float edge=max(abs(rel.x),abs(rel.y))/basin;
      if(edge>=.5)return 0.;
      vec2 grid=rel*(64./basin),cell=floor(grid),t=fract(grid),u=1.-t;
      vec2 a=u*u*u/6.,d=t*t*t/6.;
      vec2 b=(4.-6.*t*t+3.*t*t*t)/6.,c=1.-a-b-d;
      vec2 lo=(cell-.5+b/(a+b))/64.,hi=(cell+1.5+d/(c+d))/64.;
      vec2 w=c+d;
      vec4 packedHeight=mix(mix(texture2D(field,lo),texture2D(field,vec2(hi.x,lo.y)),w.x),
                            mix(texture2D(field,vec2(lo.x,hi.y)),texture2D(field,hi),w.x),w.y);
      vec2 heights=heightScale*((packedHeight.xz*65280.+packedHeight.yw*255.)/32767.-1.);
      return mix(heights.x,heights.y,frameMix)*(1.-smoothstep(.46,.5,edge));
    }`;

// The spectral field extends through the forcing hull. Record the physical
// weather deck in body coordinates so the viewer can omit water over its interior.
export function createDeckHeightMap(T,geometry){
  geometry.computeBoundingBox();
  const {min,max}=geometry.boundingBox,width=1024,height=128;
  const sx=width/(max.x-min.x),sz=height/(max.z-min.z);
  const data=new Uint8Array(width*height),p=geometry.getAttribute('position');
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3(),n=new T.Vector3();
  for(let i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    ab.subVectors(b,a);ac.subVectors(c,a);n.crossVectors(ab,ac);
    if(!n.y || Math.abs(n.y)<.9*n.length())continue;
    const x0=Math.max(0,Math.ceil((Math.min(a.x,b.x,c.x)-min.x)*sx-.5));
    const x1=Math.min(width-1,Math.floor((Math.max(a.x,b.x,c.x)-min.x)*sx-.5));
    const z0=Math.max(0,Math.ceil((Math.min(a.z,b.z,c.z)-min.z)*sz-.5));
    const z1=Math.min(height-1,Math.floor((Math.max(a.z,b.z,c.z)-min.z)*sz-.5));
    for(let j=z0;j<=z1;j++)for(let k=x0;k<=x1;k++){
      const x=min.x+(k+.5)/sx-a.x,z=min.z+(j+.5)/sz-a.z;
      const u=(ac.x*z-ac.z*x)/n.y,v=(ab.z*x-ab.x*z)/n.y;
      if(u<0||v<0||u+v>1)continue;
      const y=a.y+u*ab.y+v*ac.y,idx=j*width+k;
      data[idx]=Math.max(data[idx],Math.round(255*y/max.y));
    }
  }
  const texture=new T.DataTexture(data,width,height,T.RedFormat);
  texture.needsUpdate=true;
  return {texture,scale:max.y,uv:new T.Vector4(min.x,min.z,sx/width,sz/height)};
}
