"""Generate graded harbor mesh geometry from Modelica Meshing and the viewer's collision assets."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

here=Path(__file__).resolve().parent
root=here.parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument("--modelica-models",type=Path,required=True,help="modelica_models checkout containing Meshing")
p.add_argument("--msl",type=Path,default=root/".deps/msl",help="Modelica Standard Library source tree")
p.add_argument("--omc",default="omc")
p.add_argument("--node",default="node")
p.add_argument("--output",type=Path,default=root/"build/harbor-flow/grid.json")
a=p.parse_args()
with tempfile.TemporaryDirectory() as tmp:
    tmp=Path(tmp)
    axes=tmp/"axes.tsv"
    source=tmp/"grid.mos"
    models=[a.msl/"Complex.mo",a.msl/"ModelicaServices/package.mo",a.msl/"Modelica/package.mo",
            a.modelica_models/"Meshing/package.mo",here/"HarborGrid.mo"]
    if any(not path.exists() for path in models): raise FileNotFoundError(next(path for path in models if not path.exists()))
    write='model HarborGridWriter\ninitial algorithm\n  assert(HarborGrid.writeGrid('+json.dumps(str(axes))+'),"Grid generation failed");\nend HarborGridWriter;'
    source.write_text("".join("loadFile("+json.dumps(str(f.resolve()))+");getErrorString();\n" for f in models)+
                      "loadString("+json.dumps(write)+");getErrorString();\nsimulate(HarborGridWriter,stopTime=0);getErrorString();\n")
    process=subprocess.run([a.omc,str(source)],cwd=tmp,capture_output=True,text=True)
    if process.returncode or not axes.exists():
        raise RuntimeError(process.stdout+process.stderr)
    a.output.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run([a.node,str(here/"grid.mjs"),str(axes),str(a.output.resolve())],check=True)
