"""Package time-resolved tank-frame lattice samples for the propeller viewer."""
import csv

import numpy as np


def rotation_x(angle):
    c, s = np.cos(angle), np.sin(angle)
    return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])


def sample(values, positions, origin, dx):
    """Trilinear sampling at points inside the native cell-centre grid."""
    address = (positions-origin)/dx
    dims = np.array(values.shape[:3][::-1])
    if np.any(address < 0) or np.any(address >= dims-1):
        raise ValueError('sample outside the lattice')
    base = np.floor(address).astype(int)
    frac = address-base
    result = np.zeros((len(positions),values.shape[-1]))
    for offset in np.ndindex(2,2,2):
        i,j,k = (base+offset).T
        weight = np.prod(np.where(offset,frac,1-frac),axis=1)
        result += weight[:,None]*values[k,j,i]
    return result


def sample_fields(grid, query, origin, dx):
    gradients = [np.gradient(grid[...,i], dx) for i in range(3)]  # z, y, x
    curl = np.stack((gradients[2][1]-gradients[1][0], gradients[0][0]-gradients[2][2],
                     gradients[1][2]-gradients[0][1]), axis=-1)
    flow = sample(grid,query,origin,dx)
    return flow[:,:3], flow[:,3]/1000, sample(curl,query,origin,dx)


def streamlines(grid, origin, dx, diameter, fluid, seeds):
    """Trace instantaneous streamlines. Store xyz/D and speed for each vertex."""
    count = 145
    result = np.zeros((len(seeds),count,4),dtype='<i2')
    pos = seeds.copy()
    active = np.ones(len(pos),dtype=bool)
    ds = .03*diameter
    for i in range(count):
        u = sample(grid,pos,origin,dx)[:,:3]
        speed = np.linalg.norm(u,axis=1)
        active &= (speed>1e-5) & fluid(pos)
        result[active,i,:3] = np.rint(pos[active]*8192/diameter)
        result[active,i,3] = np.maximum(1,np.rint(speed[active]*1000))
        mid = pos+.5*ds*u/np.maximum(speed[:,None],1e-5)
        active &= fluid(mid)
        velocity = sample(grid,mid,origin,dx)[:,:3]
        pos[active] += ds*velocity[active]/np.maximum(np.linalg.norm(velocity[active],axis=1)[:,None],1e-5)
    return result


def write_sequence(directory, output, lattice, query, blade, locator, diameter):
    with (directory/'rumoca-frames.csv').open() as manifest:
        rows = list(csv.DictReader(manifest))
    intervals = lattice['framesPerTurn']
    if lattice.get('startsFromRest'):
        intervals = round(intervals*lattice['steps']/lattice['stepsPerRev'])
    if len(rows)!=intervals+1 or int(rows[-1]['step'])!=lattice['steps']:
        raise ValueError('incomplete transient recording')
    origin = np.array(lattice['firstCenter_m'])
    dx = lattice['spacing_m']
    dims = lattice['dims']
    fields = {key:[] for key in ('velocity','fluidPressure','vorticity')}
    descriptors = {key:[] for key in fields}
    frames = []
    geometry = bytearray()
    seeds = diameter*np.array([[-1.25,r*np.cos(a),r*np.sin(a)] for r in (.16,.32,.47,.59)
                               for a in np.arange(12)*np.pi/6])
    take = np.arange(len(seeds)*4)
    tracer = seeds[take%len(seeds)].copy()
    tracer[:,0] += diameter*3.25*((take*.61803398875)%1)
    previous = None
    for row in rows:
        grid = np.fromfile(directory/row['file'],dtype='<f4').reshape(*dims[::-1],4)
        t = float(row['time_s'])
        turns = float(row['revolutions'])
        rot = rotation_x(-2*np.pi*turns)
        def fluid(points):
            # Only query VTK where the blade or hub can actually occupy a cell.
            original = points@rot.T
            lower = blade.min(axis=0)
            upper = blade.max(axis=0)
            near = np.all((original>=lower)&(original<=upper),axis=1)
            valid = np.ones(len(points),dtype=bool)
            valid[near] = [locator.FindCell(p)>=0 for p in original[near]]
            return valid
        valid = fluid(query)
        u,p,w = sample_fields(grid,query,origin,dx)
        for key,values in [('velocity',np.linalg.norm(u,axis=1)),('fluidPressure',p),('vorticity',np.linalg.norm(w,axis=1))]:
            values = values[valid]
            if not np.all(np.isfinite(values)):
                raise ValueError('nonfinite '+key)
            low, high = float(values.min()), float(values.max())
            step = (high-low)/65534 or 1.
            packed = np.zeros(len(valid),dtype='<u2')
            packed[valid] = 1+np.rint((values-low)/step).astype(np.uint16)
            fields[key].append(packed)
            descriptors[key].append(dict(min=low,max=high,step=step))
        blade_pressure = sample(grid,blade@rot,origin,dx)[:,3]/1000
        lines = streamlines(grid,origin,dx,diameter,fluid,seeds)
        if previous is not None:
            dt = t-frames[-1]['time']
            # Midpoint advection, interpolating velocities between solved times.
            a = sample(previous,tracer,origin,dx)[:,:3]
            mid = tracer+.5*dt*a
            a = sample(previous,mid,origin,dx)[:,:3]
            b = sample(grid,mid,origin,dx)[:,:3]
            tracer += dt*.5*(a+b)
        invalid = ~fluid(tracer) | (tracer[:,0]>2.95*diameter)
        tracer[invalid] = seeds[take[invalid]%len(seeds)]
        frames.append(dict(time=t,turns=turns,offset=len(geometry)))
        geometry.extend(blade_pressure.astype('<f4').tobytes())
        geometry.extend((tracer/diameter).astype('<f4').tobytes())
        geometry.extend(lines.tobytes())
        previous = grid
    for key,packed in fields.items():
        np.stack(packed).tofile(output/('turn-'+key+'.bin'))
    (output/'turn-geometry.bin').write_bytes(geometry)
    return dict(frames=frames, fields=descriptors, tracers=len(tracer),
                paths=len(seeds), verticesPerPath=lines.shape[1])
