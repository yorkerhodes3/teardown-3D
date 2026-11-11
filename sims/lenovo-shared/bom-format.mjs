export const BOM_STORAGE_KEY = 'teardown-bom-v1';
export const MAX_BOM_BYTES = 256 * 1024;
export const SLOT_KINDS = {
  cpu: 'cpu', memory: 'dimm', gpu: 'gpu', drives: 'drive', fans: 'fan',
  psu: 'psu', nics: 'nic', ocp: 'ocp', boot: 'boot',
};
const STRUCTURE = {
  chassis: 'chassis', cover: 'cover', board: 'board', gpuBoard: 'pcieboard',
  duct: 'duct', fanCage: 'fancage',
};
const KINDS = new Set(['rack', 'pdu', 'rail', 'blank', 'switch', ...Object.values(SLOT_KINDS),
  ...Object.values(STRUCTURE), 'nvlink', 'socket', 'heatsink', 'riser']);
const NUMBERS = {
  watts: 100000, units: 60, plinth: 300, volts: 1000, amps: 1000, phases: 3,
  travel: 1500, ports: 128, switches: 8, fins: 96, pipes: 16,
  idle: 100000, gb: 100000, fp8: 1000000, tb: 100000, gbps: 100000,
  output: 100000, efficiency: 1, rpm: 100000,
};
const INTEGER_FIELDS = new Set(['units', 'phases', 'ports', 'switches', 'fins', 'pipes']);
const ZERO_DIMS = new Set(['board', 'pcieboard', 'duct', 'riser', 'nvlink']);

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}
function object(value, path, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || (allowed && !allowed.includes(key))) {
      fail(`${path}.${key}`, 'unsupported field');
    }
  }
}
function text(value, path, max = 160) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f]/.test(value)) {
    fail(path, `expected text of at most ${max} characters, without control characters`);
  }
}
function number(value, path, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail(path, `expected ${integer ? 'an integer' : 'a number'} from ${min} to ${max}`);
  }
}
function dimensions(value, path, zero = false) {
  if (!Array.isArray(value) || value.length !== 3) fail(path, 'expected [width, height, depth] in mm');
  value.forEach((v, i) => number(v, `${path}[${i}]`, zero ? 0 : 0.1, 3000));
}
function entries(value, path, max) {
  object(value, path);
  const rows = Object.entries(value);
  if (!rows.length || rows.length > max) fail(path, `expected 1 to ${max} entries`);
  for (const [id] of rows) if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id)) fail(`${path}.${id}`, 'invalid id');
  return rows;
}

