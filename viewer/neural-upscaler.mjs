// SPDX-License-Identifier: Apache-2.0
const maximumPixels=1920*1080;
const preference='ocean-neural-upscaling';

const fullscreenVertex='void main(){gl_Position=vec4(position.xy,0.,1.);}';
const pixelFunctions=`
  uniform highp sampler2D image;
  vec3 pixel(ivec2 p,ivec2 edge){return texelFetch(image,clamp(p,ivec2(0),edge),0).rgb;}
`;
function inferenceShader({kernel,offset,residual}){
  const literal=value=>value.toFixed(7);
  const vector=values=>'vec4('+values.map(literal).join(',')+')';
  const layer=kernel.map((row,index)=>
    'correction+=(max(0.,dot(left,'+vector(row.slice(0,4))+')+dot(right,'+
    vector(row.slice(5))+')+('+literal(offset[index])+'))-'+literal(Math.max(0,offset[index]))+
    ')*'+vector(residual[index])+';').join('\n');
  return pixelFunctions+`
    out vec4 color;
    float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
    void main(){
      ivec2 p=ivec2(gl_FragCoord.xy);
      ivec2 edge=textureSize(image,0)-1;
      // Training rows run from top to bottom, opposite WebGL's framebuffer.
      float a=luma(pixel(p+ivec2(-1,1),edge));
      float b=luma(pixel(p+ivec2(0,1),edge));
      float c=luma(pixel(p+ivec2(1,1),edge));
      float d=luma(pixel(p+ivec2(-1,0),edge));
      float center=luma(pixel(p,edge));
      float f=luma(pixel(p+ivec2(1,0),edge));
      float g=luma(pixel(p+ivec2(-1,-1),edge));
      float h=luma(pixel(p+ivec2(0,-1),edge));
      float i=luma(pixel(p+ivec2(1,-1),edge));
      vec4 left=vec4(a,b,c,d)-center;
      vec4 right=vec4(f,g,h,i)-center;
      vec4 correction=vec4(0.);
      ${layer}
      // RGBA8 stores the four subpixel corrections without a float-target extension.
      color=(128.+512.*correction)/255.;
    }`;
}
const displayShader=pixelFunctions+`
  uniform highp sampler2D detail;
  out vec4 color;
  void main(){
    ivec2 screen=ivec2(gl_FragCoord.xy);
    ivec2 p=screen/2;
    ivec2 phase=screen%2;
    ivec2 edge=textureSize(image,0)-1;
    ivec2 direction=2*phase-1;
    vec3 center=pixel(p,edge);
    vec3 row=pixel(p+ivec2(0,direction.y),edge);
    vec3 column=pixel(p+ivec2(direction.x,0),edge);
    vec3 corner=pixel(p+direction,edge);
    vec4 residual=(255.*texelFetch(detail,p,0)-128.)/512.;
    vec3 base=(9.*center+3.*(row+column)+corner)/16.;
    vec3 low=min(min(center,row),min(column,corner));
    vec3 high=max(max(center,row),max(column,corner));
    int subpixel=phase.x+2*(1-phase.y);
    color=vec4(clamp(base+residual[subpixel],low,high),1.);
  }`;

