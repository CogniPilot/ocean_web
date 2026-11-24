"""Compare the native Rumoca FMI collision operator to a tensor-form NumPy reference."""
import argparse
import ctypes as ct
import os
from pathlib import Path
import subprocess
import tempfile
from xml.etree import ElementTree

import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("build", type=Path, help="output directory of build-lattice.sh")
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
sources = args.build / "PropellerFlow/sources"
xml = ElementTree.parse(sources.parent / "modelDescription.xml").getroot()
token = xml.get("instantiationToken")
variables = {item.get("name"): int(item.get("valueReference")) for item in xml.find("ModelVariables")}
c = np.array([(0,0,0),(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1),
              (1,1,0),(-1,-1,0),(1,-1,0),(-1,1,0),(1,0,1),(-1,0,-1),(1,0,-1),
              (-1,0,1),(0,1,1),(0,-1,-1),(0,1,-1),(0,-1,1)])
weights = np.array([1/3] + [1/18]*6 + [1/36]*12)

def equilibrium(rho, velocity):
    projected = c @ velocity
    return rho * weights * (1 + 3*projected + 4.5*projected**2 - 1.5*(velocity @ velocity))

with tempfile.TemporaryDirectory() as tmp:
    library = Path(tmp) / "cell.so"
    subprocess.run([os.getenv("CC", "gcc"), "-O3", "-shared", "-fPIC",
                    "-I"+str(root/".deps/rumoca-src/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers"),
                    *sorted(sources.glob("*.c")), "-lm", "-o", library], check=True)
    module = ct.CDLL(str(library))
    ptr, size, boolean = ct.c_void_p, ct.c_size_t, ct.c_bool
    def bind(name, params, result=ct.c_int):
        fn = getattr(module, "Rumoca_"+token.replace("-", "_")+"_fmi3"+name)
        fn.argtypes, fn.restype = params, result
        return fn
    create = bind("InstantiateCoSimulation", [ct.c_char_p]*3 + [boolean]*4 + [ptr,size,ptr,ptr,ptr], ptr)
    model = create(b"audit", token.encode(), None, False, False, False, False, None, 0, None, None, None)
    assert model
    args_real = [ptr, ptr, size, ptr, size]
    put, get = bind("SetFloat64", args_real), bind("GetFloat64", args_real)
    def refs(names):
        return np.array([variables[name] for name in names.split()], dtype=np.uint32)
    inputs = refs("populations fraction y z omega nu cs wallTensor")
    outputs = refs("post force velocity pressure")
    assert bind("EnterInitializationMode", [ptr,boolean,ct.c_double,ct.c_double,boolean,ct.c_double])(model,False,0,0,False,0)==0
    initial = np.r_[weights, 0.,0.,0.,0.,.001,.16,1.,1.,1.,0.,0.,0.]
    assert put(model, inputs.ctypes.data, len(inputs), initial.ctypes.data, len(initial))==0
    assert bind("ExitInitializationMode", [ptr])(model)==0
    rng = np.random.default_rng(5613)
    peak = 0.
    for i in range(120):
        pop = weights*rng.uniform(.85,1.15,19)
        solid = [0.,1.,rng.random()][i%3]
        y,z = rng.uniform(-8,8,2)
        omega = (-1)**i*.011
        nu,cs = rng.uniform(.0001,.002),.16
        rho = pop.sum()
        u = (pop @ c)/rho
        normal = rng.normal(size=3)
        normal /= np.linalg.norm(normal)
        tensor = np.eye(3) if i%2==0 else np.outer(normal,normal)
        du = solid * (tensor @ (np.cross([omega,0,0],[0,y,z])-u))
        neq = pop-equilibrium(rho,u)
        stress = c.T @ (neq[:,None]*c)
        tau0 = .5+3*nu
        tau = .5*(tau0+np.sqrt(tau0**2+18*cs**2*np.sqrt(2)*np.linalg.norm(stress)/rho))
        coeff = np.einsum("qi,ij,qj->q",c,stress,c)-np.trace(stress)/3
        post = equilibrium(rho,u+du)+(1-1/tau)*4.5*weights*coeff
        expected = np.r_[post,-rho*du,u+.5*du,(rho-1)/3]
        values = np.r_[pop,solid,y,z,omega,nu,cs,tensor.diagonal(),tensor[0,1],tensor[0,2],tensor[1,2]]
        actual = np.empty_like(expected)
        assert put(model,inputs.ctypes.data,len(inputs),values.ctypes.data,len(values))==0
        assert get(model,outputs.ctypes.data,len(outputs),actual.ctypes.data,len(actual))==0
        np.testing.assert_allclose(actual,expected,atol=2e-13,rtol=0)
        np.testing.assert_allclose(actual[:19] @ c + actual[19:22], pop @ c, atol=2e-13,rtol=0)
        np.testing.assert_allclose(actual[:19].sum(), rho, atol=2e-13,rtol=0)
        peak = max(peak,np.max(np.abs(actual-expected)))
    bind("FreeInstance",[ptr],None)(model)
    print(f"120 collision cases passed; largest absolute difference in lattice units {peak:.3g}")
