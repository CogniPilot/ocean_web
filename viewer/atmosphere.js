 const oceanHeightGLSL=`
 uniform sampler2D tile;uniform float blend,tide;
 uniform vec4 swell,boat; uniform vec2 swellCenter;
 uniform sampler2D spectrumMap,incidentMap,bowMap;
 uniform vec2 spectrumDrift;
 uniform float spectrumPeriod,spectrumBlend,wakeAvailable,bowAvailable;
 vec2 spectralUV(vec2 p){return (p-spectrumDrift)/spectrumPeriod+vec2(.5/64.);}
 float elevationSample(sampler2D map,vec2 uv){
   vec4 pair=texture2D(map,uv);
   vec2 weights=vec2(65280.,255.);
   return (mix(dot(pair.rg,weights),dot(pair.ba,weights),spectrumBlend)-32768.)/8192.;
 }
 // Match the hull-wave window used for the Modelica water probes.
 float wakeFalloff(vec2 p){return smoothstep(.35,.49,length(p-boat.xy)/spectrumPeriod);}
 float spectralElevation(vec2 p){
   if(spectrumPeriod<=0.)return 0.;
   vec2 uv=spectralUV(p);
   float falloff=wakeAvailable>.5?wakeFalloff(p):0.;
   if(falloff>=1.)return elevationSample(incidentMap,uv);
   float z=elevationSample(spectrumMap,uv);
   return falloff<=0.?z:mix(z,elevationSample(incidentMap,uv),falloff);
 }
 bool nearBowField(vec2 p,float radius){
   #ifdef DISABLE_BOW_FIELD
   return false;
   #else
   vec2 r=p-boat.xy;
   return bowAvailable>.5&&dot(r,r)<radius*radius;
   #endif
 }
 float bowElevation(vec2 p){
   if(!nearBowField(p,4.))return 0.;
   vec2 r=p-boat.xy,forward=vec2(cos(boat.z),sin(boat.z));
   vec2 local=vec2(dot(r,forward),dot(r,vec2(-forward.y,forward.x)));
   return elevationSample(bowMap,local/8.+vec2(.5/32.));
 }
 float backgroundHeightAt(vec2 p){
  vec4 data=texture2D(tile,p/64.+vec2(.5/32.));
  return tide+swell.x*sin(swell.y+dot(p-swellCenter,swell.zw))+spectralElevation(p)+mix(dot(data.rg,vec2(255.*256.,255.)),dot(data.ba,vec2(255.*256.,255.)),blend)*16./65535.-8.;
 }
 float heightAt(vec2 p){return backgroundHeightAt(p)+bowElevation(p);}
 `;
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
vec2 rippleSlope(vec2 world,float clock,vec2 along,float wind){
  vec2 crossSea=vec2(-along.y,along.x);
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
// One point batch for droplets from both hulls. Emission follows the measured
// wet forebody sections. After release, droplets travel independently of the boat.
function bowSpray(scene,U){
 const slots=2048,geometry=new THREE.BufferGeometry();
 const origins=new THREE.BufferAttribute(new Float32Array(slots*3),3).setUsage(THREE.DynamicDrawUsage);
 const velocity=new THREE.BufferAttribute(new Float32Array(slots*3),3).setUsage(THREE.DynamicDrawUsage);
 const life=new THREE.BufferAttribute(new Float32Array(slots*2),2).setUsage(THREE.DynamicDrawUsage);
 geometry.setAttribute('position',origins);geometry.setAttribute('launchVelocity',velocity);geometry.setAttribute('drop',life);
 const material=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,
   vertexShader:oceanHeightGLSL+`
     uniform float tm,under;uniform vec2 viewport;
     attribute vec3 launchVelocity;attribute vec2 drop;varying float opacity;
     void main(){
       float age=tm-position.z;
       float dz=age*(launchVelocity.z-4.905*age);
       gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;opacity=0.;
       if(drop.x<=0. || under>.5 || age<0. || dz<0.)return;
       vec2 p=position.xy+age*launchVelocity.xy;
       vec4 eye=viewMatrix*vec4(p,heightAt(position.xy)+dz+.012,1.);
       gl_Position=projectionMatrix*eye;
       float pixels=drop.x*viewport.y*projectionMatrix[1][1]/max(.1,-eye.z);
       gl_PointSize=clamp(pixels,1.,9.);
       opacity=drop.y*min(1.,pixels*pixels)*smoothstep(0.,.025,dz+.012);
     }`,
   fragmentShader:`uniform vec3 sunDir;varying float opacity;
     void main(){
       vec2 q=2.*gl_PointCoord-1.;float a=opacity*(1.-smoothstep(.12,1.,dot(q,q)));
       if(a<.012)discard;
       gl_FragColor=vec4(mix(vec3(.15,.25,.29),vec3(.85,.93,.95),smoothstep(-.15,.22,sunDir.z)),a);
       #include <tonemapping_fragment>
       #include <colorspace_fragment>
     }`});
 const points=new THREE.Points(geometry,material);
 points.name='Bow spray';points.frustumCulled=false;points.visible=false;points.renderOrder=1;scene.add(points);
 const priorWet=[0,0];
 let slot=0,seed=853,previous,lastDrop=-Infinity;
 function random(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
 function clear(){life.array.fill(0);life.needsUpdate=true;points.visible=false;previous=undefined;lastDrop=-Infinity;}
 function sample(strips,time,speed){
   if(previous===time)return;
   if(previous!==undefined&&(time<previous||time-previous>.31))clear();
   const dt=previous===undefined?0:time-previous;
   previous=time;
   let emitted=false;
   for(let hull=0;hull<2;hull++){
     const stern=18*hull;
     let tip=stern+15;
     while(tip>stern+3 && strips[tip+2]<.0007)tip-=3;
     const shoulder=tip-3;
     let dx=strips[tip]-strips[shoulder],dy=strips[tip+1]-strips[shoulder+1];
     const length=Math.hypot(dx,dy),wet=strips[tip+2]+.42*strips[shoulder+2];
     const loading=dt>0?Math.max(0,(wet-priorWet[hull])/dt):0;
     priorWet[hull]=wet;
     if(!dt||length<.02||speed<1.5||wet<.0003)continue;
     dx/=length;dy/=length;
     const strength=Math.min(1,(speed-1.5)/6)*Math.min(1,Math.sqrt(wet/.012));
     const impact=Math.min(1,loading/.085);
     const count=Math.min(160,Math.round(dt*1450*strength*(.68+.65*impact)));
     for(let i=0;i<count;i++){
       const phase=(i+random())*dt/count,side=random()<.5?-1:1;
       const along=(.40+.65*strips[tip+2]/wet-.64*random())*length+phase*speed;
       const beam=side*(.065+.075*random());
       origins.setXYZ(slot,strips[shoulder]+along*dx-beam*dy,strips[shoulder+1]+along*dy+beam*dx,time+phase);
       const surge=speed*(.18+.32*random()),sway=side*speed*(.10+.20*random());
       const rise=Math.min(4.1,speed*(.13+.20*random())*(.95+.65*impact));
       velocity.setXYZ(slot,surge*dx-sway*dy,surge*dy+sway*dx,rise);
       life.setXY(slot,.004+.010*random(),.52+.40*random());
       slot=(slot+1)%slots;lastDrop=time+phase;emitted=true;
     }
   }
   if(emitted)origins.needsUpdate=velocity.needsUpdate=life.needsUpdate=true;
   points.visible=time-lastDrop<1.;
 }
 return {points,sample,clear};
}
// Render white water over the solved surface along the past wet stern sections.
function hullFoam(scene,uniforms){
 const count=52,tracks=[[],[]],geometry=new THREE.BufferGeometry();
 const along=new Float32Array(2*count*2*3);
 const foam=new Float32Array(2*count*2*3);
 const indices=[];
 for(let h=0;h<2;h++)for(let row=0;row<count-1;row++){
   const v=(h*count+row)*2;indices.push(v,v+1,v+2,v+1,v+3,v+2);
 }
 geometry.setAttribute('position',new THREE.BufferAttribute(along,3).setUsage(THREE.DynamicDrawUsage));
 geometry.setAttribute('foam',new THREE.BufferAttribute(foam,3).setUsage(THREE.DynamicDrawUsage));
 geometry.setIndex(indices);
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,side:THREE.DoubleSide,depthWrite:false,
   vertexShader:oceanHeightGLSL+`
     attribute vec3 foam;
     varying vec3 vFoam;
     varying vec2 location;
     void main(){
       vec2 p=position.xy+spectrumDrift;
       vFoam=foam;location=position.xy;
       gl_Position=projectionMatrix*viewMatrix*vec4(p,heightAt(p)+.018,1.);
     }`,
   fragmentShader:skyNoiseGLSL+`
     uniform float tm,under;
     uniform vec3 sunDir;
     varying vec3 vFoam;
     varying vec2 location;
     void main(){
       float age=max(0.,tm-vFoam.y);
       float grain=noise2(location*19.);
       float edge=1.-smoothstep(.24,.83,abs(vFoam.x)+(grain-.5)*.37);
       float breakup=smoothstep(.24,.64,noise2(location*5.)*.7+grain*.3);
       float alpha=vFoam.z*edge*(.48+.52*breakup)*exp(-age*.43)*(1.-smoothstep(3.6,5.,age));
       if(under>.5 || alpha<.015)discard;
       vec3 tint=mix(vec3(.18,.24,.29),vec3(.88,.94,.93),smoothstep(-.12,.22,sunDir.z));
       gl_FragColor=vec4(tint,alpha);
       #include <tonemapping_fragment>
       #include <colorspace_fragment>
     }`});
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name='Hull foam trails';mesh.frustumCulled=false;mesh.visible=false;
 scene.add(mesh);
 let stamp;
 function clear(){
   for(const track of tracks)track.length=0;
   mesh.visible=false;stamp=undefined;
 }
 function sample(strips,time,speed,cat){
   if(!strips||time===stamp)return;
   const drift=uniforms.spectrumDrift.value,dx=drift.x,dy=drift.y;
   if(stamp!==undefined&&time-stamp>.26)clear();
   stamp=time;
   let visible=false;
   for(let h=0;h<tracks.length;h++){
     const track=tracks[h],i=18*h;
     if(h===0||cat){
       const aft=strips[i+2],inboard=.42*strips[i+5],wet=aft+inboard;
       const strength=Math.max(0,Math.min(1,(speed-1.25)/3.1))*Math.min(1,Math.max(0,wet)/.010);
       const forward=wet>1e-9?inboard/wet:0;
       const east=strips[i]+forward*(strips[i+3]-strips[i]);
       const north=strips[i+1]+forward*(strips[i+4]-strips[i+1]);
       track.unshift([east-dx,north-dy,time,strength]);
       if(track.length>count)track.pop();
     }
     for(let j=0;j<count;j++){
       const p=track[Math.min(j,track.length-1)]??[0,0,0,0];
       const before=track[Math.max(0,j-1)]??p,after=track[j+1]??p;
       const ux=before[0]-after[0],uy=before[1]-after[1],length=Math.hypot(ux,uy);
       const width=(cat?.16:.20)+.16*p[3]+.08*Math.max(0,time-p[2]);
       const strength=j<track.length&&length>.02?p[3]:0;
       visible||=strength>.025;
       for(let side=0;side<2;side++){
         const k=(h*count+j)*6+3*side,sign=2*side-1;
         const normal=sign*width/Math.max(.02,length);
         along[k]=p[0]-uy*normal;along[k+1]=p[1]+ux*normal;
         foam[k]=sign;foam[k+1]=p[2];foam[k+2]=strength;
       }
     }
   }
   geometry.attributes.position.needsUpdate=geometry.attributes.foam.needsUpdate=true;
   mesh.visible=visible;
 }
 return {mesh,clear,sample};
}
function atmosphere(scene,waterCaptureLayer){
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
 U.windBlend={value:1};U.referenceWind={value:11};
 function updateWind(field){
   for(let i=0;i<48*48;i++){
     const k=i*4;
     const incoming=Math.hypot(field[3*i],field[3*i+1]);
     const previous=Math.hypot(windBytes[k]*64/255-32,windBytes[k+1]*64/255-32);
     const shown=U.windFieldActive.value?
       windBytes[k+3]*(1-U.windBlend.value)+previous*255/64*U.windBlend.value:incoming*255/64;
     for(let k=0;k<3;k++)windBytes[4*i+k]=Math.round(Math.max(0,Math.min(255,(field[3*i+k]+(k===2?0:32))*255/64)));
     windBytes[k+3]=Math.round(Math.max(0,Math.min(255,shown)));
   }
   windMap.needsUpdate=true;U.windFieldActive.value=1;
 }
 const incidentBytes=new Uint8Array(64*64*4);
 const incidentTexture=new THREE.DataTexture(incidentBytes,64,64);
 incidentTexture.wrapS=incidentTexture.wrapT=THREE.RepeatWrapping;
 incidentTexture.minFilter=incidentTexture.magFilter=THREE.LinearFilter;
 U.incidentMap={value:incidentTexture};U.wakeAvailable={value:0};
 const bowBytes=new Uint8Array(32*32*4),bowTexture=new THREE.DataTexture(bowBytes,32,32);
 bowTexture.wrapS=bowTexture.wrapT=THREE.RepeatWrapping;
 bowTexture.minFilter=bowTexture.magFilter=THREE.LinearFilter;
 U.bowMap={value:bowTexture};U.bowAvailable={value:0};
 U.forebodyPort={value:new THREE.Vector3()};U.forebodyStarboard={value:new THREE.Vector3()};
 let spray;
 function clearWake(){spray?.clear();U.wakeAvailable.value=U.bowAvailable.value=0;trails.clear();}
 function displayedHeight(data,k,blend){
   const old=(data[k]<<8)+data[k+1],latest=(data[k+2]<<8)+data[k+3];
   return Math.round(old+blend*(latest-old));
 }
 function encodeSpectrum(data,frame,initialized,subtract){
   for(let i=0;i<frame.length;i++){
     const level=frame[i]-(subtract?subtract[i]:0);
     const packed=Math.round(32768+Math.max(-4,Math.min(3.99987,level))*8192);
     const k=i*4,old=initialized?displayedHeight(data,k,U.spectrumBlend.value):packed;
     data[k]=old>>8;data[k+1]=old&255;data[k+2]=packed>>8;data[k+3]=packed&255;
   }
 }
 function updateSpectrum(heights,x,y,period,wake,bow){
   if(wake){
     encodeSpectrum(incidentBytes,heights,U.wakeAvailable.value,wake);
     incidentTexture.needsUpdate=true;U.wakeAvailable.value=1;
   }
   if(bow){
     encodeSpectrum(bowBytes,bow,U.bowAvailable.value);
     bowTexture.needsUpdate=true;U.bowAvailable.value=1;
   }
   encodeSpectrum(spectrumBytes,heights,U.spectrumPeriod.value);
   spectrumTexture.needsUpdate=true;
   U.spectrumDrift.value.set(x,y);U.spectrumPeriod.value=period;
 }
 const pixels=new Uint8Array(32*32*4),tile=new THREE.DataTexture(pixels,32,32);
 tile.wrapS=tile.wrapT=THREE.RepeatWrapping;tile.minFilter=tile.magFilter=THREE.LinearFilter;tile.needsUpdate=true;
 Object.assign(U,{tile:{value:tile},blend:{value:1},tide:{value:0},wind:{value:11},bearing:{value:.45},boat:{value:new THREE.Vector4()},reflection:{value:null},transmission:{value:null},mirrorMatrix:{value:new THREE.Matrix4()},viewport:{value:new THREE.Vector2(1,1)}});
 const field=oceanHeightGLSL+`
 vec2 surfaceSlope(vec2 p,out vec2 bowSlope){
   vec2 slope=vec2(backgroundHeightAt(p+vec2(.48,0))-backgroundHeightAt(p-vec2(.48,0)),
     backgroundHeightAt(p+vec2(0,.48))-backgroundHeightAt(p-vec2(0,.48)))/.96;
   bowSlope=vec2(0.);
   if(nearBowField(p,4.25))
     bowSlope=vec2(bowElevation(p+vec2(.24,0))-bowElevation(p-vec2(.24,0)),
       bowElevation(p+vec2(0,.24))-bowElevation(p-vec2(0,.24)))/.48;
   return slope+bowSlope;
 }
 #ifdef VERTEX_SLOPE
 varying vec2 resolvedSlope;
 #endif
 `;
 function waterMesh(segments){
 const geometry=new THREE.PlaneGeometry(1,1,segments,segments);
 const coords=geometry.attributes.position;
 // Resolve the 25 cm body-frame field with at least two vertices per cell
 // across the bows. Spend the same vertex budget over coarser open water.
 const stretch=v=>{
   const u=2*Math.abs(v);
   if(segments<120)return Math.sign(v)*(15*u+580*u**4);
   const outer=Math.max(0,(u-.52)/.48);
   return Math.sign(v)*(7.5*u+587.5*outer**3);
 };
 for(let j=0;j<coords.count;j++){
   coords.setXY(j,stretch(coords.getX(j)),stretch(coords.getY(j)));
 }
 return geometry;
 }
 const water=new THREE.Mesh(waterMesh(144),new THREE.ShaderMaterial({uniforms:U,side:THREE.DoubleSide,
 vertexShader:field+`varying vec3 wp;
 void main(){wp=(modelMatrix*vec4(position,1.)).xyz;wp.z=heightAt(wp.xy);
 #ifdef VERTEX_SLOPE
 vec2 unusedBowSlope;resolvedSlope=surfaceSlope(wp.xy,unusedBowSlope);
 #endif
 gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
 fragmentShader:lookup+oceanRippleGLSL+skyNoiseGLSL+field+`
 uniform sampler2D windMap; uniform float windFieldActive,windBlend,referenceWind;
 uniform sampler2D reflection,transmission; uniform mat4 mirrorMatrix;uniform vec2 viewport; uniform float under,wind,bearing;varying vec3 wp;
 uniform vec3 forebodyPort,forebodyStarboard;
 uniform highp sampler2D transmissionDepth;uniform mat4 throughMatrix;uniform vec3 throughEye;uniform vec2 cameraRange;
 uniform vec2 transmissionSize;

 float nearWetBow(vec3 source,vec2 point,vec2 forward){
   vec2 relative=point-source.xy;
   float nose=dot(relative,forward);
   float across=abs(dot(relative,vec2(-forward.y,forward.x)));
   return source.z*(1.-smoothstep(.28,1.42,across))
     *smoothstep(-1.35,-.35,nose)*(1.-smoothstep(.45,1.62,nose));
 }
 float viewDepth(float z){return cameraRange.x*cameraRange.y/(cameraRange.y-z*(cameraRange.y-cameraRange.x));}
 // Reconstruct color after the waterline test and attenuation of each texel.
 // Interpolating a hull depth with the distant seabed invents water between them.
 vec4 throughSample(vec2 uv,float surface,float rayScale,float edgeWidth,vec3 waterColor){
   float dz=viewDepth(texture2D(transmissionDepth,uv).r)-surface;
   float behind=smoothstep(-edgeWidth,edgeWidth,dz);
   float path=clamp(dz*rayScale,0.,60.);
   vec3 attenuation=exp(-vec3(.22,.085,.055)*path)*(1.-smoothstep(9.,32.,path));
   return vec4(behind*attenuation*(texture2D(transmission,uv).rgb-waterColor),behind);
 }
 vec4 filteredThrough(vec2 uv,float surface,float rayScale,float edgeWidth,vec3 waterColor){
   vec2 pixel=uv*transmissionSize-.5,f=fract(pixel),texel=1./transmissionSize;
   vec2 lo=(floor(pixel)+.5)*texel;
   vec4 a=throughSample(lo,surface,rayScale,edgeWidth,waterColor);
   vec4 b=throughSample(lo+vec2(texel.x,0.),surface,rayScale,edgeWidth,waterColor);
   vec4 c=throughSample(lo+vec2(0.,texel.y),surface,rayScale,edgeWidth,waterColor);
   vec4 d=throughSample(lo+texel,surface,rayScale,edgeWidth,waterColor);
   return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
 }
 void main(){
   vec3 eye=normalize(cameraPosition-wp);
   vec4 air=texture2D(windMap,wp.xy/96.+.5/48.);
   vec2 localAir=air.rg*64.-32.;
   vec2 baseDir=vec2(cos(bearing),sin(bearing));
   float localSpeed=length(localAir);
   vec2 dir=windFieldActive>.5 && localSpeed>.4?localAir/localSpeed:baseDir;
   float puff=smoothstep(.35,2.25,mix(air.a*64.,localSpeed,windBlend)-referenceWind)*windFieldActive;
   float rippleWind=mix(wind,air.b*64.,windFieldActive);
   vec2 p=vec2(dot(wp.xy,baseDir),dot(wp.xy,vec2(-baseDir.y,baseDir.x)));
   float fade=1.-smoothstep(16.,110.,length(wp-cameraPosition));
   #ifdef VERTEX_SLOPE
   vec2 d=resolvedSlope,bowSlope=vec2(0.);
   #else
   vec2 bowSlope;
   vec2 d=surfaceSlope(wp.xy,bowSlope);
   #endif
   float gravitySlope=length(d);
   d+=fade*rippleSlope(wp.xy,tm,dir,rippleWind*(1.+puff*.34));
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
     vec3 levelNormal=vec3(0.,0.,1.);
     float eyeDistance=length(cameraPosition-wp);
     vec4 clip=mirrorMatrix*vec4(wp,1.);
     vec3 reflectedDeflection=ref-reflect(-eye,levelNormal);
     vec4 mirrorRay=clip+mirrorMatrix*vec4(.055*eyeDistance*reflectedDeflection,0.);
     vec2 uv=clamp(mirrorRay.xy/max(.001,mirrorRay.w)*.5+.5,.001,.999);
     vec4 objects=texture2D(reflection,uv,.65);
     vec3 reflected=skyColor(ref)*(1.-objects.a)+objects.rgb;
     // Compare both depths in the camera that captured the seabed.
     vec4 captureClip=throughMatrix*vec4(wp,1.);
     vec2 screen=captureClip.xy/max(.001,captureClip.w)*.5+.5;
     vec3 bentRay=refract(-eye,n,1./1.333),levelRay=refract(-eye,levelNormal,1./1.333);
     vec4 refractedClip=captureClip+throughMatrix*vec4(.085*eyeDistance*(bentRay-levelRay),0.);
     vec2 refrUV=clamp(refractedClip.xy/max(.001,refractedClip.w)*.5+.5,.001,.999);
     float surfaceDepth=captureClip.w;
     float rayScale=length(throughEye-wp)/max(.01,surfaceDepth);
     float edgeWidth=max(.008,.5*fwidth(surfaceDepth));
     vec4 transmitted;
     bool nearSurface=eyeDistance<32. || length(wp.xy-boat.xy)<8.;
     if(nearSurface){
       transmitted=filteredThrough(refrUV,surfaceDepth,rayScale,edgeWidth,waterColor);
     }else{
       transmitted=throughSample(refrUV,surfaceDepth,rayScale,edgeWidth,waterColor);
     }
     // A bent ray can land on the dry hull. Use only the additional submerged
     // coverage in the straight view, avoiding a hard switch or a doubled edge.
     if(transmitted.a<.999){
       vec4 straight=nearSurface?filteredThrough(screen,surfaceDepth,rayScale,edgeWidth,waterColor)
                                :throughSample(screen,surfaceDepth,rayScale,edgeWidth,waterColor);
       transmitted.rgb+=straight.rgb*max(0.,straight.a-transmitted.a)/max(.001,straight.a);
     }
     vec2 frameMargin=min(screen,1.-screen);
     float visible=smoothstep(0.,.025,min(frameMargin.x,frameMargin.y))*step(.001,surfaceDepth);
     color=mix(waterColor+visible*transmitted.rgb,reflected,fres);
     // Wind roughens the surface and scatters the coherent sky reflection.
     color*=1.-.19*puff*(.55+.45*fade);
     color+=vec3(3.5,2.7,1.65)*pow(max(dot(ref,sunDir),0.),240.)+vec3(.62,.7,1.)*pow(max(dot(ref,moonDir),0.),260.);
     float windCrest=wp.z-tide-swell.x*sin(swell.y+dot(wp.xy-swellCenter,swell.zw));
     waterColor=mix(waterColor,vec3(.012,.037,.043),storm*.85);
     float scum=cloud(p*vec2(1.8,3.8)+vec2(-.9*tm,0.));
     // Monahan and O'Muircheartaigh's wind-dependent whitecap coverage.
     // Use it as a density control on steep wind-wave crests.
     float windCoverage=3.84e-6*pow(max(0.,rippleWind),3.41);
     float densityCutoff=clamp(1.-8.*windCoverage,.36,1.);
     float breaking=smoothstep(.085,.32,windCrest)*smoothstep(.045,.17,gravitySlope);
     float foam=breaking*smoothstep(densityCutoff-.08,densityCutoff+.06,scum);
     float edge=wakeAvailable>.5?1.-wakeFalloff(wp.xy):0.;
     if(edge>0.){
       vec2 uvWake=spectralUV(wp.xy);
       float hullCrest=elevationSample(spectrumMap,uvWake)-elevationSample(incidentMap,uvWake)+bowElevation(wp.xy);
       if(hullCrest>.012){
         // Use small drifting patches to break up the visible foam on the crest.
         float bubbles=noise2((wp.xy-spectrumDrift)*6.);
         float coverage=smoothstep(.012,.062,hullCrest)*edge;
         vec2 forward=vec2(cos(boat.z),sin(boat.z));
         float bow=max(nearWetBow(forebodyPort,wp.xy,forward),nearWetBow(forebodyStarboard,wp.xy,forward));
         // Clear water climbs the stem. Only the steeper leading shoulder
         // gets localized aeration; the gentler pressure hump stays reflective.
         float face=max(0.,-dot(bowSlope,forward));
         float breakingFace=smoothstep(.08,.32,length(bowSlope))*smoothstep(.018,.14,face);
         float foamStreak=noise2(vec2(dot(wp.xy-spectrumDrift,forward)*5.-tm,
                                    dot(wp.xy-spectrumDrift,vec2(-forward.y,forward.x))*19.));
         float scattered=.20+.80*smoothstep(.27,.72,foamStreak);
         float trail=coverage*(1.-bow)*(.20+.64*smoothstep(.24,.73,bubbles));
         foam=max(foam,max(trail,bow*breakingFace*scattered*coverage));
       }
     }
     float shore=length((wp.xy-vec2(36.,40.))/vec2(17.,11.));
     foam=max(foam,exp(-abs(shore-.93)*23.)*smoothstep(.32,.65,scum)*smoothstep(.01,.16,abs(windCrest)));

     color=mix(color,vec3(.018,.048,.051)+reflected*.22,storm*(.48+.20*(1.-fres)));
     color=mix(color,mix(vec3(.06,.10,.14),vec3(.79,.87,.85),day),foam*.86);
     float haze=smoothstep(70.,430.,length(wp-cameraPosition));
     color=mix(color,skyColor(normalize(vec3(-eye.xy,.01))),haze*.90);
   }
   gl_FragColor=vec4(color,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
 }`}));
 scene.add(water);

 const trails=hullFoam(scene,U);
 function updateHullFoam(strips,time,speed,cat){
   if(!strips)return;
   trails.sample(strips,time,speed,cat);
   if(cat){spray??=bowSpray(scene,U);spray.sample(strips,time,speed);}
   const strength=Math.max(0,Math.min(1,(speed-1.25)/2.8));
   function crestSource(target,index,active){
     const immersion=active?Math.min(1,(strips[index+2]+.45*strips[index-1])/.014):0;
     target.value.set(strips[index],strips[index+1],strength*immersion);
   }
   crestSource(U.forebodyPort,15,true);
   crestSource(U.forebodyStarboard,33,cat);
 }
 const encodeHeight=h=>Math.round(65535*Math.max(0,Math.min(1,(h+8)/16)));
 let firstTile=true;
 function update(old,f){
   if(!f.tile || f.tile.length!==1024)throw Error('Missing Modelica spectral tile');
   for(let i=0;i<1024;i++){
     const k=i*4,b=encodeHeight(f.tile[i]);
     const a=firstTile?encodeHeight(old.tile[i]):displayedHeight(pixels,k,U.blend.value);
     pixels[k]=a>>8;pixels[k+1]=a&255;
     pixels[k+2]=b>>8;pixels[k+3]=b&255;
   }
   firstTile=false;tile.needsUpdate=true;U.tide.value=f.tide;U.wind.value=f.wind;
 }
 const mirrorCamera=new THREE.PerspectiveCamera(),reflectRT=new THREE.WebGLRenderTarget(512,320),throughRT=new THREE.WebGLRenderTarget(512,320);
 // Mip-filter thin silhouettes as ripple distortion minifies the reflected image.
 reflectRT.texture.generateMipmaps=true;
 reflectRT.texture.minFilter=THREE.LinearMipmapLinearFilter;
 throughRT.depthTexture=new THREE.DepthTexture(512,320,THREE.UnsignedIntType);
 U.throughMatrix={value:new THREE.Matrix4()};U.throughEye={value:new THREE.Vector3()};
 U.transmissionDepth={value:throughRT.depthTexture};U.cameraRange={value:new THREE.Vector2()};
 U.transmissionSize={value:new THREE.Vector2(512,320)};
 U.reflection.value=reflectRT.texture;U.transmission.value=throughRT.texture;
 const mirrorLook=new THREE.Vector3(),mirrorClip=new THREE.Plane(new THREE.Vector3(0,0,1));
 const clearThrough=new THREE.Color(0x144958);
 let simpleCapture=false;
 function capture(renderer,camera,submergedScenery,reflect,transmit){
   camera.updateMatrixWorld();
   const oldBackground=scene.background,oldFog=scene.fog;
   const foamVisible=trails.mesh.visible,sprayVisible=spray?.points.visible;
   if(spray)spray.points.visible=false;
   water.visible=false;trails.mesh.visible=false;dome.visible=false;scene.fog=null;
   if(reflect){
     camera.getWorldDirection(mirrorLook).add(camera.position);
     mirrorCamera.copy(camera);
     if(simpleCapture)mirrorCamera.layers.set(waterCaptureLayer);
     const twiceTide=2*U.tide.value;
     mirrorCamera.position.z=twiceTide-camera.position.z;mirrorLook.z=twiceTide-mirrorLook.z;
     mirrorCamera.up.set(0,0,-1);mirrorCamera.lookAt(mirrorLook);mirrorCamera.updateMatrixWorld();
     U.mirrorMatrix.value.multiplyMatrices(mirrorCamera.projectionMatrix,mirrorCamera.matrixWorldInverse);
     scene.background=null;
     renderer.setClearColor(0x000000,0);renderer.setRenderTarget(reflectRT);
     mirrorClip.constant=-U.tide.value;renderer.clippingPlanes=[mirrorClip];
     const hideSubmerged=submergedScenery && U.tide.value>=0 && submergedScenery.visible;
     if(hideSubmerged)submergedScenery.visible=false;
     renderer.render(scene,mirrorCamera);renderer.clippingPlanes=[];
     if(hideSubmerged)submergedScenery.visible=true;
   }
   if(transmit){
     U.throughMatrix.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
     U.throughEye.value.copy(camera.position);U.cameraRange.value.set(camera.near,camera.far);
     renderer.getDrawingBufferSize(U.viewport.value);
     renderer.setRenderTarget(throughRT);scene.background=clearThrough;
     const viewLayers=camera.layers.mask;
     if(simpleCapture)camera.layers.set(waterCaptureLayer);
     try {renderer.render(scene,camera);} finally {camera.layers.mask=viewLayers;}
   }
   renderer.setRenderTarget(null);
   scene.fog=oldFog;scene.background=oldBackground;water.visible=true;trails.mesh.visible=foamVisible;dome.visible=true;
   if(spray)spray.points.visible=sprayVisible;
 }
 function setQuality(profile,vertexSlope,multisampling){
   if(water.geometry.parameters.widthSegments!==profile.mesh){
     water.geometry.dispose();water.geometry=waterMesh(profile.mesh);
   }
   simpleCapture=vertexSlope;
   water.material.defines=vertexSlope?{VERTEX_SLOPE:1,DISABLE_BOW_FIELD:1}:{};
   water.material.needsUpdate=true;
   skyTarget.setSize(Math.round(512*profile.sky),Math.round(192*profile.sky));lastSky=-Infinity;
   const scale=profile.capture;
   const width=Math.round(512*scale),height=Math.round(320*scale);
   reflectRT.samples=multisampling?(profile.reflectSamples??0):0;
   reflectRT.setSize(simpleCapture?256:width,simpleCapture?160:height);
   const throughWidth=Math.max(320,width),throughHeight=Math.max(200,height);
   throughRT.setSize(throughWidth,throughHeight);U.transmissionSize.value.set(throughWidth,throughHeight);
 }
 return {U,dome,water,update,updateSpectrum,updateHullFoam,clearWake,updateWind,capture,setQuality,updateSky};
}
