 const oceanHeightGLSL=`
 uniform sampler2D tile;uniform float blend,tide;
 uniform vec4 swell; uniform vec2 swellCenter; uniform sampler2D spectrumMap; uniform vec2 spectrumDrift; uniform float spectrumPeriod,spectrumBlend;
 float spectralElevation(vec2 p){
   if(spectrumPeriod<=0.)return 0.;
   vec4 pair=texture2D(spectrumMap,(p-spectrumDrift)/spectrumPeriod+vec2(.5/64.));
   vec2 weights=vec2(65280.,255.);
   return (mix(dot(pair.rg,weights),dot(pair.ba,weights),spectrumBlend)-32768.)/32768.;
 }
 float heightAt(vec2 p){
  vec4 data=texture2D(tile,p/64.+vec2(.5/32.));
  return tide+swell.x*sin(swell.y+dot(p-swellCenter,swell.zw))+spectralElevation(p)+mix(dot(data.rg,vec2(255.*256.,255.)),dot(data.ba,vec2(255.*256.,255.)),blend)*16./65535.-8.;
 }`;
// Shared sky radiance for the dome and the water reflection. World Z is up.
const skyGLSL=`
uniform vec3 sunDir;
uniform vec3 moonDir;
uniform float tm;
uniform float storm;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.54);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float cloud(vec2 p){return noise2(p)*.53+noise2(p*2.1)*.27+noise2(p*4.3)*.13+noise2(p*8.9)*.07;}
vec3 skyColor(vec3 d){
 float day=smoothstep(-.12,.18,sunDir.z), dusk=1.-smoothstep(.03,.48,abs(sunDir.z));
 float h=pow(max(d.z,0.),.43);
 vec3 horizon=mix(vec3(.022,.041,.077),mix(vec3(.66,.83,.92),vec3(1.,.46,.21),dusk),day);
 vec3 zenith=mix(vec3(.002,.006,.025),vec3(.105,.34,.61),day);
 vec3 c=mix(horizon,zenith,h);
 float sd=max(dot(d,sunDir),0.),md=max(dot(d,moonDir),0.);
 c+=vec3(1.,.67,.32)*pow(sd,28.)*.42*day;
 c+=vec3(5.,3.6,2.1)*smoothstep(.99991,.99997,sd);
 c+=vec3(.72,.81,1.)*smoothstep(.99989,.99996,md)*(0.65+0.35*noise2(d.xy*430.));
 c+=vec3(.6,.76,.96)*step(.9986,hash(floor(d.xy/(.7+abs(d.z))*650.)))*(1.-day)*smoothstep(.05,.3,d.z);
 vec2 field=d.xy/max(.045,d.z)*1.45+vec2(tm*.001,0.);
 float clouds=smoothstep(.51-.14*storm,.72-.18*storm,cloud(field))*smoothstep(.025,.22,d.z);
 vec3 vapor=mix(vec3(.028,.04,.065),mix(vec3(.87,.91,.92),vec3(1.,.71,.48),dusk),day);
 vec3 fair=mix(c,vapor,clouds*.81);
 float front=cloud(field*.43+vec2(tm*.009,1.7));
 float shelf=smoothstep(.32,.65,front+max(d.z,0.)*.36);
 vec3 base=mix(vec3(.22,.29,.31),vec3(.018,.032,.046),shelf);
 base+=dusk*vec3(.83,.36,.08)*pow(max(0.,dot(d,sunDir)),8.)*(1.-.86*shelf);
 float epoch=floor(tm/11.),age=mod(tm,11.);
 float blink=exp(-120.*abs(age-.50))+.52*exp(-85.*abs(age-.68));
 float az=atan(d.y,d.x),strike=.42+1.2*(hash(vec2(epoch,9.))-.5);
 float line=strike+.034*sin(d.z*63.+epoch)+.009*sin(d.z*174.);
 float bolt=exp(-abs(atan(sin(az-line),cos(az-line)))*500.)*smoothstep(.004,.025,d.z)*(1.-smoothstep(.18,.24,d.z));
 base+=blink*(vec3(.39,.42,.48)*shelf+vec3(2.8,2.7,2.5)*bolt);
 return mix(fair,base*(.45+.55*day),storm);
}
`;
function atmosphere(scene){
 const U={storm:{value:0},tm:{value:0},sunDir:{value:new THREE.Vector3()},moonDir:{value:new THREE.Vector3()},under:{value:1},waveAmp:{value:1},tidalPhase:{value:.5}};
 const skyTarget=new THREE.WebGLRenderTarget(512,192,{type:THREE.HalfFloatType});
 skyTarget.texture.wrapS=THREE.RepeatWrapping;
 U.skyMap={value:skyTarget.texture};
 const lookup=`uniform sampler2D skyMap;uniform vec3 sunDir,moonDir;uniform float tm,storm;
 vec3 skyColor(vec3 d){return texture2D(skyMap,vec2(atan(d.y,d.x)/6.2831853+.5,asin(clamp(d.z,-1.,1.))/3.14159265+.5)).rgb;}`;
 const skyPass=new THREE.Scene(),skyEye=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 skyPass.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:U,depthTest:false,depthWrite:false,
 vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:skyGLSL+'varying vec2 p;void main(){float a=(p.x-.5)*6.2831853,h=(p.y-.5)*3.14159265;gl_FragColor=vec4(skyColor(vec3(cos(a)*cos(h),sin(a)*cos(h),sin(h))),1.);}'})));
 let lastSky=-Infinity,skyKey='';
 function updateSky(renderer,time,key){
   if(key===skyKey && time-lastSky<(U.storm.value>.3?.075:.35))return;
   lastSky=time;skyKey=key;renderer.setRenderTarget(skyTarget);renderer.render(skyPass,skyEye);renderer.setRenderTarget(null);
 }
 const dome=new THREE.Mesh(new THREE.SphereGeometry(280,40,24),new THREE.ShaderMaterial({uniforms:U,side:THREE.BackSide,depthWrite:false,
 vertexShader:'varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:lookup+'varying vec3 dir;void main(){gl_FragColor=vec4(skyColor(normalize(dir)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));
 scene.add(dome);
 const spectrumBytes=new Uint8Array(64*64*4),spectrumTexture=new THREE.DataTexture(spectrumBytes,64,64);
 spectrumTexture.wrapS=spectrumTexture.wrapT=THREE.RepeatWrapping;
 spectrumTexture.minFilter=spectrumTexture.magFilter=THREE.LinearFilter;
 Object.assign(U,{spectrumMap:{value:spectrumTexture},spectrumDrift:{value:new THREE.Vector2()},spectrumPeriod:{value:0},spectrumBlend:{value:1},swell:{value:new THREE.Vector4()},swellCenter:{value:new THREE.Vector2()}});
 const windBytes=new Uint8Array(48*48*4),windMap=new THREE.DataTexture(windBytes,48,48);
 windMap.wrapS=windMap.wrapT=THREE.RepeatWrapping;windMap.minFilter=windMap.magFilter=THREE.LinearFilter;windMap.needsUpdate=true;
 U.windMap={value:windMap};U.windFieldActive={value:0};
 function updateWind(field){
   for(let i=0;i<48*48;i++){
     for(let k=0;k<3;k++)windBytes[4*i+k]=Math.round(Math.max(0,Math.min(255,(field[3*i+k]+(k===2?0:32))*255/64)));
     windBytes[4*i+3]=255;
   }
   windMap.needsUpdate=true;U.windFieldActive.value=1;
 }
 function updateSpectrum(heights,x,y,period){
   for(let i=0;i<heights.length;i++){
     const packed=Math.round(32768+Math.max(-1,Math.min(.99996,heights[i]))*32768);
     const k=i*4;
     spectrumBytes[k]=U.spectrumPeriod.value?spectrumBytes[k+2]:packed>>8;
     spectrumBytes[k+1]=U.spectrumPeriod.value?spectrumBytes[k+3]:packed&255;
     spectrumBytes[k+2]=packed>>8;spectrumBytes[k+3]=packed&255;
   }
   spectrumTexture.needsUpdate=true;
   U.spectrumDrift.value.set(x,y);U.spectrumPeriod.value=period;
 }
 const pixels=new Uint8Array(32*32*4),tile=new THREE.DataTexture(pixels,32,32);
 tile.wrapS=tile.wrapT=THREE.RepeatWrapping;tile.minFilter=tile.magFilter=THREE.LinearFilter;tile.needsUpdate=true;
 Object.assign(U,{tile:{value:tile},blend:{value:1},tide:{value:0},wind:{value:11},bearing:{value:.45},boat:{value:new THREE.Vector4()},reflection:{value:null},transmission:{value:null},mirrorMatrix:{value:new THREE.Matrix4()},viewport:{value:new THREE.Vector2(1,1)}});
 const field=oceanHeightGLSL;
 const geometry=new THREE.PlaneGeometry(1,1,144,144);
 const coords=geometry.attributes.position;
 for(let j=0;j<coords.count;j++){
   const stretch=v=>Math.sign(v)*(Math.abs(v)*30+Math.pow(2*Math.abs(v),4)*580);
   coords.setXY(j,stretch(coords.getX(j)),stretch(coords.getY(j)));
 }
 const water=new THREE.Mesh(geometry,new THREE.ShaderMaterial({uniforms:U,side:THREE.DoubleSide,
 vertexShader:field+`varying vec3 wp;
 void main(){wp=(modelMatrix*vec4(position,1.)).xyz;wp.z=heightAt(wp.xy);
 gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
 fragmentShader:lookup+skyGLSL.slice(skyGLSL.indexOf('float hash'),skyGLSL.indexOf('vec3 skyColor'))+field+`
 uniform sampler2D windMap; uniform float windFieldActive; uniform sampler2D reflection,transmission; uniform mat4 mirrorMatrix;uniform vec2 viewport; uniform float under,wind,bearing;uniform vec4 boat;varying vec3 wp;
 float ripple(vec2 p){
   float chop=sin(p.x*5.3+1.6*sin(p.y*2.2)+tm*2.8)+.42*sin(p.x*10.8+p.y*4.4+tm*4.5);
   return chop*.007+noise2(p*1.9+tm*.3)*.05+noise2(p*6.6+tm*.55)*.014;
 }
 void main(){
   vec3 eye=normalize(cameraPosition-wp);
   vec3 air=texture2D(windMap,wp.xy/96.+.5/48.).rgb;
   vec2 localAir=air.rg*64.-32.;
   vec2 dir=windFieldActive>.5 && length(localAir)>.4?normalize(localAir):vec2(cos(bearing),sin(bearing));
   vec2 crosswind=vec2(-dir.y,dir.x);float rippleWind=mix(wind,air.b*64.,windFieldActive);
   vec2 p=vec2(dot(wp.xy,dir),dot(wp.xy,crosswind));float rip=ripple(p);
   float fade=1.-smoothstep(16.,110.,length(wp-cameraPosition));
   vec2 d=vec2((heightAt(wp.xy+vec2(.48,0))-heightAt(wp.xy-vec2(.48,0)))/.96,
               (heightAt(wp.xy+vec2(0,.48))-heightAt(wp.xy-vec2(0,.48)))/.96);
   d+=fade*min(rippleWind/10.,2.5)*(dir*(ripple(p+vec2(.06,0))-rip)+crosswind*(ripple(p+vec2(0,.06))-rip))/.06;
   vec3 n=normalize(vec3(-d,1.));vec3 ref=reflect(-eye,n);
   float day=smoothstep(-.12,.22,sunDir.z);
   float fres=.021+.979*pow(1.-clamp(abs(dot(n,eye)),0.,1.),5.);
   float back=pow(max(0.,dot(-eye,sunDir)),3.)*smoothstep(-.45,.9,wp.z-tide);
   vec3 waterColor=mix(vec3(.001,.008,.019),vec3(.004,.061,.093)+back*vec3(.012,.13,.10),day);
   vec4 clip=mirrorMatrix*vec4(wp,1.);
   // A distant reflected canopy occupies just a few pixels near the horizon.
   float normalOffset=.023*mix(.16,1.,smoothstep(.025,.24,abs(eye.z)));
   vec2 uv=clamp(clip.xy/clip.w*.5+.5-d*normalOffset,.001,.999);
   vec4 objects=texture2D(reflection,uv,.65);
   vec3 reflected=mix(skyColor(ref),objects.rgb,objects.a);
   float opticalDepth=clamp(4.2*pow(length((wp.xy-vec2(36.,40.))/vec2(17.,11.)),2.)-3.6+wp.z,0.,13.7);
   vec3 below=texture2D(transmission,clamp(gl_FragCoord.xy/viewport+d*.013,.001,.999)).rgb;
   vec3 trans=exp(-vec3(.51,.20,.12)*opticalDepth/max(.15,abs(eye.z)));
   vec3 color=mix(waterColor*(1.-trans)+below*trans,reflected,fres);
   color+=vec3(3.5,2.7,1.65)*pow(max(dot(ref,sunDir),0.),240.)+vec3(.62,.7,1.)*pow(max(dot(ref,moonDir),0.),260.);
   float crest=wp.z-tide-.4*length(d);
   waterColor=mix(waterColor,vec3(.012,.037,.043),storm*.85);
   float scum=cloud(p*vec2(1.8,3.8)+vec2(-.9*tm,0.));
   float foam=smoothstep(.40,.89,crest+(wind-9.)*.054)*smoothstep(.43,.67,scum);
   float shore=length((wp.xy-vec2(36.,40.))/vec2(17.,11.));
   foam=max(foam,exp(-abs(shore-.93)*23.)*smoothstep(.32,.65,scum));
   color=mix(color,vec3(.024,.34,.32)*(.3+.7*day),.62*(1.-smoothstep(.9,1.32,shore)));
   color=mix(color,vec3(.018,.048,.051)+reflected*.22,storm*(.48+.20*(1.-fres)));
   foam=max(foam,storm*smoothstep(.43,1.1,crest)*smoothstep(.34,.61,scum));
   color=mix(color,mix(vec3(.06,.10,.14),vec3(.79,.87,.85),day),foam*.86);
   if(under>.5){
     vec3 ray=normalize(wp-cameraPosition);
     float window=smoothstep(.62,.76,dot(ray,n));
     color=mix(vec3(.015,.105,.135),skyColor(ray)*.78,window)*(.22+.78*day);
   }
   float haze=smoothstep(70.,430.,length(wp-cameraPosition));
   color=mix(color,skyColor(normalize(vec3(-eye.xy,.01))),haze*.90*(1.-under));
   gl_FragColor=vec4(color,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
 }`}));
 scene.add(water);
 function update(old,f){
   if(!f.tile || f.tile.length!==1024)throw Error('Missing Modelica spectral tile');
   for(let i=0;i<1024;i++){
     const encode=h=>Math.round(65535*Math.max(0,Math.min(1,(h+8)/16)));
     const a=encode(old.tile[i]),b=encode(f.tile[i]);
     pixels.set([a>>8,a&255,b>>8,b&255],i*4);
   }
   tile.needsUpdate=true;U.tide.value=f.tide;U.wind.value=f.wind;
 }
 const mirrorCamera=new THREE.PerspectiveCamera(),reflectRT=new THREE.WebGLRenderTarget(512,320),throughRT=new THREE.WebGLRenderTarget(512,320);
 // Mip-filter thin silhouettes as ripple distortion minifies the reflected image.
 reflectRT.texture.generateMipmaps=true;
 reflectRT.texture.minFilter=THREE.LinearMipmapLinearFilter;
 U.reflection.value=reflectRT.texture;U.transmission.value=throughRT.texture;
 function capture(renderer,camera){
   renderer.getDrawingBufferSize(U.viewport.value);const oldBackground=scene.background,oldFog=scene.fog;
   const target=new THREE.Vector3();camera.getWorldDirection(target);target.add(camera.position);
   mirrorCamera.copy(camera);mirrorCamera.position.z=2*U.tide.value-camera.position.z;target.z=2*U.tide.value-target.z;
   mirrorCamera.up.set(0,0,-1);mirrorCamera.lookAt(target);mirrorCamera.updateMatrixWorld();
   U.mirrorMatrix.value.multiplyMatrices(mirrorCamera.projectionMatrix,mirrorCamera.matrixWorldInverse);
   water.visible=false;dome.visible=false;scene.background=null;scene.fog=null;
   renderer.setClearColor(0x000000,0);renderer.setRenderTarget(reflectRT);
   renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,0,1),-U.tide.value)];
   renderer.render(scene,mirrorCamera);renderer.clippingPlanes=[];
   renderer.setRenderTarget(throughRT);scene.background=new THREE.Color(0x144958);
   renderer.render(scene,camera);renderer.setRenderTarget(null);
   scene.fog=oldFog;scene.background=oldBackground;water.visible=true;dome.visible=true;
 }
 function setCaptureScale(scale){
   const width=Math.round(512*scale),height=Math.round(320*scale);
   reflectRT.setSize(width,height);throughRT.setSize(width,height);
 }
 return {U,dome,water,update,updateSpectrum,updateWind,capture,setCaptureScale,updateSky};
}
