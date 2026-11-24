#!/usr/bin/env bash
set -euo pipefail
root=$(git rev-parse --show-toplevel)
source_dir="$root/scripts/benchmarks/onrt-propeller"
dest="${1:?Pass build directory}"
mkdir -p "$dest"
dest=$(realpath "$dest")
"${RUMOCA:-$root/.deps/rumoca-upstream/target/debug/rumoca}" compile "$source_dir/PropellerFlow.mo" -m PropellerFlow --target fmi3 -o "$dest"
python3 - "$dest" <<'PY'
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
p=Path(sys.argv[1]);x=ET.parse(p/'PropellerFlow/modelDescription.xml').getroot()
v={a.get('name'):a.get('valueReference') for a in x.find('ModelVariables')}
with (p/'flow_refs.h').open('w') as f:
    print('#define FLOW_TOKEN "'+x.get('instantiationToken')+'"',file=f)
    for name,names in [('input','populations fraction y z omega nu cs wallTensor'),('output','post force velocity pressure')]:
        print('static const fmi3ValueReference '+name+'_refs[] = {'+','.join(v[k] for k in names.split())+'};',file=f)
PY
headers="$root/.deps/rumoca-upstream/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers"
"${CC:-gcc}" -O3 -flto -fopenmp -I"$headers" -I"$dest" -I"$dest/PropellerFlow/sources" "$source_dir/lattice.c" "$dest"/PropellerFlow/sources/*.c -lm -o "$dest/lattice"
