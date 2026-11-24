// SPDX-License-Identifier: Apache-2.0
const maximumPixels=1920*1080;
const preference='ocean-neural-upscaling';

function inferenceShader({kernel,offset,residual}){
  const literal=value=>value.toFixed(7);
  const vector=values=>'vec4f('+values.map(literal).join(',')+')';
  const layer=kernel.map((row,index)=>
    'correction+=(max(0.,dot(left,'+vector(row.slice(0,4))+')+dot(right,'+
    vector(row.slice(5))+')+('+literal(offset[index])+'))-'+literal(Math.max(0,offset[index]))+
    ')*'+vector(residual[index])+';').join('\n');
  return `
    @group(0) @binding(0) var source:texture_2d<f32>;
    @group(0) @binding(1) var image:texture_storage_2d<rgba8unorm,write>;
    fn loadRGB(p:vec2i,edge:vec2i)->vec3f{
      return textureLoad(source,clamp(p,vec2i(0),edge),0).rgb;
    }
    fn luma(c:vec3f)->f32{return dot(c,vec3f(.2126,.7152,.0722));}
    fn reconstruct(center:vec3f,row:vec3f,column:vec3f,corner:vec3f,
                   residual:f32,lo:vec3f,hi:vec3f)->vec4f{
      let base=(9.*center+3.*(row+column)+corner)/16.;
      return vec4f(clamp(base+residual,lo,hi),1.);
    }
    @compute @workgroup_size(8,8) fn infer(@builtin(global_invocation_id) id:vec3u){
      let size=textureDimensions(source);
      if(any(id.xy>=size)){return;}
      let p=vec2i(id.xy);
      let edge=vec2i(size)-1;
      let a=loadRGB(p+vec2i(-1,-1),edge);
      let b=loadRGB(p+vec2i(0,-1),edge);
      let c=loadRGB(p+vec2i(1,-1),edge);
      let d=loadRGB(p+vec2i(-1,0),edge);
      let center=loadRGB(p,edge);
      let f=loadRGB(p+vec2i(1,0),edge);
      let g=loadRGB(p+vec2i(-1,1),edge);
      let h=loadRGB(p+vec2i(0,1),edge);
      let i=loadRGB(p+vec2i(1,1),edge);
      let base=luma(center);
      let left=vec4f(luma(a),luma(b),luma(c),luma(d))-base;
      let right=vec4f(luma(f),luma(g),luma(h),luma(i))-base;
      var correction=vec4f(0.);
      ${layer}
      let lo=min(center,min(min(min(a,b),min(c,d)),min(min(f,g),min(h,i))));
      let hi=max(center,max(max(max(a,b),max(c,d)),max(max(f,g),max(h,i))));
      let destination=2*p;
      textureStore(image,destination,reconstruct(center,b,d,a,correction.x,lo,hi));
      textureStore(image,destination+vec2i(1,0),reconstruct(center,b,f,c,correction.y,lo,hi));
      textureStore(image,destination+vec2i(0,1),reconstruct(center,h,d,g,correction.z,lo,hi));
      textureStore(image,destination+vec2i(1,1),reconstruct(center,h,f,i,correction.w,lo,hi));
    }`;
}

const displayShader=`
  @group(0) @binding(0) var image:texture_2d<f32>;
  @vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
    let vertices=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));
    return vec4f(vertices[i],0.,1.);
  }
  @fragment fn display(@builtin(position) p:vec4f)->@location(0) vec4f{
    return textureLoad(image,vec2i(p.xy),0);
  }`;

