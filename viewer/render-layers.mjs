// Low-quality water captures use only this layer.
export const waterCaptureLayer=2;
// Course labels appear in the player view.
export const courseMarkerLayer=4;

export function showInLowWaterCapture(mesh){
  mesh.layers.enable(waterCaptureLayer);
  return mesh;
}
