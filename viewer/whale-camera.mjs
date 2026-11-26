// Bound the rendered skin in longitudinal sections. Assign complete triangles
// to a section so a surface between two vertices is covered as well.
export function whaleCameraGuard(T, group) {
  const sections = Array.from({length: 8}, () => ({parts: [], box: new T.Box3()}));
  const point = new T.Vector3(), delta = new T.Vector3();
  group.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry;
    const {position, skinIndex, skinWeight} = geometry.attributes;
    geometry.computeBoundingBox();
    const {min, max} = geometry.boundingBox;
    const masks = new Uint8Array(position.count);
    const indices = geometry.index?.array;
    for (let i = 0; i < (indices?.length ?? position.count); i += 3) {
      const a = indices?.[i] ?? i, b = indices?.[i+1] ?? i+1, c = indices?.[i+2] ?? i+2;
      const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
      const band = Math.max(0, Math.min(7, Math.floor(8 * (z - min.z) / (max.z - min.z))));
      for (const vertex of [a,b,c]) masks[vertex] |= 1 << band;
    }
    const parts = sections.map(() => new Map());
    const feed = geometry.morphAttributes.position?.[mesh.morphTargetDictionary?.Feed];
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      if (feed) {
        delta.fromBufferAttribute(feed, i);
        if (geometry.morphTargetsRelative) delta.add(point);
      }
      for (let w = 0; w < 4; w++) {
        if (skinWeight.getComponent(i, w) <= 0) continue;
        const bone = skinIndex.getComponent(i, w);
        for (let band = 0; band < sections.length; band++) {
          if (!(masks[i] & (1 << band))) continue;
          let box = parts[band].get(bone);
          if (!box) {
            box = new T.Box3();
            parts[band].set(bone, box);
            sections[band].parts.push({mesh, bone, box});
          }
          box.expandByPoint(point);
          if (feed) box.expandByPoint(delta);
        }
      }
    }
  });
  const frame = new T.Matrix4(), transform = new T.Matrix4(), posed = new T.Box3();
  const ray = new T.Ray(), exit = new T.Vector3();
  return camera => {
    group.updateMatrixWorld(true);
    frame.copy(group.matrixWorld).invert();
    ray.origin.copy(camera.position).applyMatrix4(frame);
    camera.getWorldDirection(ray.direction).negate().transformDirection(frame);
    const tangent = Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
    const padding = .015 + camera.near * Math.hypot(1, tangent, camera.aspect * tangent);
    let distance = 0;
    for (const {parts,box} of sections) {
      box.makeEmpty();
      for (const {mesh,bone,box:rest} of parts) {
        const rig = mesh.skeleton;
        transform.multiplyMatrices(frame,mesh.matrixWorld).multiply(mesh.bindMatrixInverse)
          .multiply(rig.bones[bone].matrixWorld).multiply(rig.boneInverses[bone]).multiply(mesh.bindMatrix);
        box.union(posed.copy(rest).applyMatrix4(transform));
      }
      box.expandByScalar(padding);
    }
    // Walk through overlapping sections in the viewing direction back toward
    // the eye. This keeps panning and orbiting usable at the zoom limit.
    for (let pass = 0; pass < sections.length; pass++) {
      let step = 0;
      for (const {box} of sections) {
        if (box.containsPoint(ray.origin) && ray.intersectBox(box,exit))
          step = Math.max(step, exit.distanceTo(ray.origin) + .001);
      }
      if (!step) break;
      ray.origin.addScaledVector(ray.direction, step);
      distance += step;
    }
    if (distance) camera.position.copy(ray.origin).applyMatrix4(group.matrixWorld);
  };
}
