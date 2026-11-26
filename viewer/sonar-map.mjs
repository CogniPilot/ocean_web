// Fan echoes have measured slant range and bearing. Four-beam DVL lock also
// supplies height-resolved intersections from the calibrated downward beams.
export function sonarMap(T, scene) {
  const maxKeys = 48, rays = 48, stride = 180, capacity = maxKeys * rays;
  const centers = new Float32Array(capacity * 3);
  const beams = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const widths = new Float32Array(capacity);
  const track = new Float32Array(maxKeys * 3);
  const dvlPoints = new Float32Array(maxKeys * 4 * 3);
  const dvlGeometry = new T.BufferGeometry();
  dvlGeometry.setAttribute('position', new T.BufferAttribute(dvlPoints, 3).setUsage(T.DynamicDrawUsage));
  dvlGeometry.setDrawRange(0, 0);
  const dvl = new T.Points(dvlGeometry, new T.PointsMaterial({
    color: 0xecfcff, size: .12, fog: false, depthTest: false, depthWrite: false
  }));
  const tilt = new T.Euler(0, 0, 0, 'ZYX'), ray = new T.Vector3();
  const sinBeam = Math.sin(Math.PI / 8), cosBeam = Math.cos(Math.PI / 8);
  const dvlAxes = [[sinBeam,0],[-sinBeam,0],[0,sinBeam],[0,-sinBeam]];
  const splatGeometry = new T.InstancedBufferGeometry();
  const quad = new T.PlaneGeometry(2, 2);
  splatGeometry.index = quad.index;
  splatGeometry.setAttribute('position', quad.getAttribute('position'));
  splatGeometry.setAttribute('center', new T.InstancedBufferAttribute(centers, 3).setUsage(T.DynamicDrawUsage));
  splatGeometry.setAttribute('beam', new T.InstancedBufferAttribute(beams, 3).setUsage(T.DynamicDrawUsage));
  splatGeometry.setAttribute('echoColor', new T.InstancedBufferAttribute(colors, 3).setUsage(T.DynamicDrawUsage));
  splatGeometry.setAttribute('width', new T.InstancedBufferAttribute(widths, 1).setUsage(T.DynamicDrawUsage));
  splatGeometry.instanceCount = 0;
  const splats = new T.Mesh(splatGeometry, new T.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    vertexShader: `
      attribute vec3 center,beam,echoColor;
      attribute float width;
      varying vec2 offset;
      varying vec3 tint;
      void main() {
        vec3 direction=mat3(modelViewMatrix)*beam;
        float inPlane=dot(direction.xy,direction.xy);
        vec2 axis=inPlane>.0001 ? direction.xy*inversesqrt(inPlane) : vec2(1.,0.);
        vec2 across=vec2(-axis.y,axis.x);
        // Project the beam-aligned 3D covariance onto the view plane.
        float axial=.075;
        float along=sqrt(mix(width*width,axial*axial,clamp(inPlane,0.,1.)));
        offset=3.*position.xy;
        tint=echoColor;
        vec4 p=modelViewMatrix*vec4(center,1.);
        p.xy+=axis*along*offset.x+across*width*offset.y;
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader: `
      varying vec2 offset;
      varying vec3 tint;
      void main() {
        float radius2=dot(offset,offset);
        if(radius2>9.)discard;
        gl_FragColor=vec4(tint,.46*exp(-.5*radius2));
        #include <colorspace_fragment>
      }`
  }));
  const trackGeometry = new T.BufferGeometry();
  trackGeometry.setAttribute('position', new T.BufferAttribute(track, 3).setUsage(T.DynamicDrawUsage));
  trackGeometry.setDrawRange(0, 0);
  const path = new T.Line(trackGeometry, new T.LineBasicMaterial({
    color: 0xffaf53, fog: false, depthTest: false, depthWrite: false, transparent: true
  }));
  const group = new T.Group();
  splats.frustumCulled = path.frustumCulled = dvl.frustumCulled = false;
  splats.renderOrder = 10;
  path.renderOrder = 11;
  group.visible = false;
  dvl.renderOrder = 12;
  group.add(splats, path, dvl);
  scene.add(group);
  return {
    group,
    update(rows) {
      let hits = 0, dvlCount = 0;
      const count = Math.min(maxKeys, Math.floor(rows.length / stride));
      for (let key = 0; key < count; key++) {
        const base = key * stride, x = rows[base], y = rows[base+1], z = rows[base+2];
        const c = Math.cos(rows[base+3]), s = Math.sin(rows[base+3]);
        track.set([x, y, z], 3*key);
        const packedTilt = rows[base + 175];
        if (packedTilt > 0) {
          const code = packedTilt - 1;
          const roll = (Math.floor(code / 2048) - 1800) * Math.PI / 1800;
          const pitch = (code % 2048 - 900) * Math.PI / 1800;
          tilt.set(roll, pitch, rows[base+3], 'ZYX');
          for (let beam = 0; beam < 4; beam++) {
            const range = rows[base + 176 + beam];
            const [forward, port] = dvlAxes[beam];
            ray.set(range * forward, range * port, -.075 - range * cosBeam).applyEuler(tilt);
            dvlPoints.set([x + ray.x, y + ray.y, z + ray.z], 3*dvlCount++);
          }
        }
        for (let ray = 0; ray < rays; ray++) {
          const offset = base + 8 + ray*3;
          const dx = rows[offset], dy = rows[offset+1], dz = rows[offset+2];
          const range = Math.hypot(dx, dy, dz);
          if (!range) continue;
          const east = c*dx-s*dy, north = s*dx+c*dy;
          centers.set([x+east, y+north, z+dz], 3*hits);
          beams.set([east/range, north/range, dz/range], 3*hits);
          colors.set(dz < -.2 ? [.009,.25,.76] : dz > .2 ? [.84,.59,.05] : [.036,.72,.37], 3*hits);
          widths[hits] = Math.min(.28, .085 + .011*range);
          hits++;
        }
      }
      for (const name of ['center', 'beam', 'echoColor', 'width']) {
        splatGeometry.attributes[name].needsUpdate = true;
      }
      dvlGeometry.attributes.position.needsUpdate = true;
      dvlGeometry.setDrawRange(0, dvlCount);
      trackGeometry.attributes.position.needsUpdate = true;
      splatGeometry.instanceCount = hits;
      trackGeometry.setDrawRange(0, count);
    }
  };
}
