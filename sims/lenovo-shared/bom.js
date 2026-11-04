// THE BILL OF MATERIALS. Edit this file, rebuild, and the rack, the server, the explode, the panels and the power
// budget all follow. Nothing else in lenovo-shared/ holds a part name, a count, a dimension or a wattage.
//
//   CATALOG  every orderable part: what it is (kind → which 3D builder draws it), its real size in mm, its power, the
//            spec lines the inspect card shows. Add a SKU by copying the closest entry and changing the numbers.
//   SERVERS  a server configuration: which catalog part goes in each slot and how many.
//   RACK     the cabinet, its PDUs and rails, and what sits in which U. `target: true` marks the node that is torn down.
//
// Units: mm, W, GB. dims are [width (x), height (y), length/depth (z)] as the part sits in the chassis.
// Kinds the builders know: rack, pdu, rail, blank, switch, chassis, cover, board, pcieboard, gpu, nvlink, drive,
// fan, fancage, cpu, socket, heatsink, dimm, duct, psu, riser, nic, ocp, boot.
// Optional slots (ocp, boot, nics, drives, gpu, ...) can be deleted from a server; counts can be 0.
// Layout checks run at load: anything that does not fit is reported with console.warn and squeezed, never hidden.

export const CATALOG = {
  // ------------------------------------------------------------ cabinet
  'rack.42u-1200': {
    kind: 'rack', name: 'Lenovo 42U 1200 mm Deep Rack', sub: 'Dynamic rack cabinet', dims: [600, 2011, 1200],
    units: 42, plinth: 100,
    spec: [['Height', '42U · 1U = 44.45 mm'], ['Footprint', '600 × 1200 mm'], ['Mounting', 'EIA-310 19-inch'], ['Doors', 'Perforated, front to back air']],
  },
  'pdu.3ph-63a': {
    kind: 'pdu', name: '0U Switched PDU', sub: '3-phase 400 V · 63 A', dims: [56, 1760, 100], volts: 400, amps: 63, phases: 3,
    spec: [['Input', '3φ 400 V · 63 A'], ['Outlets', '36 × C13 · 12 × C19'], ['Feed', 'A / B redundant']],
  },
  'rail.slide': {
    kind: 'rail', name: 'Slide Rail Kit', sub: '3-stage ball-bearing', dims: [12, 36, 720], travel: 620,
    spec: [['Stages', '3, ball-bearing'], ['Install', 'Tool-less']],
  },
  'blank.1u': {kind: 'blank', name: '1U Filler Panels', sub: 'Stop hot air recirculating', dims: [482.6, 44, 10], spec: [['Purpose', 'Seal empty U slots']]},

  // ------------------------------------------------------------ network
  'sw.leaf-400g': {
    kind: 'switch', name: '400 GbE Leaf Switch', sub: '32 × QSFP-DD · 1U', units: 1, dims: [440, 43.6, 560], watts: 700, ports: 32, portStyle: 'qsfp',
    spec: [['Ports', '32 × 400 GbE QSFP-DD'], ['Fabric', 'GPU east-west traffic']],
  },
  'sw.mgmt-1g': {
    kind: 'switch', name: '1 GbE Management Switch', sub: '48 × RJ45 · 1U', units: 1, dims: [440, 43.6, 300], watts: 80, ports: 48, portStyle: 'rj45',
    spec: [['Ports', '48 × 1 GbE RJ45'], ['Carries', 'XClarity BMC traffic']],
  },

  // ------------------------------------------------------------ server structure (SR675 V3)
  'chassis.sr675v3': {kind: 'chassis', name: 'SR675 V3 Chassis', sub: 'Steel 3U enclosure', dims: [448, 130, 874], spec: [['Size', '448 × 130 × 874 mm'], ['Airflow', 'Front to back']]},
  'cover.sr675v3': {kind: 'cover', name: 'Top Cover', sub: 'Tool-less latch', dims: [448, 1.5, 874], spec: [['Material', 'Steel sheet'], ['Removal', 'Latch and slide']]},
  'mb.sr675v3': {
    kind: 'board', name: 'System Board', sub: 'XClarity Controller 2 BMC', dims: [440, 2, 0], watts: 60,
    spec: [['Sockets', 'SP5'], ['Memory', 'DDR5, 12 channels per CPU'], ['BMC', 'XClarity Controller 2']],
  },
  'pcie.sw-board': {
    kind: 'pcieboard', name: 'GPU Switch Board', sub: 'PCIe Gen5 fan-out', dims: [440, 6, 0], watts: 100, switches: 2,
    spec: [['Links', 'CPUs ↔ GPUs ↔ NICs'], ['Lanes', 'PCIe Gen5 x16 per GPU']],
  },
  'cage.fan': {kind: 'fancage', name: 'Fan Cage', sub: 'Hot-swap fan wall', dims: [440, 100, 64], spec: [['Holds', 'The front-to-back fan wall']]},
  'duct.cpu': {kind: 'duct', name: 'CPU Air Baffle', sub: 'Steers air over the heat sinks', dims: [440, 14, 0], spec: [['Material', 'Moulded plastic'], ['Job', 'No air bypasses the fins']]},
  'riser.x16': {kind: 'riser', name: 'PCIe Riser Cage', sub: 'Rear PCIe Gen5 x16 slots', dims: [0, 84, 175], spec: [['Slots', 'PCIe Gen5 x16, HHHL']]},

  // ------------------------------------------------------------ compute
  'cpu.epyc-9554': {
    kind: 'cpu', name: 'AMD EPYC 9554', sub: '64 cores · SP5', dims: [72, 6, 75.4], watts: 360, label: 'AMD EPYC',
    spec: [['Cores', '64 / 128 threads'], ['Clock', '3.1 GHz · 3.75 boost'], ['L3 cache', '256 MB'], ['TDP', '360 W']],
  },
  'sock.sp5': {kind: 'socket', name: 'SP5 Socket', sub: 'LGA 6096', dims: [86, 7, 96], spec: [['Contacts', '6,096 (LGA)'], ['Memory', '12 DDR5 channels']]},
  'hs.cpu-sp5': {
    kind: 'heatsink', name: 'CPU Heat Sink', sub: 'Copper base, aluminium fins', dims: [100, 86, 115], fins: 36, pipes: 4,
    spec: [['Rated', '360 W TDP'], ['Pipes', '4 copper heat pipes']],
  },
  'mem.ddr5-64g': {
    kind: 'dimm', name: '64 GB DDR5-4800 RDIMM', sub: 'Registered ECC', dims: [7.5, 31.25, 133.35], watts: 10, gb: 64,
    spec: [['Capacity', '64 GB'], ['Speed', '4800 MT/s'], ['Type', 'RDIMM, ECC']],
  },

  // ------------------------------------------------------------ accelerators
  'gpu.h100-nvl': {
    kind: 'gpu', name: 'NVIDIA H100 NVL', sub: '94 GB HBM3 · PCIe Gen5', dims: [40, 111.15, 267.7], watts: 400, idle: 60, gb: 94,
    label: 'H100 NVL', fp8: 3341,
    spec: [['Memory', '94 GB HBM3 · 3.9 TB/s'], ['FP8', '3,341 TFLOPS sparse'], ['Power', '400 W max'], ['Form', 'FHFL double-width']],
  },
  'nvl.bridge-h100': {
    kind: 'nvlink', name: 'NVLink Bridge', sub: 'Joins a GPU pair', dims: [0, 7, 22],
    spec: [['Bandwidth', '600 GB/s per pair'], ['Per pair', '3 bridges']],
  },

  // ------------------------------------------------------------ storage, network cards
  'ssd.e1s-7t68': {
    kind: 'drive', name: 'E1.S NVMe SSD', sub: '7.68 TB · hot-swap', dims: [15, 31.5, 118.75], watts: 20, tb: 7.68,
    spec: [['Capacity', '7.68 TB'], ['Form', 'E1.S 15 mm'], ['Interface', 'NVMe PCIe x4']],
  },
  'ssd.u2-3t84': {kind: 'drive', name: '2.5-inch NVMe SSD', sub: '3.84 TB · hot-swap', dims: [15, 70, 100], watts: 14, tb: 3.84, spec: [['Capacity', '3.84 TB']]},
  'nic.cx7-400': {
    kind: 'nic', name: 'NVIDIA ConnectX-7', sub: '400 Gb/s NDR · 1-port', dims: [18, 68.9, 167.65], watts: 25, gbps: 400,
    spec: [['Speed', '400 Gb/s IB / Ethernet'], ['Bus', 'PCIe Gen5 x16'], ['Role', 'GPU fabric']],
  },
  'nic.ocp-2x25': {kind: 'ocp', name: 'OCP 3.0 Adapter', sub: '2 × 25 GbE', dims: [76, 12, 115], watts: 15, spec: [['Ports', '2 × 25 GbE SFP28'], ['Role', 'Front-end network']]},
  'm2.boot-2x960': {kind: 'boot', name: 'M.2 Boot Adapter', sub: '2 × 960 GB · RAID 1', dims: [42, 8, 110], watts: 16, spec: [['Drives', '2 × 960 GB M.2 NVMe'], ['RAID', '1, mirrored OS']]},

  // ------------------------------------------------------------ power and cooling
  'psu.2600-ti': {
    kind: 'psu', name: '2600 W Titanium PSU', sub: 'Hot-swap', dims: [73.5, 40, 185], output: 2600, efficiency: 0.96,
    spec: [['Output', '2600 W'], ['Efficiency', '96 % (Titanium)'], ['Swap', 'Hot, no tools']],
  },
  'fan.80-dual': {
    kind: 'fan', name: '80 mm Dual-Rotor Fan', sub: 'Hot-swap', dims: [80, 80, 56], watts: 45, rpm: 13000,
    spec: [['Size', '80 × 80 × 56 mm'], ['Rotors', '2, counter-rotating'], ['Max', '13,000 rpm']],
  },
};

