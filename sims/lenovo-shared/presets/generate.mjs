// Generate complete, standalone JSON BOMs from the shared model and reviewed example specifications.
import {writeFile} from 'node:fs/promises';
import {DEFAULT_BOM} from '../bom.js';
import {validateBom} from '../bom-format.mjs';

const configs = [
  {id: 'lenovo-sr675-v3', brand: 'Lenovo', model: 'ThinkSystem SR675 V3', cpu: 'AMD EPYC 9004', units: 3, dims: [448, 130, 874], gpu: 8, memory: 12, fans: 5, psu: 2600, color: '#b52828'},
  {id: 'dell-r760xa', brand: 'Dell', model: 'PowerEdge R760xa', cpu: 'Intel Xeon Scalable', units: 2, dims: [434, 86.8, 830], gpu: 4, memory: 8, fans: 6, psu: 2800, color: '#0066a1'},
  {id: 'hpe-dl380a-gen11', brand: 'HPE', model: 'ProLiant DL380a Gen11', cpu: 'Intel Xeon Scalable', units: 2, dims: [445, 87, 830], gpu: 4, memory: 8, fans: 6, psu: 2200, color: '#007f70'},
  {id: 'supermicro-as4125gs', brand: 'Supermicro', model: 'AS-4125GS-TNRT', cpu: 'AMD EPYC 9004', units: 4, dims: [437, 178, 737], gpu: 8, memory: 8, fans: 8, psu: 2000, color: '#244d86'},
];
for (const c of configs) {
  const b = structuredClone(DEFAULT_BOM);
  b.title = {name: `${c.brand} AI Rack`, sub: `${c.model} · illustrative example`, brand: c.brand, badgeColor: c.color};
  const catalog = b.catalog;
  const rack = catalog['rack.42u-1200'];
  Object.assign(rack, {name: `${c.brand} example 42U cabinet`, sub: 'Illustrative generic cabinet', spec: [['Height', '42U'], ['Footprint', '600 × 1200 mm'], ['Note', 'Example; verify actual rack']]});
  catalog['sw.mgmt-1g'].spec = [['Ports', '48 × 1 GbE RJ45'], ['Carries', 'Management traffic']];
  const server = b.servers['sr675v3-8dw'];
  Object.assign(server, {name: c.model, sub: `${c.units}U · example GPU node`, units: c.units, dims: c.dims});
  for (const [key, name] of [['chassis.sr675v3', 'Chassis'], ['cover.sr675v3', 'Top Cover']]) {
    Object.assign(catalog[key], {name: `${c.model} ${name}`, sub: 'Illustrative geometry', dims: c.dims, spec: [['Model', c.model], ['Note', 'Approximate representation']]});
  }
  Object.assign(catalog['mb.sr675v3'], {name: 'System Board', sub: 'Illustrative server board', spec: [['Platform', c.cpu], ['Note', 'Verify vendor configuration']]});
  Object.assign(catalog['pcie.sw-board'], {name: 'GPU Carrier Board', sub: 'Illustrative PCIe layout', spec: [['Purpose', 'Accelerator connectivity']]});
  Object.assign(catalog['cpu.epyc-9554'], {name: c.cpu, sub: 'Example processor family', label: c.cpu, spec: [['Family', c.cpu], ['Note', 'Select actual CPU and TDP']]});
  Object.assign(catalog['sock.sp5'], {name: 'CPU Socket', sub: 'Illustrative socket', spec: [['Note', 'Verify socket and platform']]});
  Object.assign(catalog['hs.cpu-sp5'], {name: 'CPU Heat Sink', sub: 'Illustrative air cooling', spec: [['Note', 'Verify cooling option']]});
  Object.assign(catalog['gpu.h100-nvl'], {name: 'Example PCIe Accelerator', sub: 'Illustrative double-width GPU', label: 'PCIe GPU', vendor: '', fp8: 0, spec: [['Form', 'Double-width PCIe'], ['Note', 'Select a supported GPU']]});
  if (c.id === 'supermicro-as4125gs') {
    Object.assign(catalog['gpu.h100-nvl'], {
      name: 'NVIDIA L40S', sub: '48 GB GDDR6 · PCIe Gen4', label: 'L40S', vendor: 'NVIDIA', watts: 350, gb: 48, fp8: 1466,
      spec: [['Memory', '48 GB GDDR6 ECC'], ['FP8', '1,466 TFLOPS sparse'], ['Power', '350 W max'], ['Form', 'Double-width PCIe']],
    });
  }
  Object.assign(catalog['psu.2600-ti'], {name: `${c.psu} W PSU`, sub: 'Illustrative hot-swap PSU', output: c.psu, spec: [['Output', `${c.psu} W`], ['Note', 'Verify option and redundancy']]});
  Object.assign(catalog['fan.80-dual'], {name: 'Hot-swap Fan', sub: 'Illustrative fan module', dims: [Math.min(80, (c.dims[0] - 8) / c.fans), 70, 56], spec: [['Note', 'Approximate representation']]});
  Object.assign(catalog['nic.cx7-400'], {name: 'Example PCIe Network Adapter', sub: 'Illustrative network card', spec: [['Note', 'Select a supported adapter']]});
  Object.assign(catalog['nic.ocp-2x25'], {name: 'Example OCP Network Adapter', sub: 'Illustrative OCP card', spec: [['Note', 'Verify compatibility']]});
  b.servers['sr650v3'].name = 'Example storage node';
  b.servers['sr650v3'].sub = 'Illustrative 2U storage node';
  server.gpu = {part: 'gpu.h100-nvl', count: c.gpu};
  delete catalog['nvl.bridge-h100'];
  server.memory.perCpu = c.memory;
  server.fans.count = c.fans;
  server.psu.count = c.units === 2 ? 2 : 4;
  server.psu.redundancy = 'N+N';
  server.drives.count = 4;
  b.rack.layout = [
    {u: 42, part: 'sw.leaf-400g', name: 'Leaf A'},
    {u: 41, part: 'sw.leaf-400g', name: 'Leaf B'},
    {u: 40, part: 'sw.mgmt-1g', name: 'Management'},
    ...[34, 29, 24, 19].map((u, i) => ({u, server: 'sr675v3-8dw', name: `GPU node ${i + 1}`, ...(i === 0 ? {target: true} : {})})),
    {u: 13, server: 'sr650v3', name: 'Example storage'},
  ];
  const ids = {
    'chassis.sr675v3': 'chassis.example', 'cover.sr675v3': 'cover.example',
    'mb.sr675v3': 'board.example', 'cpu.epyc-9554': 'cpu.example',
    'sock.sp5': 'socket.example', 'gpu.h100-nvl': c.id === 'supermicro-as4125gs' ? 'gpu.nvidia-l40s' : 'gpu.example',
    'psu.2600-ti': 'psu.example', 'nic.cx7-400': 'nic.example', 'fan.80-dual': 'fan.example',
    'sr675v3-8dw': 'server.example', 'sr650v3': 'storage.example',
  };
  const rename = (v) => {
    if (typeof v === 'string') return ids[v] || v;
    if (Array.isArray(v)) return v.map(rename);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, value]) => [ids[k] || k, rename(value)]));
    return v;
  };
  const bom = rename(b);
  validateBom(bom);
  await writeFile(new URL(`./${c.id}.json`, import.meta.url), `${JSON.stringify(bom, null, 2)}\n`);
}
