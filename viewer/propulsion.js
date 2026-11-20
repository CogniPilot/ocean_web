function makeRotor(T,sub,id,center,axis,material,hubMaterial){
 const pod=new T.Group();pod.position.fromArray(center);
 pod.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(...axis));
 sub.add(pod);
 const rotor=new T.Group();pod.add(rotor);
 const hub=new T.Mesh(new T.SphereGeometry(.025,14,10),hubMaterial);hub.scale.z=1.6;rotor.add(hub);
 const handed=id%2===0?1:-1;
 const profile=new T.Shape();profile.moveTo(.012,-.006);profile.quadraticCurveTo(.048,-.019,.085,.008);
 profile.quadraticCurveTo(.083,.023,.063,.024);profile.quadraticCurveTo(.055,.012,.018,.009);profile.closePath();
 const blade=new T.ExtrudeGeometry(profile,{depth:.003,bevelEnabled:false,curveSegments:6});
 for(let i=0;i<3;i++){
   const m=new T.Mesh(blade,material);m.rotation.z=i*2*Math.PI/3;m.rotation.x=.14*handed;rotor.add(m);
 }
 return {center:new T.Vector3(...center),axis:new T.Vector3(...axis),rotor,handed};
}
function bubbleWake(T,scene,sub){
 const limit=800,xyz=new Float32Array(limit*3),strength=new Float32Array(limit),life=new Float32Array(limit),velocity=new Float32Array(limit*3);
 const geometry=new T.BufferGeometry(),pos=new T.BufferAttribute(xyz,3),alpha=new T.BufferAttribute(strength,1);
 geometry.setAttribute('position',pos);geometry.setAttribute('strength',alpha);
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{pixels:{value:500}},
   vertexShader:'attribute float strength;uniform float pixels;varying float a;void main(){a=strength;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(pixels*.012/max(.1,-p.z),1.,8.);}',
   fragmentShader:'varying float a;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.||a<=0.)discard;gl_FragColor=vec4(.75,.94,.98,a*(.2+.7*smoothstep(.45,.86,r))*(1.-smoothstep(.86,1.,r)));}'});
 const points=new T.Points(geometry,material);points.frustumCulled=false;scene.add(points);
 const fractions=Array(7).fill(0),origin=new T.Vector3(),jet=new T.Vector3();
 let head=0;
 return (dt,rpm,cavitation,current,height)=>{
   material.uniforms.pixels.value=height;
   for(let i=0;i<limit;i++)if(life[i]>0){
     life[i]-=dt;strength[i]=Math.min(.85,Math.max(0,life[i]*2));
     for(let k=0;k<3;k++)xyz[3*i+k]+=dt*velocity[3*i+k];
   }
   sub.userData.rotors.forEach(({center,axis,rotor,handed},i)=>{
     rotor.rotation.z=(rotor.rotation.z+handed*rpm[i]*Math.PI/30*dt)%(2*Math.PI);
     fractions[i]+=120*cavitation[i]*dt;
     origin.copy(center).applyQuaternion(sub.quaternion).add(sub.position);
     jet.copy(axis).applyQuaternion(sub.quaternion).multiplyScalar(-Math.sign(rpm[i]));
     while(fractions[i]>=1){
       fractions[i]--;const id=head++%limit;life[id]=.25+.55*Math.random();strength[id]=.8;
       for(let k=0;k<3;k++){
         const j=jet.getComponent(k);xyz[3*id+k]=origin.getComponent(k)+.04*j+.045*(Math.random()-.5);
         velocity[3*id+k]=current[k]+j*(.35+Math.abs(rpm[i])*.00035)+.17*(Math.random()-.5)+(k===2?.23:0);
       }
     }
   });
   pos.needsUpdate=true;alpha.needsUpdate=true;
 };
}