function prepare(T,renderer,model){
  const screen=renderer.domElement;
  const camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const geometry=new T.PlaneGeometry(2,2);
  const image={value:null};
  const start=new T.Vector2();
  const viewport=new T.Vector4();
  const detail=new T.WebGLRenderTarget(1,1,{
    depthBuffer:false,stencilBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter
  });
  detail.texture.name='Neural upscaling residual';
  let frame,source,linked=false;
  function pass(fragmentShader,uniforms){
    const material=new T.ShaderMaterial({
      glslVersion:T.GLSL3,vertexShader:fullscreenVertex,fragmentShader,uniforms,
      depthTest:false,depthWrite:false,toneMapped:false,blending:T.NoBlending
    });
    const scene=new T.Scene();
    const screenQuad=new T.Mesh(geometry,material);
    screenQuad.frustumCulled=false;
    scene.add(screenQuad);
    return {scene,material};
  }
  const inference=pass(inferenceShader(model),{image});
  const display=pass(displayShader,{image,detail:{value:detail.texture}});
  function restore(){
    renderer.setRenderTarget(null);
    renderer.setViewport(viewport);
    frame=false;
  }
  return {
    get size(){return source?.image;},
    begin(){
      const width=Math.ceil(screen.width/2),height=Math.ceil(screen.height/2);
      if(!width||!height)return;
      if(source?.image.width!==width||source?.image.height!==height){
        source?.dispose();
        source=new T.FramebufferTexture(width,height);
        source.name='Low-resolution scene for neural upscaling';
        image.value=source;
        detail.setSize(width,height);
      }
      const scale=renderer.getPixelRatio();
      renderer.getViewport(viewport);
      // Three converts logical viewport coordinates back to integer pixels.
      frame=true;
      renderer.setViewport(0,0,(width+.001)/scale,(height+.001)/scale);
    },
    present(){
      if(!frame)return;
      const debug=renderer.debug,reportShaderError=debug.onShaderError;
      let shaderError;
      if(!linked)debug.onShaderError=(gl,program)=>{
        shaderError=gl.getProgramInfoLog(program)||'Neural shader failed to link';
      };
      try{
        // Render the scene into this rectangle of the regular drawing buffer
        // so it uses the same exposure, color space and edge antialiasing.
        renderer.copyFramebufferToTexture(start,source);
        renderer.setRenderTarget(detail);
        renderer.render(inference.scene,camera);
        restore();
        if(!shaderError)renderer.render(display.scene,camera);
        if(shaderError)throw Error(shaderError);
        linked=true;
      }finally{
        if(frame)restore();
        debug.onShaderError=reportShaderError;
      }
    },
    dispose(){
      if(frame)restore();
      source?.dispose();
      detail.dispose();
      geometry.dispose();
      inference.material.dispose();
      display.material.dispose();
    }
  };
}

export function neuralUpscaling(T,renderer,toggle,status,{signal,resize}){
  let pipeline,pending,enabled=false;
  function remember(){
    try{localStorage.setItem(preference,toggle.checked?'on':'off');}catch{}
  }
  function stop(){
    if(enabled){
      enabled=false;
      pipeline?.dispose();
      pipeline=undefined;
      resize();
    }
  }
  function failed(error){
    if(signal.aborted)return;
    toggle.checked=false;
    remember();
    stop();
    status.textContent='AI upscaling failed. Using standard rendering.';
    console.warn('AI upscaling could not start',error);
  }
  async function select(){
    remember();
    if(!toggle.checked){
      stop();
      status.textContent='';
      return;
    }
    if(enabled)return;
    status.textContent='Preparing AI upscaling…';
    pending??=import('./neural-upscaler-model.mjs');
    let model;
    try{model=await pending;}catch(error){pending=undefined;failed(error);return;}
    if(signal.aborted||!toggle.checked||enabled)return;
    try{
      pipeline=prepare(T,renderer,model);
      enabled=true;
      status.textContent='Active on the WebGL 2 renderer';
      resize();
    }catch(error){failed(error);}
  }
  signal.addEventListener('abort',()=>pipeline?.dispose(),{once:true});
  if(!renderer.capabilities.isWebGL2){
    toggle.disabled=true;
    status.textContent='AI upscaling requires WebGL 2.';
  }else{
    try{toggle.checked=localStorage.getItem(preference)==='on';}catch{}
    toggle.addEventListener('change',select,{signal});
    void select();
  }
  return {
    get size(){return enabled?pipeline.size:undefined;},
    ratio(nativeRatio){
      return enabled?Math.min(2*nativeRatio,1,Math.sqrt(maximumPixels/(innerWidth*innerHeight))):nativeRatio;
    },
    begin(){
      if(enabled){
        try{pipeline.begin();}catch(error){failed(error);}
      }
    },
    present(){
      if(enabled){
        try{pipeline.present();}catch(error){failed(error);}
      }
    }
  };
}
