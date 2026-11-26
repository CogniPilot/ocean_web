function makeRotor(T,sub,id,center,axis,material,hubMaterial){
 const pod=new T.Group();pod.position.fromArray(center);
 pod.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(...axis));
 sub.add(pod);
 const rotor=new T.Group();pod.add(rotor);
 const hub=new T.Mesh(new T.SphereGeometry(.0125,14,10),hubMaterial);hub.scale.z=1.6;rotor.add(hub);
 const handed=id%2===0?1:-1;
 const profile=new T.Shape();profile.moveTo(.006,-.003);profile.quadraticCurveTo(.024,-.0095,.0425,.004);
 profile.quadraticCurveTo(.0415,.0115,.0315,.012);profile.quadraticCurveTo(.0275,.006,.009,.0045);profile.closePath();
 const blade=new T.ExtrudeGeometry(profile,{depth:.0015,bevelEnabled:false,curveSegments:6});
 for(let i=0;i<3;i++){
   const m=new T.Mesh(blade,material);m.rotation.z=i*2*Math.PI/3;m.rotation.x=.14*handed;rotor.add(m);
 }
 return {center:new T.Vector3(...center),axis:new T.Vector3(...axis),rotor,handed};
}
function bubbleWake(T,scene,sub,includeInWater){
 const limit=800,xyz=new Float32Array(limit*3),strength=new Float32Array(limit),life=new Float32Array(limit),velocity=new Float32Array(limit*3);
 const geometry=new T.BufferGeometry(),pos=new T.BufferAttribute(xyz,3),alpha=new T.BufferAttribute(strength,1);
 geometry.setAttribute('position',pos);geometry.setAttribute('strength',alpha);
 const maxCssDiameter=5.6;
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{pixels:{value:500},maxDiameter:{value:maxCssDiameter}},
   vertexShader:`attribute float strength;
     uniform float pixels,maxDiameter;
     varying float a;
     void main(){
       vec4 p=modelViewMatrix*vec4(position,1.);
       gl_Position=projectionMatrix*p;
       // Project a 4.4 mm bubble into the current render target.
       float diameter=min(maxDiameter,.0022*pixels*projectionMatrix[1][1]/max(.05,-p.z));
       gl_PointSize=max(1.,diameter);
       // Hardware rasterizes one pixel minimum. Preserve subpixel area in alpha.
       a=strength*min(1.,diameter*diameter);
     }`,
   fragmentShader:'varying float a;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.||a<=0.)discard;gl_FragColor=vec4(.75,.94,.98,a*(.2+.7*smoothstep(.45,.86,r))*(1.-smoothstep(.86,1.,r)));}'});
 const points=new T.Points(geometry,material);points.frustumCulled=false;includeInWater(points);scene.add(points);
 const viewport=new T.Vector4();
 points.onBeforeRender=renderer=>{
   const height=renderer.getCurrentViewport(viewport).w;
   material.uniforms.pixels.value=height;
   material.uniforms.maxDiameter.value=maxCssDiameter*height/Math.max(1,renderer.domElement.clientHeight);
 };
 const outlet=new T.Vector3();
 const fractions=Array(sub.userData.rotors.length).fill(0),origin=new T.Vector3(),jet=new T.Vector3();
 let head=0;
 return (dt,rpm,cavitation,current,height,surfaceAt)=>{
   for(let i=0;i<limit;i++)if(life[i]>0){
     life[i]-=dt;strength[i]=Math.min(.85,Math.max(0,life[i]*2));
     for(let k=0;k<3;k++)xyz[3*i+k]+=dt*velocity[3*i+k];
   }
   sub.userData.rotors.forEach(({center,axis,rotor,handed},i)=>{
     rotor.rotation.z=(rotor.rotation.z+handed*rpm[i]*Math.PI/30*dt)%(2*Math.PI);
     if(!dt||!rpm[i])return;
     origin.copy(center).applyQuaternion(sub.quaternion).add(sub.position);
     jet.copy(axis).applyQuaternion(sub.quaternion).multiplyScalar(-Math.sign(rpm[i]));
     // A loaded prop near the surface can entrain air before reaching cavitation.
     const surface=surfaceAt&&origin.z> -2?surfaceAt(origin.x,origin.y,true):undefined;
     const depth=surface===undefined?Infinity:surface-origin.z;
     const immersion=.0425*Math.sqrt(Math.max(0,1-jet.z*jet.z));
     if(depth<=-immersion)return;
     const loading=Math.min(1,Math.abs(rpm[i])/1000);
     const ventilation=Math.max(0,1-Math.max(0,depth-immersion)/.085)*loading*loading;
     // Trace entrained microbubbles in every active jet. Ventilation and
     // simulated cavitation add a denser plume at their own outlets.
     const wash=18*loading;
     fractions[i]+=dt*(wash+120*cavitation[i]+36*ventilation);
     while(fractions[i]>=1){
       fractions[i]--;
       // Seed in the blade annulus just outside the downstream lip of each guard.
       const angle=2*Math.PI*Math.random(),radius=.02+.02*Math.random();
       outlet.set(radius*Math.cos(angle),radius*Math.sin(angle),-.0275*Math.sign(rpm[i]))
         .applyQuaternion(rotor.parent.quaternion).applyQuaternion(sub.quaternion).add(origin);
       if(surface!==undefined&&outlet.z>surface)continue;
       const id=head++%limit;life[id]=.25+.55*Math.random();strength[id]=.8;
       for(let k=0;k<3;k++){
         const j=jet.getComponent(k);xyz[3*id+k]=outlet.getComponent(k);
         velocity[3*id+k]=current[k]+j*(.35+Math.abs(rpm[i])*.00035)+.17*(Math.random()-.5)+(k===2?.23:0);
       }
     }
   });
   pos.needsUpdate=true;alpha.needsUpdate=true;
 };
}
