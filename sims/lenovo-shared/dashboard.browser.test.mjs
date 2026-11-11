// Build lenovo-live first. Set CHROMIUM when using a system Chrome instead of Playwright's browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {DEFAULT_BOM} from './bom.js';
import {BOM_STORAGE_KEY, MAX_BOM_BYTES} from './bom-format.mjs';

test('dashboard edits, validates, imports, exports, reloads and hides risks without clearing them', {timeout: 360000}, async (t) => {
  const html = await readFile(new URL('../../teardown-out/dist/lenovo-live.html', import.meta.url));
  const server = createServer((request, response) => {
    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(90000);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const ready = async () => {
    await page.waitForFunction(() => window.LIVE && window.TEARDOWN);
    await page.evaluate(() => {
      window.LIVE.st.setQuality({ao: false, shadow: 256, samples: 0});
      window.LIVE.st.resize(1600, 900, 0.5);
    });
  };
  await page.goto(url);
  await ready();
  const panel = page.locator('.bom-dashboard');
  const open = async () => {
    if (await panel.getAttribute('open') === null) await panel.locator(':scope > summary').click();
  };
  await open();
  assert.equal(await panel.locator('.dash-body').isVisible(), true);
  await page.evaluate(() => window.TEARDOWN.setRisk([{match: 'gpu-2', level: 'high'}]));
  await page.waitForFunction(() => window.LIVE.st.rack.parts.get('gpu-2').risk > 0);
  await panel.getByLabel('Show risk signals and red highlights').uncheck();
  await page.waitForFunction(() => window.LIVE.st.rack.parts.get('gpu-2').risk === 0);
  assert.equal(await page.evaluate(() => window.TEARDOWN.risk.list.length), 1);
  await page.evaluate(() => window.TEARDOWN.addRisk({match: 'psu-0', level: 'critical'}));
  await panel.getByLabel('Show risk signals and red highlights').check();
  await page.waitForFunction(() => window.LIVE.st.rack.parts.get('gpu-2').risk > 0 && window.LIVE.st.rack.parts.get('psu-0').risk > 0);
  await panel.getByLabel('Display title', {exact: true}).fill('Supermicro example rack');
  await panel.getByLabel('Rack / server badge text').fill('Supermicro');
  await panel.getByLabel('Badge color').fill('#34373c');
  const gpuRow = panel.locator('.dash-row').filter({has: page.getByRole('combobox', {name: 'GPU', exact: true})});
  const memoryRow = panel.locator('.dash-row').filter({has: page.getByRole('combobox', {name: 'Memory', exact: true})});
  await gpuRow.getByLabel('Qty', {exact: true}).fill('4');
  await memoryRow.getByLabel('/ CPU', {exact: true}).fill('8');
  const downloadWait = page.waitForEvent('download');
  await panel.getByRole('button', {name: 'Export JSON'}).click();
  const download = await downloadWait;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.title.brand, 'Supermicro');
  assert.equal(exported.servers['sr675v3-8dw'].gpu.count, 4);
  exported.catalog['gpu.example'] = {...exported.catalog['gpu.h100-nvl'], name: 'Example accelerator', vendor: '', label: 'Example'};
  exported.servers['sr675v3-8dw'].gpu.part = 'gpu.example';
  exported.title.sub = '';
  const upload = panel.getByLabel('Upload BOM', {exact: false});
  const send = async (value, name = 'bom.json') => {
    await upload.setInputFiles({name, mimeType: 'application/json', buffer: Buffer.from(value)});
    await page.waitForFunction(() => document.querySelector('.bom-dashboard input[type=file]').value === '');
  };
  for (const [value, name] of [['{bad', 'bad.json'], [JSON.stringify({...DEFAULT_BOM, version: 99}), 'bad.json'], [' '.repeat(MAX_BOM_BYTES + 1), 'big.json'], ['alert(1)', 'bad.js']]) {
    await send(value, name);
    await page.waitForFunction(() => document.querySelector('.dash-status').dataset.error === 'true');
    assert.match(await panel.locator('.dash-status').textContent(), /Upload rejected/);
    assert.equal(await panel.getByLabel('Display title', {exact: true}).inputValue(), 'Supermicro example rack');
  }
  await send(JSON.stringify(exported));
  await page.waitForFunction(() => document.querySelector('.dash-status').textContent.includes('into the editor'));
  await Promise.all([
    page.waitForEvent('load'),
    panel.getByRole('button', {name: 'Apply BOM and reload'}).click(),
  ]);
  await ready();
  assert.deepEqual(await page.evaluate(() => ({
    gpu: [...window.LIVE.st.rack.parts.keys()].filter((id) => /^gpu-\d+$/.test(id)).length,
    dimms: [...window.LIVE.st.rack.parts.keys()].filter((id) => /^dimm-\d+$/.test(id)).length,
  })), {gpu: 4, dimms: 16});
  assert.equal(await page.getByText('Supermicro example rack', {exact: false}).count() > 0, true);
  await open();
  assert.equal(await panel.getByRole('combobox', {name: 'GPU', exact: true}).inputValue(), 'gpu.example');
  await panel.locator(':scope > summary').click();
  assert.equal(await panel.locator('.dash-body').isVisible(), false);
  // A CPU-only BOM must not break scripted GPU selections or the FP8 display.
  const cpuOnly = structuredClone(exported);
  delete cpuOnly.servers['sr675v3-8dw'].gpu;
  cpuOnly.title.name = '<img src=x onerror=alert(1)>';
  await open();
  await send(JSON.stringify(cpuOnly));
  await page.waitForFunction(() => document.querySelector('.dash-status').textContent.includes('into the editor'));
  await Promise.all([page.waitForEvent('load'), panel.getByRole('button', {name: 'Apply BOM and reload'}).click()]);
  await ready();
  await page.waitForFunction(() => window.SIM_SHOWN);
  assert.equal(await page.locator('#app img').count(), 0);
  assert.equal(await page.getByText('<img src=x onerror=alert(1)>', {exact: false}).count() > 0, true);
  assert.equal(await page.evaluate(() => window.LIVE.st.rack.parts.has('gpu-0')), false);
  await open();
  page.once('dialog', (dialog) => dialog.accept());
  await Promise.all([page.waitForEvent('load'), panel.getByRole('button', {name: 'Reset to published BOM'}).click()]);
  await ready();
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), BOM_STORAGE_KEY), null);
  assert.equal(await page.evaluate(() => window.LIVE.st.rack.parts.has('gpu-7')), true);
  // Invalid saved data must show a recovery path rather than a broken page.
  await page.evaluate((key) => sessionStorage.setItem(key, '{bad'), BOM_STORAGE_KEY);
  await page.reload();
  await ready();
  assert.match(await panel.locator('.dash-status').textContent(), /Saved BOM could not be loaded/);
  assert.equal(await panel.locator('.dash-body').isVisible(), true);
  assert.deepEqual(errors, []);
});