async function prepare(source,output,signal,onFailure){
  const staging=new OffscreenCanvas(1,1);
  const context=staging.getContext('webgpu'),bitmapContext=output.getContext('bitmaprenderer');
  if(!context||!bitmapContext)throw Error('No WebGPU presentation context');
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter||(adapter.info?.isFallbackAdapter??adapter.isFallbackAdapter))
    throw Error('No hardware WebGPU adapter');
  const device=await adapter.requestDevice();
  let input,image,computeGroup,displayGroup,width,height;
  function release(){
    input?.destroy();image?.destroy();
  }
  function dispose(){
    release();context?.unconfigure();device.destroy();
  }
  try{
    if(signal.aborted)throw signal.reason;
    const model=await import('./neural-upscaler-model.mjs');
    if(signal.aborted)throw signal.reason;
    const computeModule=device.createShaderModule({code:inferenceShader(model)});
    const displayModule=device.createShaderModule({code:displayShader});
    const format=navigator.gpu.getPreferredCanvasFormat();
    const [compute,display]=await Promise.all([
      device.createComputePipelineAsync({layout:'auto',compute:{module:computeModule,entryPoint:'infer'}}),
      device.createRenderPipelineAsync({layout:'auto',
        vertex:{module:displayModule,entryPoint:'vertex'},
        fragment:{module:displayModule,entryPoint:'display',targets:[{format}]}})
    ]);
    if(signal.aborted)throw signal.reason;
    context.configure({device,format,alphaMode:'opaque'});
    device.addEventListener('uncapturederror',event=>{event.preventDefault();onFailure(event.error);});
    device.lost.then(info=>{if(info.reason!=='destroyed')onFailure(Error(info.message||'WebGPU device lost'));});
    return {dispose,present(){
      const w=source.width,h=source.height;
      if(!w||!h)return false;
      if(width!==w||height!==h){
        release();
        width=w;height=h;
        output.width=staging.width=2*width;
        output.height=staging.height=2*height;
        input=device.createTexture({size:[width,height],format:'rgba8unorm',
          usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT});
        image=device.createTexture({size:[2*width,2*height],format:'rgba8unorm',
          usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING});
        const imageView=image.createView();
        computeGroup=device.createBindGroup({layout:compute.getBindGroupLayout(0),entries:[
          {binding:0,resource:input.createView()},{binding:1,resource:imageView}]});
        displayGroup=device.createBindGroup({layout:display.getBindGroupLayout(0),entries:[
          {binding:0,resource:imageView}]});
      }
      device.queue.copyExternalImageToTexture({source},{texture:input},[width,height]);
      const encoder=device.createCommandEncoder();
      const inference=encoder.beginComputePass();
      inference.setPipeline(compute);inference.setBindGroup(0,computeGroup);
      inference.dispatchWorkgroups(Math.ceil(width/8),Math.ceil(height/8));
      inference.end();
      const presentation=encoder.beginRenderPass({colorAttachments:[
        {view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}
      ]});
      presentation.setPipeline(display);presentation.setBindGroup(0,displayGroup);
      presentation.draw(3);
      presentation.end();
      device.queue.submit([encoder.finish()]);
      // Present the completed GPU frame on the overlay without changing the
      // WebGL canvas that owns rendering and pointer input.
      bitmapContext.transferFromImageBitmap(staging.transferToImageBitmap());
      return true;
    }};
  }catch(error){dispose();throw error;}
}

export function neuralUpscaling(source,output,toggle,status,{signal,resize}){
  let pipeline,pending,enabled=false,failed=false;
  function remember(){
    try{localStorage.setItem(preference,toggle.checked?'on':'off');}catch{}
  }
  function unavailable(error){
    if(signal.aborted||failed)return;
    failed=true;
    toggle.checked=false;toggle.disabled=true;remember();
    status.textContent='AI upscaling unavailable on this device';
    output.hidden=true;
    pipeline?.dispose();pipeline=undefined;
    if(enabled){enabled=false;resize();}
    if(error)console.warn('AI upscaling unavailable',error);
  }
  async function select(){
    remember();
    if(!toggle.checked){
      output.hidden=true;status.textContent='';
      if(enabled){enabled=false;resize();}
      return;
    }
    if(!pipeline){
      status.textContent='Preparing AI upscaling…';
      pending??=prepare(source,output,signal,unavailable);
      try{pipeline=await pending;}catch(error){unavailable(error);return;}
      if(signal.aborted||failed){pipeline.dispose();return;}
      if(!toggle.checked)return;
    }
    if(!enabled){
      enabled=true;
      status.textContent='';
      resize();
    }
  }
  signal.addEventListener('abort',()=>pipeline?.dispose(),{once:true});
  if(!navigator.gpu||typeof OffscreenCanvas!=='function')unavailable();
  else{
    try{toggle.checked=localStorage.getItem(preference)==='on';}catch{}
    toggle.addEventListener('change',select,{signal});
    void select();
  }
  return {
    get canvas(){return output.hidden?source:output;},
    ratio(nativeRatio){
      // Keep both the source and the inferred image cheap on large or HiDPI displays.
      return enabled?Math.min(nativeRatio,.5,.5*Math.sqrt(maximumPixels/(innerWidth*innerHeight))):nativeRatio;
    },
    present(){
      if(!enabled)return;
      try{if(pipeline.present())output.hidden=false;}catch(error){unavailable(error);}
    }
  };
}
