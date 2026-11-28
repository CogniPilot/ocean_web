// Correlation follows the public PX4Flow texture gate and SAD block matcher.
// https://github.com/PX4/PX4-Flow/blob/master/src/modules/flow/flow.c
export const flowProfiles={
  PAW3902:{fov:42,pixels:35,maxRate:7.4,minRange:.08,maxRange:30,texture:.026},
  PMW3901:{fov:42,pixels:35,maxRate:7.4,minRange:.08,maxRange:30,texture:.038}
};

export function droneFlowKernel(T,renderer){
  const grid=3,output=new T.WebGLRenderTarget(grid,grid,{depthBuffer:false});
  const uniforms={older:{value:null},newer:{value:null},stride:{value:1/35},minTexture:{value:.026}};
  const material=new T.ShaderMaterial({
    uniforms,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`
      uniform sampler2D older,newer;
      uniform float stride,minTexture;
      float luma(sampler2D image,vec2 uv){return dot(texture2D(image,uv).rgb,vec3(.2126,.7152,.0722));}
      float mismatch(vec2 origin,vec2 delta){
        float sum=0.;
        for(int y=-3;y<=3;y++)for(int x=-3;x<=3;x++){
          vec2 point=origin+stride*vec2(float(x),float(y));
          sum+=abs(luma(older,point)-luma(newer,point+stride*delta));
        }
        return sum/49.;
      }
      void main(){
        vec2 origin=.31+(gl_FragCoord.xy-.5)*.19;
        float textureLevel=0.;
        for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){
          vec2 point=origin+stride*vec2(float(x),float(y));
          float a=luma(older,point);
          textureLevel+=abs(a-luma(older,point+vec2(stride,0.)))+abs(a-luma(older,point+vec2(0.,stride)));
        }
        textureLevel/=50.;
        if(textureLevel<minTexture){gl_FragColor=vec4(.5,.5,0.,1.);return;}
        vec2 best=vec2(0.);
        float low=2.,second=2.;
        for(int y=-7;y<=7;y++)for(int x=-7;x<=7;x++){
          vec2 shift=vec2(float(x),float(y));
          float error=mismatch(origin,shift);
          if(error<low){second=low;low=error;best=shift;}
          else second=min(second,error);
        }
        float quality=clamp((second-low)*35.,0.,1.)*clamp(1.-low/.13,0.,1.);
        if(max(abs(best.x),abs(best.y))>6.)quality=0.;
        float left=mismatch(origin,best-vec2(1.,0.)),right=mismatch(origin,best+vec2(1.,0.));
        float down=mismatch(origin,best-vec2(0.,1.)),up=mismatch(origin,best+vec2(0.,1.));
        vec2 curve=max(vec2(.001),vec2(left+right,down+up)-2.*low);
        best+=clamp(.5*vec2(left-right,down-up)/curve,-.5,.5);
        gl_FragColor=vec4(.5+best/16.,quality,1.);
      }`
  });
  const scene=new T.Scene(),camera=new T.Camera(),quad=new T.Mesh(new T.PlaneGeometry(2,2),material);
  quad.frustumCulled=false;scene.add(quad);
  function compare(older,newer,profile){
    uniforms.older.value=older;uniforms.newer.value=newer;uniforms.stride.value=1/profile.pixels;
    uniforms.minTexture.value=profile.texture;
    renderer.setRenderTarget(output);renderer.render(scene,camera);
    return output;
  }
  function measure(rgba,profile,dt,range){
    const tiles=[];
    for(let i=0;i<rgba.length;i+=4)if(rgba[i+2]>15)
      tiles.push([(rgba[i]/255-.5)*16,(rgba[i+1]/255-.5)*16,rgba[i+2]/255]);
    if(tiles.length<3||!(dt>0&&dt<.2)||!(range>=profile.minRange&&range<=profile.maxRange))
      return {pixelFlow:[0,0],angularFlow:[0,0],quality:0,dt,range};
    const median=axis=>tiles.map(row=>row[axis]).sort((a,b)=>a-b)[Math.floor(tiles.length/2)];
    const x=median(0),y=median(1),consistent=tiles.filter(row=>Math.hypot(row[0]-x,row[1]-y)<1.5);
    const focal=profile.pixels/(2*Math.tan(profile.fov*Math.PI/360));
    const integral=[Math.atan(x/focal),Math.atan(y/focal)];
    const quality=Math.hypot(...integral)/dt>profile.maxRate?0:
      Math.round(255*consistent.reduce((sum,row)=>sum+row[2],0)/(grid*grid));
    return {pixelFlow:[x,y],angularFlow:integral,quality,dt,range};
  }
  return {grid,compare,measure,dispose(){output.dispose();quad.geometry.dispose();material.dispose();}};
}
