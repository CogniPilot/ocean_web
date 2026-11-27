// Newton supplies the sphere/plane witnesses. Apply the MicroDuck compliant wrench at each witness.
struct Vec {
  float x, y, z;
};
__device__ Vec add(Vec a, Vec b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
__device__ Vec sub(Vec a, Vec b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
__device__ Vec mul(Vec a, float s) { return {a.x * s, a.y * s, a.z * s}; }
__device__ Vec cross(Vec a, Vec b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
__device__ Vec get3(const float *a) { return {a[0], a[1], a[2]}; }
__device__ Vec rotate(const float *q, Vec a) {
  Vec v = get3(q), t = mul(cross(v, a), 2);
  return add(add(a, mul(t, q[3])), cross(v, t));
}
__device__ float softplus(float x, float s) { return fmaxf(x, 0.f) + s * log1pf(expf(-fabsf(x) / s)); }
extern "C" __global__ void prepare(const int *step, const float *torques, float *joint_f, float *body_f,
                                   float *corners) {
  int i = blockDim.x * blockIdx.x + threadIdx.x;
  if (i < 64 * 15 * 6)
    body_f[i] = 0;
  if (i < 64 * 8 * 6)
    corners[i] = 0;
  if (i < 64 * 20) {
    int j = i % 20;
    joint_f[i] = j < 6 ? 0 : torques[((*step) * 64 + i / 20) * 14 + j - 6];
  }
}
extern "C" __global__ void feet(const int *count, const int *sid0, const int *sid1, const float *p0,
                                const float *p1, const float *m0, const float *m1, const int *shape_body,
                                const float *pose, const float *twist, const float *body_com,
                                float *corners, int *faults) {
  int i = blockDim.x * blockIdx.x + threadIdx.x;
  if (i >= *count)
    return;
  int a = shape_body[sid0[i]], b = shape_body[sid1[i]];
  if ((a < 0) == (b < 0)) {
    atomicAdd(faults, 1);
    return;
  }
  int foot = a >= 0 ? a : b, local = foot % 15;
  if (local != 5 && local != 14) {
    atomicAdd(faults, 1);
    return;
  }
  const float *q = pose + 7 * foot;
  Vec centre = add(get3(q), rotate(q + 3, get3(body_com + 3 * foot)));
  Vec footPoint = add(get3(q), rotate(q + 3, get3((a >= 0 ? p0 : p1) + 3 * i)));
  footPoint.z -= (a >= 0 ? m0[i] : m1[i]);
  Vec floorPoint = get3((a >= 0 ? p1 : p0) + 3 * i);
  floorPoint.z += (a >= 0 ? m1[i] : m0[i]);
  float gap = footPoint.z - floorPoint.z;
  if (gap >= .005f)
    return;
  Vec arm = sub(footPoint, centre);
  Vec v = add(get3(twist + 6 * foot), cross(get3(twist + 6 * foot + 3), arm));
  float fn = 10000.f * softplus(-gap, .0001f) * softplus(1.f - .5f * v.z, .05f);
  float scale = -.8f * fn / sqrtf(v.x * v.x + v.y * v.y + .0001f);
  Vec force = {scale * v.x, scale * v.y, fn}, tau = cross(arm, force);
  int index = (a >= 0 ? sid0[i] : sid1[i]) % 9;
  if (index >= 8 || index / 4 != (local == 14)) {
    atomicAdd(faults, 1);
    return;
  }
  float *dst = corners + 6 * ((foot / 15) * 8 + index);
  dst[0] = force.x;
  dst[1] = force.y;
  dst[2] = force.z;
  dst[3] = tau.x;
  dst[4] = tau.y;
  dst[5] = tau.z;
}
extern "C" __global__ void apply_feet(const float *corners, float *body_f, float *load) {
  int foot = blockDim.x * blockIdx.x + threadIdx.x;
  if (foot >= 64 * 2)
    return;
  int body = 15 * (foot / 2) + (foot % 2 ? 14 : 5);
  for (int k = 0; k < 6; k++) {
    float sum = 0;
    for (int c = 0; c < 4; c++)
      sum += corners[(foot * 4 + c) * 6 + k];
    body_f[6 * body + k] = sum;
    if (k == 2)
      load[foot] = sum;
  }
}
extern "C" __global__ void record(const int *step, const float *q, const float *v, const float *load,
                                  float *history) {
  int i = blockDim.x * blockIdx.x + threadIdx.x;
  if (i >= 64 * 43)
    return;
  int lane = i / 43, j = i % 43;
  history[(*step) * 64 * 43 + i] =
      j < 21 ? q[lane * 21 + j] : (j < 41 ? v[lane * 20 + j - 21] : load[lane * 2 + j - 41]);
}
extern "C" __global__ void next(int *step) { ++*step; }
