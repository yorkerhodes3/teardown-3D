import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {DEFAULT_BOM} from './bom.js';
import {MAX_BOM_BYTES, parseBom, validateBom} from './bom-format.mjs';

const copy = () => structuredClone(DEFAULT_BOM);
const target = (bom) => bom.servers[bom.rack.layout.find((d) => d.target).server];

test('default BOM round-trips without sharing references', () => {
  const result = parseBom(JSON.stringify(DEFAULT_BOM));
  assert.deepEqual(result, DEFAULT_BOM);
  result.title.name = 'Edited';
  assert.notEqual(DEFAULT_BOM.title.name, 'Edited');
});

test('supports new same-kind SKUs, branding, counts and retargeting', () => {
  const bom = copy();
  bom.title = {name: 'Supermicro AI Rack', sub: 'Illustrative build', brand: 'Supermicro', badgeColor: '#34373c'};
  bom.catalog['gpu.example'] = {...bom.catalog['gpu.h100-nvl'], name: 'Example accelerator', label: 'Example', vendor: 'AMD'};
  target(bom).gpu = {part: 'gpu.example', count: 4};
  target(bom).memory.perCpu = 8;
  bom.rack.layout.find((d) => d.target).target = false;
  bom.rack.layout.find((d) => d.u === 34).target = true;
  assert.equal(validateBom(bom).catalog['gpu.example'].vendor, 'AMD');
});

test('optional components may be removed, including GPUs and memory', () => {
  const bom = copy();
  for (const slot of ['gpu', 'memory', 'fans', 'drives', 'nics', 'ocp', 'boot']) delete target(bom)[slot];
  assert.doesNotThrow(() => validateBom(bom));
});

for (const [label, change, error] of [
  ['wrong version', (b) => { b.version = 2; }, /version 1/],
  ['missing title', (b) => { delete b.title; }, /title/],
  ['blank server name', (b) => { target(b).name = ' '; }, /cannot be blank/],
  ['unsupported kind', (b) => { b.catalog['gpu.h100-nvl'].kind = 'oam'; }, /unsupported geometry/],
  ['missing dimensions', (b) => { delete b.catalog['gpu.h100-nvl'].dims; }, /dims/],
  ['zero physical dimensions', (b) => { b.catalog['gpu.h100-nvl'].dims[0] = 0; }, /dims/],
  ['negative watts', (b) => { b.catalog['gpu.h100-nvl'].watts = -1; }, /watts/],
  ['unsafe color', (b) => { b.title.badgeColor = 'url(https://example.com)'; }, /hex color/],
  ['wrong slot kind', (b) => { target(b).gpu.part = 'cpu.epyc-9554'; }, /kind "gpu"/],
  ['unknown reference', (b) => { target(b).cpu.socket = 'missing'; }, /socket/],
  ['fractional count', (b) => { target(b).gpu.count = 2.5; }, /integer/],
  ['huge count', (b) => { target(b).gpu.count = 100000; }, /integer/],
  ['geometry allocation limit', (b) => { b.catalog['hs.cpu-sp5'].fins = 100000; }, /fins/],
  ['no CPU', (b) => { target(b).cpu.count = 0; }, /CPU/],
  ['insufficient redundant PSUs', (b) => { target(b).psu.count = 1; }, /PSUs/],
  ['bad spec pairs', (b) => { b.catalog['gpu.h100-nvl'].spec = [['Bad']]; }, /label, value/],
  ['rack overlap', (b) => { b.rack.layout[0].u = 41; }, /overlap/],
  ['rack overflow', (b) => { b.rack.layout.find((d) => d.target).u = 42; }, /beyond|overlap/],
  ['multiple targets', (b) => { b.rack.layout[3].target = true; }, /exactly one/],
  ['no target', (b) => { b.rack.layout.find((d) => d.target).target = false; }, /exactly one/],
  ['shell target', (b) => { target(b).shell = true; }, /shell/],
  ['executable field', (b) => { b.script = 'alert(1)'; }, /unsupported field/],
  ['prototype key', (b) => { b.catalog = JSON.parse('{"__proto__":{}}'); }, /unsupported field/],
]) {
  test(`rejects ${label}`, () => {
    const bom = copy();
    change(bom);
    assert.throws(() => validateBom(bom), error);
  });
}

test('rejects malformed, oversized and non-finite JSON', () => {
  assert.throws(() => parseBom('{bad'), /invalid JSON/);
  assert.throws(() => parseBom(' '.repeat(MAX_BOM_BYTES + 1)), /exceeds/);
  assert.throws(() => parseBom(JSON.stringify(DEFAULT_BOM).replace('"count":8', '"count":1e999')), /integer/);
});

test('saved BOM is restored before model evaluation', () => {
  const bom = copy();
  target(bom).gpu.count = 4;
  target(bom).memory.perCpu = 8;
  bom.title.brand = 'Supermicro';
  const source = `
    import {restoreBom, TITLE} from ${JSON.stringify(new URL('./bom.js', import.meta.url).href)};
    globalThis.sessionStorage = {getItem: () => ${JSON.stringify(JSON.stringify(bom))}};
    restoreBom();
    const m = await import(${JSON.stringify(new URL('./model.js', import.meta.url).href)});
    if (m.TOTALS.gpus !== 16 || m.TOTALS.memTB !== 1 || TITLE.brand !== 'Supermicro') throw new Error('BOM not applied');
    console.log('restored');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /restored/);
});

test('tour skips selections of optional components absent from the applied BOM', () => {
  const bom = copy();
  delete target(bom).gpu;
  const source = `
    import {restoreBom} from ${JSON.stringify(new URL('./bom.js', import.meta.url).href)};
    globalThis.sessionStorage = {getItem: () => ${JSON.stringify(JSON.stringify(bom))}};
    restoreBom();
    const film = await import(${JSON.stringify(new URL('./film.js', import.meta.url).href)});
    if (film.selectAt(20.9).sel !== null || film.selectAt(28).sel !== 'cpu-0') throw new Error('Invalid tour selection');
    film.makeCursor({
      stageSpot: () => [0, 0],
      bomSpot: (i) => { if (i < 0) throw new Error('Cursor points to an absent BOM row'); return [0, 0]; },
      spots: {risk: [0, 0]},
    });
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
});
