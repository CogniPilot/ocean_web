const bowAtlasLayout={width:80,height:64,coarse:1,foam:35};
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
 uniform float spectrumPeriod,spectrumBlend,wakeAvailable,bowAvailable,bowLength,hullSpectrumOnly,bowFoamSpacing,bowFoamAvailable;
 uniform vec4 bowFoamBounds;
 const vec2 bowAtlasSize=vec2(${bowAtlasLayout.width}.,${bowAtlasLayout.height}.);
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
 float bowElevation(vec2 p){
   if(!nearBowField(p,.5*bowLength))return 0.;
   return elevationSample(bowMap,(mod(bowLocal(p)*(32./bowLength),32.)+vec2(${bowAtlasLayout.coarse+.5},1.5))/bowAtlasSize);
 }
 float bowFoamCoverage(vec2 local){
   vec2 margin=min(local-bowFoamBounds.xy,bowFoamBounds.zw-local);
   float edge=smoothstep(0.,.20,min(margin.x,margin.y));
   if(edge<=0.)return 0.;
   vec2 index=(local-bowFoamBounds.xy)/bowFoamSpacing;
   vec2 foam=texture2D(bowMap,(index+vec2(${bowAtlasLayout.foam+.5},1.5))/bowAtlasSize).rg;
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
// Rasterize the disturbed stern water in current-relative coordinates.
function sternFoamField(uniforms){
 const size=128,bytes=new Uint8Array(size*size*4);
 const map=new THREE.DataTexture(bytes,size,size);
 map.minFilter=map.magFilter=THREE.LinearFilter;
 const region=new THREE.Vector4();
 uniforms.sternFoamMap={value:map};uniforms.sternFoamRegion={value:region};
 const ramp=(x)=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
 function clear(){region.set(0,0,0,0);}
 function sample(...trails){
   const segments=[];
   let eastMin=Infinity,northMin=Infinity,eastMax=-Infinity,northMax=-Infinity;
   for(const trail of trails)for(let i=4;i<(trail?.length??0);i+=4){
     const j=i-4,east=trail[j],north=trail[j+1];
     const opacityA=trail[j+2],opacityB=trail[i+2];
     if(opacityA<=0||opacityB<=0||Math.max(opacityA,opacityB)<.015)continue;
     const dx=trail[i]-east,dy=trail[i+1]-north,length2=dx*dx+dy*dy;
     if(length2<.02**2)continue;
     const widthA=trail[j+3],widthB=trail[i+3],width=Math.max(widthA,widthB);
     const left=Math.min(east,trail[i])-width,right=Math.max(east,trail[i])+width;
     const bottom=Math.min(north,trail[i+1])-width,top=Math.max(north,trail[i+1])+width;
     eastMin=Math.min(eastMin,left);eastMax=Math.max(eastMax,right);
     northMin=Math.min(northMin,bottom);northMax=Math.max(northMax,top);
     segments.push({east,north,dx,dy,length2,opacityA,opacityB,widthA,widthB,left,right,bottom,top});
   }
   if(!segments.length){clear();return;}
   const width=Math.max(12,eastMax-eastMin+1),height=Math.max(12,northMax-northMin+1);
   const east=.5*(eastMin+eastMax-width),north=.5*(northMin+northMax-height);
   const stepE=width/size,stepN=height/size;
   bytes.fill(0);
   for(const {east:segmentEast,north:segmentNorth,dx,dy,length2,opacityA,opacityB,widthA,widthB,left,right,bottom,top} of segments){
     const i0=Math.max(0,Math.ceil((left-east)/stepE-.5));
     const i1=Math.min(size-1,Math.floor((right-east)/stepE-.5));
     const j0=Math.max(0,Math.ceil((bottom-north)/stepN-.5));
     const j1=Math.min(size-1,Math.floor((top-north)/stepN-.5));
     const startX=east+(i0+.5)*stepE-segmentEast,du=dx/length2,dv=dy/length2;
     const widthDelta=widthB-widthA,opacityDelta=opacityB-opacityA;
     for(let row=j0;row<=j1;row++){
       const y=north+(row+.5)*stepN-segmentNorth;
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
 return {sample,clear,dispose:()=>map.dispose()};
}
// Each stern feeds an independent track. The water material samples both on its own displaced surface.
function sailingFoam(uniforms,field){
 const count=52,tracks=[[],[]],coverage=[new Float32Array(4*count),new Float32Array(4*count)];
 let stamp;
 function clear(){
   for(const track of tracks)track.length=0;
   stamp=undefined;
 }
 function sample(strips,time,speed,cat){
   if(!strips||time===stamp)return;
   const drift=uniforms.spectrumDrift.value,dx=drift.x,dy=drift.y;
   if(stamp!==undefined&&(time<stamp||time-stamp>.26))clear();
   stamp=time;
   for(let h=0;h<tracks.length;h++){
     const track=tracks[h],i=18*h;
     if(h===0||cat){
       const aft=strips[i+2],inboard=.42*strips[i+5],wet=aft+inboard;
       const spacing=Math.hypot(strips[i+3]-strips[i],strips[i+4]-strips[i+1]);
       const area=Math.max(0,wet)/Math.max(.1,spacing);
       // Normalize the volume of disturbed water per second to opacity.
       const speedAhead=Math.max(0,speed),flux=area*speedAhead;
       const strength=Math.min(1,flux/.11);
       const breaking=cat?strength*Math.max(0,Math.min(1,(speedAhead-4.0)/5.0)):0;
       const forward=wet>1e-9?inboard/wet:0;
       const east=strips[i]+forward*(strips[i+3]-strips[i]);
       const north=strips[i+1]+forward*(strips[i+4]-strips[i+1]);
       track.unshift([east-dx,north-dy,time,strength,breaking]);
       if(track.length>count)track.pop();
     }
     const values=coverage[h];
     for(let j=0;j<track.length;j++){
       const [east,north,born,strength,breaking]=track[j],age=Math.max(0,time-born);
       const width=(cat?.16:.20)+.16*strength+.08*age+breaking*(.28+.34*(1-Math.exp(-1.6*age)));
       const fade=Math.min(1,Math.max(0,(age-3.6)/1.4));
       values[4*j]=east;values[4*j+1]=north;
       values[4*j+2]=strength*Math.exp(-age*.43)*(1-fade*fade*(3-2*fade));
       values[4*j+3]=width;
     }
   }
   field.sample(coverage[0].subarray(0,4*tracks[0].length),
     coverage[1].subarray(0,cat?4*tracks[1].length:0));
 }
 return {clear,sample};
}
// R contains drifting foam, G the cross-section along a breaking lip and B shoreline noise.
function makeFoamTexture(T){
 const texture=new T.TextureLoader().load('./assets/whitecap-coverage.png');
 texture.wrapS=texture.wrapT=T.RepeatWrapping;
 texture.minFilter=T.LinearMipmapLinearFilter;
 return texture;
}
const windTextureRange=32;
// More samples near the boat and progressively larger cells offshore. Use
// the inverse mapping for history and shading so the foam stays in world space.
const foamPatchNearWidth=128,foamPatchCurvature=640;
const foamPatchGLSL=`
 const float foamPatchNearWidth=${foamPatchNearWidth}.;
 const float foamPatchCurvature=${foamPatchCurvature}.;
 vec2 foamPatchUV(vec2 offset){
   return .5+2.*offset/(foamPatchNearWidth+sqrt(foamPatchNearWidth*foamPatchNearWidth
     +4.*foamPatchCurvature*abs(offset)));
 }
`;
// Short, directionally spread gravity waves close the unresolved end of
// the wind-wave spectrum. Their deformation seeds foam, which then advects
// and decays in a world-space atlas independently of the breaking crest.
function whitecapField(T,U){
 let size=320;
 const targets=Array.from({length:2},()=>new T.WebGLRenderTarget(size,size,{
   depthBuffer:false,stencilBuffer:false,magFilter:T.LinearFilter,minFilter:T.LinearMipmapLinearFilter,
   generateMipmaps:true
 }));
 const modes=[
   [1.12,.11,.102,2.3],[1.38,-.24,.084,5.2],[1.72,.02,.089,.7],[1.98,.29,.076,4.2],
   [2.26,-.13,.070,1.5],[2.61,.41,.065,5.8],[2.94,-.36,.057,3.3],[3.31,.18,.054,.2],
   [3.64,-.52,.047,2.9],[3.92,.51,.042,5.4],[4.29,-.31,.039,1.1],[4.61,.36,.034,4.5]
 ];
 const sigma=Math.sqrt(modes.reduce((sum,[,,steepness])=>sum+.5*steepness**2,0));
 const waveTerms=modes.map(([k,angle,steepness,phase])=>{
   const x=Math.cos(angle).toFixed(7),y=Math.sin(angle).toFixed(7);
   const angularSpeed=Math.sqrt(9.80665*k).toFixed(7);
   return `{
     const vec2 direction=vec2(${x},${y});
     float angle=${k}*dot(local,direction)-${angularSpeed}*tm+${phase};
     float resolved=1.-smoothstep(1.,3.14,fwidth(angle));
     float compression=resolved*${steepness}*cos(angle);
     strain+=compression*vec3(direction.x*direction.x,direction.y*direction.y,direction.x*direction.y);
     gradient-=resolved*${steepness}*sin(angle)*direction;
     orbital+=compression*${(Math.sqrt(9.80665*k)/k).toFixed(7)}*direction;
   }`;
 }).join('');
 // Use the same phases on the mesh and in the foam atlas so the spilling
 // lip follows its own crest. The mesh resolves the longer modes nearby.
 const resolvedModes=modes.slice(0,6);
 const crestVariance=resolvedModes.reduce((sum,[k,,steepness])=>sum+.5*(steepness/k)**2,0);
 const crestHeight=resolvedModes.map(([k,angle,steepness,phase])=>{
   const x=(k*Math.cos(angle)).toFixed(7),y=(k*Math.sin(angle)).toFixed(7);
   const speed=Math.sqrt(9.80665*k).toFixed(7);
   return `${(steepness/k).toFixed(7)}*cos(dot(local,vec2(${x},${y}))-${speed}*tm+${phase})`;
 }).join('+');
 const bounds={value:new T.Vector3()};
 const map={value:targets[0].texture};
 const controls={
   ...U,history:{value:targets[1].texture},patchCenter:{value:new T.Vector2()},
   previousCenter:{value:new T.Vector2()},surfaceCurrent:{value:new T.Vector2()},
   elapsed:{value:0},hasHistory:{value:0}
 };
 const quad=new T.PlaneGeometry(2,2),scene=new T.Scene();
 const camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const material=new T.ShaderMaterial({uniforms:controls,depthTest:false,depthWrite:false,blending:T.NoBlending,
   vertexShader:'varying vec2 uvPatch;void main(){uvPatch=uv;gl_Position=vec4(position.xy,0.,1.);}',
   fragmentShader:oceanHeightGLSL+foamPatchGLSL+`
     uniform sampler2D windMap,history;
     uniform float elapsed,hasHistory,windBlend,windPeriod,windFieldActive,referenceWind,bearing,tm;
     uniform vec2 patchCenter,previousCenter,surfaceCurrent;
     varying vec2 uvPatch;
     void main(){
       vec2 offset=uvPatch-.5;
       vec2 world=patchCenter+offset*(foamPatchNearWidth+foamPatchCurvature*abs(offset));
       vec2 downwind=vec2(cos(bearing),sin(bearing)),across=vec2(-downwind.y,downwind.x);
       vec4 air=texture2D(windMap,world/windPeriod+.5/48.);
       float wind10=mix(referenceWind,${windTextureRange}.*mix(air.r,air.g,windBlend),windFieldActive);
       float waveWind=mix(referenceWind,${windTextureRange}.*mix(air.b,air.a,windBlend),windFieldActive);
       // Schwendeman & Thomson (2015), Table 2. Use the measured growth of
       // coverage, with a lower onset within their fitted uncertainty so the
       // rare first breakers resolve on the atlas in a gentle breeze.
       float totalCoverage=2.81e-5*pow(max(0.,wind10-3.4),2.76);
       vec2 local=vec2(dot(world,downwind),dot(world,across));
       vec3 strain=vec3(0.);
       vec2 gradient=vec2(0.),orbital=vec2(0.);
       ${waveTerms}
       float incident=sampledHeightsAt(world).y;
       vec2 spacing=2.*downwind;
       float crestCurvature=(2.*incident-sampledHeightsAt(world-spacing).y
                          -sampledHeightsAt(world+spacing).y)*.25;
       // det(I - strain) is the compression of the horizontal orbital map.
       // The resolved wind sea influences the onset, with swell and hull
       // wakes excluded from the short-wave compression test.
       float jacobian=(1.-strain.x)*(1.-strain.y)-strain.z*strain.z;
       float severity=(1.-jacobian)/${sigma.toFixed(8)}+clamp(1.1*crestCurvature,-.26,.26);
       // Gaussian upper-tail quantile. The active breaking stage occupies
       // a fraction of the measured area, the rest is drifting foam.
       float x=sqrt(-2.*log(clamp(.81*totalCoverage,1e-6,.08)));
       float onset=x-(2.515517+x*(.802853+.010328*x))/(1.+x*(1.432788+x*(.189269+.001308*x)));
       // Compression peaks near the crest. Use its upper downwind shoulder
       // for the spilling lip, including the crest itself at atlas resolution.
       float lightBreeze=1.-smoothstep(7.,12.,wind10);
       float spilling=smoothstep(onset-.25-.42*lightBreeze,onset+.26,severity);
       // A spilling crest is a ridge. Limit emission to the narrow band where
       // the along-wind slope crosses its upper shoulder, filtering to atlas resolution.
       float lipDistance=abs(gradient.x+.035+.12*gradient.y);
       float lipAA=clamp(.45*fwidth(gradient.x),.012,.085);
       float front=1.-smoothstep(.026,.088+lipAA,lipDistance);
       float source=smoothstep(3.4,5.0,wind10)*spilling*front;
       // Semi-Lagrangian advection. Foam moves with the water and wind
       // drift while the dispersive crest moves away at phase speed.
       vec2 drift=surfaceCurrent+(.025*wind10+.46*orbital.x)*downwind+.46*orbital.y*across;
       vec2 back=foamPatchUV(world-elapsed*drift-previousCenter);
       float residual=0.,freshSource=source;
       if(hasHistory>.5&&all(greaterThan(back,vec2(0.)))&&all(lessThan(back,vec2(1.)))){
         // Follow the dominant short-wave phase for the brief active stage.
         // Decay continuously as the crest loses its compression.
         vec2 crestBack=foamPatchUV(world-elapsed*(surfaceCurrent+2.4*downwind)-previousCenter);
         float previous=all(greaterThan(crestBack,vec2(0.)))&&all(lessThan(crestBack,vec2(1.)))
           ?texture2D(history,crestBack).r:0.;
         float response=1.-exp(-elapsed/(source>previous?.32:1.35));
         freshSource=mix(previous,source,response);
         // Residual bubbles disperse preferentially downwind as the lip moves on.
         vec2 metresPerUV=foamPatchNearWidth+2.*foamPatchCurvature*abs(back-.5);
         vec2 spread=downwind*sqrt(.09*elapsed)/metresPerUV;
         float foam=.6*texture2D(history,back).g+.2*(texture2D(history,back-spread).g
           +texture2D(history,back+spread).g);
         // Callaghan et al. (2012) model the decay of foam area exponentially.
         float lifetime=mix(4.5,9.0,smoothstep(7.,15.,wind10));
         residual=foam*exp(-elapsed/lifetime);
       }
       residual=1.-(1.-residual)*exp(-1.40*elapsed*source);
       // Unbiased rounding preserves the decay of thin foam in an 8-bit map.
       float rounding=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))
                             +.61803399*floor(tm*28.)));
       residual=floor(255.*residual+rounding)/255.;
       freshSource=floor(255.*freshSource+rounding)/255.;
       // Cox & Munk's measured slope variance rises with wind speed.
       float cellSize=max(fwidth(world.x),fwidth(world.y));
       float chopGain=mix(.7,1.65,smoothstep(3.5,13.,waveWind));
       float roughness=chopGain*sqrt(clamp((waveWind-2.)/11.,0.,1.2))*(1.-.5*smoothstep(.85,2.4,cellSize));
       gradient=(gradient.x*downwind+gradient.y*across)*roughness;
       gl_FragColor=vec4(freshSource,residual,clamp(128./255.+.8*gradient,0.,1.));
     }
   `});
 scene.add(new T.Mesh(quad,material));
 let slot=0,lastTime=-Infinity,lastWall=-Infinity;
 function update(renderer,wall,east,north,currentEast,currentNorth){
   const cell=foamPatchNearWidth/size,time=U.tm.value,cx=Math.round(east/cell)*cell,cy=Math.round(north/cell)*cell;
   const old=controls.patchCenter.value,dt=time-lastTime;
   const moved=(cx-old.x)**2+(cy-old.y)**2>4;
   if(!moved&&(dt===0||wall-lastWall<1000/28))return;
   controls.hasHistory.value=Number(dt>=0&&dt<15&&bounds.value.z>0);
   controls.elapsed.value=dt>0&&dt<15?dt:0;
   controls.previousCenter.value.copy(old);old.set(cx,cy);
   controls.surfaceCurrent.value.set(currentEast,currentNorth);
   controls.history.value=targets[slot].texture;
   slot=1-slot;
   const previous=renderer.getRenderTarget();
   renderer.setRenderTarget(targets[slot]);renderer.render(scene,camera);renderer.setRenderTarget(previous);
   map.value=targets[slot].texture;
   bounds.value.set(cx,cy,1);
   lastTime=time;lastWall=wall;
 }
 function setResolution(resolution){
   if(resolution===size)return;
   size=resolution;
   for(const target of targets)target.setSize(size,size);
   bounds.value.z=0;lastTime=lastWall=-Infinity;
 }
 return {update,bounds,map,crestHeight,crestVariance,setResolution,dispose(){
   for(const target of targets)target.dispose();
   quad.dispose();material.dispose();
 }};
}
function atmosphere(scene,{waterCaptureLayer,objectDrawRange,cruiserSurface,hobieSurface,bowFoamGrid,bowLength=8,islandBed},makeSwimmerWater,makeSpray,cruiserBeamGLSL,cruiserHullGLSL,searchlightHeight,hullGlowLobes){
 const U={underwaterFogDensity:{value:0},underwaterFogColor:{value:new THREE.Color()},cruiserTilt:{value:new Float32Array(10)},cruiserCount:{value:0},cruiserPose:{value:new Float32Array(20)},cruiserAim:{value:new Float32Array(20)},cloudTravel:{value:new THREE.Vector2()},lightning:{value:new THREE.Vector2()},storm:{value:0},tm:{value:0},sunDir:{value:new THREE.Vector3()},moonDir:{value:new THREE.Vector3()},under:{value:1},waveAmp:{value:1},tidalPhase:{value:.5}};
 U.subPortCount={value:0};
 U.subPorts={value:new Float32Array(40)};
 U.subForwards={value:new Float32Array(30)};
 U.islandBedMap={value:islandBed.texture};U.islandBedBounds={value:islandBed.bounds};
 const swimmerWater=makeSwimmerWater(THREE,U);
 const skyTarget=new THREE.WebGLRenderTarget(512,192,{type:THREE.HalfFloatType});
 skyTarget.texture.wrapS=THREE.RepeatWrapping;
 U.skyMap={value:skyTarget.texture};
 const lookup=`uniform sampler2D skyMap;uniform vec3 sunDir,moonDir;uniform float tm,storm;
 vec4 sampleSky(vec3 d){
   return texture2D(skyMap,vec2(atan(d.y,d.x)/6.2831853+.5,asin(clamp(d.z,-1.,1.))/3.14159265+.5));
 }
 vec3 skyColor(vec3 d){
   vec4 sky=sampleSky(d);
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
 U.windBlend={value:1};U.referenceWind={value:11};U.rippleScale={value:1};
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
       const next=Math.round(Math.max(0,Math.min(255,speed*255/windTextureRange)));
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
 const {x:fineX,y:fineY,columns:fineColumns,rows:fineRows,spacing:fineStep}=bowFoamGrid;
 const bowBytes=new Uint8Array(32*32*4);
 const {width:atlasWidth,height:atlasHeight,coarse:coarseColumn,foam:foamColumn}=bowAtlasLayout;
 const bowAtlas=new Uint8Array(atlasWidth*atlasHeight*4),bowTexture=new THREE.DataTexture(bowAtlas,atlasWidth,atlasHeight);
 bowTexture.minFilter=bowTexture.magFilter=THREE.LinearFilter;
 U.bowLength={value:bowLength};U.bowMap={value:bowTexture};U.bowAvailable={value:0};
 U.bowFoamAvailable={value:0};
 U.bowFoamSpacing={value:fineStep};
 U.bowFoamBounds={value:new THREE.Vector4(fineX,fineY,fineX+(fineColumns-1)*fineStep,fineY+(fineRows-1)*fineStep)};
 let spray;
 function clearWake(){if(U.hullSpectrumOnly.value)U.spectrumPeriod.value=0;swimmerWater.clear();spray?.clear();U.wakeAvailable.value=U.bowAvailable.value=U.bowFoamAvailable.value=0;trails?.clear();sternField.clear();}
 function displayedHeight(data,k,blend){
   const old=(data[k]<<8)+data[k+1],latest=(data[k+2]<<8)+data[k+3];
   return Math.round(old+blend*(latest-old));
 }
 function readBowGrid(target){
   const blend=U.spectrumBlend.value;
   for(let i=0;i<target.length;i++)target[i]=(displayedHeight(bowBytes,i*4,blend)-32768)/8192;
 }
 function encodeSpectrum(data,frame,initialized,subtract){
   for(let i=0;i<frame.length;i++){
     const level=frame[i]-(subtract?subtract[i]:0);
     const packed=Math.round(32768+Math.max(-4,Math.min(3.99987,level))*8192);
     const k=i*4,old=initialized?displayedHeight(data,k,U.spectrumBlend.value):packed;
     data[k]=old>>8;data[k+1]=old&255;data[k+2]=packed>>8;data[k+3]=packed&255;
   }
 }
 function updateFullSpectrum(heights,x,y,period,bow,foam){
   if(bow){
     encodeSpectrum(bowBytes,bow,U.bowAvailable.value);
     // Repeat the first row and column for bilinear sampling across the periodic seam.
     for(let row=0;row<=32;row++){
       const start=(row%32)*32*4,offset=((row+1)*atlasWidth+coarseColumn)*4;
       bowAtlas.set(bowBytes.subarray(start,start+32*4),offset);
       bowAtlas.set(bowBytes.subarray(start,start+4),offset+32*4);
     }
     if(foam?.length===fineColumns*fineRows){
       for(let row=0;row<fineRows;row++)for(let col=0;col<fineColumns;col++){
         const k=((row+1)*atlasWidth+foamColumn+col)*4,next=foam[row*fineColumns+col];
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
 function updateHullSpectrum(heights,x,y,period,bow,foam){
   U.hullSpectrumOnly.value=U.wakeAvailable.value=1;
   updateFullSpectrum(heights,x,y,period,bow,foam);
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
 const whitecaps=whitecapField(THREE,U);
 U.whitecapMap=whitecaps.map;U.whitecapBounds=whitecaps.bounds;
 const field=oceanHeightGLSL+`
 vec2 surfaceSlope(vec2 p){
   float dx=(sampledHeightsAt(p+vec2(.48,0)).x-sampledHeightsAt(p-vec2(.48,0)).x)/.96;
   float dy=(sampledHeightsAt(p+vec2(0,.48)).x-sampledHeightsAt(p-vec2(0,.48)).x)/.96;
   // Factor the analytic swell's central difference into one cosine.
   vec2 swellSlope=swell.x*cos(swell.y+dot(p-swellCenter,swell.zw))*sin(.48*swell.zw)/.48;
   vec2 slope=vec2(dx,dy)+swellSlope;
   if(nearBowField(p,bowLength*(.5+1./32.))){
     float spacing=bowLength/32.;
     slope+=vec2(bowElevation(p+vec2(spacing,0))-bowElevation(p-vec2(spacing,0)),
       bowElevation(p+vec2(0,spacing))-bowElevation(p-vec2(0,spacing)))/(2.*spacing);
   }
   return slope;
 }
 #ifdef VERTEX_SLOPE
 varying vec2 resolvedSlope;
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
   const inner=.52,nearScale=7.5;
   const outer=Math.max(0,(u-inner)/(1-inner));
   return Math.sign(v)*(nearScale*u+(595-nearScale)*outer**3);
 };
 for(let j=0;j<coords.count;j++){
   coords.setXY(j,stretch(coords.getX(j)),stretch(coords.getY(j)));
 }
 return geometry;
 }
 function compactWaterMesh(){
   const radius=hobieSurface?5:4,cells=hobieSurface?40:80,row=cells+1;
   const positions=[],indices=[];
   for(let y=0;y<=cells;y++)for(let x=0;x<=cells;x++){
     positions.push((2*x/cells-1)*radius,(2*y/cells-1)*radius,0);
     if(x<cells&&y<cells){
       const a=y*row+x;
       indices.push(a,a+1,a+row+1,a,a+row+1,a+row);
     }
   }
   const perimeter=(segments,point)=>{
     const vertices=[];
     for(let edge=0;edge<4;edge++)for(let i=0;i<segments;i++){
       const [x,y]=edge===0?[i,0]:edge===1?[segments,i]:
         edge===2?[segments-i,segments]:[0,segments-i];
       vertices.push(point(x,y));
     }
     return vertices;
   };
   let inner=perimeter(cells,(x,y)=>y*row+x);
   // The Hobie uses 25 cm cells across both hulls and their near wake. Rings share every edge
   // vertex with their neighbours, including where resolution halves.
   const rings=[[radius+1.25,40],[radius+2.65,40],[radius+4.2,40],[radius+6.2,40],[13,20],[17,20],
     [22,20],[31,20],[43,10],[64,10],[96,10],[145,10],[225,5],[350,5],
     [550,5],[objectDrawRange+128,5]];
   for(const [extent,segments] of rings){
     const outer=perimeter(segments,(x,y)=>{
       const index=positions.length/3;
       positions.push((2*x/segments-1)*extent,(2*y/segments-1)*extent,0);
       return index;
     });
     const stride=inner.length/outer.length;
     for(let i=0;i<outer.length;i++){
       const end=(i+1)*stride;
       indices.push(outer[i],outer[(i+1)%outer.length],inner[end%inner.length]);
       for(let j=end;j>i*stride;j--)
         indices.push(outer[i],inner[j%inner.length],inner[j-1]);
     }
     inner=outer;
   }
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
   geometry.setIndex(indices);
   return geometry;
 }
 let waterMeshKey=144;
 U.foamTexture={value:makeFoamTexture(THREE)};
 const swimmerFoam=new THREE.TextureLoader().load('./assets/swimmer-foam.webp');
 swimmerFoam.wrapS=swimmerFoam.wrapT=THREE.MirroredRepeatWrapping;
 swimmerFoam.minFilter=THREE.LinearMipmapLinearFilter;
 U.swimmerFoam={value:swimmerFoam};
 const water=new THREE.Mesh(waterMesh(144),new THREE.ShaderMaterial({uniforms:U,side:THREE.DoubleSide,
 vertexShader:field+`varying vec3 wp;
 uniform float tm,bearing,referenceWind;
 void main(){
 wp=(modelMatrix*vec4(position,1.)).xyz;
 float detail=1.-smoothstep(420.,550.,max(abs(position.x),abs(position.y)));
 wp.z=tide;
 #ifdef VERTEX_SLOPE
 resolvedSlope=vec2(0.);
 #endif
 if(detail>0.){
   wp.z+=detail*(swell.x*sin(swell.y+dot(wp.xy-swellCenter,swell.zw))+sampledHeightsAt(wp.xy).x+bowElevation(wp.xy)+wildlifeWave(wp.xy).x);
   #ifdef VERTEX_SLOPE
   float shortWaveDetail=1.-smoothstep(4.,10.,max(abs(position.x),abs(position.y)));
   #else
   float shortWaveDetail=1.-smoothstep(9.,21.,max(abs(position.x),abs(position.y)));
   #endif
   // Taper where the mesh undersamples the waves and at the vessel's waterline.
   if(referenceWind>2.&&shortWaveDetail>0.){
     vec2 along=vec2(cos(bearing),sin(bearing));
     vec2 local=vec2(dot(wp.xy,along),dot(wp.xy,vec2(-along.y,along.x)));
     float crest=${whitecaps.crestHeight};
     float strength=sqrt(clamp((referenceWind-2.)/11.,0.,1.2));
     shortWaveDetail*=smoothstep(2.8,5.,distance(wp.xy,boat.xy));
     wp.z+=strength*shortWaveDetail*(crest+.46*(crest*crest-${whitecaps.crestVariance.toFixed(7)}));
   }
   #ifdef VERTEX_SLOPE
   resolvedSlope=surfaceSlope(wp.xy)*detail;
   #endif
 }
 gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
 fragmentShader:lookup+oceanRippleGLSL+skyNoiseGLSL+field+foamPatchGLSL+`
 uniform sampler2D windMap,foamTexture,whitecapMap,swimmerFoam; uniform vec3 whitecapBounds; uniform float windFieldActive,windBlend,referenceWind,windPeriod,rippleScale;
 uniform vec3 underwaterFogColor;uniform float underwaterFogDensity;
 uniform highp sampler2D reflection,reflectionDepth,transmission; uniform mat4 mirrorMatrix,mirrorInverse;uniform vec2 viewport; uniform float under,wind,bearing;varying vec3 wp;
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
 uniform vec2 transmissionSize;uniform float airCapture;
 uniform sampler2D islandBedMap;uniform vec4 islandBedBounds;

 const float waterIOR=1.333;
 const vec3 waterExtinction=vec3(.22,.085,.055);
 float dielectricFresnel(float cosine,float eta){
   float transmitted=1.-(1.-cosine*cosine)/(eta*eta);
   if(transmitted<=0.)return 1.;
   float t=sqrt(transmitted);
   float s=(cosine-eta*t)/(cosine+eta*t);
   float p=(eta*cosine-t)/(eta*cosine+t);
   return .5*(s*s+p*p);
 }
 // GGX distribution with height-correlated Smith visibility. The
 // unresolved slopes contribute to the lobe instead of flickering.
 float sunReflection(vec3 n,vec3 eye,float slopeVariance){
   float nl=dot(n,sunDir),nv=dot(n,eye);
   if(nl<=0.||nv<=0.||sunDir.z<=0.)return 0.;
   vec3 h=normalize(sunDir+eye);
   float nh=max(0.,dot(n,h)),vh=clamp(dot(eye,h),0.,1.);
   float f=dielectricFresnel(vh,waterIOR);
   float q=1.+(slopeVariance-1.)*nh*nh;
   float d=slopeVariance/(3.14159265*q*q);
   float v=.5/(nl*sqrt(slopeVariance+(1.-slopeVariance)*nv*nv)
                   +nv*sqrt(slopeVariance+(1.-slopeVariance)*nl*nl));
   return f*d*v*nl;
 }
 float viewDepth(float z){return cameraRange.x*cameraRange.y/(cameraRange.y-z*(cameraRange.y-cameraRange.x));}
 // Unresolved refraction spreads a submerged detail over more pixels with
 // depth and surface slope variance. Retain the mean water radiance.
 float transmissionDetail(float path,float variance){return exp(-5.*variance*min(9.,path));}
 // Reconstruct color after the waterline test and attenuation of each texel.
 // Interpolating a hull depth with the distant seabed invents water between them.
 vec4 throughSample(vec2 uv,float surface,float rayScale,float edgeWidth,vec3 waterColor,vec2 bubbleLayer){
   float dz=viewDepth(texture2D(transmissionDepth,uv).r)-surface;
   if(dz<=-edgeWidth)return vec4(0.);
   float behind=smoothstep(-edgeWidth,edgeWidth,dz);
   float path=max(0.,dz*rayScale);
   if(path>=32.)return vec4(0.,0.,0.,behind);
   // A thin layer of breaking-wave bubbles extinguishes transmitted detail.
   float opticalDepth=bubbleLayer.x*min(path,bubbleLayer.y);
   vec3 attenuation=exp(-waterExtinction*path-opticalDepth)*(1.-smoothstep(16.,32.,path));
   return vec4(behind*attenuation*(texture2D(transmission,uv).rgb-waterColor),behind);
 }
 vec4 filteredThrough(vec2 uv,float surface,float rayScale,float edgeWidth,vec3 waterColor,vec2 bubbleLayer){
   vec2 pixel=uv*transmissionSize-.5,f=fract(pixel),texel=1./transmissionSize;
   vec2 lo=(floor(pixel)+.5)*texel;
   vec4 a=throughSample(lo,surface,rayScale,edgeWidth,waterColor,bubbleLayer);
   vec4 b=throughSample(lo+vec2(texel.x,0.),surface,rayScale,edgeWidth,waterColor,bubbleLayer);
   vec4 c=throughSample(lo+vec2(0.,texel.y),surface,rayScale,edgeWidth,waterColor,bubbleLayer);
   vec4 d=throughSample(lo+texel,surface,rayScale,edgeWidth,waterColor,bubbleLayer);
   return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
 }
 // At long range a submerged fin can occupy only a few capture texels.
 // A quadratic B-spline averages their depth-tested contributions without
 // creating intermediate depths or bleeding a dry silhouette into the water.
 vec4 distantThrough(vec2 uv,float surface,float rayScale,float edgeWidth,vec3 waterColor,vec2 bubbleLayer,float strength){
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
       total+=wx*wy*throughSample((centre+vec2(float(i),float(j))+.5)*texel,surface,rayScale,edgeWidth,waterColor,bubbleLayer);
     }
   }
   return total;
 }
 uniform int subPortCount;
 uniform vec4 subPorts[10];
 uniform vec3 subForwards[10];
 bool subWaterExcluded(vec3 surface){
   for(int i=0;i<10;++i){
     if(i>=subPortCount)break;
     vec3 p=surface-subPorts[i].xyz;
     float d2=dot(p,p);
     float r=subPorts[i].w,scale=r/.168;
     if(d2>1.25*scale*scale)continue;
     float axial=dot(p,subForwards[i]);
     if(axial>=0.){if(d2<r*r)return true;}
     else if(axial>=-1.08*scale && d2-axial*axial<.17*.17*scale*scale)return true;
   }
   return false;
 }
 vec3 surfaceColor(vec3 eye,float eyeDistance,float day){
   vec3 color;
   if(cruiserWaterExcluded(wp)||subWaterExcluded(wp))discard;
   vec4 air=texture2D(windMap,wp.xy/windPeriod+.5/48.);
   vec2 baseDir=vec2(cos(bearing),sin(bearing));
   float localSpeed=${windTextureRange}.*mix(air.r,air.g,windBlend);
   float rippleWind=mix(wind,${windTextureRange}.*mix(air.b,air.a,windBlend),windFieldActive);
   float windChop=smoothstep(3.5,13.,rippleWind);
   // Use the actual local wind and the Modelica short-wave response at this ENU position.
   float windDelta=(mix(localSpeed,rippleWind,.35)-referenceWind)/max(3.,referenceWind);
   // Short-wave roughness is visible out into the weaker shoulders of a
   // gust. Give those shoulders more contrast without changing wind loads.
   float puff=smoothstep(.015,.18,windDelta)*windFieldActive;
   float lull=smoothstep(.035,.17,-windDelta)*windFieldActive;
   vec2 p=vec2(dot(wp.xy,baseDir),dot(wp.xy,vec2(-baseDir.y,baseDir.x)));
   float fade=1.-smoothstep(16.,110.,eyeDistance);
   #ifdef VERTEX_SLOPE
   vec2 d=resolvedSlope;
   #else
   vec2 d=surfaceSlope(wp.xy);
   #endif
   vec4 swimmer=wildlifeWave(wp.xy);
   d+=swimmer.zw;
   d+=rippleScale*fade*rippleSlope(wp.xy,tm,baseDir,rippleWind)*(.62+1.02*windChop+.94*puff)*mix(1.,.24,lull);
   // Resolve fine wind rows nearby; their aggregate roughness stays visible farther out.
   float ripplePhase=12.*p.x+1.9*p.y-11.*tm+.8*sin(1.6*p.y+.5*tm);
   float resolved=1.-smoothstep(1.,3.,fwidth(ripplePhase));
   d+=baseDir*(.043*rippleScale*puff*resolved*fade*cos(ripplePhase));
   float breakingWind=mix(wind,localSpeed,windFieldActive);
   float roughSea=smoothstep(3.,13.,breakingWind);
   vec2 driftCoord=p-vec2(.025*breakingWind*tm,0.);
   vec2 driftUV=driftCoord*vec2(.22,.25);
   vec4 trace=texture2D(foamTexture,driftUV);
   float scum=trace.b;
   vec2 atlas=foamPatchUV(wp.xy-whitecapBounds.xy);
   float atlasWeight=1.-smoothstep(.36,.49,length(atlas-.5));
   vec2 whitecap=vec2(0.),seaSlope=vec2(0.);
   if(under<.5&&whitecapBounds.z>0.&&atlasWeight>0.){
     vec4 seaFoam=texture2D(whitecapMap,atlas);
     whitecap=seaFoam.rg*atlasWeight;
     seaSlope=atlasWeight*(seaFoam.ba-vec2(128./255.));
     d+=seaSlope*mix(1.,.32,lull);
   }
   vec3 n=normalize(vec3(-d,1.));vec3 ref=reflect(-eye,n);
   if(under>.5){
     vec3 ray=normalize(wp-cameraPosition);
     // Trace the underwater viewing ray across the water/air interface.
     vec3 skyRay=refract(ray,-n,waterIOR);
     float incidence=clamp(dot(ray,n),0.,1.);
     float transmissionGate=1.-dielectricFresnel(incidence,1./waterIOR);
     vec3 through=skyColor(normalize(skyRay+vec3(0.,0.,.0001)));
     // Look up dry geometry through Snell's window. Probe the depth on the
     // straight ray first, then reproject at that depth along the refracted ray.
     if(airCapture>.5 && transmissionGate>.001){
       vec4 surfaceClip=throughMatrix*vec4(wp,1.);
       vec2 uv=surfaceClip.xy/surfaceClip.w*.5+.5;
       float depth=texture2D(transmissionDepth,clamp(uv,0.,1.)).r;
       vec4 refractedDir=throughMatrix*vec4(skyRay,0.);
       if(refractedDir.w>.001){
         float travel=depth<.999999?clamp((viewDepth(depth)-surfaceClip.w)/refractedDir.w,0.,12.):1.;
         vec4 bent=surfaceClip+travel*refractedDir;
         uv=bent.xy/bent.w*.5+.5;
         if(all(greaterThan(uv,vec2(0.)))&&all(lessThan(uv,vec2(1.)))){
           depth=texture2D(transmissionDepth,uv).r;
           float hitDistance=(viewDepth(depth)-surfaceClip.w)/refractedDir.w;
           if(depth<.999999 && hitDistance>=0.){
             vec3 hit=wp+skyRay*hitDistance;
             float dry=smoothstep(-.012,.012,hit.z-heightAt(hit.xy));
             through=mix(through,texture2D(transmission,uv).rgb,dry);
           }
         }
       }
     }
     vec3 underside=mix(vec3(.006,.040,.061),vec3(.015,.14,.17),incidence)*(.24+.76*day);
     color=mix(underside,through,transmissionGate);
     color=mix(color,vec3(.48,.66,.67)*(.24+.76*day),.78*swimmer.y);
     vec3 attenuation=exp(-vec3(.18,.057,.032)*eyeDistance);
     color=mix(vec3(.013,.105,.145)*(.22+.78*day),color,attenuation);
   }else{
     float fres=dielectricFresnel(clamp(abs(dot(n,eye)),0.,1.),waterIOR);
     float back=pow(max(0.,dot(-eye,sunDir)),3.)*smoothstep(-.45,.9,wp.z-tide);
     vec3 waterColor=mix(vec3(.001,.008,.019),vec3(.004,.061,.093)+back*vec3(.012,.13,.10),day);
     waterColor=mix(waterColor,vec3(.009,.026,.036),storm*.80);
     float subpixel=max(smoothstep(.11,.85,length(fwidth(wp.xy))),1.-atlasWeight);
     // Integrate over unresolved facets at grazing angles. Reflected rays
     // below the local horizon see neighbouring water instead of bright sky.
     // The delayed short-wave response broadens the reflection of the sky,
     // so a gust remains visible after its individual ripples are subpixel.
     float slopeVariance=.00512*max(0.,rippleWind)*(1.+.65*puff)*mix(1.,.21,lull);
     float refractionVariance=max(0.,slopeVariance-.015)*(.4+.6*windChop);
     float spread=sqrt(slopeVariance)*(.55+.65*subpixel);
     float roughReflection=max(roughSea*mix(1.,.28,lull),.65*smoothstep(.002,.05,slopeVariance));
     float skyVisibility=mix(1.,smoothstep(-spread,.8*spread+.001,ref.z),roughReflection);
     vec3 skyDirection=normalize(vec3(ref.xy,max(0.,ref.z)+.55*spread*roughSea));
     vec3 reflectedSky=mix(.65*waterColor,sampleSky(skyDirection).rgb,skyVisibility);
     // Only aerated patches add extinction to the water's surface layer.
     vec2 bubbleLayer=vec2(2.1*whitecap.x+1.25*whitecap.y,.55/max(.22,abs(dot(eye,n))));
     vec2 islandUv=(wp.xy-islandBedBounds.xy)/islandBedBounds.zw;
     float shoreFoam=0.;
     if(all(greaterThan(islandUv,vec2(0.)))&&all(lessThan(islandUv,vec2(1.)))){
       vec2 sampleUv=(islandUv*vec2(74.,62.)+.5)/vec2(75.,63.);
       float bottom=-13.7+18.*texture2D(islandBedMap,sampleUv).r;
       float depth=max(0.,wp.z-bottom);
       // Approximate the two-way light path even where the seabed falls
       // outside the transmission capture.
       float downCos=sqrt(1.-(1.-sunDir.z*sunDir.z)/(waterIOR*waterIOR));
       float upCos=sqrt(1.-(1.-eye.z*eye.z)/(waterIOR*waterIOR));
       float viewPath=depth/upCos;
       vec3 bottomLight=exp(-waterExtinction*(depth/downCos+viewPath)-bubbleLayer.x*min(viewPath,bubbleLayer.y));
       vec3 sand=vec3(.30,.39,.29);
       waterColor=mix(waterColor,sand,day*(1.-.72*storm)*bottomLight*(1.-smoothstep(3.5,10.,depth))
         *transmissionDetail(viewPath,refractionVariance));
       // Shallow crests break when their height is a significant fraction
       // of the local depth. Keep the foam on those crests.
       float crest=wp.z-tide;
       shoreFoam=smoothstep(.05,.29,crest)*smoothstep(.05,.22,crest-.39*depth)
          *smoothstep(.29,.68,scum)*smoothstep(.025,.14,depth);
     }
     #ifdef SIMPLE_SURFACE
     vec3 reflected=reflectedSky;
     color=mix(waterColor,reflected,fres);
     #else
     vec3 levelNormal=vec3(0.,0.,1.);
     // Start the optical ray on the displaced water surface. At a hull
     // touching the water the reflection and the real hull have the same
     // projection. The sail is farther from the surface and bends more.
     vec4 clip=mirrorMatrix*vec4(wp,1.);
     vec4 rayDir=mirrorMatrix*vec4(ref,0.);
     float probeLength=clamp(.16*eyeDistance,.20,2.);
     vec4 mirrorRay=clip+rayDir*probeLength;
     vec2 probeUV=mirrorRay.xy/max(.001,mirrorRay.w)*.5+.5;
     if(mirrorRay.w>.001&&all(greaterThan(probeUV,vec2(0.)))&&all(lessThan(probeUV,vec2(1.)))){
       float probeDepth=texture2D(reflectionDepth,probeUV).r;
       if(probeDepth<1.){
         vec4 probeHit=mirrorInverse*vec4(2.*probeUV-1.,2.*probeDepth-1.,1.);
         if(abs(probeHit.w)>.00001){
           float travel=clamp(dot(probeHit.xyz/probeHit.w-wp,ref),0.,100.);
           mirrorRay=clip+rayDir*travel;
         }
       }
     }
     vec2 uv=mirrorRay.xy/max(.001,mirrorRay.w)*.5+.5;
     vec2 mirrorMargin=min(uv,1.-uv);
     float mirrorVisible=step(.001,mirrorRay.w)*smoothstep(0.,.018,min(mirrorMargin.x,mirrorMargin.y));
     // Broaden reflected detail where the pixel spans several short ripples.
     float mirrorBlur=smoothstep(6.,20.,eyeDistance)*(.65+1.4*roughSea*subpixel)*mix(1.,.22,lull);
     vec4 objects=texture2D(reflection,clamp(uv,.001,.999),mirrorBlur)*mirrorVisible;
     if(objects.a>.001 && eyeDistance<80.){
       float depth=texture2D(reflectionDepth,clamp(uv,.001,.999)).r;
       vec4 hit=mirrorInverse*vec4(2.*uv-1.,2.*depth-1.,1.);
       if(depth<1. && abs(hit.w)>.00001){
         vec3 worldHit=hit.xyz/hit.w;
         float forward=dot(worldHit-wp,ref);
         objects*=smoothstep(-.015,.015,worldHit.z-heightAt(worldHit.xy))
           *smoothstep(-.045,-.005,forward);
       }
     }
     vec3 reflected=reflectedSky*(1.-objects.a)+objects.rgb;
     // Compare both depths in the camera that captured the seabed.
     vec4 captureClip=throughMatrix*vec4(wp,1.);
     vec2 screen=captureClip.xy/max(.001,captureClip.w)*.5+.5;
     vec3 bentRay=refract(-eye,n,1./waterIOR),levelRay=refract(-eye,levelNormal,1./waterIOR);
     float surfaceDepth=captureClip.w;
     float rayScale=length(throughEye-wp)/max(.01,surfaceDepth);
     float straightDepth=viewDepth(texture2D(transmissionDepth,clamp(screen,.001,.999)).r);
     float opticalPath=clamp((straightDepth-surfaceDepth)*rayScale,0.,5.);
     // At a narrow guard or skid a neighbouring depth texel can belong to the
     // seabed, moving a near-surface object's refracted silhouette several metres.
     // Bound the bend by the short water path where a ray crosses a Piccard.
     for(int i=0;i<10;++i){
       if(i>=subPortCount)break;
       float scale=subPorts[i].w/.168;
       vec3 towardBody=subPorts[i].xyz-.51*scale*subForwards[i]-wp;
       float along=dot(towardBody,-eye);
       float rad2=max(0.,dot(towardBody,towardBody)-along*along);
       float weight=(1.-smoothstep(.60*scale*scale,scale*scale,rad2))*smoothstep(-.95*scale,-.70*scale,along);
       opticalPath=mix(opticalPath,min(opticalPath,max(.04*scale,along+.25*scale)),weight);
     }
     vec4 refractedClip=captureClip+throughMatrix*vec4(.60*opticalPath*(bentRay-levelRay),0.);
     vec2 refrUV=clamp(refractedClip.xy/max(.001,refractedClip.w)*.5+.5,.001,.999);
     float edgeWidth=max(.008,.5*fwidth(surfaceDepth));
     #ifdef MOBILE_WATER
     vec4 transmitted=filteredThrough(refrUV,surfaceDepth,rayScale,edgeWidth,waterColor,bubbleLayer);
     #else
     vec2 samplePixel=refrUV*transmissionSize;
     float footprint=max(length(dFdx(samplePixel)),length(dFdy(samplePixel)));
     float centrePath=max(0.,(viewDepth(texture2D(transmissionDepth,refrUV).r)-surfaceDepth)*rayScale);
     float blur=clamp(smoothstep(14.,38.,eyeDistance)*smoothstep(.6,3.,centrePath)
                      +.35*smoothstep(.75,2.,footprint),0.,1.);
     vec4 transmitted=blur>.025
       ?distantThrough(refrUV,surfaceDepth,rayScale,edgeWidth,waterColor,bubbleLayer,blur)
       :filteredThrough(refrUV,surfaceDepth,rayScale,edgeWidth,waterColor,bubbleLayer);
     #endif
     // A bent ray can land on the dry hull. Refill uncovered samples using
     // the straight ray, preserving the water path of each underlying texel.
     if(transmitted.a<.995){
       vec4 straight=filteredThrough(screen,surfaceDepth,rayScale,edgeWidth,waterColor,bubbleLayer);
       transmitted.rgb+=straight.rgb*max(0.,straight.a-transmitted.a)/max(.001,straight.a);
     }
     vec2 frameMargin=min(screen,1.-screen);
     float visible=smoothstep(0.,.025,min(frameMargin.x,frameMargin.y))*step(.001,surfaceDepth);
     color=mix(waterColor+visible*transmissionDetail(opticalPath,refractionVariance)*transmitted.rgb,reflected,fres);
     #endif
     // Rough patches scatter more light away from the view. Keep direct sun
     // glitter and foam above the darker surface so gusts are legible at sea level.
     color*=mix(vec3(1.),vec3(.62,.70,.75),puff*mix(.60,1.,day));
     float specular=sunReflection(n,eye,.0018+slopeVariance*(.04+.56*subpixel));
     if(specular>.00015)color+=vec3(4.4,3.8,2.8)*sampleSky(sunDir).a*specular;
     color+=vec3(.62,.7,1.)*pow(max(dot(ref,moonDir),0.),260.);
     // Fresh foam travels with the crest. Older foam travels with the surface
     // drift and stretches downwind into streaks separated by clear water.
     float detail=1.-smoothstep(.08,.55,length(fwidth(wp.xy)));
     // Across the crest, use the windward slope of the breaking wave. Along
     // it, the same pieces of froth travel with the lip as it rolls forward.
     float slope=dot(seaSlope,baseDir);
     vec2 lipUV=vec2(.19*p.y+.06*sin(.57*p.y+.22*(p.x-2.4*tm)),.48+.70*clamp(slope,-.28,.28));
     float core=texture2D(foamTexture,lipUV).g;
     float density=1.-exp(-2.65*whitecap.x);
     float fresh=density*mix(.86,.62+.38*core,detail);
     float film=1.-exp(-2.7*whitecap.y);
     float residue=film*(.07+.90*trace.r);
     float foam=1.-(1.-fresh)*(1.-.80*residue);
     if(bowFoamAvailable>.5&&nearBowField(wp.xy,4.)){
       vec2 local=bowLocal(wp.xy);
       vec2 flow=local+vec2(tm*clamp(.45*abs(boat.w),.4,2.8),0.);
       vec2 eddies=flow*vec2(7.5,11.);
       float swirl=noise2(eddies);
       float coverage=bowFoamCoverage(local+vec2(.042,-.08)*(swirl-.5));
       if(coverage>0.){
         vec2 cell=flow*vec2(32.,45.)+vec2(swirl*2.,11.);
         float pore=1.-abs(2.*noise2(cell)-1.);
         // Resolve the froth close to the hull and average microbubbles
         // below a pixel to keep the wake from flickering at a distance.
         float detail=1.-smoothstep(.45,1.7,37.*length(fwidth(wp.xy)));
         pore=mix(.58,pore,detail);
         float islands=smoothstep(.25,.79,.46*swirl+.54*pore);
         float aeration=smoothstep(.012,.74,coverage);
         foam=max(foam,aeration*(.18+.75*islands)*(.50+.22*swirl));
       }
     }
     if(swimmer.y>0.){
       vec2 drift=wp.xy-.10*tm*baseDir;
       float threads=texture2D(swimmerFoam,drift*.64).r;
       float flecks=texture2D(swimmerFoam,vec2(.80*drift.x+.60*drift.y,-.60*drift.x+.80*drift.y)*.37+.27).r;
       float wakeCover=smoothstep(.05,.79,min(1.,swimmer.y));
       float froth=smoothstep(.20,.68,.73*threads+.27*flecks+.16*wakeCover);
       foam=max(foam,wakeCover*(.11+.89*froth));
     }
     foam=max(foam,shoreFoam);

     float foamLight=day*(1.-.51*storm);
     vec3 foamColor=mix(vec3(.06,.10,.14),vec3(.88,.93,.94),foamLight);
     foamColor*=.80+.20*max(0.,dot(n,sunDir));
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
   if(under>.5){
     color*=exp(-vec3(.12,.096,.075)*max(0.,tide-cameraPosition.z));
     // Match the fog on nearby meshes where they intersect the water surface.
     float opticalDepth=underwaterFogDensity/gl_FragCoord.w;
     float zenith=max(0.,-eye.z);
     // Water-to-eye attenuation is already applied to transmitted sky above.
     // Toward the horizon, retain the same visibility as submerged geometry.
     float skyWindow=smoothstep(.50,.82,zenith);
     float visibility=mix(exp(-opticalDepth*opticalDepth),1.,skyWindow);
     // Daylight scattered down from the surface makes the upper water column
     // brighter even just outside the refracted window. It fades with depth.
     vec3 downwelling=vec3(.018,.110,.145)*day*(1.-.40*storm)*
       exp(-.064*max(0.,tide-cameraPosition.z))*zenith*zenith;
     color=mix(underwaterFogColor+downwelling,color+downwelling,visibility);
   }
   gl_FragColor=vec4(color,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
 }`}));
 scene.add(water);

 const sternField=sternFoamField(U),bowSprayArea=new Float64Array(4);
 const trails=cruiserSurface?null:sailingFoam(U,sternField);
 function updateHullFoam(strips,time,speed,cat,cruiser=false,jets,frame,sternTrail){
   if(cruiser)sternField.sample(sternTrail);
   else trails?.sample(strips,time,speed,cat);
   if(cat||(cruiser&&jets&&frame)){
     spray??=makeSpray(THREE,scene,'Bow spray',4,sampleSurface,{bow:true});
     if(jets&&frame){spray.sampleShoulders(time,jets,frame);return;}
     if(!strips)return;
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
       if(U.bowAvailable.value&&r<bowLength/2){
         const c=Math.cos(boat.z),s=Math.sin(boat.z),dx=east-boat.x,dy=north-boat.y;
         const u=dx*c+dy*s,v=-dx*s+dy*c;
         h+=(sample(bowBytes,32,32*u/bowLength,32*v/bowLength,blend)-32768)/8192;
       }
     }
     h+=(packed-32768)/8192;
   }
   if(optical)h+=swimmerWater.elevation(east,north);
   return h;
 }
 const mirrorCamera=new THREE.PerspectiveCamera(),reflectRT=new THREE.WebGLRenderTarget(512,320),throughRT=new THREE.WebGLRenderTarget(512,320);
 // Mip-filter thin silhouettes as ripple distortion minifies the reflected image.
 reflectRT.depthTexture=new THREE.DepthTexture(512,320,THREE.UnsignedIntType);
 U.reflectionDepth={value:reflectRT.depthTexture};U.mirrorInverse={value:new THREE.Matrix4()};
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
 let simpleCapture=false,captureScale=1,baseThroughWidth=320,baseThroughHeight=200;
 function clipReflectionAtSurface(){
   // Replace the reflected camera's near plane. Geometry is clipped in the
   // rasterizer, so the reflection uses the regular material programs.
   if(mirrorClip.distanceToPoint(mirrorCamera.position)>=0)return false;
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
 function capture(renderer,camera,submergedScenery,terrain){
   camera.updateMatrixWorld();
   const oldBackground=scene.background,oldFog=scene.fog;
   const sprayVisible=spray?.points.visible;
   if(spray)spray.points.visible=false;
   water.visible=false;dome.visible=false;scene.fog=null;
   {
     camera.getWorldDirection(mirrorLook).add(camera.position);
     mirrorCamera.copy(camera);
     if(simpleCapture)mirrorCamera.layers.set(waterCaptureLayer);
     const surfaceZ=sampleSurface(water.position.x,water.position.y,true);
     const twiceHeight=2*surfaceZ;
     mirrorCamera.position.z=twiceHeight-camera.position.z;mirrorLook.z=twiceHeight-mirrorLook.z;
     mirrorCamera.up.setFromMatrixColumn(camera.matrixWorld,1);mirrorCamera.up.z*=-1;mirrorCamera.lookAt(mirrorLook);mirrorCamera.updateMatrixWorld();
     // A crest between two hulls can be higher than their waterlines. Keep
     // their lowest local surface in the capture. The depth sample in the
     // water shader clips each hit to its wave at the actual hit position.
     const bx=water.position.x,by=water.position.y,r=3;
     const floor=Math.min(surfaceZ,sampleSurface(bx-r,by,true),sampleSurface(bx+r,by,true),
       sampleSurface(bx,by-r,true),sampleSurface(bx,by+r,true));
     mirrorClip.constant=-floor+.035;
     const obliqueClip=clipReflectionAtSurface();
     U.mirrorMatrix.value.multiplyMatrices(mirrorCamera.projectionMatrix,mirrorCamera.matrixWorldInverse);
     U.mirrorInverse.value.copy(U.mirrorMatrix.value).invert();
     scene.background=null;
     renderer.setClearColor(0x000000,0);renderer.setRenderTarget(reflectRT);
     if(!obliqueClip)renderer.clippingPlanes=[mirrorClip];
     const hideSubmerged=submergedScenery && U.tide.value>=0 && submergedScenery.visible;
     const range=terrain?.userData.reflectionRange;
     if(hideSubmerged){
       submergedScenery.visible=false;
       if(range)terrain.setDrawRange(range.start,range.count);
     }
     try {renderer.render(scene,mirrorCamera);} finally {
       if(!obliqueClip)renderer.clippingPlanes=[];
       if(hideSubmerged){
         submergedScenery.visible=true;
         if(range)terrain.setDrawRange(0,Infinity);
       }
     }
   }
   {
     U.throughMatrix.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
     U.throughEye.value.copy(camera.position);U.cameraRange.value.set(camera.near,camera.far);
     renderer.getDrawingBufferSize(U.viewport.value);
     let closeHousing=false;
     const ports=U.subPorts.value;
     for(let i=0;i<U.subPortCount.value;i++){
       if(Math.hypot(camera.position.x-ports[4*i],camera.position.y-ports[4*i+1],
         camera.position.z-ports[4*i+2])<16){closeHousing=true;break;}
     }
     const view=U.viewport.value,nearScale=Math.min(1,768/Math.max(1,view.x,view.y));
     const width=closeHousing?Math.max(baseThroughWidth,Math.round(nearScale*view.x)):baseThroughWidth;
     const height=closeHousing?Math.max(baseThroughHeight,Math.round(nearScale*view.y)):baseThroughHeight;
     if(throughRT.width!==width||throughRT.height!==height){
       throughRT.setSize(width,height);U.transmissionSize.value.set(width,height);
     }
     renderer.setRenderTarget(throughRT);scene.background=clearThrough;
     const viewLayers=camera.layers.mask;
     if(simpleCapture)camera.layers.set(waterCaptureLayer);
     try {renderer.render(scene,camera);} finally {camera.layers.mask=viewLayers;}
   }
   renderer.setRenderTarget(null);
   scene.fog=oldFog;scene.background=oldBackground;water.visible=true;dome.visible=true;
   if(spray)spray.points.visible=sprayVisible;
 }
 // Each submerged view has its own projection, including camera thumbnails.
 // Reuse the transmission sampler slots so the water still fits mobile GPU limits.
 const airTargets=Array.from({length:2},()=>{
   const rt=new THREE.WebGLRenderTarget(1,1);
   rt.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
   return rt;
 });
 const airMatrix=new THREE.Matrix4(),airRange=new THREE.Vector2();
 const airCamera=new THREE.PerspectiveCamera(),viewDir=new THREE.Vector3(),clearBefore=new THREE.Color();
 U.airCapture={value:0};
 function renderThroughAir(renderer,eye,thumbnail,draw){
   eye.getWorldDirection(viewDir);
   const halfAngle=Math.atan(Math.tan(THREE.MathUtils.degToRad(eye.fov/2))*Math.hypot(1,eye.aspect));
   if(viewDir.z<=-Math.sin(halfAngle)||eye.position.z<U.tide.value-35){draw();return;}
   const destination=renderer.getRenderTarget(),background=scene.background,fog=scene.fog;
   const alpha=renderer.getClearAlpha();renderer.getClearColor(clearBefore);
   const oldWater=water.visible,oldDome=dome.visible;
   const airRT=airTargets[Number(thumbnail)];
   const width=thumbnail?192:Math.min(768,Math.max(256,renderer.domElement.width));
   airRT.setSize(width,Math.max(1,Math.round(width/eye.aspect)));
   airCamera.copy(eye,false);airCamera.far=Math.min(eye.far,250);airCamera.updateProjectionMatrix();airCamera.updateMatrixWorld();
   airMatrix.multiplyMatrices(airCamera.projectionMatrix,airCamera.matrixWorldInverse);
   airRange.set(airCamera.near,airCamera.far);
   try{
     water.visible=false;dome.visible=false;scene.background=null;scene.fog=null;
     renderer.setRenderTarget(airRT);renderer.setClearColor(0,0);renderer.render(scene,airCamera);
   }finally{
     renderer.setRenderTarget(destination);renderer.setClearColor(clearBefore,alpha);
     scene.background=background;scene.fog=fog;water.visible=oldWater;dome.visible=oldDome;
   }
   const oldMatrix=U.throughMatrix.value,oldRange=U.cameraRange.value;
   U.throughMatrix.value=airMatrix;U.cameraRange.value=airRange;
   U.transmission.value=airRT.texture;U.transmissionDepth.value=airRT.depthTexture;U.airCapture.value=1;
   try{draw();}finally{
     U.airCapture.value=0;U.throughMatrix.value=oldMatrix;U.cameraRange.value=oldRange;
     U.transmission.value=throughRT.texture;U.transmissionDepth.value=throughRT.depthTexture;
   }
 }
 function setQuality(profile,vertexSlope,multisampling,mobileWater=false){
   const compactMobile=mobileWater&&profile.compactOnMobile;
   const lowMobileHobie=mobileWater&&hobieSurface&&profile.omitWake;
   const compact=compactMobile||lowMobileHobie||(hobieSurface&&!profile.omitWake);
   const meshKey=compact?'compact':profile.mesh;
   if(waterMeshKey!==meshKey){
     water.geometry.dispose();
     water.geometry=compact?compactWaterMesh():waterMesh(profile.mesh);
     waterMeshKey=meshKey;
   }
   // Match the optical foam map to the small drawing buffer on a Low touch-device Hobie.
   const foamResolution=vertexSlope||mobileWater||profile.skipCaptures?320:512;
   whitecaps.setResolution(lowMobileHobie?192:foamResolution);
   simpleCapture=vertexSlope;
   water.material.defines=vertexSlope||compactMobile?{VERTEX_SLOPE:1}:{};
   if(vertexSlope)water.material.defines.DISABLE_BOW_FIELD=1;
   if(mobileWater)water.material.defines.MOBILE_WATER=1;
   if(profile.skipCaptures)water.material.defines.SIMPLE_SURFACE=1;
   if(profile.omitWake)water.material.defines.DISABLE_STERN_FOAM=1;
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
   baseThroughWidth=Math.max(320,width);baseThroughHeight=Math.max(200,height);
   throughRT.setSize(baseThroughWidth,baseThroughHeight);U.transmissionSize.value.set(baseThroughWidth,baseThroughHeight);
 }
 return {U,dome,water,renderThroughAir,updateWhitecaps:whitecaps.update,dispose(){airTargets.forEach(rt=>rt.dispose());whitecaps.dispose();U.foamTexture.value.dispose();swimmerFoam.dispose();sternField.dispose();},drawSpray:t=>spray?.draw(t),swimmerWater,sampleSurface,sampleWind,readBowGrid,update,updateSpectrum,updateHullSpectrum,updateHullFoam,clearWake,updateWind,capture,setQuality,resizeCaptures,updateSky};
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
