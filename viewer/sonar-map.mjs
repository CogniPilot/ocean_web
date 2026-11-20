// The estimator stores 48 leveled sonar endpoints in each optimized keyframe.
export function sonarMap(T, scene) {
  const maxKeys = 48, rays = 48, stride = 180;
  const positions = new Float32Array(maxKeys * rays * 3);
  const colors = new Float32Array(positions.length);
  const track = new Float32Array(maxKeys * 3);
  const pointsGeometry = new T.BufferGeometry();
  const trackGeometry = new T.BufferGeometry();
  pointsGeometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  pointsGeometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  trackGeometry.setAttribute('position', new T.BufferAttribute(track, 3));
  const points = new T.Points(pointsGeometry, new T.PointsMaterial({
    size: 3, sizeAttenuation: false, vertexColors: true, fog: false, depthTest: false
  }));
  const path = new T.Line(trackGeometry, new T.LineBasicMaterial({
    color: 0xffaf53, fog: false, depthTest: false
  }));
  const group = new T.Group();
  points.frustumCulled = path.frustumCulled = false;
  points.renderOrder = path.renderOrder = 10;
  pointsGeometry.setDrawRange(0, 0);
  trackGeometry.setDrawRange(0, 0);
  group.visible = false;
  group.add(points, path);
  scene.add(group);
  return {
    group,
    update(rows) {
      let hits = 0;
      const count = rows.length / stride;
      for (let key = 0; key < count; key++) {
        const base = key * stride, x = rows[base], y = rows[base+1], z = rows[base+2];
        const c = Math.cos(rows[base+3]), s = Math.sin(rows[base+3]);
        track.set([x, y, z], 3*key);
        for (let ray = 0; ray < rays; ray++) {
          const offset = base + 8 + ray*3;
          const dx = rows[offset], dy = rows[offset+1], dz = rows[offset+2];
          if (dx === 0 && dy === 0 && dz === 0) continue;
          positions.set([x+c*dx-s*dy, y+s*dx+c*dy, z+dz], 3*hits);
          colors.set(dz < -.2 ? [.16,.68,1] : dz > .2 ? [1,.88,.35] : [.31,1,.76], 3*hits);
          hits++;
        }
      }
      pointsGeometry.attributes.position.needsUpdate = true;
      pointsGeometry.attributes.color.needsUpdate = true;
      trackGeometry.attributes.position.needsUpdate = true;
      pointsGeometry.setDrawRange(0, hits);
      trackGeometry.setDrawRange(0, count);
    }
  };
}
