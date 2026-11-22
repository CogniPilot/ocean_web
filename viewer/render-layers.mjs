// Low-quality water captures use only this layer.
export const waterCaptureLayer=2;

export function showInLowWaterCapture(mesh){
  mesh.layers.enable(waterCaptureLayer);
  return mesh;
}
