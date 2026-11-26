"""Solve one harbor through the FMU's public FMI 3 co-simulation interface."""
import argparse
import array
import ctypes as C
import json
import math
import os
from pathlib import Path
import platform
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from zipfile import ZipFile

def solve(fmu, grid_path, east, north, destination, limit, verbose):
    grid=json.loads(grid_path.read_text())
    variables=["eastFaces","northFaces","upFaces","wallMask","incident"]
    grid["incident"]=[east,north,0]
    n=math.prod(len(grid[name])-1 for name in variables[:3])
    with ZipFile(fmu) as archive, tempfile.TemporaryDirectory() as temporary:
        xml=ET.fromstring(archive.read("modelDescription.xml"))
        name=xml.find("CoSimulation").get("modelIdentifier")
        path=Path(temporary)/(name+".so")
        path.write_bytes(archive.read("binaries/"+platform.machine()+"-linux/"+path.name))
        lib=C.CDLL(str(path))
        V=C.c_void_p; D=C.c_double; B=C.c_bool; I=C.c_int; U=C.c_uint32; S=C.c_size_t
        refptr=C.POINTER(U)
        def bind(name, result, *types):
            f=getattr(lib,"fmi3"+name); f.restype=result;f.argtypes=types;return f
        new=bind("InstantiateCoSimulation",V,C.c_char_p,C.c_char_p,C.c_char_p,B,B,B,B,refptr,S,V,V,V)
        enter=bind("EnterInitializationMode",I,V,B,D,D,B,D)
        start=bind("ExitInitializationMode",I,V)
        finish=bind("Terminate",I,V)
        release=bind("FreeInstance",None,V)
        set_array=bind("SetFloat64",I,V,refptr,S,C.POINTER(D),S)
        get_array=bind("GetFloat64",I,V,refptr,S,C.POINTER(D),S)
        get_integer=bind("GetInt32",I,V,refptr,S,C.POINTER(I),S)
        get_bool=bind("GetBoolean",I,V,refptr,S,C.POINTER(B),S)
        step=bind("DoStep",I,V,D,D,B,C.POINTER(B),C.POINTER(B),C.POINTER(B),C.POINTER(D))
        inst=new(b"harbor",xml.get("instantiationToken").encode(),None,False,False,False,False,None,0,None,None,None)
        if not inst: raise RuntimeError("FMI instantiation failed")
        by_name={v.get("name"):int(v.get("valueReference")) for v in xml.find("ModelVariables")}
        def check(status):
            if status>1: raise RuntimeError(f"FMI returned status {status}")
        def read(name,T,count,getter):
            out=(T*count)(); check(getter(inst,C.byref(U(by_name[name])),1,out,count));return out
        try:
            check(enter(inst,False,0,0,False,0))
            for name in variables:
                a=array.array('d',grid[name]); value=(D*len(a)).from_buffer(a)
                check(set_array(inst,C.byref(U(by_name[name])),1,value,len(a)))
            check(start(inst))
            begun=time.monotonic();clock=0;settled=False
            while clock<limit and not settled:
                length=min(8,limit-clock); event,terminate,early=B(),B(),B();last=D()
                check(step(inst,clock,length,True,C.byref(event),C.byref(terminate),C.byref(early),C.byref(last)))
                clock+=length
                settled=read("converged",B,1,get_bool)[0]
                update=read("relativeUpdateRms",D,1,get_array)[0]
                div=read("divergenceRms",D,1,get_array)[0]
                if verbose: print(f"{clock} sweeps: update {update:.3g}, divergence {div:.3g}/s; {time.monotonic()-begun:.1f}s",file=sys.stderr,flush=True)
            diag=dict(converged=settled,iterations=read("iterations",I,1,get_integer)[0],
                      pressureIterations=read("pressureIterations",I,1,get_integer)[0],relativeUpdateRms=update,
                      divergenceRms=div,wallSeconds=time.monotonic()-begun,incidentENU=grid["incident"],
                      shape=[len(grid[v])-1 for v in variables[:3]])
            destination.mkdir(parents=True,exist_ok=True)
            (destination/"diagnostics.json").write_text(json.dumps(diag,indent=2)+"\n")
            if not settled: raise RuntimeError(f"Steady solve did not converge after {clock} iterations")
            field=array.array("f",[0])*(3*n)
            for d,name in enumerate(("velocityEast","velocityNorth","velocityUp")):
                field[d::3]=array.array("f",read(name,D,n,get_array))
            if sys.byteorder!="little":field.byteswap()
            with tempfile.NamedTemporaryFile(dir=destination,delete=False) as out:
                field.tofile(out)
            os.replace(out.name,destination/"velocity.f32")
            check(finish(inst));return diag
        finally:
            release(inst)

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("fmu",type=Path);p.add_argument("grid",type=Path)
    p.add_argument("east",type=float);p.add_argument("north",type=float);p.add_argument("output",type=Path)
    p.add_argument("--max-iterations",type=int,default=1600);p.add_argument("--verbose",action="store_true")
    a=p.parse_args()
    if a.max_iterations<1 or not all(map(math.isfinite,(a.east,a.north))):p.error("Invalid solver input")
    print(json.dumps(solve(a.fmu,a.grid,a.east,a.north,a.output,a.max_iterations,a.verbose or os.getenv("HARBOR_SOLVER_VERBOSE")=="1")))
