"""Add the host FMI 3 Co-Simulation library to the measurement-only SLAM source FMU."""
import argparse
import os
from pathlib import Path
import platform
import subprocess
from tempfile import TemporaryDirectory
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, ZipFile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--headers", type=Path, default=Path(".deps/rumoca-src/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers"))
args = parser.parse_args()
arch = {"x86_64": "x86_64", "aarch64": "aarch64"}.get(platform.machine())
if platform.system() != "Linux" or not arch:
    parser.error("This builder supports native x86_64 and aarch64 Linux")
if args.source.resolve() == args.output.resolve():
    parser.error("Choose a separate path for the native artifact")
with TemporaryDirectory() as tempdir, ZipFile(args.source) as archive:
    xml = ElementTree.fromstring(archive.read("modelDescription.xml"))
    if xml.get("modelName") != "Wreck_SurveySLAM":
        parser.error("Expected the measurement-only Wreck.SurveySLAM export")
    name = xml.find("CoSimulation").attrib["modelIdentifier"] + ".so"
    temp = Path(tempdir)
    for member in archive.namelist():
        path = Path(member)
        if path.parts[:1] == ("sources",) and len(path.parts) == 2 and path.suffix in {".h", ".c"}:
            (temp / path.name).write_bytes(archive.read(member))
    subprocess.run([os.environ.get("CC", "cc"), "-std=c11", "-DFMI3_OVERRIDE_FUNCTION_PREFIX", "-O2", "-fPIC", "-shared",
                    "-I", str(args.headers.resolve()), *sorted(temp.glob("*.c")), "-lm", "-o", temp / name], check=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.output, "w", compression=ZIP_DEFLATED) as output:
        binary = f"binaries/{arch}-linux/{name}"
        for member in archive.infolist():
            if member.filename != binary:
                output.writestr(member, archive.read(member))
        output.write(temp / name, binary)
print(args.output)
