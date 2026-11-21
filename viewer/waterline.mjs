// A dome port straddling the local free surface sees air and water simultaneously.
export function splitCamera(T){
 const above=new T.WebGLRenderTarget(1,1),below=new T.WebGLRenderTarget(1,1);
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const u={air:{value:above.texture},sea:{value:below.texture},tile:{value:null},blend:{value:0},tide:{value:0},
   positionEye:{value:new T.Vector3()},forward:{value:new T.Vector3()},right:{value:new T.Vector3()},up:{value:new T.Vector3()},aspect:{value:1},slope:{value:.5}};
 const m=new T.ShaderMaterial({uniforms:u,depthTest:false,depthWrite:false,
 vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`varying vec2 p;uniform sampler2D air,sea;uniform vec3 positionEye,forward,right,up;uniform float aspect,slope;
 ${oceanHeightGLSL}
 void main(){vec2 uv=2.*p-1.;vec3 d=normalize(forward+slope*(up*uv.y+right*uv.x*aspect));vec3 port=positionEye+d*.34;
 float h=port.z-heightAt(port.xy);float edge=exp(-abs(h)*150.);
 vec2 glass=clamp(p+vec2(0.,.009*edge*sign(h)),0.,1.);
 vec3 c=mix(texture2D(sea,glass).rgb,texture2D(air,glass).rgb,smoothstep(-.0018,.0018,h));
 gl_FragColor=vec4(mix(c,vec3(.68,.83,.87),edge*.27),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 scene.add(new T.Mesh(new T.PlaneGeometry(2,2),m));
 const size=new T.Vector2();
 return (renderer,world,eye,water,fog)=>{
   renderer.getDrawingBufferSize(size);above.setSize(size.x,size.y);below.setSize(size.x,size.y);
   eye.updateMatrixWorld();eye.getWorldDirection(u.forward.value);u.right.value.setFromMatrixColumn(eye.matrixWorld,0);u.up.value.setFromMatrixColumn(eye.matrixWorld,1);
   u.positionEye.value.copy(eye.position);u.slope.value=Math.tan(T.MathUtils.degToRad(eye.fov/2));u.aspect.value=eye.aspect;
   for(const key of ['tile','tide','blend','swell','swellCenter','boat','spectrumMap','incidentMap','spectrumDrift','spectrumPeriod','spectrumBlend','wakeAvailable','bowMap','bowAvailable'])u[key]=water.U[key];
   world.fog=null;water.dome.visible=true;water.U.under.value=0;
   renderer.setRenderTarget(above);renderer.render(world,eye);
   world.fog=fog;water.dome.visible=false;water.U.under.value=1;
   renderer.setRenderTarget(below);renderer.render(world,eye);
   renderer.setRenderTarget(null);renderer.render(scene,camera);water.dome.visible=true;world.fog=null;
 };
}
