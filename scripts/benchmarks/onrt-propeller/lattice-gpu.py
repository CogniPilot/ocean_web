"""Run the Rumoca-generated collision function on a double-precision OpenCL GPU."""
import argparse
import csv
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import pyopencl as cl

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lattice_collision import build_lattice

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("fmu", type=Path, help="unpacked PropellerFlow FMI source directory")
parser.add_argument("mask", type=Path)
parser.add_argument("normals", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--periods", type=int, default=48)
parser.add_argument("--frames", type=int, default=8)
parser.add_argument("--periodic", action="store_true", help="Find a repeating full-speed lattice state at one shaft phase")
args = parser.parse_args()
devices = [d for p in cl.get_platforms() for d in p.get_devices(device_type=cl.device_type.GPU) if d.double_fp_config]
if not devices:
    raise RuntimeError("A double-precision OpenCL GPU is required")
ctx = cl.Context([devices[0]])
queue = cl.CommandQueue(ctx, properties=cl.command_queue_properties.PROFILING_ENABLE)
print("Compute device:", devices[0].name, flush=True)
domain = Path(__file__).with_name("lattice-device.cl").read_text()
program = build_lattice(ctx, args.fmu, domain)
kernel = program.advance
out = args.output
out.mkdir(parents=True, exist_ok=True)
def grid_input(path, dtype, components):
    with path.open("rb") as file:
        shape = tuple(map(int,np.fromfile(file, '<i4', 3)))
        data = np.fromfile(file, dtype)
    res,width,phases = shape
    if not 8<=res<=64 or data.size!=width**3*phases*components:
        raise ValueError("Invalid rotor grid")
    return shape,data
shape,mask = grid_input(args.mask,'u1',1)
norm_shape,normals = grid_input(args.normals,'<f4',6)
if shape!=norm_shape:
    raise ValueError("Blade fractions and normal tensors use different grids")
res,width,phases=shape
nx,ny,nz=9*res,4*res,4*res
cells=nx*ny*nz
if cells%128: raise ValueError("GPU workgroups require a multiple of 128 cells")
D,rpm,J,rho=.1066,538.,.8,998.6
rev=math.ceil(math.pi*res/.075)
n=rpm/60
dt=1/(rev*n)
dx=D/res
omega=-2*math.pi/rev
dirs=np.array([[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,1,0],[-1,-1,0],[1,-1,0],[-1,1,0],[1,0,1],[-1,0,-1],[1,0,-1],[-1,0,1],[0,1,1],[0,-1,-1],[0,1,-1],[0,-1,1]])
lookup={tuple(v):i for i,v in enumerate(dirs)}
reflect=np.array([[lookup[tuple(v*[1,-1 if flip&1 else 1,-1 if flip&2 else 1])] for v in dirs] for flip in range(4)],dtype='i4')
mf=cl.mem_flags
def buffer(a,flags):
    return cl.Buffer(ctx,flags|mf.COPY_HOST_PTR,hostbuf=a)
weights=np.r_[1/3,np.full(6,1/18),np.full(12,1/36)]
initial=weights
if args.periodic:
    inflow=J*n*D*dt/dx
    eu=dirs[:,0]*inflow
    initial=weights*(1+3*eu+4.5*eu**2-1.5*inflow**2)
src=buffer(np.broadcast_to(initial[:,None],(19,cells)).copy(),mf.READ_WRITE)
dst=cl.Buffer(ctx,mf.READ_WRITE,src.size)
mask,normals,reflect=[buffer(a,mf.READ_ONLY) for a in (mask,normals,reflect)]
field=np.zeros((nz,ny,nx,4),dtype='<f4')
field_gpu=cl.Buffer(ctx,mf.WRITE_ONLY,field.nbytes)
blocks=np.empty((cells//128,4),dtype=np.float64)
loads_gpu=cl.Buffer(ctx,mf.WRITE_ONLY,blocks.nbytes)
def writer(name, columns):
    f=(out/name).open('w',buffering=1)
    w=csv.writer(f);w.writerow(columns.split(','))
    return w
history=writer('rumoca-loads.csv','step,time_s,revolutions,thrust_N,torque_Nm,KT,KQ,max_mach,mask_phase,omega_rad_s')
sequence=writer('rumoca-frames.csv','step,time_s,revolutions,file')
periods=writer('rumoca-periods.csv','period,time_s,mean_thrust_N,mean_torque_Nm,relative_velocity_change,stable_periods')
def snapshot(i,step,turns):
    file=f'rumoca-frame-{i:04d}.bin'
    field.tofile(out/file)
    sequence.writerow([step,step*dt,turns,file])
if args.periodic:
    populations=np.empty((19,cells))
    previous_populations=np.broadcast_to(initial[:,None],populations.shape).copy()
else:
    snapshot(0,0,0)
region=np.s_[int(2*res-.8*res):int(2*res+.8*res)+1,int(2*res-.8*res):int(2*res+.8*res)+1,2*res:6*res+1,:3]
previous=np.zeros_like(field[region])
stable=0
total=np.zeros(2)
last=np.zeros(2)
gpu_time=0.
start=time.monotonic()
for step in range(1,rev*args.periods+1):
    s=min(1.,step/rev)
    ramp=s*s*(3-2*s)
    turns=s**3-.5*s**4 if step<=rev else step/rev-.5
    if args.periodic:
        ramp=1.
        turns=step/rev
    phase=(-4*turns%1)*phases
    frame=math.floor(step*args.frames/rev+.5)
    capture=step==math.floor(frame*rev/args.frames+.5)
    if args.periodic: capture=step%rev==0
    event=kernel(queue,(cells,),(128,),src,dst,mask,normals,reflect,field_gpu,loads_gpu,
                 *map(np.int32,(res,width,phases)),*map(np.float64,(phase,ramp,omega,J*n*D*dt/dx,1.054e-6*dt/dx**2,dx/dt,rho*(dx/dt)**2)),np.int32(capture))
    cl.enqueue_copy(queue,blocks,loads_gpu)
    gpu_time+=(event.profile.end-event.profile.start)*1e-9
    max_mach=math.sqrt(3*blocks[:,2].max())
    if blocks[:,3].any() or max_mach>.4 or not np.isfinite(blocks).all(): raise ValueError(f'Unstable step {step}, Mach {max_mach}')
    force=blocks[:,:2].sum(axis=0)*np.array([-1,dx])*rho*dx**4/dt**2
    kt,kq=force/(rho*n**2*np.array([D**4,D**5]))
    history.writerow([step,step*dt,turns,*force,kt,kq,max_mach,phase,ramp*omega/dt])
    total+=force/rev
    if capture:
        cl.enqueue_copy(queue,field,field_gpu)
        if not args.periodic: snapshot(frame,step,turns)
    if step%rev==0:
        region_values=field[region]
        diff=np.linalg.norm(region_values-previous)/max(np.linalg.norm(region_values),1e-15)
        if args.periodic:
            # Fixed point of one full revolution, including all 19 streamed populations.
            cl.enqueue_copy(queue,populations,dst)
            residual=np.linalg.norm(populations-previous_populations)/np.linalg.norm(populations-weights[:,None])
            load_change=np.max(abs(total-last)/np.maximum(abs(total),1e-15))
            repeat=max(residual,diff,load_change)<.005
            previous_populations,populations=populations,previous_populations
        else:
            repeat=diff<.02 and np.all(abs(total-last)<.02*abs(total))
        stable=stable+1 if repeat else 0
        periods.writerow([step//rev,step*dt,*total,diff,stable])
        print(f'Period {step//rev}, velocity change {diff:.3%}, {stable} settled, {time.monotonic()-start:.1f}s elapsed',flush=True)
        previous=region_values.copy();last=total;total=np.zeros(2)
        if stable>=3: break
    src,dst=dst,src
if args.periodic and stable<3:
    raise RuntimeError("Full-speed state failed the three-revolution repeatability test")
field.tofile(out/'rumoca-volume.bin')
meta=dict(dims=[nx,ny,nz],spacing_m=dx,firstCenter_m=[(.5-a*res)*dx for a in [3,2,2]],
          dt_s=dt,steps=step,stepsPerRev=rev,framesPerTurn=0 if args.periodic else args.frames,startsFromRest=not args.periodic,
          J=J,rpm=rpm,wallTreatment='normal-slip',computeDevice=devices[0].name,
          solveWallSeconds=time.monotonic()-start,kernelSeconds=gpu_time,settled=stable>=3)
if args.periodic:
    meta['periodicInitialization']=dict(populationResidual=float(residual),velocityResidual=float(diff),
        loadResidual=float(load_change),tolerance=.005,successivePeriods=stable)
(out/'rumoca-volume.json').write_text(json.dumps(meta,indent=2)+'\n')
