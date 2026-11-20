// Each fragment measures one calibrated ray against the same oriented boxes as the scene.
export function createRangeScan(T, renderer, wreck, directions){
  const count=directions.length/3, boxes=wreck.children;
  if(!boxes.length || boxes.some(mesh=>mesh.geometry?.type!=='BoxGeometry')){
    throw new Error('Range acquisition requires the individual oriented wreck plates');
  }
  wreck.updateWorldMatrix(true,true);
  const inverse=new Float32Array(boxes.length*16);
  boxes.forEach((box,i)=>box.matrixWorld.clone().invert().toArray(inverse,i*16));
  const tex=(data,w,h,format)=>{
    const result=new T.DataTexture(data,w,h,format,T.FloatType);
    result.needsUpdate=true;return result;
  };
  const beams=new Float32Array(count*4);
  for(let i=0;i<count;i++)beams.set(directions.slice(3*i,3*i+3),4*i);
  const uniforms={boxes:{value:tex(inverse,4,boxes.length,T.RGBAFormat)},
    beams:{value:tex(beams,count,1,T.RGBAFormat)},eye:{value:new T.Vector3()},rotation:{value:new T.Matrix3()}};
  const material=new T.RawShaderMaterial({glslVersion:T.GLSL3,uniforms,
    vertexShader:'in vec3 position;void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`precision highp float;
    uniform highp sampler2D boxes,beams;uniform vec3 eye;uniform mat3 rotation;out vec4 color;
    void main(){
      int i=int(gl_FragCoord.x);vec3 direction=rotation*texelFetch(beams,ivec2(i,0),0).xyz;
      vec3 start=eye+(i>=153?rotation*vec3(.62,0,.09):vec3(0));
      float limit=i<4?35.:(i<153?18.:8.);float nearest=limit+1.;
      for(int b=0;b<${boxes.length};b++){
        mat4 m=mat4(texelFetch(boxes,ivec2(0,b),0),texelFetch(boxes,ivec2(1,b),0),
                    texelFetch(boxes,ivec2(2,b),0),texelFetch(boxes,ivec2(3,b),0));
        vec3 o=(m*vec4(start,1.)).xyz,d=mat3(m)*direction;
        float lo=-1e6,hi=1e6;
        for(int k=0;k<3;k++){
          if(abs(d[k])<1e-8){if(abs(o[k])>.5)hi=-1e6;}
          else{float a=(-.5-o[k])/d[k],z=(.5-o[k])/d[k];lo=max(lo,min(a,z));hi=min(hi,max(a,z));}
        }
        float hit=lo>=.08?lo:hi;
        if(hi>=lo&&hit>=.08)nearest=min(nearest,hit);
      }
      float mm=nearest<=limit?floor(nearest*1000.+.5):0.;
      color=vec4(mod(mm,256.)/255.,floor(mm/256.)/255.,0.,1.);
    }`});
  const scene=new T.Scene(),quad=new T.Mesh(new T.PlaneGeometry(2,2),material);
  quad.frustumCulled=false;scene.add(quad);
  const target=new T.WebGLRenderTarget(count,1,{depthBuffer:false}),camera=new T.Camera(),pixels=new Uint8Array(4*count);
  const quat=new T.Quaternion(),rotation=new T.Matrix4();
  return (p,q)=>{
    uniforms.eye.value.fromArray(p);quat.set(q[1],q[2],q[3],q[0]);
    uniforms.rotation.value.setFromMatrix4(rotation.makeRotationFromQuaternion(quat));
    const prev=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.render(scene,camera);
    renderer.readRenderTargetPixels(target,0,0,count,1,pixels);renderer.setRenderTarget(prev);
    return Float64Array.from({length:count},(_,i)=>(pixels[4*i]+256*pixels[4*i+1])*.001);
  };
}
