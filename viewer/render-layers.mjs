// Main views use layers 0 and 1. The low-quality mirror uses only this layer.
export const reflectionLayer=2;

export function reflectOnLow(mesh){
  mesh.layers.enable(reflectionLayer);
  return mesh;
}
