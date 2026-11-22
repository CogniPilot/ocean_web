 const oceanHeightGLSL=`
 // Packed high/low bytes must reach the decode without sampler precision loss.
 uniform highp sampler2D tile;uniform float blend,tide;
 uniform vec4 swell,boat; uniform vec2 swellCenter;
 uniform highp sampler2D spectrumMap,incidentMap,bowMap,swimmerWater;
 uniform vec4 whalePatch,sharkPatch,whalePatchPrevious,sharkPatchPrevious;
 uniform vec2 swimmerBlend;uniform vec4 swimmerFin;uniform float swimmerHalfFloat;
 vec4 animalWave(vec2 p,vec4 region){
   if(region.z<=0.)return vec4(0.);
   vec2 q=(p-region.xy)/region.z;
   float edge=max(abs(q.x),abs(q.y));
   if(edge>=.48)return vec4(0.);
   vec4 data=texture2D(swimmerWater,vec2(.5+q.x,(.5+q.y+region.w)*.25));
   if(swimmerHalfFloat<.5)data=vec4((255.*data.r-128.)/254.,data.g,(255.*data.ba-128.)/127.);
   return (1.-smoothstep(.38,.48,edge))*data;
 }
 vec4 wildlifeWave(vec2 p){
   vec4 whale=mix(animalWave(p,whalePatchPrevious),animalWave(p,whalePatch),swimmerBlend.x);
   if(max(sharkPatch.z,sharkPatchPrevious.z)<=0.)return whale;
   float a=swimmerBlend.y;
   vec2 fin=swimmerFin.xy-(1.-a)*swimmerFin.zw;
   vec2 shift=(1.-smoothstep(.45,1.30,distance(p,fin)))*swimmerFin.zw;
   return whale+mix(animalWave(p-a*shift,sharkPatchPrevious),animalWave(p+(1.-a)*shift,sharkPatch),a);
 }
 uniform vec2 spectrumDrift;
 uniform float spectrumPeriod,spectrumBlend,wakeAvailable,bowAvailable,hullSpectrumOnly,bowFineAvailable,bowFineSpacing,bowFoamAvailable;
 uniform vec4 bowFineBounds,bowFoamBounds;
 const vec2 bowAtlasSize=vec2(64.,128.);
 vec2 spectralUV(vec2 p){return (p-spectrumDrift)/spectrumPeriod+vec2(.5/64.);}
 float elevationSample(highp sampler2D map,vec2 uv){
   vec4 pair=texture2D(map,uv);
   vec2 weights=vec2(65280.,255.);
   return (mix(dot(pair.rg,weights),dot(pair.ba,weights),spectrumBlend)-32768.)/8192.;
 }
 // Keep a separate ambient sample for whitecaps. The full height still
 // includes hull displacement for rendering and surface probes.
 vec2 spectralElevations(vec2 p){
   if(spectrumPeriod<=0.)return vec2(0.);
   vec2 uv=spectralUV(p);
   if(wakeAvailable<.5)return vec2(elevationSample(spectrumMap,uv));
   float incident=hullSpectrumOnly>.5?0.:elevationSample(incidentMap,uv);
   float falloff=smoothstep(.35,.49,length(p-boat.xy)/spectrumPeriod);
   if(falloff>=1.)return vec2(incident);
   return vec2(mix(elevationSample(spectrumMap,uv),incident,falloff),incident);
 }
 bool nearBowField(vec2 p,float radius){
   #ifdef DISABLE_BOW_FIELD
   return false;
   #else
   vec2 r=p-boat.xy;
   return bowAvailable>.5&&dot(r,r)<radius*radius;
   #endif
 }
 vec2 bowLocal(vec2 p){
   vec2 r=p-boat.xy,forward=vec2(cos(boat.z),sin(boat.z));
   return vec2(dot(r,forward),dot(r,vec2(-forward.y,forward.x)));
 }
 float bowFineWeight(vec2 local){
   if(bowFineAvailable<.5)return 0.;
   vec2 edge=min(local-bowFineBounds.xy,bowFineBounds.zw-local);
   return smoothstep(0.,.25,min(edge.x,edge.y));
 }
 float bowElevation(vec2 p){
   if(!nearBowField(p,4.))return 0.;
   vec2 local=bowLocal(p);
   float blendFine=bowFineWeight(local);
   float fine=0.;
   if(blendFine>0.){
     vec2 index=(local-bowFineBounds.xy)/bowFineSpacing;
     fine=elevationSample(bowMap,(index+vec2(36.5,1.5))/bowAtlasSize);
     if(blendFine>=1.)return fine;
   }
   float coarse=elevationSample(bowMap,(mod(local*4.,32.)+vec2(1.5))/bowAtlasSize);
   return mix(coarse,fine,blendFine);
 }
 float bowFoamCoverage(vec2 local){
   vec2 margin=min(local-bowFoamBounds.xy,bowFoamBounds.zw-local);
   float edge=smoothstep(0.,.20,min(margin.x,margin.y));
   if(edge<=0.)return 0.;
   vec2 index=(local-bowFoamBounds.xy)/bowFineSpacing;
   vec2 foam=texture2D(bowMap,(index+vec2(1.5,40.5))/bowAtlasSize).rg;
   return edge*mix(foam.x,foam.y,spectrumBlend);
 }
 vec2 sampledHeightsAt(vec2 p){
  vec4 data=texture2D(tile,p/64.+vec2(.5/32.));
  return spectralElevations(p)+mix(dot(data.rg,vec2(255.*256.,255.)),dot(data.ba,vec2(255.*256.,255.)),blend)*16./65535.-8.;
 }
 float backgroundHeightAt(vec2 p){return tide+swell.x*sin(swell.y+dot(p-swellCenter,swell.zw))+sampledHeightsAt(p).x;}
 float heightAt(vec2 p){return backgroundHeightAt(p)+bowElevation(p)+wildlifeWave(p).x;}
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
// Cruiser foam is an advected scalar field painted onto the water surface.
function cruiserSternFoam(uniforms){
 const size=128,bytes=new Uint8Array(size*size*4);
 const map=new THREE.DataTexture(bytes,size,size);
 map.minFilter=map.magFilter=THREE.LinearFilter;
 const region=new THREE.Vector4();
 uniforms.sternFoamMap={value:map};uniforms.sternFoamRegion={value:region};
 const ramp=(x)=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
 function clear(){region.set(0,0,0,0);}
 function sample(tracks,time){
   const segments=[];
   let eastMin=Infinity,northMin=Infinity,eastMax=-Infinity,northMax=-Infinity;
   for(const track of tracks){
     for(let i=1;i<track.length;i++){
       const a=track[i-1],b=track[i],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
       if(length2<.02**2)continue;
       const ageA=Math.max(0,time-a[2]),ageB=Math.max(0,time-b[2]);
       const opacityA=a[3]*Math.exp(-.43*ageA)*(1-ramp((ageA-3.6)/1.4));
       const opacityB=b[3]*Math.exp(-.43*ageB)*(1-ramp((ageB-3.6)/1.4));
       if(Math.max(opacityA,opacityB)<.015)continue;
       const widthA=.65+.16*a[3]+.23*ageA,widthB=.65+.16*b[3]+.23*ageB;
       const width=Math.max(widthA,widthB);
       const left=Math.min(a[0],b[0])-width,right=Math.max(a[0],b[0])+width;
       const bottom=Math.min(a[1],b[1])-width,top=Math.max(a[1],b[1])+width;
       eastMin=Math.min(eastMin,left);eastMax=Math.max(eastMax,right);
       northMin=Math.min(northMin,bottom);northMax=Math.max(northMax,top);
       segments.push({a,dx,dy,length2,opacityA,opacityB,widthA,widthB,left,right,bottom,top});
     }
   }
   if(!segments.length){clear();return;}
   const width=Math.max(12,eastMax-eastMin+1),height=Math.max(12,northMax-northMin+1);
   const east=.5*(eastMin+eastMax-width),north=.5*(northMin+northMax-height);
   const stepE=width/size,stepN=height/size;
   bytes.fill(0);
   for(const {a,dx,dy,length2,opacityA,opacityB,widthA,widthB,left,right,bottom,top} of segments){
     const i0=Math.max(0,Math.ceil((left-east)/stepE-.5));
     const i1=Math.min(size-1,Math.floor((right-east)/stepE-.5));
     const j0=Math.max(0,Math.ceil((bottom-north)/stepN-.5));
     const j1=Math.min(size-1,Math.floor((top-north)/stepN-.5));
     const startX=east+(i0+.5)*stepE-a[0],du=dx/length2,dv=dy/length2;
     const widthDelta=widthB-widthA,opacityDelta=opacityB-opacityA;
     for(let row=j0;row<=j1;row++){
       const y=north+(row+.5)*stepN-a[1];
       let x=startX;
       for(let col=i0;col<=i1;col++,x+=stepE){
         const t=Math.min(1,Math.max(0,x*du+y*dv));
         const offX=x-t*dx,offY=y-t*dy,span=widthA+widthDelta*t;
         const normalized2=(offX*offX+offY*offY)/(span*span);
         if(normalized2>=.83)continue;
         const edge=1-ramp((normalized2-.06)/.77);
         const opacity=opacityA+opacityDelta*t;
         const k=4*(row*size+col),value=Math.round(255*edge*opacity);
         if(value>bytes[k])bytes[k]=value;
       }
     }
   }
   region.set(east,north,1/width,1/height);map.needsUpdate=true;
 }
 return {sample,clear};
}
// Render the narrow sailboat trails over their past wet stern sections.
function hullFoam(scene,uniforms,cruiserHullGLSL,cruiserSurface){
 const count=52,tracks=[[],[]],geometry=new THREE.BufferGeometry();
 const cruiserFoam=cruiserSurface?cruiserSternFoam(uniforms):null;
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
     varying vec2 location;varying vec3 foamPoint;
     void main(){
       vec2 p=position.xy+spectrumDrift;
       vFoam=foam;location=position.xy;
       foamPoint=vec3(p,heightAt(p)+.018);
       gl_Position=projectionMatrix*viewMatrix*vec4(foamPoint,1.);
     }`,
   fragmentShader:skyNoiseGLSL+cruiserHullGLSL+`
     uniform float tm,under;
     uniform vec3 sunDir;
     varying vec3 vFoam;
     varying vec2 location;varying vec3 foamPoint;
     void main(){
       float age=max(0.,tm-vFoam.y);
       float grain=noise2(location*19.);
       float edge=1.-smoothstep(.24,.83,abs(vFoam.x)+(grain-.5)*.37);
       float breakup=smoothstep(.24,.64,noise2(location*5.)*.7+grain*.3);
       float alpha=vFoam.z*edge*(.48+.52*breakup)*exp(-age*.43)*(1.-smoothstep(3.6,5.,age));
       if(under>.5 || alpha<.015 || cruiserWaterExcluded(foamPoint))discard;
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
   cruiserFoam?.clear();mesh.visible=false;stamp=undefined;
 }
 function sample(strips,time,speed,cat,cruiser){
   if(!strips||time===stamp)return;
   const drift=uniforms.spectrumDrift.value,dx=drift.x,dy=drift.y;
   // A delayed browser paint can miss several 10 Hz snapshots. Preserve the
   // cruiser's recent path between them, but break a genuine time discontinuity.
   if(stamp!==undefined&&(time<stamp||time-stamp>(cruiser?1.2:.26)))clear();
   stamp=time;
   let visible=false;
   for(let h=0;h<tracks.length;h++){
     const track=tracks[h],i=18*h;
     if(h===0||cat){
       const aft=strips[i+2],inboard=.42*strips[i+5],wet=aft+inboard;
       const spacing=Math.hypot(strips[i+3]-strips[i],strips[i+4]-strips[i+1]);
       const area=Math.max(0,wet)/Math.max(.1,spacing);
       // Normalize the volume of disturbed water per second to opacity.
       const strength=Math.min(1,area*Math.max(0,speed)/.11);
       const forward=wet>1e-9?inboard/wet:0;
       const east=strips[i]+forward*(strips[i+3]-strips[i]);
       const north=strips[i+1]+forward*(strips[i+4]-strips[i+1]);
       track.unshift([east-dx,north-dy,time,strength]);
       if(track.length>count)track.pop();
     }
     if(cruiser)continue;
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
   if(cruiser){mesh.visible=false;cruiserFoam?.sample(tracks,time);return;}
   geometry.attributes.position.needsUpdate=geometry.attributes.foam.needsUpdate=true;
   mesh.visible=visible;
 }
 return {mesh,clear,sample};
}
function atmosphere(scene,{waterCaptureLayer,objectDrawRange,cruiserSurface,bowRefinement,fineBowGrid,bowFoamGrid},makeSwimmerWater,makeSpray,cruiserBeamGLSL,cruiserHullGLSL,searchlightHeight,hullGlowLobes){
 const U={cruiserTilt:{value:new Float32Array(10)},cruiserCount:{value:0},cruiserPose:{value:new Float32Array(20)},cruiserAim:{value:new Float32Array(20)},cloudTravel:{value:new THREE.Vector2()},lightning:{value:new THREE.Vector2()},storm:{value:0},tm:{value:0},sunDir:{value:new THREE.Vector3()},moonDir:{value:new THREE.Vector3()},under:{value:1},waveAmp:{value:1},tidalPhase:{value:.5}};
 const swimmerWater=makeSwimmerWater(THREE,U);
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
 const dome=new THREE.Mesh(new THREE.SphereGeometry(280,40,24),new THREE.ShaderMaterial({uniforms:U,side:THREE.BackSide,depthTest:false,depthWrite:false,
 vertexShader:'varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:lookup+'varying vec3 dir;void main(){gl_FragColor=vec4(skyColor(normalize(dir)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));
 dome.renderOrder=-1;scene.add(dome);
 const spectrumBytes=new Uint8Array(64*64*4),spectrumTexture=new THREE.DataTexture(spectrumBytes,64,64);
 spectrumTexture.wrapS=spectrumTexture.wrapT=THREE.RepeatWrapping;
 spectrumTexture.minFilter=spectrumTexture.magFilter=THREE.LinearFilter;
 Object.assign(U,{spectrumMap:{value:spectrumTexture},spectrumDrift:{value:new THREE.Vector2()},spectrumPeriod:{value:0},spectrumBlend:{value:1},swell:{value:new THREE.Vector4()},swellCenter:{value:new THREE.Vector2()}});
 const windBytes=new Uint8Array(48*48*4),windMap=new THREE.DataTexture(windBytes,48,48);
 windMap.wrapS=windMap.wrapT=THREE.RepeatWrapping;windMap.minFilter=windMap.magFilter=THREE.LinearFilter;windMap.needsUpdate=true;
 U.windMap={value:windMap};U.windPeriod={value:288};U.windFieldActive={value:0};
 U.windBlend={value:1};U.referenceWind={value:11};
 let gustField;
 // Bilinear lookup uses the same 48-cell periodic grid as MarineWind.sampleWind.
 function sampleWind(east,north,result){
   if(!gustField)return result.set(U.wind.value*Math.cos(U.bearing.value),U.wind.value*Math.sin(U.bearing.value));
   const wrap=v=>((v%48)+48)%48,x=wrap(east*48/U.windPeriod.value),y=wrap(north*48/U.windPeriod.value);
   const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,k=(i+1)%48,l=(j+1)%48;
   const a=3*(48*j+i),b=3*(48*j+k),c=3*(48*l+i),d=3*(48*l+k);
   const value=n=>(1-v)*((1-u)*gustField[a+n]+u*gustField[b+n])+v*((1-u)*gustField[c+n]+u*gustField[d+n]);
   return result.set(value(0),value(1));
 }
 function updateWind(field){
   gustField=field;
   for(let i=0;i<48*48;i++){
     const k=i*4;
     // Store the displayed and incoming speed / roughness together. The next
     // puff can then arrive between frames without resetting the ripple phase.
     for(let channel=0;channel<2;channel++){
       const speed=channel===0?Math.hypot(field[3*i],field[3*i+1]):field[3*i+2];
       const next=Math.round(Math.max(0,Math.min(255,speed*255/64)));
       const start=k+2*channel;
       windBytes[start]=U.windFieldActive.value?Math.round(windBytes[start]+
         U.windBlend.value*(windBytes[start+1]-windBytes[start])):next;
       windBytes[start+1]=next;
     }
   }
   windMap.needsUpdate=true;U.windFieldActive.value=1;
 }
 const incidentBytes=new Uint8Array(64*64*4);
 const incidentTexture=new THREE.DataTexture(incidentBytes,64,64);
 incidentTexture.wrapS=incidentTexture.wrapT=THREE.RepeatWrapping;
 incidentTexture.minFilter=incidentTexture.magFilter=THREE.LinearFilter;
 U.incidentMap={value:incidentTexture};U.wakeAvailable={value:0};U.hullSpectrumOnly={value:0};
 const {x:fineX,y:fineY,columns:fineColumns,rows:fineRows,spacing:fineStep}=fineBowGrid;
 const {x:foamX,y:foamY,columns:foamColumns,rows:foamRows}=bowFoamGrid;
 const bowBytes=new Uint8Array(32*32*4),fineBowBytes=new Uint8Array(fineColumns*fineRows*4);
 const bowAtlas=new Uint8Array(64*128*4),bowTexture=new THREE.DataTexture(bowAtlas,64,128);
 bowTexture.minFilter=bowTexture.magFilter=THREE.LinearFilter;
 U.bowMap={value:bowTexture};U.bowAvailable={value:0};U.bowFineAvailable={value:0};
 U.bowFoamAvailable={value:0};
 U.bowFineSpacing={value:fineStep};
 U.bowFineBounds={value:new THREE.Vector4(fineX,fineY,fineX+(fineColumns-1)*fineStep,fineY+(fineRows-1)*fineStep)};
 U.bowFoamBounds={value:new THREE.Vector4(foamX,foamY,foamX+(foamColumns-1)*fineStep,foamY+(foamRows-1)*fineStep)};
 let spray;
 function clearWake(){if(U.hullSpectrumOnly.value)U.spectrumPeriod.value=0;swimmerWater.clear();spray?.clear();U.wakeAvailable.value=U.bowAvailable.value=U.bowFineAvailable.value=U.bowFoamAvailable.value=0;trails.clear();}
 function displayedHeight(data,k,blend){
   const old=(data[k]<<8)+data[k+1],latest=(data[k+2]<<8)+data[k+3];
   return Math.round(old+blend*(latest-old));
 }
 function readBowGrid(target,refined=false){
   const blend=U.spectrumBlend.value;
   const bytes=refined?fineBowBytes:bowBytes;
   for(let i=0;i<target.length;i++)target[i]=(displayedHeight(bytes,i*4,blend)-32768)/8192;
 }
 function sampleFineBow(x,y,blend){
   const ix=Math.min(fineColumns-2,Math.floor(x)),iy=Math.min(fineRows-2,Math.floor(y)),fx=x-ix,fy=y-iy;
   const k=(iy*fineColumns+ix)*4,next=k+fineColumns*4;
   const lower=THREE.MathUtils.lerp(displayedHeight(fineBowBytes,k,blend),displayedHeight(fineBowBytes,k+4,blend),fx);
   const upper=THREE.MathUtils.lerp(displayedHeight(fineBowBytes,next,blend),displayedHeight(fineBowBytes,next+4,blend),fx);
   return THREE.MathUtils.lerp(lower,upper,fy);
 }
 function encodeSpectrum(data,frame,initialized,subtract){
   for(let i=0;i<frame.length;i++){
     const level=frame[i]-(subtract?subtract[i]:0);
     const packed=Math.round(32768+Math.max(-4,Math.min(3.99987,level))*8192);
     const k=i*4,old=initialized?displayedHeight(data,k,U.spectrumBlend.value):packed;
     data[k]=old>>8;data[k+1]=old&255;data[k+2]=packed>>8;data[k+3]=packed&255;
   }
 }
 function updateFullSpectrum(heights,x,y,period,bow,fineBow,foam){
   if(bow){
     encodeSpectrum(bowBytes,bow,U.bowAvailable.value);
     // Both grids use one sampler. The extra coarse row and column preserve its periodic seam.
     for(let row=0;row<=32;row++){
       const start=(row%32)*32*4,offset=((row+1)*64+1)*4;
       bowAtlas.set(bowBytes.subarray(start,start+32*4),offset);
       bowAtlas.set(bowBytes.subarray(start,start+4),offset+32*4);
     }
     if(fineBow?.length===fineColumns*fineRows){
       encodeSpectrum(fineBowBytes,fineBow,U.bowFineAvailable.value);
       for(let row=0;row<fineRows;row++){
         const start=row*fineColumns*4;
         bowAtlas.set(fineBowBytes.subarray(start,start+fineColumns*4),((row+1)*64+36)*4);
       }
       U.bowFineAvailable.value=1;
     }else U.bowFineAvailable.value=0;
     if(foam?.length===foamColumns*foamRows){
       for(let row=0;row<foamRows;row++)for(let col=0;col<foamColumns;col++){
         const k=((row+40)*64+col+1)*4,next=foam[row*foamColumns+col];
         bowAtlas[k]=U.bowFoamAvailable.value?Math.round(THREE.MathUtils.lerp(bowAtlas[k],bowAtlas[k+1],U.spectrumBlend.value)):next;
         bowAtlas[k+1]=next;
       }
       U.bowFoamAvailable.value=1;
     }else U.bowFoamAvailable.value=0;
     bowTexture.needsUpdate=true;U.bowAvailable.value=1;
   }
   encodeSpectrum(spectrumBytes,heights,U.spectrumPeriod.value);
   spectrumTexture.needsUpdate=true;
   U.spectrumDrift.value.set(x,y);U.spectrumPeriod.value=period;
 }
 // Integrated worlds get their incident sea from boatWater.tile. Their 64²
 // spectrum contains only local and shared hull radiation.
 function updateHullSpectrum(heights,x,y,period,bow,fineBow,foam){
   U.hullSpectrumOnly.value=U.wakeAvailable.value=1;
   updateFullSpectrum(heights,x,y,period,bow,fineBow,foam);
 }
 function updateSpectrum(heights,x,y,period,wake,bow){
   U.hullSpectrumOnly.value=0;
   if(wake){
     encodeSpectrum(incidentBytes,heights,U.wakeAvailable.value,wake);
     incidentTexture.needsUpdate=true;U.wakeAvailable.value=1;
   }
   updateFullSpectrum(heights,x,y,period,bow);
 }
 const pixels=new Uint8Array(32*32*4),tile=new THREE.DataTexture(pixels,32,32);
 tile.wrapS=tile.wrapT=THREE.RepeatWrapping;tile.minFilter=tile.magFilter=THREE.LinearFilter;tile.needsUpdate=true;
 Object.assign(U,{tile:{value:tile},blend:{value:1},tide:{value:0},wind:{value:11},bearing:{value:.45},boat:{value:new THREE.Vector4()},reflection:{value:null},transmission:{value:null},mirrorMatrix:{value:new THREE.Matrix4()},viewport:{value:new THREE.Vector2(1,1)}});
 const field=oceanHeightGLSL+`
 vec2 surfaceSlope(vec2 p,out vec2 incidentSlope){
   vec2 dx=(sampledHeightsAt(p+vec2(.48,0))-sampledHeightsAt(p-vec2(.48,0)))/.96;
   vec2 dy=(sampledHeightsAt(p+vec2(0,.48))-sampledHeightsAt(p-vec2(0,.48)))/.96;
   // Factor the analytic swell's central difference into one cosine.
   vec2 swellSlope=swell.x*cos(swell.y+dot(p-swellCenter,swell.zw))*sin(.48*swell.zw)/.48;
   incidentSlope=vec2(dx.y,dy.y)+swellSlope;
   vec2 slope=vec2(dx.x,dy.x)+swellSlope;
   if(nearBowField(p,4.25)){
     float spacing=mix(.24,bowFineSpacing,bowFineWeight(bowLocal(p)));
     slope+=vec2(bowElevation(p+vec2(spacing,0))-bowElevation(p-vec2(spacing,0)),
       bowElevation(p+vec2(0,spacing))-bowElevation(p-vec2(0,spacing)))/(2.*spacing);
   }
   return slope;
 }
 varying float windCrest;
 #ifdef VERTEX_SLOPE
 varying vec2 resolvedSlope,resolvedIncidentSlope;
 #endif
 `;
 function waterMesh(segments){
 const geometry=new THREE.PlaneGeometry(1,1,segments,segments);
 const coords=geometry.attributes.position;
 // Concentrate existing vertices around the boat to resolve the local bow field.
 const stretch=v=>{
   const u=2*Math.abs(v);
   // Stretch only the outermost ring to cover the extended horizon.
   if(u===1)return Math.sign(v)*(objectDrawRange+128);
   if(segments<120)return Math.sign(v)*(15*u+580*u**4);
   const inner=bowRefinement?.70:.52,nearScale=bowRefinement?5.4:7.5;
   const outer=Math.max(0,(u-inner)/(1-inner));
   return Math.sign(v)*(nearScale*u+(595-nearScale)*outer**3);
 };
 for(let j=0;j<coords.count;j++){
   coords.setXY(j,stretch(coords.getX(j)),stretch(coords.getY(j)));
 }
 return geometry;
 }
 const water=new THREE.Mesh(waterMesh(144),new THREE.ShaderMaterial({uniforms:U,side:THREE.DoubleSide,
 vertexShader:field+`varying vec3 wp;
 void main(){
 wp=(modelMatrix*vec4(position,1.)).xyz;
 float detail=1.-smoothstep(420.,550.,max(abs(position.x),abs(position.y)));
 wp.z=tide;windCrest=0.;
 #ifdef VERTEX_SLOPE
 resolvedSlope=vec2(0.);resolvedIncidentSlope=vec2(0.);
 #endif
 if(detail>0.){
   vec2 sampled=sampledHeightsAt(wp.xy);
   windCrest=detail*sampled.y;
   wp.z+=detail*(swell.x*sin(swell.y+dot(wp.xy-swellCenter,swell.zw))+sampled.x+bowElevation(wp.xy)+wildlifeWave(wp.xy).x);
   #ifdef VERTEX_SLOPE
   resolvedSlope=surfaceSlope(wp.xy,resolvedIncidentSlope)*detail;
   resolvedIncidentSlope*=detail;
   #endif
 }
 gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
 fragmentShader:lookup+oceanRippleGLSL+skyNoiseGLSL+field+`
 uniform sampler2D windMap; uniform float windFieldActive,windBlend,referenceWind,windPeriod;
 uniform highp sampler2D reflection,transmission; uniform mat4 mirrorMatrix;uniform vec2 viewport; uniform float under,wind,bearing;varying vec3 wp;
 #ifndef DISABLE_STERN_FOAM
 uniform sampler2D sternFoamMap;
 uniform vec4 sternFoamRegion;
 float sternFoam(vec2 p){
   if(sternFoamRegion.z<=0.)return 0.;
   vec2 currentPosition=p-spectrumDrift;
   vec2 uv=(currentPosition-sternFoamRegion.xy)*sternFoamRegion.zw;
   if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return 0.;
   float coverage=texture2D(sternFoamMap,uv).r;
   if(coverage<.015)return 0.;
   float grain=noise2(currentPosition*19.);
   float breakup=smoothstep(.24,.64,noise2(currentPosition*5.)*.7+grain*.3);
   return coverage*(.54+.46*breakup);
 }
 #endif
 ${cruiserHullGLSL}
 ${cruiserBeamGLSL}
 vec3 lampScatter(vec3 surface,float daylight){
   vec3 lit=vec3(0.);
   for(int i=0;i<5;i++){
     if(i>=cruiserCount)break;
     vec4 pose=cruiserPose[i],aim=cruiserAim[i];vec2 delta=surface.xy-pose.xy;
     if((aim.z<.5&&aim.w<.5)||dot(delta,delta)>45.*45.)continue;
     vec3 body=cruiserLocal(surface,pose,cruiserTilt[i]);
     if(aim.w>.5&&dot(delta,delta)<120.){
       float scatter=0.;
       ${hullGlowLobes.map(({center,radius,weight})=>`{
         vec3 q=(body-vec3(${center.map(x=>x.toFixed(3)).join(',')}))/vec3(${radius.join(',')});
         scatter+=${weight}*exp(-.50*dot(q,q));
       }`).join('')}
       lit+=vec3(1.19,.56,.095)*scatter*(under>.5?.12:1.);
     }
     if(aim.z<.5||under>.5)continue;
     {
       float bearing=aim.x;
       vec3 axis=vec3(cos(bearing)*cos(aim.y),sin(bearing)*cos(aim.y),-sin(aim.y));
       vec3 lens=vec3(.56,0.,${searchlightHeight})+.097*axis,ray=body-lens;
       float dist=length(ray);
       float cone=smoothstep(.953,.996,dot(ray,axis)/max(.01,dist));
       if(cone>0.&&cruiserBlocksBeam(lens,body))cone=0.;
       lit+=vec3(1.,.91,.69)*cone/(1.+.018*dist*dist);
     }
   }
   return lit*mix(.86,.23,daylight);
 }
 uniform highp sampler2D transmissionDepth;uniform mat4 throughMatrix;uniform vec3 throughEye;uniform vec2 cameraRange;
 uniform vec2 transmissionSize;

 float viewDepth(float z){return cameraRange.x*cameraRange.y/(cameraRange.y-z*(cameraRange.y-cameraRange.x));}
 // Reconstruct color after the waterline test and attenuation of each texel.
 // Interpolating a hull depth with the distant seabed invents water between them.
 vec4 throughSample(vec2 uv,float surface,float rayScale,float edgeWidth,vec3 waterColor){
   float dz=viewDepth(texture2D(transmissionDepth,uv).r)-surface;
   if(dz<=-edgeWidth)return vec4(0.);
   float behind=smoothstep(-edgeWidth,edgeWidth,dz);
   float path=max(0.,dz*rayScale);
   if(path>=32.)return vec4(0.,0.,0.,behind);
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
 // At long range a submerged fin can occupy only a few capture texels.
 // A quadratic B-spline averages their depth-tested contributions without
 // creating intermediate depths or bleeding a dry silhouette into the water.
 vec4 distantThrough(vec2 uv,float surface,float rayScale,float edgeWidth,vec3 waterColor,float strength){
   vec2 pixel=uv*transmissionSize-.5;
   vec2 centre=floor(pixel+.5),d=pixel-centre;
   vec2 lo=mix(max(vec2(0.),-d),.5*(.5-d)*(.5-d),strength);
   vec2 hi=mix(max(vec2(0.),d),.5*(.5+d)*(.5+d),strength);
   vec2 mid=1.-lo-hi,texel=1./transmissionSize;
   vec4 total=vec4(0.);
   for(int j=-1;j<=1;j++){
     float wy=j<0?lo.y:j>0?hi.y:mid.y;
     for(int i=-1;i<=1;i++){
       float wx=i<0?lo.x:i>0?hi.x:mid.x;
       total+=wx*wy*throughSample((centre+vec2(float(i),float(j))+.5)*texel,surface,rayScale,edgeWidth,waterColor);
     }
   }
   return total;
 }
 vec3 surfaceColor(vec3 eye,float eyeDistance,float day){
   vec3 color;
   if(cruiserWaterExcluded(wp))discard;
   vec4 air=texture2D(windMap,wp.xy/windPeriod+.5/48.);
   vec2 baseDir=vec2(cos(bearing),sin(bearing));
   float localSpeed=64.*mix(air.r,air.g,windBlend);
   float rippleWind=mix(wind,64.*mix(air.b,air.a,windBlend),windFieldActive);
   // Use the actual local wind and the Modelica short-wave response at this ENU position.
   float windDelta=(mix(localSpeed,rippleWind,.35)-referenceWind)/max(3.,referenceWind);
   // Short-wave roughness is visible out into the weaker shoulders of a
   // gust. Give those shoulders more contrast without changing wind loads.
   float puff=smoothstep(.001,.15,windDelta)*windFieldActive;
   float lull=smoothstep(.01,.23,-windDelta)*windFieldActive;
   vec2 p=vec2(dot(wp.xy,baseDir),dot(wp.xy,vec2(-baseDir.y,baseDir.x)));
   float fade=1.-smoothstep(16.,110.,eyeDistance);
   #ifdef VERTEX_SLOPE
   vec2 d=resolvedSlope,incidentSlope=resolvedIncidentSlope;
   #else
   vec2 incidentSlope;
   vec2 d=surfaceSlope(wp.xy,incidentSlope);
   #endif
   vec4 swimmer=wildlifeWave(wp.xy);
   d+=swimmer.zw;
   float gravitySlope=length(incidentSlope);
   d+=fade*rippleSlope(wp.xy,tm,baseDir,rippleWind)*(.80+.50*puff-.23*lull);
   // Resolve fine wind rows nearby; their aggregate roughness stays visible farther out.
   float ripplePhase=12.*p.x+1.9*p.y-11.*tm+.8*sin(1.6*p.y+.5*tm);
   float resolved=1.-smoothstep(1.,3.,fwidth(ripplePhase));
   d+=baseDir*(.029*puff*resolved*fade*cos(ripplePhase));
   vec3 n=normalize(vec3(-d,1.));vec3 ref=reflect(-eye,n);
   if(under>.5){
     vec3 ray=normalize(wp-cameraPosition);
     // Trace the underwater viewing ray across the water/air interface.
     vec3 skyRay=refract(ray,-n,1.333);
     float incidence=clamp(dot(ray,n),0.,1.);
     float transmissionGate=smoothstep(.653,.672,incidence);
     vec3 through=skyColor(normalize(skyRay+vec3(0.,0.,.0001)));
     vec3 underside=mix(vec3(.006,.040,.061),vec3(.015,.14,.17),incidence)*(.24+.76*day);
     color=mix(underside,through,transmissionGate*(1.-pow(1.-incidence,5.)));
     color=mix(color,vec3(.48,.66,.67)*(.24+.76*day),.78*swimmer.y);
     vec3 attenuation=exp(-vec3(.18,.057,.032)*eyeDistance);
     color=mix(vec3(.013,.105,.145)*(.22+.78*day),color,attenuation);
   }else{
     float fres=.021+.979*pow(1.-clamp(abs(dot(n,eye)),0.,1.),5.);
     float back=pow(max(0.,dot(-eye,sunDir)),3.)*smoothstep(-.45,.9,wp.z-tide);
     vec3 waterColor=mix(vec3(.001,.008,.019),vec3(.004,.061,.093)+back*vec3(.012,.13,.10),day);
     #ifdef SIMPLE_SURFACE
     vec3 reflected=skyColor(ref);
     color=mix(waterColor,reflected,fres);
     #else
     vec3 levelNormal=vec3(0.,0.,1.);
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
     #ifdef MOBILE_WATER
     vec4 transmitted=filteredThrough(refrUV,surfaceDepth,rayScale,edgeWidth,waterColor);
     #else
     vec2 samplePixel=refrUV*transmissionSize;
     float footprint=max(length(dFdx(samplePixel)),length(dFdy(samplePixel)));
     float centrePath=max(0.,(viewDepth(texture2D(transmissionDepth,refrUV).r)-surfaceDepth)*rayScale);
     float blur=clamp(smoothstep(14.,38.,eyeDistance)*smoothstep(.6,3.,centrePath)
                      +.35*smoothstep(.75,2.,footprint),0.,1.);
     vec4 transmitted=blur>.025
       ?distantThrough(refrUV,surfaceDepth,rayScale,edgeWidth,waterColor,blur)
       :filteredThrough(refrUV,surfaceDepth,rayScale,edgeWidth,waterColor);
     #endif
     // A bent ray can land on the dry hull. Refill uncovered samples using
     // the straight ray, preserving the water path of each underlying texel.
     if(transmitted.a<.995){
       vec4 straight=filteredThrough(screen,surfaceDepth,rayScale,edgeWidth,waterColor);
       transmitted.rgb+=straight.rgb*max(0.,straight.a-transmitted.a)/max(.001,straight.a);
     }
     vec2 frameMargin=min(screen,1.-screen);
     float visible=smoothstep(0.,.025,min(frameMargin.x,frameMargin.y))*step(.001,surfaceDepth);
     color=mix(waterColor+visible*transmitted.rgb,reflected,fres);
     #endif
     color+=vec3(3.5,2.7,1.65)*pow(max(dot(ref,sunDir),0.),240.)+vec3(.62,.7,1.)*pow(max(dot(ref,moonDir),0.),260.);
     waterColor=mix(waterColor,vec3(.012,.037,.043),storm*.85);
     vec2 foamUV=p*vec2(1.8,3.8)+vec2(-.9*tm,0.);
     #ifdef SIMPLE_SURFACE
     float scum=noise2(foamUV);
     #else
     float scum=cloud(foamUV);
     #endif
     // Monahan and O'Muircheartaigh's wind-dependent whitecap coverage.
     // Use it as a density control on steep wind-wave crests.
     float windCoverage=3.84e-6*pow(max(0.,rippleWind),3.41);
     float densityCutoff=clamp(1.-8.*windCoverage,.36,1.);
     float breaking=smoothstep(.085,.32,windCrest)*smoothstep(.045,.17,gravitySlope);
     float foam=breaking*smoothstep(densityCutoff-.08,densityCutoff+.06,scum);
     if(bowFoamAvailable>.5&&nearBowField(wp.xy,4.)){
       vec2 local=bowLocal(wp.xy);
       vec2 flow=local+vec2(tm*clamp(.45*abs(boat.w),.4,2.8),0.);
       float cluster=noise2(flow*vec2(3.7,7.1));
       float bowFoam=bowFoamCoverage(local+vec2(.05,-.13)*(cluster-.5));
       if(bowFoam>0.){
         float bubbles=noise2(flow*vec2(19.,26.)+vec2(11.,27.));
         float porosity=.72*cluster+.28*bubbles;
         float cutoff=mix(.69,.33,bowFoam);
         foam=max(foam,bowFoam*smoothstep(cutoff-.07,cutoff+.10,porosity));
       }
     }
     if(swimmer.y>0.)foam=max(foam,min(1.,swimmer.y)*(.40+.60*smoothstep(.22,.75,noise2(wp.xy*12.+.28*tm))));
     float shore=length((wp.xy-vec2(36.,40.))/vec2(17.,11.));
     foam=max(foam,exp(-abs(shore-.93)*23.)*smoothstep(.32,.65,scum)*smoothstep(.01,.16,abs(windCrest)));

     color=mix(color,vec3(.018,.048,.051)+reflected*.22,storm*(.48+.20*(1.-fres)));
     // The ripple normals disappear below a pixel before the puff itself does.
     // Keep a footprint in the unresolved reflected sky as well as in nearby water.
     color*=1.-puff*(.17+.25*fres);
     color*=1.+puff*resolved*(scum-.5)*.28;
     color+=.045*lull*reflected*fres;
     vec3 foamColor=mix(vec3(.06,.10,.14),vec3(.79,.87,.85),day);
     color=mix(color,foamColor,foam*.86);
     #ifndef DISABLE_STERN_FOAM
     float stern=sternFoam(wp.xy);
     color=mix(color,foamColor*(.84+.16*max(0.,dot(n,sunDir))),stern);
     #endif
     float haze=.9*smoothstep(70.,430.,eyeDistance)+.1*smoothstep(430.,540.,eyeDistance);
     color=mix(color,skyColor(normalize(vec3(-eye.xy,.01))),haze);
   }
   if(cruiserCount>0)color+=lampScatter(wp,day)*(.70+.30*smoothstep(-.14,.14,dot(d,baseDir)));
   return color;
 }
 void main(){
   vec3 offset=cameraPosition-wp;
   float eyeDistance=length(offset);
   vec3 eye=offset/max(.001,eyeDistance);
   float day=smoothstep(-.12,.22,sunDir.z);
   vec3 color=eyeDistance<=540.?surfaceColor(eye,eyeDistance,day):
     under>.5?vec3(.013,.105,.145)*(.22+.78*day):skyColor(normalize(vec3(-eye.xy,.01)));
   gl_FragColor=vec4(color,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
 }`}));
 scene.add(water);

 const trails=hullFoam(scene,U,cruiserHullGLSL,cruiserSurface),bowSprayArea=new Float64Array(4);
 function updateHullFoam(strips,time,speed,cat,cruiser=false,jets,frame){
   if(!strips)return;
   trails.sample(strips,time,speed,cat||cruiser,cruiser);
   if(cat){
     spray??=makeSpray(THREE,scene,'Bow spray',4,sampleSurface,{bow:true});
     if(jets&&frame){spray.sampleShoulders(time,jets,frame);return;}
     const area=bowSprayArea;
     const heading=Math.atan2(strips[16]-strips[1],strips[15]-strips[0]);
     const c=Math.cos(heading),s=Math.sin(heading);
     for(let h=0;h<2;h++)for(let i=0;i<2;i++){
       const k=h*18+12+3*i,index=2*h+i;
       const dx=strips[k]-strips[k-3],dy=strips[k+1]-strips[k-2];
       const spacing=Math.max(.1,Math.hypot(dx,dy));
       const wet=Math.max(0,strips[k+2]);
       // Meter the water intercepted by the two forward sections. Place
       // each source outside its hull instead of launching across the deck.
       const width=(h===0?1:-1)*(i===0?.16:.095);
       const x=strips[k]-s*width,y=strips[k+1]+c*width;
       spray.positions[index].set(x,y,0);
       area[index]=wet/spacing;
     }
     for(let h=0;h<2;h++)area[2*h]=Math.max(0,area[2*h]-area[2*h+1]);
     spray.sample(time,area,Math.max(0,speed),heading);
   }
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
 // Bilinear, periodic sampling at the texel centres used by backgroundHeightAt.
 function sampleSurface(east,north,optical=false){
   function sample(data,n,x,y,blend){
     const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
     let value=0;
     for(let j=0;j<2;j++)for(let i=0;i<2;i++){
       const k=4*(((iy+j)&(n-1))*n+((ix+i)&(n-1)));
       value+=(i?fx:1-fx)*(j?fy:1-fy)*displayedHeight(data,k,blend);
     }
     return value;
   }
   const swell=U.swell.value,center=U.swellCenter.value,period=U.spectrumPeriod.value;
   let h=U.tide.value+swell.x*Math.sin(swell.y+(east-center.x)*swell.z+(north-center.y)*swell.w);
   if(!firstTile)h+=sample(pixels,32,east/2,north/2,U.blend.value)*16/65535-8;
   if(period>0){
     const drift=U.spectrumDrift.value;
     const x=64*(east-drift.x)/period,y=64*(north-drift.y)/period,blend=U.spectrumBlend.value;
     const data=U.wakeAvailable.value?incidentBytes:spectrumBytes;
     let packed=U.hullSpectrumOnly.value?32768:sample(data,64,x,y,blend);
     if(optical&&U.wakeAvailable.value){
       const boat=U.boat.value,r=Math.hypot(east-boat.x,north-boat.y);
       const f=Math.max(0,Math.min(1,(r/period-.35)/.14));
       if(f<1){const w=f*f*(3-2*f);packed=w*packed+(1-w)*sample(spectrumBytes,64,x,y,blend);}
       if(U.bowAvailable.value&&r<4){
         const c=Math.cos(boat.z),s=Math.sin(boat.z),dx=east-boat.x,dy=north-boat.y;
         const u=dx*c+dy*s,v=-dx*s+dy*c,bounds=U.bowFineBounds.value;
         let bow=sample(bowBytes,32,4*u,4*v,blend);
         if(U.bowFineAvailable.value){
           const edge=Math.min(u-bounds.x,v-bounds.y,bounds.z-u,bounds.w-v);
           if(edge>0){
             const fine=sampleFineBow((u-fineX)/fineStep,(v-fineY)/fineStep,blend);
             bow=THREE.MathUtils.lerp(bow,fine,THREE.MathUtils.smoothstep(edge,0,.25));
           }
         }
         h+=(bow-32768)/8192;
       }
     }
     h+=(packed-32768)/8192;
   }
   if(optical)h+=swimmerWater.elevation(east,north);
   return h;
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
 const viewPlane=new THREE.Plane(),clip=new THREE.Vector4(),corner=new THREE.Vector4();
 const clearThrough=new THREE.Color(0x144958);
 let simpleCapture=false,captureScale=1;
 function clipReflectionAtTide(){
   // Replace the reflected camera's near plane. Geometry is clipped in the
   // rasterizer, so the reflection uses the regular material programs.
   if(mirrorCamera.position.z>=U.tide.value)return false;
   const matrix=mirrorCamera.projectionMatrix,projection=matrix.elements;
   viewPlane.copy(mirrorClip).applyMatrix4(mirrorCamera.matrixWorldInverse);
   clip.set(viewPlane.normal.x,viewPlane.normal.y,viewPlane.normal.z,viewPlane.constant);
   corner.set(Math.sign(clip.x),Math.sign(clip.y),1,1).applyMatrix4(mirrorCamera.projectionMatrixInverse);
   const distance=clip.dot(corner);
   if(distance<=1e-6)return false;
   clip.multiplyScalar(2/distance);
   projection[2]=clip.x;projection[6]=clip.y;projection[10]=clip.z+1;projection[14]=clip.w;
   mirrorCamera.projectionMatrixInverse.copy(matrix).invert();
   return true;
 }
 function capture(renderer,camera,submergedScenery,refreshReflection){
   camera.updateMatrixWorld();
   const oldBackground=scene.background,oldFog=scene.fog;
   const foamVisible=trails.mesh.visible,sprayVisible=spray?.points.visible;
   if(spray)spray.points.visible=false;
   water.visible=false;trails.mesh.visible=false;dome.visible=false;scene.fog=null;
   if(refreshReflection){
     camera.getWorldDirection(mirrorLook).add(camera.position);
     mirrorCamera.copy(camera);
     if(simpleCapture)mirrorCamera.layers.set(waterCaptureLayer);
     const twiceTide=2*U.tide.value;
     mirrorCamera.position.z=twiceTide-camera.position.z;mirrorLook.z=twiceTide-mirrorLook.z;
     mirrorCamera.up.setFromMatrixColumn(camera.matrixWorld,1);mirrorCamera.up.z*=-1;mirrorCamera.lookAt(mirrorLook);mirrorCamera.updateMatrixWorld();
     mirrorClip.constant=-U.tide.value;
     const obliqueClip=clipReflectionAtTide();
     U.mirrorMatrix.value.multiplyMatrices(mirrorCamera.projectionMatrix,mirrorCamera.matrixWorldInverse);
     scene.background=null;
     renderer.setClearColor(0x000000,0);renderer.setRenderTarget(reflectRT);
     if(!obliqueClip)renderer.clippingPlanes=[mirrorClip];
     const hideSubmerged=submergedScenery && U.tide.value>=0 && submergedScenery.visible;
     if(hideSubmerged)submergedScenery.visible=false;
     renderer.render(scene,mirrorCamera);
     if(!obliqueClip)renderer.clippingPlanes=[];
     if(hideSubmerged)submergedScenery.visible=true;
   }
   {
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
 function setQuality(profile,vertexSlope,multisampling,mobileWater=false){
   if(water.geometry.parameters.widthSegments!==profile.mesh){
     water.geometry.dispose();water.geometry=waterMesh(profile.mesh);
   }
   simpleCapture=vertexSlope;
   water.material.defines=vertexSlope?{VERTEX_SLOPE:1,DISABLE_BOW_FIELD:1}:{};
   if(mobileWater)water.material.defines.MOBILE_WATER=1;
   if(profile.skipCaptures)water.material.defines.SIMPLE_SURFACE=1;
   if(profile.omitWake||!cruiserSurface)water.material.defines.DISABLE_STERN_FOAM=1;
   water.material.needsUpdate=true;
   skyTarget.setSize(Math.round(512*profile.sky),Math.round(192*profile.sky));lastSky=-Infinity;
   if(profile.skipCaptures){reflectRT.dispose();throughRT.dispose();return;}
   captureScale=profile.capture;
   reflectRT.samples=multisampling?(profile.reflectSamples??0):0;
   resizeCaptures(1);
 }
 function resizeCaptures(ratio){
   const scale=captureScale*ratio;
   const width=Math.round(512*scale),height=Math.round(320*scale);
   reflectRT.setSize(simpleCapture?256:width,simpleCapture?160:height);
   const throughWidth=Math.max(320,width),throughHeight=Math.max(200,height);
   throughRT.setSize(throughWidth,throughHeight);U.transmissionSize.value.set(throughWidth,throughHeight);
 }
 return {U,dome,water,drawSpray:t=>spray?.draw(t),swimmerWater,sampleSurface,sampleWind,readBowGrid,update,updateSpectrum,updateHullSpectrum,updateHullFoam,clearWake,updateWind,capture,setQuality,resizeCaptures,updateSky};
}

// Low maritime cloud banks in world coordinates. Soft particles scatter light
// at different depths; local extinction also fades opaque geometry inside a bank.
function harborClouds(T,scene){
  const group=new T.Group();group.name='Low maritime clouds';scene.add(group);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
  const ctx=canvas.getContext('2d'),im=ctx.createImageData(96,96);
  for(let y=0;y<96;y++)for(let x=0;x<96;x++){
    const u=(x-47.5)/47.5,v=(y-47.5)/47.5;
    const scallop=.09*Math.sin(8*u+4*v)*Math.cos(6*v)+.035*Math.sin(19*v-13*u);
    const a=Math.max(0,1-u*u-v*v+scallop);
    const k=4*(y*96+x);im.data[k]=im.data[k+1]=im.data[k+2]=238+13*v;im.data[k+3]=135*a*a;
  }
  ctx.putImageData(im,0,0);
  const map=new T.CanvasTexture(canvas),material=new T.SpriteMaterial({map,transparent:true,opacity:.65,depthWrite:false,fog:false});
  // Forward scattering brightens the sunward face. Both the sprites and
  // in-cloud fog use the same sky exposure as the ocean and skydome.
  const light={value:new T.Vector3(0,0,1)};
  material.onBeforeCompile=shader=>{
    shader.uniforms.cloudLight=light;
    shader.fragmentShader='uniform vec3 cloudLight;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      vec2 q=vMapUv*2.-1.;
      vec3 n=normalize(vec3(q,sqrt(max(.02,1.-dot(q,q)))));
      diffuseColor.rgb*=.70+.30*max(0.,dot(n,mat3(viewMatrix)*cloudLight));
    `);
  };
  const banks=[[17,-10,11,17,10,5],[-43,24,28,24,15,8],[58,38,39,26,17,10]];
  for(const [x,y,z,w,d,h] of banks)for(let j=0;j<13;j++){
    const a=j*2.4,r=Math.sqrt(j/13),sprite=new T.Sprite(material);
    sprite.position.set(x+w*r*Math.cos(a),y+d*r*Math.sin(a),z+.43*h*Math.cos(3*a));
    sprite.scale.set(1.25*w,1.55*h,1);group.add(sprite);
  }
  const fog=new T.FogExp2(0xd8e3e8,.03);
  const twilight=new T.Color(),dayColor=new T.Color(),nightColor=new T.Color();
  return (travel,eye,storm,sky)=>{
    group.position.set(9*Math.sin(travel.x/85),8*Math.sin(travel.y/85),0);
    const elevation=sky.sunDir.value.z;
    const day=T.MathUtils.smoothstep(elevation,-.12,.18);
    const dusk=1-T.MathUtils.smoothstep(Math.abs(elevation),.03,.48);
    light.value.copy(elevation>0?sky.sunDir.value:sky.moonDir.value);
    nightColor.setRGB(.008,.015,.031).multiplyScalar(.65+.35*Math.max(0,sky.moonDir.value.z));
    twilight.setRGB(.87,.49,.28);
    dayColor.setRGB(.83,.89,.92).lerp(twilight,dusk);
    material.color.copy(nightColor).lerp(dayColor,day).multiplyScalar(storm?.38:1);
    if(storm)material.color.addScalar(.22*Math.max(0,sky.lightning.value.y));
    fog.color.copy(material.color);
    let density=0;
    for(const [x,y,z,w,d,h] of banks){
      const r=((eye.x-x-group.position.x)/w)**2+((eye.y-y-group.position.y)/d)**2+((eye.z-z)/h)**2;
      density=Math.max(density,1-r);
    }
    fog.density=.085*density*(storm?1.4:1);
    return density>0?fog:null;
  };
}
