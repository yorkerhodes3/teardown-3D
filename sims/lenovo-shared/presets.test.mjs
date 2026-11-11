import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parseBom} from './bom-format.mjs';

for (const name of ['lenovo-sr675-v3', 'dell-r760xa', 'hpe-dl380a-gen11', 'supermicro-as4125gs']) {
  test(`${name} is a complete validated rack with a working model`, () => {
    const text = readFileSync(new URL(`./presets/${name}.json`, import.meta.url), 'utf8');
    const bom = parseBom(text);
    assert.ok(bom.rack.layout.length >= 6);
    const config = bom.servers[bom.rack.layout.find((device) => device.target).server];
    assert.ok(config.cpu.count && config.gpu.count && config.memory.perCpu && config.psu.count);
    if (name === 'supermicro-as4125gs') {
      assert.equal(bom.catalog[config.gpu.part].name, 'NVIDIA L40S');
      assert.equal(bom.catalog[config.gpu.part].gb, 48);
      assert.equal(bom.catalog[config.gpu.part].watts, 350);
    }
    const script = `
      globalThis.sessionStorage = {getItem: () => ${JSON.stringify(text)}};
      const b = await import(${JSON.stringify(new URL('./bom.js', import.meta.url).href)});
      b.restoreBom();
      const m = await import(${JSON.stringify(new URL('./model.js', import.meta.url).href)});
      if (b.BOM_LOAD_ERROR || !m.TARGET || !m.NODES.size || m.WARN.length) throw new Error(JSON.stringify(m.WARN));
      if (!m.info('server').spec.some(([key, value]) => key === 'Memory' && value.includes('GPU memory'))) throw new Error('Memory description is not vendor-neutral');
      const film = await import(${JSON.stringify(new URL('./film.js', import.meta.url).href)});
      film.makeCursor({stageSpot: () => [0,0], bomSpot: i => {if (i < 0) throw new Error('Missing BOM row'); return [0,0]}, spots: {risk: [0,0]}});
    `;
    const result = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
  });
}
