import {forEachGridEdge,surfaceGridColor} from './physics-geometry.mjs';

const waveVertex=`attribute vec2 waveCenter;
attribute vec4 waveSwell;
uniform float patchRadius;
varying vec2 localPoint;
varying vec3 worldPoint;
varying vec2 slope;
void setWave(float lift){
  localPoint=position.xy;
  vec2 offset=patchRadius*localPoint;
  float phase=waveSwell.w+dot(waveSwell.yz,offset);
  slope=waveSwell.x*cos(phase)*waveSwell.yz;
  worldPoint=vec3(waveCenter+offset,waveSwell.x*sin(phase)+lift);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(worldPoint,1.);
}`;

// Draw the surface and its grid from the same Modelica swell samples.
export function trainingWaveView(T,scene,capacity,halfWidth){
  const divisions=12,side=divisions+1,positions=[],strength=[];
  forEachGridEdge(side,side,(i,j,line)=>{
    const major=Number(line%3===0);
    for(const node of [i,j]){
      positions.push(2*(node%side)/divisions-1,2*Math.floor(node/side)/divisions-1,0);
      strength.push(major);
    }
  });
  const centers=new Float32Array(2*capacity),swells=new Float32Array(4*capacity);
  const center=new T.InstancedBufferAttribute(centers,2).setUsage(T.DynamicDrawUsage);
  const swell=new T.InstancedBufferAttribute(swells,4).setUsage(T.DynamicDrawUsage);
  const patchRadius={value:halfWidth};
  function geometry(position,index){
    const shape=new T.InstancedBufferGeometry();
    shape.setAttribute('position',position);
    if(index)shape.setIndex(index);
    shape.setAttribute('waveCenter',center);shape.setAttribute('waveSwell',swell);shape.instanceCount=0;
    return shape;
  }
  const plane=new T.PlaneGeometry(2,2,divisions,divisions);
  const surface=new T.Mesh(geometry(plane.attributes.position,plane.index),new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{patchRadius},
    vertexShader:`${waveVertex}\nvoid main(){setWave(0.);}`,
    fragmentShader:`varying vec2 localPoint;varying vec3 worldPoint;varying vec2 slope;
      void main(){
        float edge=max(abs(localPoint.x),abs(localPoint.y));
        float visibility=1.-smoothstep(.70,1.,edge);
        float ripple=sin(dot(worldPoint.xy,vec2(2.8,1.7)))+.55*sin(dot(worldPoint.xy,vec2(-1.2,3.4)));
        vec3 normal=normalize(vec3(-slope+vec2(.065,-.05)*ripple,1.));
        vec3 view=normalize(cameraPosition-worldPoint);
        float grazing=pow(1.-max(0.,dot(view,normal)),3.);
        float light=.5+.5*dot(normal,normalize(vec3(.30,-.65,.6)));
        vec3 water=mix(vec3(.016,.09,.13),vec3(.060,.21,.28),light);
        water=mix(water,vec3(.19,.39,.48),.7*grazing);
        gl_FragColor=vec4(water,visibility*.92);
        #include <colorspace_fragment>
      }`
  }));
  const lattice=geometry(new T.Float32BufferAttribute(positions,3));
  lattice.setAttribute('majorLine',new T.Float32BufferAttribute(strength,1));
  const grid=new T.LineSegments(lattice,new T.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:{patchRadius,color:{value:new T.Color(surfaceGridColor)}},
    vertexShader:`${waveVertex}
      attribute float majorLine;varying float lineStrength;
      void main(){lineStrength=majorLine;setWave(.018);}`,
    fragmentShader:`varying float lineStrength;varying vec2 localPoint;uniform vec3 color;
      void main(){
        float edge=max(abs(localPoint.x),abs(localPoint.y));
        float visibility=1.-.65*smoothstep(.77,1.,edge);
        gl_FragColor=vec4(color,mix(.63,.96,lineStrength)*visibility);
        #include <colorspace_fragment>
      }`
  }));
  surface.name='Local swell surface';grid.name='Local swell grids';grid.renderOrder=1;
  for(const mesh of [surface,grid])mesh.frustumCulled=false;
  scene.add(surface,grid);
  return {set(i,x,y,amplitude,k,bearing,phase){
    centers[2*i]=x;centers[2*i+1]=y;
    swells[4*i]=amplitude;swells[4*i+1]=k*Math.cos(bearing);swells[4*i+2]=k*Math.sin(bearing);swells[4*i+3]=phase;
  },flush(count,focused){
    patchRadius.value=focused?12:halfWidth;
    surface.geometry.instanceCount=grid.geometry.instanceCount=count;
    center.needsUpdate=swell.needsUpdate=true;
  },dispose(){
    for(const mesh of [surface,grid]){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}
  }};
}
