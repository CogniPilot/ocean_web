"""Build the native FMI 3 steady solver with the standard FMI headers and a C99 compiler."""
import argparse
import os
from pathlib import Path
import platform
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED

here = Path(__file__).resolve().parent
root = here.parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("--headers", type=Path, default=root/".deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers")
args = parser.parse_args()
nx, ny, nz = 74, 68, 26
n = nx*ny*nz
token = re.search(r'#define TOKEN "(.*?)"', (here/"fmu.c").read_text())[1]
xml = ET.Element("fmiModelDescription", fmiVersion="3.0", modelName="HarborCurrentSolver", instantiationToken=token)
ET.SubElement(xml, "CoSimulation", modelIdentifier="HarborCurrentSolver", canHandleVariableCommunicationStepSize="true")
variables = ET.SubElement(xml, "ModelVariables")
structure = ET.SubElement(xml, "ModelStructure")
spec = [("time",1),("eastFaces",nx+1),("northFaces",ny+1),("upFaces",nz+1),
        ("wallMask",n),("incident",3),("velocityEast",n),("velocityNorth",n),("velocityUp",n),
        ("relativeUpdateRms",1),("divergenceRms",1),("iterations",1),("pressureIterations",1),("converged",1)]
for vr,(name,size) in enumerate(spec):
    typ = "Float64" if vr<11 else "Int32" if vr<13 else "Boolean"
    attrs = dict(name=name,valueReference=str(vr))
    if vr==0:
        attrs.update(causality="independent",variability="continuous")
    elif vr<=5:
        attrs.update(causality="parameter",variability="fixed",initial="exact",start=" ".join(["0"]*size))
    else:
        attrs.update(causality="output",variability="discrete",initial="calculated")
        ET.SubElement(structure, "Output", valueReference=str(vr))
    var = ET.SubElement(variables, typ, **attrs)
    if size>1: ET.SubElement(var, "Dimension", start=str(size))
for vr in range(6,len(spec)):
    ET.SubElement(structure,"InitialUnknown",valueReference=str(vr))
platform_name = {"x86_64":"x86_64","aarch64":"aarch64"}[platform.machine()]+"-linux"
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    # Standard loaders resolve all FMI symbols, including unsupported typed interfaces.
    types=(args.headers/"fmi3FunctionTypes.h").read_text()
    impl=(here/"fmu.c").read_text()
    with (tmp/"unsupported.c").open("w") as out:
        out.write('#include "fmi3Functions.h"\n')
        for ret,name,params in re.findall(r'typedef\s+(fmi3Status|fmi3Instance|void)\s+(fmi3\w+)TYPE\s*\(([^;]*)\);',types,re.S):
            if re.search(r'\b'+name+r'\s*\(',impl): continue
            result = "return fmi3Error;" if ret=="fmi3Status" else "return NULL;" if ret=="fmi3Instance" else ""
            out.write(f"{ret} {name}({params}) {{ {result} }}\n")
    lib=tmp/"HarborCurrentSolver.so"
    subprocess.run([os.environ.get("CC","cc"),"-O3","-DNDEBUG","-std=c99","-fPIC","-shared","-I",str(args.headers),
                  str(here/"fmu.c"),str(tmp/"unsupported.c"),"-lm","-o",str(lib)],check=True)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with ZipFile(args.output,"w",ZIP_DEFLATED) as archive:
        archive.writestr("modelDescription.xml",ET.tostring(xml,encoding="utf-8",xml_declaration=True))
        archive.write(lib,"binaries/"+platform_name+"/"+lib.name)
        for file in ["fmu.c","solver.c"]:
            archive.write(here/file, "sources/"+file)
        archive.write(tmp/"unsupported.c","sources/unsupported.c")
        archive.write(args.headers/"LICENSE.txt","documentation/licenses/FMI-headers.txt")
