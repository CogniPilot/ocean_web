// Convert MuJoCo world linear/body angular coordinates to the production floating-tree convention.
static void rumocaAccel(const mjModel *m, const mjData *d, double out[20], const void *parents,
                        const void *offsets, const void *mounts, const void *axes, const void *inertias,
                        const void *armatures) {
  double gravity[3], speed[20], effort[20], a[20], R[9];
  mju_quat2Mat(R, d->qpos + 3);
  mju_mulMatTVec3(gravity, R, m->opt.gravity);
  mju_mulMatTVec3(speed + 3, R, d->qvel);
  mju_mulMatTVec3(effort + 3, R, d->qfrc_applied);
  memcpy(speed, d->qvel + 3, 3 * sizeof(double));
  memcpy(effort, d->qfrc_applied + 3, 3 * sizeof(double));
  memcpy(speed + 6, d->qvel + 6, 14 * sizeof(double));
  memcpy(effort + 6, d->qfrc_applied + 6, 14 * sizeof(double));
  const void *args[] = {parents, offsets,  mounts,    axes,    d->qpos + 7,
                        speed,   inertias, armatures, gravity, effort};
  bool ok[4] = {0};
  void *outputs[] = {NULL, NULL, a, ok, ok + 1, ok + 2, ok + 3};
  if (TREE_FORWARD(args, outputs, NULL) || !(ok[0] && ok[1] && ok[2] && ok[3]))
    abort();
  double transport[3];
  mju_cross(transport, speed, speed + 3);
  mju_addTo3(transport, a + 3);
  mju_mulMatVec3(out, R, transport);
  memcpy(out + 3, a, 3 * sizeof(double));
  memcpy(out + 6, a + 6, 14 * sizeof(double));
}
