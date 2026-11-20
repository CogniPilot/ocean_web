"""Build a browser module from a Rumoca FMI 3 source FMU's unpacked directory."""
import json
import math
from pathlib import Path
import subprocess
import sys
from xml.etree import ElementTree as ET

source, destination = map(Path, sys.argv[1:3])
xml = ET.parse(source / 'modelDescription.xml').getroot()
if xml.get('generationTool') != 'Rumoca' or xml.get('fmiVersion') != '3.0':
    raise ValueError('Expected a Rumoca FMI 3 model')
destination.mkdir(parents=True, exist_ok=True)
name = xml.attrib['modelName']
headers = Path('.deps/rumoca-src/crates/rumoca-phase-codegen/src/templates/fmi-ls-wasm/fmi3-headers')
c = source / 'sources'
# Binaryen's -O2 pass expands the spectral FMU's large array initialization.
optimization = '-O1' if name == 'WakeSpectrum' else '-O2'
subprocess.run(['emcc',optimization, '-I'+str(headers), '-I'+str(c),
                *map(str, sorted(c.glob('*.c'))), 'scripts/browser-fmi3.c',
                '-sSTACK_SIZE=4194304','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node',
                '-sEXPORTED_FUNCTIONS=_create_instance,_initialize,_set_real,_set_reals,_read_real,_read_integer,_advance,_buffer',
                '-sEXPORTED_RUNTIME_METHODS=ccall,HEAPF64','-o', str(destination / (name+'.mjs'))],check=True)
variables = {v.attrib['name']: [int(v.attrib['valueReference']), v.tag,
              math.prod(int(d.attrib['start']) for d in v.findall('Dimension'))]
             for v in xml.find('ModelVariables')}
(destination / (name+'.json')).write_text(json.dumps(dict(token=xml.attrib['instantiationToken'],variables=variables)))
