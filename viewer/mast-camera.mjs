// Four equidistant 200-degree cameras at the mast pod. All projection and
// stitching happens on the GPU. Images and calibration share a capture time.
export function mastCamera(T,renderer,world,boat){
  const face=144,lens=256;
  const cubes=Array.from({length:4},()=>new T.WebGLCubeRenderTarget(face));
  const eye=new T.CubeCamera(.025,400,cubes[0]);
  eye.layers.enable(1);
  // Cube textures use Three's native +Y-up cube convention, transformed here
  // from local forward (+X), port (+Y), up (+Z) via world-from-body rotation.
  const display=new T.Scene(),ortho=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const atlas=new T.WebGLRenderTarget(lens*2,lens*2),pan=new T.WebGLRenderTarget(1024,512);
  const uniforms={att:{value:new T.Matrix3()},stitched:{value:null},pass:{value:0},selected:{value:0}};
  cubes.forEach((rt,i)=>uniforms['im'+i]={value:rt.texture});
  const material=new T.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 uvw;void main(){uvw=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 uvw; uniform mat3 att;uniform int pass,selected; uniform samplerCube im0,im1,im2,im3;uniform sampler2D stitched;
    const float pi=3.141592654;const float limit=1.74532925;
    vec3 axis(float k){return vec3(cos(k*pi*.5),sin(k*pi*.5),0.);}
    void main(){if(pass!=1){
      vec2 cell=floor(uvw*2.);int i=int(cell.x+cell.y*2.);vec2 p=fract(uvw*2.)*2.-1.;
      if(pass==2){i=selected;p=uvw*2.-1.;}
      float r=length(p);if(r>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
      vec3 f=axis(float(i)),right=vec3(f.y,-f.x,0.);
      vec3 dir=att*(cos(r*limit)*f+sin(r*limit)*(p.x*right+vec3(0.,0.,p.y))/max(r,.00001));
      gl_FragColor=i==0?textureCube(im0,dir):i==1?textureCube(im1,dir):i==2?textureCube(im2,dir):textureCube(im3,dir);
    }else{
      float a=(.5-uvw.x)*2.*pi,b=(uvw.y-.5)*pi;vec3 d=vec3(cos(a)*cos(b),sin(a)*cos(b),sin(b));
      vec3 rgb=vec3(0.);float total=0.;
      for(int i=0;i<4;i++){vec3 f=axis(float(i));float q=acos(clamp(dot(d,f),-1.,1.));
        float w=1.-smoothstep(limit-.22,limit,q);if(w>0.){
        vec2 p=vec2(dot(d,vec3(f.y,-f.x,0.)),d.z)*(q/limit)/max(.00001,sin(q));
        rgb+=w*texture2D(stitched,(vec2(mod(float(i),2.),floor(float(i)/2.))+.5+.5*p)*.5).rgb;total+=w;}}
      gl_FragColor=vec4(rgb/max(.00001,total),1.);}
    }`});
  display.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
  function png(target){
    const pixels=new Uint8Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
    const canvas=document.createElement('canvas');canvas.width=target.width;canvas.height=target.height;
    const ctx=canvas.getContext('2d'),frame=ctx.createImageData(canvas.width,canvas.height);
    const stride=canvas.width*4;for(let j=0;j<canvas.height;j++)frame.data.set(pixels.subarray(j*stride,(j+1)*stride),(canvas.height-j-1)*stride);
    ctx.putImageData(frame,0,0);return canvas.toDataURL('image/png');
  }
  const live=new T.WebGLRenderTarget(lens,lens);
  const pixels=new Uint8Array(lens*lens*4);
  let previewImage;
  const port=new T.Vector3();
  function renderPort(i){
    eye.position.copy(boat.group.localToWorld(port.fromArray(boat.cameraPorts[i])));
    eye.renderTarget=cubes[i];
    eye.update(renderer,world);
  }
  function preview(index,canvas){
    boat.group.updateMatrixWorld(true);
    uniforms.att.value.setFromMatrix4(boat.group.matrixWorld);
    const previous=renderer.getRenderTarget();
    try{
      renderPort(index);
      uniforms.pass.value=2;
      uniforms.selected.value=index;
      uniforms.stitched.value=null;
      renderer.setRenderTarget(live);
      renderer.render(display,ortho);
      renderer.readRenderTargetPixels(live,0,0,lens,lens,pixels);
      const ctx=canvas.getContext('2d');
      previewImage??=ctx.createImageData(lens,lens);
      const stride=lens*4;
      for(let y=0;y<lens;y++)previewImage.data.set(pixels.subarray(y*stride,(y+1)*stride),(lens-y-1)*stride);
      ctx.putImageData(previewImage,0,0);
    }finally{renderer.setRenderTarget(previous);}
  }
  function capture(){
    boat.group.updateMatrixWorld(true);uniforms.att.value.setFromMatrix4(boat.group.matrixWorld);
    const previous=renderer.getRenderTarget(),lenses=[];
    try{
      for(let i=0;i<4;i++){
        const az=i*Math.PI/2,position=boat.cameraPorts[i];
        lenses.push({azimuthRad:az,positionBodyM:position,fovDegrees:200,projection:'equidistant'});
        renderPort(i);
      }
      // WebGL checks all bound samplers for feedback, even on an inactive shader branch.
      uniforms.stitched.value=null;
      uniforms.pass.value=0;renderer.setRenderTarget(atlas);renderer.render(display,ortho);
      uniforms.stitched.value=atlas.texture;
      uniforms.pass.value=1;renderer.setRenderTarget(pan);renderer.render(display,ortho);
      return {lenses,raw:png(atlas),panorama:png(pan)};
    }finally{renderer.setRenderTarget(previous);}
  }
  return {preview,capture};
}
