import {loadInstance} from './fmi3/instance.mjs';

export const greatWhiteLength=4.8;
const n=64,count=n*n;
const geometry={
  hobie:{stations:[-2.520,-1.9,-.9,.15,1.12,1.95,2.52],separation:1.02},
  sloop:{stations:[-1.1,-.82,-.3,.18,.63,.98,1.22],separation:0},
  motor:{stations:[-3.8,-2.7,-1.55,-.2,1.2,2.45,3.82],separation:.55}
};
const encode=x=>Math.max(0,Math.min(255,Math.round(128+127*x)));
function probe(frame,x,y){
  const {region,field}=frame;
  if(!field||!region.z)return 0;
  const u=(x-region.x)/region.z,v=(y-region.y)/region.z,edge=Math.max(Math.abs(u),Math.abs(v));
  if(edge>=.48)return 0;
  const col=n*u+(n-1)/2,row=n*v+(n-1)/2,i=Math.floor(col),j=Math.floor(row),dx=col-i,dy=row-j;
  const k=n*j+i,f=Math.max(0,Math.min(1,(edge-.38)/.10));
  return (1-f*f*(3-2*f))*((1-dy)*((1-dx)*field[k]+dx*field[k+1])+dy*((1-dx)*field[k+n]+dx*field[k+n+1]));
}

