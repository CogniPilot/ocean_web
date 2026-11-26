// Recorded Cartesian velocity field. Domain coordinates may be rotated with
// respect to ENU; the velocity components themselves are already east/north/up.
export function prepareWreckCurrent(record, velocities, walls, geometrySha256) {
  if (record.format !== 'wreck-current-v1' || !record.converged ||
      record.geometrySha256 !== geometrySha256 || !geometrySha256) {
    throw new Error('Wreck current requires a converged field for the selected geometry');
  }
  const {dimensions, axes, firstCenter, spacingM, velocityScale} = record;
  if (dimensions?.length !== 3 || !dimensions.every(n => Number.isSafeInteger(n) && n >= 2) ||
      axes?.length !== 3 || !axes.every(a => a?.length === 3 && a.every(Number.isFinite)) ||
      firstCenter?.length !== 3 || !firstCenter.every(Number.isFinite) ||
      !Number.isFinite(spacingM) || !Number.isFinite(velocityScale) || spacingM <= 0 || velocityScale <= 0) {
    throw new Error('Invalid wreck current grid');
  }
  const cells = dimensions.reduce((count, n) => count*n, 1);
  if (velocities.length !== 3*cells || walls.length !== cells) throw new Error('Incomplete wreck current recording');
  const [nx, ny] = dimensions;
  const stride = [1, nx, nx*ny], base = new Int32Array(3), f = new Float64Array(3);
  const indices = new Uint32Array(8);
  return function sample(position, out) {
    for (let i=0; i<3; ++i) {
      const a=axes[i];
      const t=(a[0]*position[0]+a[1]*position[1]+a[2]*position[2]-firstCenter[i])/spacingM;
      if (!(t>=0 && t<=dimensions[i]-1)) return false;
      base[i]=Math.min(dimensions[i]-2, Math.floor(t));
      f[i]=t-base[i];
    }
    const start=base[0]+nx*(base[1]+ny*base[2]);
    const nearest=Number(f[0]>=.5)+2*Number(f[1]>=.5)+4*Number(f[2]>=.5);
    let nearWall=false;
    for (let i=0; i<8; ++i) {
      indices[i]=start+(i&1)*stride[0]+((i>>1)&1)*stride[1]+((i>>2)&1)*stride[2];
      nearWall ||= walls[indices[i]]!==0;
    }
    let reachable=255;
    if (nearWall) {
      reachable=1<<nearest;
      let pending=reachable;
      while (pending) {
        const bit=pending & -pending, i=31-Math.clz32(bit);
        pending ^= bit;
        for (let axis=0; axis<3; ++axis) {
          const flag=1<<axis, next=1<<(i^flag);
          // Stored bit 2*axis is the incoming + direction (neighbour at -axis).
          const blocked=1<<(2*axis+Number((i&flag)===0));
          if (!(reachable&next) && !(walls[indices[i]]&blocked)) {
            reachable |= next;
            pending |= next;
          }
        }
      }
    }
    let sum=0;out[0]=out[1]=out[2]=0;
    for (let i=0; i<8; ++i) {
      if (!(reachable&(1<<i))) continue;
      const w=(i&1 ? f[0]:1-f[0])*(i&2 ? f[1]:1-f[1])*(i&4 ? f[2]:1-f[2]);
      const index=3*indices[i];
      for (let k=0;k<3;k++) out[k]+=w*velocities[index+k];
      sum+=w;
    }
    for (let k=0;k<3;k++) out[k]*=velocityScale/sum;
    return true;
  };
}

// sha256Hex is supplied by the same runtime module which verifies the worker's FMU.
export async function loadWreckCurrent(manifestUrl, geometrySha256, sha256Hex, fetchFile = fetch) {
  async function read(path) {
    const response = await fetchFile(new URL(path, manifestUrl));
    if (!response.ok) throw new Error(`Could not load wreck current ${path} (HTTP ${response.status})`);
    return response;
  }
  const record = await (await read(manifestUrl)).json();
  if (!geometrySha256 || geometrySha256 !== record.geometrySha256 || record.converged !== true) {
    throw new Error('Wreck current does not match the selected geometry or failed its convergence check');
  }
  async function verifiedBytes(name, digest) {
    const bytes = await (await read(name)).arrayBuffer();
    if (await sha256Hex(bytes) !== digest) throw new Error(`Wreck current checksum mismatch for ${name}`);
    return bytes;
  }
  const [velocity, faces] = await Promise.all([
    verifiedBytes('velocity.i16', record.velocitySha256),
    verifiedBytes('wall-faces.u8', record.faceSha256),
  ]);
  const samples = new Int16Array(velocity);
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) {
    const littleEndian = new DataView(velocity);
    for (let i = 0; i < samples.length; i++) samples[i] = littleEndian.getInt16(2*i, true);
  }
  return prepareWreckCurrent(record, samples, new Uint8Array(faces), geometrySha256);
}