/** Validate before storing or applying any imported data. Never evaluate uploaded code. */
export function validateBom(input) {
  object(input, 'BOM', ['format', 'version', 'title', 'catalog', 'servers', 'rack']);
  if (input.format !== 'teardown-bom' || input.version !== 1) fail('BOM', 'expected format "teardown-bom", version 1');
  object(input.title, 'title', ['name', 'sub', 'brand', 'badgeColor']);
  for (const k of ['name', 'sub', 'brand']) text(input.title[k], `title.${k}`, k === 'brand' ? 24 : 100);
  if (!input.title.name.trim() || !input.title.brand.trim()) fail('title', 'name and brand cannot be blank');
  if (!/^#[0-9a-f]{6}$/i.test(input.title.badgeColor)) fail('title.badgeColor', 'expected a six-digit hex color');
  for (const [id, part] of entries(input.catalog, 'catalog', 128)) {
    const path = `catalog.${id}`;
    object(part, path, ['kind', 'name', 'sub', 'dims', 'spec', 'label', 'vendor', 'portStyle', ...Object.keys(NUMBERS)]);
    if (!KINDS.has(part.kind)) fail(`${path}.kind`, 'unsupported geometry kind');
    text(part.name, `${path}.name`);
    if (!part.name.trim()) fail(`${path}.name`, 'cannot be blank');
    text(part.sub, `${path}.sub`);
    dimensions(part.dims, `${path}.dims`, ZERO_DIMS.has(part.kind));
    if (!Array.isArray(part.spec) || part.spec.length > 12) fail(`${path}.spec`, 'expected at most 12 [label, value] pairs');
    part.spec.forEach((pair, i) => {
      if (!Array.isArray(pair) || pair.length !== 2) fail(`${path}.spec[${i}]`, 'expected [label, value]');
      pair.forEach((v) => text(v, `${path}.spec[${i}]`));
    });
    for (const k of ['label', 'vendor']) if (part[k] !== undefined) text(part[k], `${path}.${k}`, 48);
    if (part.portStyle !== undefined && !['qsfp', 'rj45'].includes(part.portStyle)) fail(`${path}.portStyle`, 'expected qsfp or rj45');
    for (const [k, max] of Object.entries(NUMBERS)) {
      if (part[k] !== undefined) number(part[k], `${path}.${k}`, 0, max, INTEGER_FIELDS.has(k));
    }
    const required = {
      rack: ['units', 'plinth'], pdu: ['volts', 'amps', 'phases'], rail: ['travel'],
      switch: ['ports', 'watts'], cpu: ['watts'], gpu: ['watts', 'gb'],
      dimm: ['watts', 'gb'], drive: ['watts', 'tb'], fan: ['watts', 'rpm'],
      psu: ['output', 'efficiency'], pcieboard: ['switches'],
    }[part.kind] || [];
    for (const k of required) {
      number(part[k], `${path}.${k}`, k === 'plinth' ? 0 : 0.001, NUMBERS[k], INTEGER_FIELDS.has(k));
    }
    if (part.kind === 'pdu' && ![1, 3].includes(part.phases)) fail(`${path}.phases`, 'expected 1 or 3');
  }
  const ref = (id, kind, path) => {
    if (typeof id !== 'string' || !Object.hasOwn(input.catalog, id) || input.catalog[id].kind !== kind) {
      fail(path, `expected a catalog id of kind "${kind}"`);
    }
    return input.catalog[id];
  };
  for (const [id, server] of entries(input.servers, 'servers', 16)) {
    const path = `servers.${id}`;
    object(server, path, ['name', 'sub', 'units', 'dims', 'shell', 'watts', ...Object.keys(STRUCTURE), ...Object.keys(SLOT_KINDS)]);
    text(server.name, `${path}.name`);
    if (!server.name.trim()) fail(`${path}.name`, 'cannot be blank');
    text(server.sub, `${path}.sub`);
    dimensions(server.dims, `${path}.dims`);
    number(server.units, `${path}.units`, 1, 12, true);
    if (server.dims[0] < 200 || server.dims[1] < 30 || server.dims[2] < 400) fail(`${path}.dims`, 'chassis must be at least 200 × 30 × 400 mm');
    if (server.shell !== undefined && typeof server.shell !== 'boolean') fail(`${path}.shell`, 'expected a boolean');
    if (server.watts !== undefined) number(server.watts, `${path}.watts`, 0, 100000);
    for (const [key, kind] of Object.entries(STRUCTURE)) {
      if (server[key] !== undefined || (!server.shell && ['chassis', 'cover'].includes(key))) ref(server[key], kind, `${path}.${key}`);
    }
    let nodeBudget = 0;
    for (const [slot, kind] of Object.entries(SLOT_KINDS)) {
      const config = server[slot];
      if (config === undefined) continue;
      const at = `${path}.${slot}`;
      const extras = {cpu: ['socket', 'heatsink'], gpu: ['bridge', 'bridgesPerPair'], psu: ['redundancy'], nics: ['riser']}[slot] || [];
      object(config, at, ['part', ...(slot === 'memory' ? ['perCpu'] : ['ocp', 'boot'].includes(slot) ? [] : ['count']), ...extras]);
      ref(config.part, kind, `${at}.part`);
      if (!['ocp', 'boot'].includes(slot)) {
        const key = slot === 'memory' ? 'perCpu' : 'count';
        const max = {cpu: 4, gpu: 16, psu: 8, fans: 16}[slot] || 32;
        number(config[key], `${at}.${key}`, 0, max, true);
        nodeBudget += config[key] * (slot === 'gpu' ? 4 : slot === 'memory' ? (server.cpu?.count || 0) : 1);
      }
      for (const [key, kind] of Object.entries({socket: 'socket', heatsink: 'heatsink', bridge: 'nvlink', riser: 'riser'})) {
        if (config[key] !== undefined) ref(config[key], kind, `${at}.${key}`);
      }
      if (config.bridgesPerPair !== undefined) number(config.bridgesPerPair, `${at}.bridgesPerPair`, 1, 8, true);
      if (config.redundancy !== undefined && !['N', 'N+1', 'N+N'].includes(config.redundancy)) fail(`${at}.redundancy`, 'expected N, N+1 or N+N');
    }
    if (nodeBudget > 240) fail(path, 'too many components for the interactive model (limit 240 weighted parts)');
    if (!server.shell) {
      if (!server.cpu?.count) fail(`${path}.cpu`, 'at least one CPU is required');
      const psu = server.psu;
      const min = psu?.redundancy === 'N+N' || psu?.redundancy === 'N+1' ? 2 : 1;
      if (!psu || psu.count < min) fail(`${path}.psu`, `at least ${min} PSUs required for this redundancy`);
      if (input.catalog[psu.part].dims[0] * 2 + 20 >= server.dims[0] - 8) fail(`${path}.psu`, 'PSUs leave no rear component space');
    }
  }
  const rack = input.rack;
  object(rack, 'rack', ['part', 'pdu', 'rail', 'blank', 'layout']);
  const cabinet = ref(rack.part, 'rack', 'rack.part');
  if (cabinet.dims[0] < 500 || cabinet.dims[2] < 600) fail('rack.part', 'cabinet must be at least 500 mm wide and 600 mm deep');
  ref(rack.rail, 'rail', 'rack.rail');
  ref(rack.blank, 'blank', 'rack.blank');
  object(rack.pdu, 'rack.pdu', ['part', 'count']);
  ref(rack.pdu.part, 'pdu', 'rack.pdu.part');
  number(rack.pdu.count, 'rack.pdu.count', 1, 4, true);
  if (!Array.isArray(rack.layout) || !rack.layout.length || rack.layout.length > 48) fail('rack.layout', 'expected 1 to 48 devices');
  let targets = 0;
  const occupied = new Set();
  for (const [i, device] of rack.layout.entries()) {
    const path = `rack.layout[${i}]`;
    object(device, path, ['u', 'server', 'part', 'name', 'target']);
    number(device.u, `${path}.u`, 1, cabinet.units, true);
    if (device.name !== undefined) text(device.name, `${path}.name`);
    if (device.target !== undefined && typeof device.target !== 'boolean') fail(`${path}.target`, 'expected a boolean');
    if (Boolean(device.server) === Boolean(device.part)) fail(path, 'specify exactly one server or part');
    let units;
    if (device.server) {
      if (!Object.hasOwn(input.servers, device.server)) fail(`${path}.server`, 'unknown server configuration');
      const server = input.servers[device.server];
      units = server.units;
      if (device.target) {
        if (server.shell) fail(path, 'target must be a detailed server, not a shell');
        targets++;
      }
    } else {
      units = ref(device.part, 'switch', `${path}.part`).units || 1;
      if (device.target) fail(path, 'a switch cannot be the teardown target');
    }
    for (let u = device.u; u < device.u + units; u++) {
      if (u > cabinet.units) fail(path, 'device extends beyond the rack');
      if (occupied.has(u)) fail(path, `overlap at U${u}`);
      occupied.add(u);
    }
  }
  if (targets !== 1) fail('rack.layout', 'exactly one detailed server must have target: true');
  return structuredClone(input);
}

export function parseBom(text) {
  if (new TextEncoder().encode(text).length > MAX_BOM_BYTES) fail('BOM', 'file exceeds 256 KiB');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('BOM', 'invalid JSON; upload a .json file exported by this dashboard');
  }
  return validateBom(value);
}