// Each fixed-time field keeps its own world origin as the solver recentres.
// The mesh and the water are presented at the same point between harbor packets.
export function wildlifeWater(T,uniforms,load=loadInstance,halfFloat=false){
  // A signed byte over a metre quantizes the little fin ridge in 3.9 mm
  // increments. Half floats preserve its submillimetre profile on WebGL 2.
  const pixels=halfFloat?new Uint16Array(16*count):new Uint8Array(16*count);
  const texture=new T.DataTexture(pixels,n,4*n,T.RGBAFormat,halfFloat?T.HalfFloatType:T.UnsignedByteType);
  uniforms.swimmerHalfFloat={value:Number(halfFloat)};
  texture.minFilter=texture.magFilter=T.LinearFilter;
  uniforms.swimmerWater={value:texture};
  const mix=new T.Vector2(1,1),fin=new T.Vector4();
  uniforms.swimmerFin={value:fin};
  uniforms.swimmerBlend={value:mix};
  const patches=[.42,.20].map((cell,i)=>{
    const key=i?'sharkPatch':'whalePatch';
    const frames=[0,1].map(slot=>({region:new T.Vector4(0,0,0,2*i+slot),field:null}));
    const patch={cell,previous:frames[0],current:frames[1],key};
    uniforms[key]={value:patch.current.region};
    uniforms[key+'Previous']={value:patch.previous.region};
    return patch;
  });
  function clear(){
    fin.set(0,0,0,0);
    for(const p of patches){
      p.stamp=undefined;
      for(const f of [p.current,p.previous]){f.region.z=0;f.field=null;f.inspection=null;}
    }
  }
  function sample(i,time,sources,impact,id,blend){
    const p=patches[i],m=p.model;
    mix.setComponent(i,blend);
    if(!m){
      p.loading??=load('SwimmerWake',{cell:p.cell}).then(model=>{p.model=model;}).catch(console.error);
      return;
    }
    if(time===p.stamp&&id===p.id)return;
    const reset=p.stamp===undefined||id!==p.id||time<=p.stamp||time-p.stamp>.6;
    if(reset){
      p.current.region.z=0;
      p.current.inspection=null;
    }
    if(i===1){
      // Section six is the dorsal fin. Transport its bound ridge with the
      // interpolated fin while the radiated wave behind it stays in world ENU.
      const x=sources[25],y=sources[26],dx=x-p.finX,dy=y-p.finY;
      const continuous=!reset&&dx*dx+dy*dy<2.25;
      fin.set(x,y,continuous?dx:0,continuous?dy:0);p.finX=x;p.finY=y;
    }
    m.set('restart',Number(reset));m.set('clock',time);m.set('sources',sources);m.set('impact',impact);
    m.advance(.1);p.stamp=time;p.id=id;
    [p.previous,p.current]=[p.current,p.previous];
    const {current,previous}=p;
    uniforms[p.key].value=current.region;
    uniforms[p.key+'Previous'].value=previous.region;
    const [center,active]=m.getMany(['center','active']);
    current.region.set(center[0],center[1],active>0?n*p.cell:0,current.region.w);
    current.inspection=null;
    if(!active)return;
    // Each ping-pong slot owns its storage across solver calls. Copy from
    // Wasm directly without allocating and boxing 12,288 numbers per sample.
    const field=current.field??=new Float64Array(3*count);
    m.get('field',field);
    const halfSpan=(n-1)*p.cell/2;
    current.inspection={id,sources,east:center[0]-halfSpan,north:center[1]-halfSpan,
      length:n*p.cell,size:n,stride:2,bounded:true,heightAt:heightReaders[i]};
    for(let k=0;k<count;k++){
      const out=4*(current.region.w*count+k);
      const height=field[k],foam=field[2*count+k];
      const east=k%n&&k%n<n-1?(field[k+1]-field[k-1])/(2*p.cell):0;
      const north=k>=n&&k<count-n?(field[k+n]-field[k-n])/(2*p.cell):0;
      if(halfFloat){
        pixels[out]=T.DataUtils.toHalfFloat(height);pixels[out+1]=T.DataUtils.toHalfFloat(foam);
        pixels[out+2]=T.DataUtils.toHalfFloat(east);pixels[out+3]=T.DataUtils.toHalfFloat(north);
      }else{
        pixels[out]=encode(2*height);pixels[out+1]=Math.round(255*foam);
        pixels[out+2]=encode(east);pixels[out+3]=encode(north);
      }
    }
    texture.needsUpdate=true;
  }
  function patchElevation(i,x,y){
    const p=patches[i],a=mix.getComponent(i);
    let dx=0,dy=0,z=0;
    if(i===1&&(fin.z||fin.w)){
      const distance=Math.hypot(x-fin.x+(1-a)*fin.z,y-fin.y+(1-a)*fin.w);
      const f=Math.max(0,Math.min(1,(distance-.45)/.85)),weight=1-f*f*(3-2*f);
      dx=fin.z*weight;dy=fin.w*weight;
    }
    if(a<1)z+=(1-a)*probe(p.previous,x-a*dx,y-a*dy);
    if(a>0)z+=a*probe(p.current,x+(1-a)*dx,y+(1-a)*dy);
    return z;
  }
  const heightReaders=patches.map((_,i)=>(x,y)=>patchElevation(i,x,y));
  function inspection(kind,id){
    const i=kind==='whale'?0:1,p=patches[i];
    if(p.id!==id)return null;
    if(p.current.inspection?.id===id)return p.current.inspection;
    return mix.getComponent(i)<1&&p.previous.inspection?.id===id?p.previous.inspection:null;
  }
  function elevation(x,y){
    let z=0;
    for(let i=0;i<patches.length;i++)z+=patchElevation(i,x,y);
    return z;
  }
  const loads=new Float64Array(15);
  function hullWater(kind,x,y,yaw,heel,pitch){
    loads.fill(0);
    if(!patches.some(p=>[p.current,p.previous].some(f=>f.region.z&&Math.max(Math.abs(x-f.region.x),Math.abs(y-f.region.y))<.5*f.region.z+4)))return loads;
    const {stations,separation}=geometry[kind],c=Math.cos(yaw),s=Math.sin(yaw);
    for(let h=0;h<2;h++){
      const offset=(1-2*h)*separation,across=offset*Math.cos(heel);
      for(let j=0;j<6;j++){
        const along=.5*(stations[j]+stations[j+1])*Math.cos(pitch)+offset*Math.sin(heel)*Math.sin(pitch);
        loads[6*h+j]=elevation(x+c*along-s*across,y+s*along+c*across);
      }
    }
    const step=.25;
    loads[12]=elevation(x,y);
    loads[13]=(elevation(x+step*c,y+step*s)-elevation(x-step*c,y-step*s))/(2*step);
    loads[14]=(elevation(x-step*s,y+step*c)-elevation(x+step*s,y-step*c))/(2*step);
    return loads;
  }
  return {sample,clear,elevation,hullWater,inspection};
}
