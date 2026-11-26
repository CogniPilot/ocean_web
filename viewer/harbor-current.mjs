// Cell-centred, steady ENU flow on an axis-aligned, graded finite-volume mesh.
const format='harbor-current-v1';
export function harborField(record,velocity,walls){
  if(record.format!==format||record.diagnostics?.converged!==true)throw Error('Unconverged harbor current');
  const {faces,incident}=record;
  if(!Array.isArray(incident)||incident.length!==3||!incident.every(Number.isFinite)||
    !Array.isArray(faces)||faces.length!==3||!faces.every(a=>Array.isArray(a)&&a.length>=3&&
      a.every((v,i)=>Number.isFinite(v)&&(!i||v>a[i-1]))))throw Error('Invalid harbor current mesh');
  const centers=faces.map(a=>a.slice(1).map((x,i)=>(x+a[i])*.5));
  const [nx,ny,nz]=centers.map(a=>a.length),stride=[1,nx,nx*ny];
  if(walls.length!==nx*ny*nz||velocity.length!==walls.length*3)throw Error('Incomplete harbor field');
  const weights=new Float64Array(3),ids=new Int32Array(8);
  function sample(p,out){
    let base=0,nearest=0;
    for(let axis=0;axis<3;axis++){
      const x=p[axis],face=faces[axis],a=centers[axis];
      if(x<face[0]||x>face.at(-1)){
        for(let j=0;j<3;j++)out[j]=incident[j];
        return true;
      }
      let lo=0,hi=a.length-1;
      while(hi-lo>1){const m=(lo+hi)>>1;if(x<a[m])hi=m;else lo=m;}
      base+=stride[axis]*lo;
      weights[axis]=Math.min(1,Math.max(0,(x-a[lo])/(a[hi]-a[lo])));
      // The physical cell boundary can differ from the midpoint of two graded-grid centres.
      if(x>=face[hi])nearest|=1<<axis;
    }
    let nearWall=false;
    for(let i=0;i<8;i++){
      ids[i]=base+(i&1)*stride[0]+((i>>1)&1)*stride[1]+(i>>2)*stride[2];
      if(walls[ids[i]])nearWall=true;
    }
    out[0]=out[1]=out[2]=0;
    if(walls[ids[nearest]]&64)return true;
    let connected=255;
    if(nearWall){
      connected=1<<nearest;
      let pending=connected;
      while(pending){
        const bit=pending&-pending,i=31-Math.clz32(bit);
        pending^=bit;
        for(let axis=0;axis<3;axis++){
          const next=i^(1<<axis),face=2*axis+Number((i&(1<<axis))===0);
          if((connected&(1<<next))||(walls[ids[i]]&(1<<face))||
             (walls[ids[next]]&(64|(1<<(face^1)))))continue;
          pending|=1<<next;connected|=1<<next;
        }
      }
    }
    let total=0;
    for(let i=0;i<8;i++)if(connected&(1<<i)){
      const w=(i&1?weights[0]:1-weights[0])*(i&2?weights[1]:1-weights[1])*(i&4?weights[2]:1-weights[2]);
      total+=w;
      for(let axis=0;axis<3;axis++)out[axis]+=w*velocity[3*ids[i]+axis];
    }
    for(let axis=0;axis<3;axis++)out[axis]/=total;
    return true;
  }
  return {sample,incident,key:record.key};
}

async function checked(url,expected){
  const r=await fetch(url);
  if(!r.ok)throw Error('Harbor current asset '+r.status);
  const bytes=await r.arrayBuffer();
  const subtle=globalThis.crypto?.subtle;
  const hash=subtle?Array.from(new Uint8Array(await subtle.digest('SHA-256',bytes)),
    b=>b.toString(16).padStart(2,'0')).join(''):await (await import('./vendor/sha256.mjs')).sha256Hex(bytes);
  if(hash!==expected)
    throw Error('Harbor current checksum mismatch');
  return bytes;
}

let loading;
export function loadHarborCurrent(){
  return loading??=readCurrent().catch(error=>{loading=undefined;throw error;});
}

async function readCurrent(){
  const base=new URL('./assets/harbor-current/',import.meta.url);
  const response=await fetch(new URL('active.json',base),{cache:'no-cache'});
  if(!response.ok)throw Error('Harbor current selection '+response.status);
  const active=await response.json();
  if(active.format!==format)throw Error('Invalid harbor current selection');
  if(!active.field&&active.incident?.length===3&&active.incident.every(x=>x===0))
    return {incident:[0,0,0],sample(p,out){out[0]=out[1]=out[2]=0;return true;}};
  if(!/^[a-f0-9]{64}$/.test(active.field))throw Error('Invalid harbor field key');
  const dir=new URL(active.field+'/',base);
  const record=JSON.parse(new TextDecoder().decode(await checked(new URL('field.json',dir),active.manifestSha256)));
  if(record.key!==active.field||!record.incident.every((x,i)=>x===active.incident[i]))throw Error('Harbor current selection mismatch');
  const [bytes,mask]=await Promise.all(['velocity.f32','walls.u8'].map(n=>checked(new URL(n,dir),record.sha256[n])));
  const velocity=new Float32Array(bytes);
  if(new Uint8Array(new Uint16Array([1]).buffer)[0]!==1){
    const little=new DataView(bytes);
    for(let i=0;i<velocity.length;i++)velocity[i]=little.getFloat32(i*4,true);
  }
  return harborField(record,velocity,new Uint8Array(mask));
}
