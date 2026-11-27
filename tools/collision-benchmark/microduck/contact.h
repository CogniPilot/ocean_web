// MuJoCo plane/sphere narrow phase with the authored MicroDuck normal and sliding-friction law.
static double softplus(double x, double s) {
  return x > 0 ? x + s * log(1 + exp(-x / s)) : s * log(1 + exp(x / s));
}
static void nativeWrench(const mjModel *model, mjData *d, const double *x, double y[6]) {
  double omega[3];
  mju_mulMatTVec3(omega, x + 3, x + 12);
  memset(y, 0, 6 * sizeof(*y));
  for (int corner = 0; corner < 4; corner++) {
    double local[3] = {corner < 2 ? -.035 : .035, corner % 2 ? .020 : -.020, 0}, arm[3];
    mju_mulMatTVec3(arm, x + 3, local);
    mju_add3(d->geom_xpos + 3, x, arm);
    mjPreContact contact;
    if (!mjCOLLISIONFUNC[mjGEOM_PLANE][mjGEOM_SPHERE](model, d, &contact, 0, 1, .005))
      continue;
    arm[2] -= .003;
    double vel[3], torque[3];
    mju_cross(vel, omega, arm);
    mju_addTo3(vel, x + 15);
    double normal = 10000 * softplus(-contact.dist, .0001) * softplus(1 - .5 * vel[2], .05);
    double vt = sqrt(vel[0] * vel[0] + vel[1] * vel[1] + .0001);
    double force[3] = {-.8 * normal * vel[0] / vt, -.8 * normal * vel[1] / vt, normal};
    mju_cross(torque, arm, force);
    mju_addTo3(y, force);
    mju_addTo3(y + 3, torque);
  }
}
