 const oceanHeightGLSL=`
 uniform sampler2D tile;uniform float blend,tide;
 uniform vec4 swell; uniform vec2 swellCenter; uniform sampler2D spectrumMap; uniform vec2 spectrumDrift; uniform float spectrumPeriod,spectrumBlend;
 float spectralElevation(vec2 p){
   if(spectrumPeriod<=0.)return 0.;
   vec4 pair=texture2D(spectrumMap,(p-spectrumDrift)/spectrumPeriod+vec2(.5/64.));
   vec2 weights=vec2(65280.,255.);
   return (mix(dot(pair.rg,weights),dot(pair.ba,weights),spectrumBlend)-32768.)/8192.;
 }
 float heightAt(vec2 p){
  vec4 data=texture2D(tile,p/64.+vec2(.5/32.));
  return tide+swell.x*sin(swell.y+dot(p-swellCenter,swell.zw))+spectralElevation(p)+mix(dot(data.rg,vec2(255.*256.,255.)),dot(data.ba,vec2(255.*256.,255.)),blend)*16./65535.-8.;
 }`;
// A single camera-centred batch. The two vertices of each streak share a seed
// and wrap together, so drops never stretch across the edge of the rain volume.
function stormRain(T,scene,water,mobile){
 const count=mobile?700:1800,points=new Float32Array(count*6),ends=new Float32Array(count*2);
 let seed=83121;
 function random(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
 for(let i=0;i<count;i++){
   const x=random(),y=random(),z=random();
   points.set([x,y,z,x,y,z],i*6);ends[2*i+1]=1;
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.BufferAttribute(points,3));geometry.setAttribute('tail',new T.BufferAttribute(ends,1));
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{...water.U,rainWind:{value:new T.Vector2()}},
 vertexShader:`attribute float tail;varying float opacity;uniform float tm,under;uniform vec2 cloudTravel,lightning,rainWind;
 ${oceanHeightGLSL}
 void main(){
   vec3 span=vec3(28.,28.,18.);
   float speed=9.+4.*position.x;
   vec3 drift=vec3(cloudTravel,-tm*speed);
   vec3 p=cameraPosition+mod(position*span+drift-cameraPosition+.5*span,span)-.5*span;
   p+=tail*vec3(-rainWind*.017,speed*.017);
   float distanceFade=1.-smoothstep(10.,14.,distance(p,cameraPosition));
   opacity=(1.-under)*distanceFade*smoothstep(0.,.12,p.z-heightAt(p.xy))*(.23+.16*position.y+.25*lightning.y);
   gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
 }`,
 fragmentShader:`varying float opacity;void main(){gl_FragColor=vec4(.67,.76,.83,opacity);}`});
 const rain=new T.LineSegments(geometry,material);rain.frustumCulled=false;rain.visible=false;rain.renderOrder=2;
 scene.add(rain);return rain;
}
// Optical short-wave slopes shared by the surface BRDF and the sunlight rays.
const oceanRippleGLSL=`
vec2 rippleSlope(vec2 world,float clock,float bearing,float wind){
  vec2 along=vec2(cos(bearing),sin(bearing)),crossSea=vec2(-along.y,along.x);
  vec2 p=vec2(dot(world,along),dot(world,crossSea));
  vec2 k1=vec2(3.4,.72),k2=vec2(4.75,-1.95),k3=vec2(7.1,2.65);
  float spread=.68+.32*sin(dot(p,vec2(.41,.27))-.78*clock);
  vec2 slope=spread*(.011*k1*cos(dot(k1,p)-5.82*clock+.65*sin(.55*p.y))
             +.006*k2*cos(dot(k2,p)-7.09*clock+.8*sin(.32*p.x+.24*p.y))
             +.003*k3*cos(dot(k3,p)-8.61*clock));
  return min(1.7,wind/10.)*(along*slope.x+crossSea*slope.y);
}`;
// Shared sky radiance for the dome and the water reflection. World Z is up.
const skyNoiseGLSL=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.54);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float cloud(vec2 p){return noise2(p)*.53+noise2(p*2.1)*.27+noise2(p*4.3)*.13+noise2(p*8.9)*.07;}
`;
const skyGLSL=`
uniform vec3 sunDir;
uniform vec3 moonDir;
uniform float tm;
uniform float storm;
uniform vec2 cloudTravel,lightning;
${skyNoiseGLSL}
vec4 skyRadiance(vec3 d){
 float day=smoothstep(-.12,.18,sunDir.z), dusk=1.-smoothstep(.03,.48,abs(sunDir.z));
 float h=pow(max(d.z,0.),.43);
 vec3 horizon=mix(vec3(.022,.041,.077),mix(vec3(.66,.83,.92),vec3(1.,.46,.21),dusk),day);
 vec3 zenith=mix(vec3(.002,.006,.025),vec3(.105,.34,.61),day);
 vec3 c=mix(horizon,zenith,h);
 float sd=max(dot(d,sunDir),0.),md=max(dot(d,moonDir),0.);
 c+=vec3(1.,.67,.32)*pow(sd,28.)*.42*day;
 c+=vec3(.72,.81,1.)*smoothstep(.99989,.99996,md)*(0.65+0.35*noise2(d.xy*430.));
 c+=vec3(.6,.76,.96)*step(.9986,hash(floor(d.xy/(.7+abs(d.z))*650.)))*(1.-day)*smoothstep(.05,.3,d.z);
 vec2 field=d.xy/max(.045,d.z)*1.45+-cloudTravel*.001;
 float clouds=smoothstep(.51-.14*storm,.72-.18*storm,cloud(field))*smoothstep(.025,.22,d.z);
 vec3 vapor=mix(vec3(.028,.04,.065),mix(vec3(.87,.91,.92),vec3(1.,.71,.48),dusk),day);
 vec3 fair=mix(c,vapor,clouds*.81);
 if(storm<.001)return vec4(fair,1.-clouds*.81);
 // Trace a curved layer. Finite grazing paths leave a misty horizon.
 vec3 view=normalize(vec3(d.xy,max(0.,d.z)));
 float earth=160.,mu=view.z*earth;
 float entry=-mu+sqrt(mu*mu+2.*earth*.68+.68*.68);
 float exitRay=-mu+sqrt(mu*mu+2.*earth*1.52+1.52*1.52);
 float stepLen=(exitRay-entry)/12.,through=1.;
 vec3 scatter=vec3(0.);
 for(int i=0;i<12;i++){
   vec3 q=view*(entry+(float(i)+.5)*stepLen);
   float altitude=(length(q+vec3(0.,0.,earth))-earth-.68)/.84;
   vec3 coord=q*vec3(.65,.65,1.7)+-vec3(cloudTravel*.001,0.);
   float density=stormDensity(coord,altitude);
   float shade=exp(-2.6*density-1.4*stormDensity(coord+sunDir*.32,altitude+.18));
   vec3 light=mix(vec3(.036,.051,.071),vec3(.39,.43,.45)+dusk*vec3(.34,.14,.025),shade);
   float absorbed=1.-exp(-density*stepLen*6.);
   scatter+=through*absorbed*light;through*=1.-absorbed;
 }
 vec3 base=scatter+through*mix(horizon,zenith,.7*h);
 float haze=exp(-max(d.z,0.)*15.);
 base=mix(base,vec3(.22,.28,.30),haze*.79);
 float shelf=1.-through;
 float blink=lightning.y,az=atan(d.y,d.x),strike=lightning.x;
 float epoch=floor(tm/14.);
 float line=strike+.034*sin(d.z*63.+epoch)+.009*sin(d.z*174.);
 float bolt=exp(-abs(atan(sin(az-line),cos(az-line)))*500.)*smoothstep(.004,.025,d.z)*(1.-smoothstep(.18,.24,d.z));
 float arc=atan(sin(az-strike),cos(az-strike));
 base+=blink*(vec3(.72,.76,.95)*exp(-5.*arc*arc-8.*pow(d.z-.22,2.))*shelf+vec3(2.8,2.7,2.5)*bolt);
 return vec4(mix(fair,base*(.45+.55*day),storm),(1.-clouds*.81)*(1.-storm));
}
`;
function atmosphere(scene){
 const U={cloudTravel:{value:new THREE.Vector2()},lightning:{value:new THREE.Vector2()},storm:{value:0},tm:{value:0},sunDir:{value:new THREE.Vector3()},moonDir:{value:new THREE.Vector3()},under:{value:1},waveAmp:{value:1},tidalPhase:{value:.5}};
 const skyTarget=new THREE.WebGLRenderTarget(512,192,{type:THREE.HalfFloatType});
 skyTarget.texture.wrapS=THREE.RepeatWrapping;
 U.skyMap={value:skyTarget.texture};
 const lookup=`uniform sampler2D skyMap;uniform vec3 sunDir,moonDir;uniform float tm,storm;
 vec3 skyColor(vec3 d){
   vec4 sky=texture2D(skyMap,vec2(atan(d.y,d.x)/6.2831853+.5,asin(clamp(d.z,-1.,1.))/3.14159265+.5));
   float separation=length(d-sunDir);
   float edge=max(.00005,.5*fwidth(separation));
   float disc=1.-smoothstep(.00465-edge,.00465+edge,separation);
   return sky.rgb+vec3(5.,3.6,2.1)*disc*sky.a*step(0.,d.z);
 }`;
 const skyPass=new THREE.Scene(),skyEye=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 skyPass.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:U,depthTest:false,depthWrite:false,
 vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:skyGLSL.replace('vec4 skyRadiance',`
 float cloudNoise(vec3 p){
   float layer=floor(p.z),z=fract(p.z);
   vec2 offset=vec2(31.19,17.71);
   return mix(noise2(p.xy+layer*offset),noise2(p.xy+(layer+1.)*offset),z*z*(3.-2.*z));
 }
 float stormDensity(vec3 q,float h){
   float v=.54*cloudNoise(q)+.27*cloudNoise(q*2.09+9.)+.13*cloudNoise(q*4.27-13.)+.06*cloudNoise(q*8.5+21.);
   return smoothstep(.28,.70,v)*smoothstep(0.,.26,h)*(1.-smoothstep(.78,1.,h));
 }
 vec4 skyRadiance`)+'varying vec2 p;void main(){float a=(p.x-.5)*6.2831853,h=(p.y-.5)*3.14159265;gl_FragColor=skyRadiance(vec3(cos(a)*cos(h),sin(a)*cos(h),sin(h)));}'})));
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
     const packed=Math.round(32768+Math.max(-4,Math.min(3.99987,heights[i]))*8192);
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
 fragmentShader:lookup+oceanRippleGLSL+skyNoiseGLSL+field+`
 uniform sampler2D windMap; uniform float windFieldActive; uniform sampler2D reflection,transmission; uniform mat4 mirrorMatrix;uniform vec2 viewport; uniform float under,wind,bearing;uniform vec4 boat;varying vec3 wp;
 uniform highp sampler2D transmissionDepth;uniform mat4 throughMatrix;uniform vec3 throughEye;uniform vec2 cameraRange;
 float viewDepth(float z){return cameraRange.x*cameraRange.y/(cameraRange.y-z*(cameraRange.y-cameraRange.x));}
 void main(){
   vec3 eye=normalize(cameraPosition-wp);
   vec3 air=texture2D(windMap,wp.xy/96.+.5/48.).rgb;
   vec2 localAir=air.rg*64.-32.;
   vec2 dir=windFieldActive>.5 && length(localAir)>.4?normalize(localAir):vec2(cos(bearing),sin(bearing));
   vec2 crosswind=vec2(-dir.y,dir.x);float rippleWind=mix(wind,air.b*64.,windFieldActive);
   vec2 baseDir=vec2(cos(bearing),sin(bearing));
   vec2 p=vec2(dot(wp.xy,baseDir),dot(wp.xy,vec2(-baseDir.y,baseDir.x)));
   float fade=1.-smoothstep(16.,110.,length(wp-cameraPosition));
   vec2 d=vec2((heightAt(wp.xy+vec2(.48,0))-heightAt(wp.xy-vec2(.48,0)))/.96,
               (heightAt(wp.xy+vec2(0,.48))-heightAt(wp.xy-vec2(0,.48)))/.96);
   d+=fade*rippleSlope(wp.xy,tm,bearing,rippleWind);
   vec3 n=normalize(vec3(-d,1.));vec3 ref=reflect(-eye,n);
   float day=smoothstep(-.12,.22,sunDir.z);
   vec3 color;
   if(under>.5){
     vec3 ray=normalize(wp-cameraPosition);
     // Trace the underwater viewing ray across the water/air interface.
     vec3 skyRay=refract(ray,-n,1.333);
     float incidence=clamp(dot(ray,n),0.,1.);
     float transmissionGate=smoothstep(.653,.672,incidence);
     vec3 through=skyColor(normalize(skyRay+vec3(0.,0.,.0001)));
     vec3 underside=mix(vec3(.006,.040,.061),vec3(.015,.14,.17),incidence)*(.24+.76*day);
     color=mix(underside,through,transmissionGate*(1.-pow(1.-incidence,5.)));
     vec3 attenuation=exp(-vec3(.18,.057,.032)*length(wp-cameraPosition));
     color=mix(vec3(.013,.105,.145)*(.22+.78*day),color,attenuation);
   }else{
     float fres=.021+.979*pow(1.-clamp(abs(dot(n,eye)),0.,1.),5.);
     float back=pow(max(0.,dot(-eye,sunDir)),3.)*smoothstep(-.45,.9,wp.z-tide);
     vec3 waterColor=mix(vec3(.001,.008,.019),vec3(.004,.061,.093)+back*vec3(.012,.13,.10),day);
     vec4 clip=mirrorMatrix*vec4(wp,1.);
     // A distant reflected canopy occupies just a few pixels near the horizon.
     float normalOffset=.023*mix(.16,1.,smoothstep(.025,.24,abs(eye.z)));
     vec2 uv=clamp(clip.xy/clip.w*.5+.5-d*normalOffset,.001,.999);
     vec4 objects=texture2D(reflection,uv,.65);
     vec3 reflected=mix(skyColor(ref),objects.rgb,objects.a);
     // Compare both depths in the camera that captured the seabed.
     vec4 captureClip=throughMatrix*vec4(wp,1.);
     vec2 screen=captureClip.xy/max(.001,captureClip.w)*.5+.5;
     vec2 refrUV=clamp(screen+d*.009,.001,.999);
     float surfaceDepth=captureClip.w;
     float hitDepth=viewDepth(texture2D(transmissionDepth,refrUV).r);
     if(hitDepth<surfaceDepth){refrUV=screen;hitDepth=viewDepth(texture2D(transmissionDepth,screen).r);}
     float path=clamp((hitDepth-surfaceDepth)*length(throughEye-wp)/max(.01,surfaceDepth),0.,60.);
     vec2 frameMargin=min(screen,1.-screen);
     float visible=smoothstep(0.,.025,min(frameMargin.x,frameMargin.y))
        *step(.001,surfaceDepth)*step(surfaceDepth,hitDepth)*(1.-smoothstep(9.,32.,path));
     vec3 below=texture2D(transmission,refrUV).rgb;
     vec3 trans=visible*exp(-vec3(.22,.085,.055)*path);
     color=mix(waterColor*(1.-trans)+below*trans,reflected,fres);
     color+=vec3(3.5,2.7,1.65)*pow(max(dot(ref,sunDir),0.),240.)+vec3(.62,.7,1.)*pow(max(dot(ref,moonDir),0.),260.);
     float crest=wp.z-tide-.4*length(d);
     waterColor=mix(waterColor,vec3(.012,.037,.043),storm*.85);
     float scum=cloud(p*vec2(1.8,3.8)+vec2(-.9*tm,0.));
     float foam=smoothstep(.40,.89,crest+(wind-9.)*.054)*smoothstep(.43,.67,scum);
     float shore=length((wp.xy-vec2(36.,40.))/vec2(17.,11.));
     foam=max(foam,exp(-abs(shore-.93)*23.)*smoothstep(.32,.65,scum));

     color=mix(color,vec3(.018,.048,.051)+reflected*.22,storm*(.48+.20*(1.-fres)));
     foam=max(foam,storm*smoothstep(.43,1.1,crest)*smoothstep(.34,.61,scum));
     color=mix(color,mix(vec3(.06,.10,.14),vec3(.79,.87,.85),day),foam*.86);
     float haze=smoothstep(70.,430.,length(wp-cameraPosition));
     color=mix(color,skyColor(normalize(vec3(-eye.xy,.01))),haze*.90);
   }
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
 throughRT.depthTexture=new THREE.DepthTexture(512,320,THREE.UnsignedIntType);
 U.throughMatrix={value:new THREE.Matrix4()};U.throughEye={value:new THREE.Vector3()};
 U.transmissionDepth={value:throughRT.depthTexture};U.cameraRange={value:new THREE.Vector2()};
 U.reflection.value=reflectRT.texture;U.transmission.value=throughRT.texture;
 function capture(renderer,camera){
   camera.updateMatrixWorld();U.throughMatrix.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
   U.throughEye.value.copy(camera.position);U.cameraRange.value.set(camera.near,camera.far);renderer.getDrawingBufferSize(U.viewport.value);const oldBackground=scene.background,oldFog=scene.fog;
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
