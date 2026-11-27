// Modelica owns the discounted returns, Gaussian score and Adam equations.
// This module packs independent actor coefficients into the compiled kernels.
const base=new URL('./assets/diver-policy/',import.meta.url);
async function resource(name){
  const reply=await fetch(new URL(name,base));
  if(!reply.ok)throw Error('Could not load '+name+' ('+reply.status+')');
  return reply;
}

async function cpu(layout){
  const metadata=await (await resource('live-update.json')).json();
  const bytes=await (await resource('live-update.wasm')).arrayBuffer();
  const {instance}=await WebAssembly.instantiate(bytes,{wasi_snapshot_preview1:{fd_close:()=>8,fd_seek:()=>8,fd_write:()=>8}});
  const m=instance.exports;
  const check=status=>{if(status>1)throw Error('DiverLiveUpdate FMI status '+status);};
  m._initialize();check(m.create_instance(m.token()));check(m.set_real(metadata.vars.groupCount[0],1));check(m.set_real(metadata.vars.sigma[0],.22));check(m.initialize());
  return {adapter:'WebAssembly CPU (Float64)',dispatches:0,close(){},
    async compute(data,count,groups){
      const out=new Float64Array(count*4);
      for(let i=0;i<count;i++){
        let grad=0;
        for(let group=0;group<groups;group++){
          const start=(i*groups+group)*layout.p;
          for(const [key,offset] of Object.entries(layout.inputs)){
            const [vr,n]=metadata.vars[key];
            if(n===1)check(m.set_real(vr,key==='previousGradient'?grad:data[start+offset]));
            else{
              new Float64Array(m.memory.buffer,m.buffer(),n).set(data.subarray(start+offset,start+offset+n));
              check(m.set_reals(vr,n));
            }
          }
          check(m.read_real(metadata.vars.update[0],4));
          const values=new Float64Array(m.memory.buffer,m.buffer(),4);
          grad=values[3];
          if(group===groups-1)out.set(values,4*i);
        }
      }
      return out;
    }};
}

export async function requestTrainingAdapter(){
  if(!globalThis.navigator?.gpu)return null;
  // Chromium can return null or reject while its GPU process starts. Some
  // devices expose an adapter only with the browser's default preference.
  for(const delay of [0,250,750]){
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    for(const options of [{powerPreference:'high-performance'},{}]){
      try{
        const adapter=await navigator.gpu.requestAdapter(options);
        if(adapter)return adapter;
      }catch{}
    }
  }
  return null;
}
async function gpu(layout,onStage){
  onStage('Connecting to WebGPU…');
  const adapter=await requestTrainingAdapter();
  if(!adapter)throw Error('WebGPU adapter unavailable. Select CPU training on this device.');
  const device=await adapter.requestDevice();
  let lost='';
  device.lost.then(event=>{lost=event.message||event.reason;});
  const kernel=await (await resource('live-update.wgsl')).text();
  const code=kernel+`
    @group(0) @binding(0) var<storage,read> samples:array<f32>;
    @group(0) @binding(1) var<storage,read_write> results:array<f32>;
    @group(0) @binding(2) var<uniform> dims:vec4<u32>;
    @compute @workgroup_size(64) fn train(@builtin(global_invocation_id) id:vec3<u32>){
      if(id.x>=dims.x){return;}
      var grad=0.0;
      for(var g=0u;g<dims.y;g++){
        let offset=(id.x*dims.y+g)*${layout.p}u;
        var p:array<f32,${layout.p}>;
        for(var j=0u;j<${layout.p}u;j++){p[j]=samples[offset+j];}
        p[${layout.inputs.previousGradient}]=grad;
        let y=rumoca_evaluate(p,0.);
        grad=y[${layout.out+3}];
        if(g+1u==dims.y){for(var j=0u;j<4u;j++){results[4u*id.x+j]=y[${layout.out}u+j];}}
      }
    }`;
  let pipeline;
  try{
    onStage('Compiling policy shader…');
    pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code}),entryPoint:'train'}});
  }catch(error){device.destroy();throw error;}
  const info=adapter.info??{};
  const result={adapter:[info.vendor,info.architecture,info.description].filter(Boolean).join(' / ')||'WebGPU adapter',
    dispatches:0,close(){device.destroy();},async compute(data,count,groups){
      if(lost)throw Error('WebGPU device lost: '+lost);
      const buffers=[];
      function allocate(size,usage){const b=device.createBuffer({size,usage});buffers.push(b);return b;}
      try{
        const packed=Float32Array.from(data),size=count*16;
        const src=allocate(packed.byteLength,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
        const dst=allocate(size,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);
        const config=allocate(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
        const map=allocate(size,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
        device.queue.writeBuffer(src,0,packed);device.queue.writeBuffer(config,0,new Uint32Array([count,groups,0,0]));
        const commands=device.createCommandEncoder(),pass=commands.beginComputePass();
        pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),
          entries:[src,dst,config].map((buffer,binding)=>({binding,resource:{buffer}}))}));
        pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();commands.copyBufferToBuffer(dst,0,map,0,size);
        device.queue.submit([commands.finish()]);
        await map.mapAsync(GPUMapMode.READ);
        const view=new Float32Array(map.getMappedRange().slice(0));
        map.unmap();result.dispatches++;return view;
      }finally{buffers.forEach(b=>b.destroy());}
    }};
  return result;
}

export async function openTrainingUpdate(backend,onStage=()=>{}){
  onStage('Loading policy update model…');
  const layout=await (await resource('live-update-gpu.json')).json();
  if(backend!=='cpu'&&backend!=='gpu')throw Error('Choose cpu or gpu for training.');
  const runner=await (backend==='gpu'?gpu(layout,onStage):cpu(layout));
  return {adapter:runner.adapter,get dispatches(){return runner.dispatches;},close:()=>runner.close(),
    async update(episodes,state,{sigma=.22,learningRate=.019}={}){
      const {weights,m,v,step}=state,rows=weights.length,columns=weights[0].length;
      const groups=episodes.length/4;
      if(!Number.isInteger(groups)||groups<1||episodes.some(lane=>lane.length!==6))throw Error('Each paired group needs four lanes and six decisions.');
      const count=rows*columns,data=new Float64Array(count*groups*layout.p),idx=layout.inputs;
      for(let i=0;i<count;i++){
        const r=Math.floor(i/columns),c=i%columns;
        for(let g=0;g<groups;g++){
          const at=(i*groups+g)*layout.p;
          for(let j=0;j<24;j++){
            const sample=episodes[4*g+Math.floor(j/6)][j%6];
            data[at+idx.feature+j]=sample.features[c];
            data[at+idx.noise+j]=sample.eps[r];
            data[at+idx.reward+j]=sample.reward;
          }
          for(const [key,value] of Object.entries({weight:weights[r][c],moment:m[r][c],variance:v[r][c],step,sigma,learningRate,groupCount:groups})){
            data[at+idx[key]]=value;
          }
        }
      }
      const out=await runner.compute(data,count,groups);
      if(!out.every(Number.isFinite))throw Error('Nonfinite policy update.');
      const matrix=offset=>weights.map((row,r)=>row.map((_,c)=>out[4*(r*columns+c)+offset]));
      return {weights:matrix(0),m:matrix(1),v:matrix(2),gradient:matrix(3),step:step+1};
    }};
}