export const SERVERS = {
  'sr675v3-8dw': {
    name: 'ThinkSystem SR675 V3', sub: '8 × double-wide GPU · 3U', units: 3, dims: [448, 130, 874],
    chassis: 'chassis.sr675v3', cover: 'cover.sr675v3', board: 'mb.sr675v3', gpuBoard: 'pcie.sw-board', duct: 'duct.cpu', fanCage: 'cage.fan',
    cpu: {part: 'cpu.epyc-9554', count: 2, socket: 'sock.sp5', heatsink: 'hs.cpu-sp5'},
    memory: {part: 'mem.ddr5-64g', perCpu: 12},
    gpu: {part: 'gpu.h100-nvl', count: 8, bridge: 'nvl.bridge-h100', bridgesPerPair: 3},
    drives: {part: 'ssd.e1s-7t68', count: 6},
    fans: {part: 'fan.80-dual', count: 5},
    psu: {part: 'psu.2600-ti', count: 4, redundancy: 'N+N'},
    nics: {part: 'nic.cx7-400', count: 4, riser: 'riser.x16'},
    ocp: {part: 'nic.ocp-2x25'},
    boot: {part: 'm2.boot-2x960'},
  },
  // Front only (never torn down here): enough to draw its face and count its power.
  'sr650v3': {
    name: 'ThinkSystem SR650 V3', sub: '2U storage / head node', units: 2, dims: [445, 86.5, 764], shell: true, watts: 900,
    drives: {part: 'ssd.u2-3t84', count: 24},
  },
};

export const RACK = {
  part: 'rack.42u-1200',
  pdu: {part: 'pdu.3ph-63a', count: 2},
  rail: 'rail.slide',
  blank: 'blank.1u',
  // u is the lowest U the device occupies (U1 at the bottom). Empty U get filler panels.
  layout: [
    {u: 42, part: 'sw.leaf-400g', name: 'Leaf A'},
    {u: 41, part: 'sw.leaf-400g', name: 'Leaf B'},
    {u: 40, part: 'sw.mgmt-1g', name: 'Mgmt'},
    {u: 34, server: 'sr675v3-8dw', name: 'GPU node 1'},
    {u: 30, server: 'sr675v3-8dw', name: 'GPU node 2'},
    {u: 26, server: 'sr675v3-8dw', name: 'GPU node 3'},
    {u: 22, server: 'sr675v3-8dw', name: 'GPU node 4', target: true},
    {u: 16, server: 'sr650v3', name: 'Storage 1'},
    {u: 13, server: 'sr650v3', name: 'Storage 2'},
  ],
};

export const TITLE = {name: 'Lenovo AI Rack', sub: 'ThinkSystem SR675 V3 GPU cluster'};
