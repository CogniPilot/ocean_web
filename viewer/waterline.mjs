// A dome port straddling the local free surface sees air and water simultaneously.
export function splitCamera(T,mainRenderer){
 const above=new T.WebGLRenderTarget(1,1),below=new T.WebGLRenderTarget(1,1);
 const gl=mainRenderer.getContext();
 const samples=mainRenderer.capabilities.isWebGL2&&gl.getContextAttributes()?.antialias?Math.min(4,mainRenderer.capabilities.maxSamples):0;
 above.samples=below.samples=samples;
 const thumbnailAbove=new T.WebGLRenderTarget(1,1),thumbnailBelow=new T.WebGLRenderTarget(1,1);
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const u={air:{value:above.texture},sea:{value:below.texture},tile:{value:null},blend:{value:0},tide:{value:0},
   portSphere:{value:new T.Vector4()},positionEye:{value:new T.Vector3()},forward:{value:new T.Vector3()},right:{value:new T.Vector3()},up:{value:new T.Vector3()},aspect:{value:1},slope:{value:.5}};
 const m=new T.ShaderMaterial({uniforms:u,depthTest:false,depthWrite:false,
 vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`varying vec2 p;uniform sampler2D air,sea;uniform vec3 positionEye,forward,right,up;uniform float aspect,slope;uniform vec4 portSphere;
 ${oceanHeightGLSL}
 void main(){vec2 uv=2.*p-1.;vec3 d=normalize(forward+slope*(up*uv.y+right*uv.x*aspect));float travel=.34;
 if(portSphere.w>0.){
   vec3 offset=positionEye-portSphere.xyz;float along=dot(d,offset);
   travel=-along+sqrt(max(0.,along*along+portSphere.w*portSphere.w-dot(offset,offset)));
 }
 vec3 port=positionEye+d*travel;
 float h=port.z-heightAt(port.xy);float edge=exp(-abs(h)*150.);
 float aa=max(.0018,fwidth(h));
 vec2 glass=clamp(p+vec2(0.,.009*edge*sign(h)),0.,1.);
 vec3 c=mix(texture2D(sea,glass).rgb,texture2D(air,glass).rgb,smoothstep(-aa,aa,h));
 gl_FragColor=vec4(mix(c,vec3(.68,.83,.87),edge*.27),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 scene.add(new T.Mesh(new T.PlaneGeometry(2,2),m));
 const size=new T.Vector2();
 const draw=(renderer,world,eye,water,fog,renderBelow,pictureSize,physicalPort)=>{
   const destination=renderer.getRenderTarget();
   if(physicalPort)u.portSphere.value.copy(physicalPort);else u.portSphere.value.set(0,0,0,0);
   if(pictureSize)size.set(pictureSize.width,pictureSize.height);
   else renderer.getDrawingBufferSize(size);
   const airTarget=pictureSize?thumbnailAbove:above,seaTarget=pictureSize?thumbnailBelow:below;
   airTarget.setSize(size.x,size.y);seaTarget.setSize(size.x,size.y);
   u.air.value=airTarget.texture;u.sea.value=seaTarget.texture;
   eye.updateMatrixWorld();eye.getWorldDirection(u.forward.value);u.right.value.setFromMatrixColumn(eye.matrixWorld,0);u.up.value.setFromMatrixColumn(eye.matrixWorld,1);
   u.positionEye.value.copy(eye.position);u.slope.value=Math.tan(T.MathUtils.degToRad(eye.fov/2));u.aspect.value=eye.aspect;
   for(const key of ['tile','tide','blend','swell','swellCenter','boat','spectrumMap','incidentMap','spectrumDrift','spectrumPeriod','spectrumBlend','wakeAvailable','hullSpectrumOnly','bowMap','bowAvailable','bowLength','bowFineAvailable','bowFineSpacing','bowFineBounds','swimmerWater','whalePatch','sharkPatch','whalePatchPrevious','sharkPatchPrevious','swimmerBlend','swimmerFin','swimmerHalfFloat'])u[key]=water.U[key];
   const oldBackground=world.background;
   world.background=null;world.fog=null;water.dome.visible=true;water.U.under.value=0;
   renderer.setRenderTarget(airTarget);renderer.render(world,eye);
   world.background=fog.color;world.fog=fog;water.dome.visible=false;water.U.under.value=1;
   renderer.setRenderTarget(seaTarget);renderBelow(world,eye);
   renderer.setRenderTarget(destination);renderer.render(scene,camera);water.dome.visible=true;world.fog=null;world.background=oldBackground;
 };
 draw.dispose=()=>{above.dispose();below.dispose();thumbnailAbove.dispose();thumbnailBelow.dispose();scene.children[0].geometry.dispose();m.dispose();};
 return draw;
}
