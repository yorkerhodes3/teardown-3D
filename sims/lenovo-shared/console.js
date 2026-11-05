// The teardown's overlay. Left: title, the teardown level, the rack elevation, the power budget, the transport.
// Right: the inspect card, the bill of materials, the risk signals, camera and overlay toggles. Bottom centre: the
// stage stepper. Leaders run from labels into the 3D parts. Red means risk and only risk. Fixed 1600 x 900 layout.
import {BOM, CATS, DEVICES, FREE_U, info, LMAX, PDU_KW, RACK, RACKDIM, STAGES, TARGET, TITLE, TOTALS, cat} from './model.js';
import {levelName} from './risk.js';

export const C = {ink: '#16181b', mute: '#8b8f95', faint: '#c9ccd0', line: '#e1e3e6', panel: 'rgba(248,248,249,.94)', red: '#e0201b', redBg: 'rgba(224,32,27,.08)', grey: ['#16181b', '#4a4f57', '#7d838c', '#a9aeb5', '#cfd2d6']};
export const CAMS = ['auto', 'front', 'side', 'top', 'rear'];
export const OVERLAYS = ['labels', 'isolate', 'risk', 'fans'];
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(20,22,26,.04)}
.cp{font-size:9.6px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.tb{position:absolute;height:19px;padding:0 7px;display:flex;align-items:center;justify-content:center;font-size:8.8px;font-weight:600;letter-spacing:.9px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;color:${C.ink};white-space:nowrap}
.call{position:absolute;white-space:nowrap;background:rgba(246,246,247,.88);padding:3px 6px;margin:-3px -6px;box-sizing:content-box}
.call b{display:block;font-size:11.5px;font-weight:600;letter-spacing:.1px}
.call span{display:block;font-size:8.6px;font-weight:500;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;margin-top:2px}
.call.rk b{color:${C.red}}
.bom{position:absolute;left:1329px;width:224px;height:13px;display:flex;align-items:center;font-size:9.6px;gap:6px;white-space:nowrap}
.bom i{font-style:normal;width:22px;text-align:right;color:${C.mute};font-weight:600}
.bom em{font-style:normal;flex:1;overflow:hidden;text-overflow:ellipsis}
.bom u{text-decoration:none;color:${C.mute};font-size:8.6px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.ink};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const pad2 = (n) => String(n).padStart(2, '0');

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const btn = {};

  // ------------------------------------------------------------ title, the teardown level
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.ink}"></div>`);
  add(`<div style="position:absolute;left:35px;top:45px;font-size:24px;font-weight:700;letter-spacing:-.2px">${esc(TITLE.name)} <span style="color:${C.mute};font-weight:500">· Teardown</span></div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:79px;font-weight:500;letter-spacing:1.5px;font-size:9px">${esc(TARGET.srv.name)} &nbsp;•&nbsp; ${TOTALS.nodes} NODES &nbsp;•&nbsp; ${TOTALS.gpus} × ${esc(TOTALS.gpuName)}</div>`);
  const lvBig = add(`<div style="position:absolute;left:33px;top:100px;font-size:56px;font-weight:800;letter-spacing:-3px;line-height:1"></div>`);
  add(`<div style="position:absolute;left:112px;top:132px;font-size:12px;font-weight:500;color:${C.mute}">/ ${pad2(LMAX)}</div>`);
  const lvName = add(`<div style="position:absolute;left:150px;top:104px;font-size:20px;font-weight:700"></div>`);
  const lvSub = add(`<div class="cp mu" style="position:absolute;left:150px;top:132px;font-weight:500;font-size:8.6px;letter-spacing:1.2px"></div>`);
  add(`<div style="position:absolute;left:35px;top:166px;width:247px;height:6px;border:1px solid ${C.faint};border-top:none"></div>`);
  add(`<div style="position:absolute;left:35px;top:174px;width:247px;height:9px;background:#e6e7e9"></div>`);
  const lvFill = add(`<div style="position:absolute;left:35px;top:174px;height:9px;background:${C.ink}"></div>`);
  for (let i = 1; i < LMAX; i++) add(`<div style="position:absolute;left:${35 + (247 * i) / LMAX}px;top:174px;width:1px;height:9px;background:#fff"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:35px;top:188px;font-size:9px;font-weight:500">ASSEMBLED</div>`);
  add(`<div class="cp" style="position:absolute;right:${1600 - 282}px;top:188px;font-size:9px;font-weight:500">EVERY COMPONENT</div>`);

  // ------------------------------------------------------------ rack elevation
  add(`<div class="pn" style="left:35px;top:214px;width:247px;height:386px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:226px;font-weight:700">RACK ELEVATION</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:226px;font-weight:500">${RACKDIM.units}U · FRONT</div>`);
  const elev = add(`<svg style="position:absolute;left:46px;top:244px" width="226" height="330"></svg>`);
  const elevNote = add(`<div class="cp mu" style="position:absolute;left:46px;top:580px;font-weight:500;font-size:8.6px"></div>`);

  // ------------------------------------------------------------ power
  add(`<div class="pn" style="left:35px;top:608px;width:247px;height:158px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:620px;font-weight:700">POWER</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:620px;font-weight:500">THIS NODE · AT THE WALL</div>`);
  const pwBig = add(`<div style="position:absolute;left:45px;top:636px;font-size:30px;font-weight:800;letter-spacing:-1.2px;line-height:1"></div>`);
  const pwSpark = add(`<svg style="position:absolute;left:160px;top:636px" width="112" height="30"></svg>`);
  const pwBar = add(`<svg style="position:absolute;left:46px;top:674px" width="226" height="40"></svg>`);
  const pwPsu = add(`<div style="position:absolute;left:46px;top:718px;font-size:9.5px;color:${C.mute}"></div>`);
  const pwRack = add(`<div style="position:absolute;left:46px;top:734px;font-size:9.5px;color:${C.mute}"></div>`);
  const pwGpu = add(`<div style="position:absolute;left:46px;top:750px;font-size:9.5px;color:${C.mute}"></div>`);

  // ------------------------------------------------------------ transport
  add(`<div class="pn" style="left:35px;top:774px;width:259px;height:111px"></div>`);
  btn.play = add(`<div class="tb" style="left:45px;top:782px;width:99px;height:26px;background:${C.ink};color:#fff;border-color:${C.ink};font-size:9.6px"></div>`);
  btn.back = add(`<div class="tb" style="left:149px;top:782px;width:66px;height:26px;font-size:9.6px">◀ STAGE</div>`);
  btn.fwd = add(`<div class="tb" style="left:219px;top:782px;width:66px;height:26px;font-size:9.6px">STAGE ▶</div>`);
  add(`<div class="cp" style="position:absolute;left:45px;top:818px;font-weight:500">TEARDOWN LEVEL</div>`);
  const lvVal = add(`<div class="cp" style="position:absolute;right:${1600 - 284}px;top:818px;font-weight:700"></div>`);
  const SL = {x: 46, w: 238};
  add(`<div style="position:absolute;left:${SL.x}px;top:836px;width:${SL.w}px;height:2px;background:#e1e3e6"></div>`);
  for (let i = 0; i <= LMAX; i++) add(`<div style="position:absolute;left:${SL.x + (SL.w * i) / LMAX}px;top:840px;width:1px;height:4px;background:${C.faint}"></div>`);
  const lvKnob = add(`<div style="position:absolute;top:831px;width:9px;height:11px;margin-left:-4.5px;background:${C.ink}"></div>`);
  add(`<div class="cp" style="position:absolute;left:45px;top:851px;font-weight:500">SPEED</div>`);
  const spVal = add(`<div class="cp" style="position:absolute;right:${1600 - 284}px;top:851px;font-weight:700"></div>`);
  add(`<div style="position:absolute;left:${SL.x}px;top:869px;width:${SL.w}px;height:2px;background:#e1e3e6"></div>`);
  const spKnob = add(`<div style="position:absolute;top:864px;width:9px;height:11px;margin-left:-4.5px;background:${C.ink}"></div>`);

  // ------------------------------------------------------------ inspect
  add(`<div class="pn" style="left:1318px;top:36px;width:245px;height:236px"></div>`);
  add(`<div class="cp" style="position:absolute;left:1329px;top:47px;font-weight:700">INSPECT</div>`);
  const inQty = add(`<div class="cp mu" style="position:absolute;right:${1600 - 1552}px;top:47px;font-weight:500"></div>`);
  const inName = add(`<div style="position:absolute;left:1329px;top:63px;width:224px;font-size:16px;font-weight:700;line-height:1.15"></div>`);
  const inSub = add(`<div class="cp mu" style="position:absolute;left:1329px;width:224px;font-weight:500;font-size:8.6px;letter-spacing:1.1px;white-space:normal;line-height:1.35"></div>`);
  const inSpec = add(`<div style="position:absolute;left:1329px;width:224px"></div>`);
  const inRisk = add(`<div style="position:absolute;left:1319px;top:216px;width:243px;height:55px;display:none"></div>`);

  // ------------------------------------------------------------ bill of materials
  const bomTop = 280;
  const bomH = 28 + BOM.length * 14 + 8;
  add(`<div class="pn" style="left:1318px;top:${bomTop}px;width:245px;height:${bomH}px"></div>`);
  add(`<div class="cp" style="position:absolute;left:1329px;top:${bomTop + 11}px;font-weight:700">BILL OF MATERIALS</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - 1552}px;top:${bomTop + 11}px;font-weight:500">PER NODE</div>`);
  const bomRows = BOM.map((g, i) => {
    const r = add(`<div class="bom" style="top:${bomTop + 28 + i * 14}px"><i>${g.qty}×</i><em>${esc(cat(g.cat).name)}</em><u>${g.watts ? `${(g.watts * g.qty).toLocaleString('en-US')} W` : ''}</u></div>`);
    return r;
  });

  // ------------------------------------------------------------ risk signals
  const rkTop = bomTop + bomH + 8;
  const rkH = 712 - rkTop;
  add(`<div class="pn" style="left:1318px;top:${rkTop}px;width:245px;height:${rkH}px"></div>`);
  add(`<div class="cp" style="position:absolute;left:1329px;top:${rkTop + 11}px;font-weight:700">RISK SIGNALS</div>`);
  const rkCount = add(`<div class="cp mu" style="position:absolute;right:${1600 - 1552}px;top:${rkTop + 11}px;font-weight:500"></div>`);
  const rkList = add(`<div style="position:absolute;left:1329px;top:${rkTop + 27}px;width:224px;height:${rkH - 32}px;overflow:hidden"></div>`);
  const rkRows = Math.max(1, Math.floor((rkH - 32) / 26));

  // ------------------------------------------------------------ camera and overlays
  add(`<div class="pn" style="left:1296px;top:720px;width:268px;height:165px"></div>`);
  const group = (title, keys, y) => {
    add(`<div class="cp mu" style="position:absolute;left:1305px;top:${y}px;font-weight:500">${title}</div>`);
    let x = 1305;
    keys.forEach((k) => {
      const w = Math.round(k.length * 6.2 + 16);
      btn[k] = add(`<div class="tb" style="left:${x}px;top:${y + 15}px;width:${w}px">${k.toUpperCase()}</div>`);
      x += w + 4;
    });
  };
  group('CAMERA', CAMS, 730);
  group('OVERLAYS', OVERLAYS, 778);
  add(`<div class="cp mu" style="position:absolute;left:1305px;top:828px;font-weight:500;font-size:8.4px;line-height:1.6;letter-spacing:1px;white-space:normal;width:250px">RED = RISK FROM AN EXTERNAL TOOL.<br>DEMO SIGNALS ARE FICTIONAL. CLICK TO INSPECT.</div>`);

  // ------------------------------------------------------------ stage stepper
  const ST = {x0: 480, dx: 107, y: 828};
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:${ST.y - 32}px;text-align:center;font-weight:500"><span style="color:${C.ink}">TEARDOWN</span> &nbsp;— &nbsp;CLICK A STAGE</div>`);
  const step = add(`<svg style="position:absolute;left:${ST.x0 - 20}px;top:${ST.y - 14}px" width="${ST.dx * LMAX + 40}" height="28"></svg>`);
  STAGES.forEach((s, i) => add(`<div class="cp" style="position:absolute;left:${ST.x0 + i * ST.dx - 50}px;width:100px;text-align:center;top:${ST.y + 18}px;font-weight:600;font-size:8.6px" data-st="${i}">${esc(s.name)}</div>`));
  const stLabels = [...ui.querySelectorAll('[data-st]')];
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:874px;text-align:center;font-weight:500;color:${C.faint}">DRAG TO ORBIT &nbsp;·&nbsp; SCROLL TO ZOOM &nbsp;·&nbsp; ← → STAGES &nbsp;·&nbsp; H HIDES THE OVERLAY</div>`);

  // ------------------------------------------------------------ callouts, the pointer
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  const stageSpot = (i) => [ST.x0 + i * ST.dx, ST.y];
  const bomSpot = (i) => [1440, bomTop + 28 + i * 14 + 6];
  const knobX = (v) => SL.x + v * SL.w;

  // the elevation's geometry
  const EU = 330 / RACKDIM.units;
  const ey = (u) => 330 - u * EU;
  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };
  const tbOn = (n, on, col = C.ink) => {
    n.style.background = on ? col : '#fff';
    n.style.color = on ? '#fff' : C.ink;
    n.style.borderColor = on ? col : C.line;
  };
  let lastInspect = '';
  let lastRisk = null;

  return {
    spots,
    stageSpot,
    bomSpot,
    levelKnob: (v) => [knobX(v / LMAX), 836],
    speedKnob: (v) => [knobX(v), 869],
    stageHit: {x0: ST.x0, dx: ST.dx, y: ST.y},
    bomHit: {top: bomTop + 28, h: 14, n: BOM.length},
    btn,
    root: ui,
    /**
     * s: X, playing, speedK, speedText, select, risk (compiled), rackRisk (Map device id → level), power, sparks,
     * cam, overlays, callouts [{at, label, name, sub, o, risk}], cursor
     */
    update(s) {
      const X = s.X;
      const si = Math.min(LMAX, Math.max(0, Math.round(X)));
      lvBig.textContent = pad2(si);
      lvBig.style.color = C.ink;
      lvName.textContent = STAGES[si].name;
      lvSub.textContent = STAGES[si].sub;
      lvFill.style.width = `${((X / LMAX) * 247).toFixed(1)}px`;
      lvVal.textContent = `${X.toFixed(2)} / ${LMAX}`;
      lvKnob.style.left = `${knobX(X / LMAX).toFixed(1)}px`;
      spVal.textContent = s.speedText;
      spKnob.style.left = `${knobX(s.speedK).toFixed(1)}px`;
      btn.play.innerHTML = s.playing ? '❚❚ &nbsp;PAUSE' : s.dir < 0 ? '◀ &nbsp;ASSEMBLE' : '▶ &nbsp;EXPLODE';

      // elevation: every device in its U, the torn-down node marked, risk in red
      {
        let h = '';
        for (let u = 1; u <= RACKDIM.units; u++) if (u % 5 === 0 || u === 1) h += `<text x="14" y="${(ey(u - 1) - EU / 2 + 2.5).toFixed(1)}" font-size="6.4" text-anchor="end" fill="${C.mute}">${u}</text>`;
        h += `<rect x="18" y="0" width="78" height="330" fill="#fff" stroke="${C.faint}"/>`;
        for (const u of FREE_U) h += `<rect x="20" y="${(ey(u) + 0.6).toFixed(1)}" width="74" height="${(EU - 1.2).toFixed(1)}" fill="#eceef0"/>`;
        for (const d of DEVICES) {
          const y0 = ey(d.top);
          const hh = d.units * EU - 1.2;
          const rk = s.rackRisk.get(d.id) || 0;
          const tgt = d === TARGET;
          const out = tgt && X > 1.6;
          const fill = rk ? C.red : out ? '#fff' : tgt ? C.ink : d.srv ? C.grey[1] : C.grey[2];
          h += `<rect x="20" y="${(y0 + 0.6).toFixed(1)}" width="74" height="${hh.toFixed(1)}" fill="${fill}" ${out ? `stroke="${rk ? C.red : C.ink}" stroke-dasharray="2 2"` : ''}/>`;
          if (d.srv && d.units > 1 && !out) for (let k = 0; k < 6; k++) h += `<rect x="${24 + k * 7}" y="${(y0 + 3).toFixed(1)}" width="4" height="${(hh - 5).toFixed(1)}" fill="rgba(255,255,255,.18)"/>`;
          h += `<line x1="96" x2="108" y1="${(y0 + hh / 2 + 0.6).toFixed(1)}" y2="${(y0 + hh / 2 + 0.6).toFixed(1)}" stroke="${C.faint}"/>`;
          h += `<text x="112" y="${(y0 + hh / 2 + 3.4).toFixed(1)}" font-size="${tgt ? 8.6 : 7.8}" font-weight="${tgt ? 700 : 500}" fill="${rk ? C.red : C.ink}">${esc(d.name)}${tgt ? ' ◂' : ''}</text>`;
          h += `<text x="226" y="${(y0 + hh / 2 + 3.4).toFixed(1)}" font-size="6.6" text-anchor="end" fill="${C.mute}">U${d.u}${d.units > 1 ? `–${d.top}` : ''}</text>`;
        }
        for (const [p, sx] of [[0, 4], [1, 101]]) if (p < RACK.pdu.count) h += `<rect x="${sx}" y="4" width="3" height="322" fill="${s.rackRisk.get(`pdu-${p}`) ? C.red : C.grey[3]}"/>`;
        elev.innerHTML = h;
        elevNote.innerHTML = X < 1.6 ? `${esc(TARGET.name)} · U${TARGET.u}–${TARGET.top} · IN RACK` : X < 2.6 ? `ON RAILS · <b style="color:${C.ink}">${Math.round(Math.min(1, X - 1) * 620)}</b> MM OUT` : `ON THE BENCH · ${FREE_U.length} U FILLED WITH BLANKS`;
      }

      // power, from the same counts as the bill of materials
      {
        const p = s.power;
        pwBig.innerHTML = `${(p.wall / 1000).toFixed(2)}<span style="font-size:13px;font-weight:600;letter-spacing:0;color:${C.mute}"> kW</span>`;
        const W = 226;
        let x = 0;
        let h = '';
        const tot = Math.max(p.usable, p.wall) || 1;
        CATS.forEach((c, i) => {
          const w = (p.cats[c.key] / tot) * W;
          h += `<rect x="${x.toFixed(1)}" y="0" width="${Math.max(0, w - 1).toFixed(1)}" height="12" fill="${C.grey[i]}"/>`;
          x += w;
        });
        if (p.usable) h += `<line x1="${((p.usable / tot) * W).toFixed(1)}" x2="${((p.usable / tot) * W).toFixed(1)}" y1="-2" y2="14" stroke="${C.ink}" stroke-width="1.2"/>`;
        CATS.forEach((c, i) => {
          const lx = (i % 3) * 78;
          const ly = 24 + Math.floor(i / 3) * 12;
          h += `<rect x="${lx}" y="${ly - 6}" width="7" height="7" fill="${C.grey[i]}"/><text x="${lx + 10}" y="${ly}" font-size="7.2" letter-spacing=".6" fill="${C.mute}">${c.label} <tspan fill="${C.ink}" font-weight="600">${Math.round(p.cats[c.key])}</tspan></text>`;
        });
        pwBar.innerHTML = h;
        let sp = '';
        s.sparks.forEach((v, i) => (sp += `${i ? 'L' : 'M'}${((i / (s.sparks.length - 1)) * 110).toFixed(1)} ${(28 - v * 26).toFixed(1)}`));
        pwSpark.innerHTML = `<path d="${sp}" fill="none" stroke="${C.ink}" stroke-width="1.2"/><text x="110" y="8" font-size="6.4" text-anchor="end" fill="${C.mute}" letter-spacing=".8">GPU UTIL ${Math.round(s.util * 100)} %</text>`;
        pwPsu.innerHTML = `PSU <b style="color:${C.ink}">${(p.usable / 1000).toFixed(1)} kW</b> usable &nbsp;·&nbsp; load <b style="color:${C.ink}">${Math.round((p.wall / p.usable) * 100)} %</b>`;
        pwRack.innerHTML = `Rack <b style="color:${C.ink}">${(s.rackW / 1000).toFixed(1)} kW</b> &nbsp;·&nbsp; PDU <b style="color:${C.ink}">${PDU_KW.toFixed(1)} kW</b> / feed`;
        pwGpu.innerHTML = `Fans <b style="color:${C.ink}">${Math.round(s.fanRpm).toLocaleString('en-US')}</b> rpm &nbsp;·&nbsp; FP8 <b style="color:${C.ink}">${((TOTALS.gpus * (cat(TARGET.srv.gpu.part).fp8 || 0)) / 1000).toFixed(0)}</b> PFLOPS / rack`;
      }

      // inspect card
      const sel = s.select || 'server';
      const rsel = s.selRisk;
      const key = `${sel}|${rsel ? rsel.level + rsel.reasons.join() : ''}`;
      if (key !== lastInspect) {
        lastInspect = key;
        const inf = info(sel);
        inName.textContent = inf.name;
        inSub.textContent = inf.sub;
        const nh = inName.getBoundingClientRect().height;
        inSub.style.top = `${66 + nh}px`;
        const sh = inSub.getBoundingClientRect().height;
        inSpec.style.top = `${74 + nh + sh}px`;
        inQty.innerHTML = `<b style="color:${C.ink}">${inf.qty}</b> ${inf.qty > 1 ? 'IN THIS NODE' : ''}`.trim();
        if (/^(server|rack|dev-|pdu|door|side|blanks|rail)/.test(sel)) inQty.innerHTML = `<b style="color:${C.ink}">${inf.qty}</b> IN RACK`;
        const rows = inf.spec.slice(0, rsel ? 4 : 6);
        inSpec.innerHTML = rows.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid ${C.line};padding:3.5px 0;font-size:9.8px"><span style="color:${C.mute};letter-spacing:.6px;text-transform:uppercase;font-size:8.4px;font-weight:600;padding-top:1px">${esc(k)}</span><b style="font-weight:600;text-align:right">${esc(v)}</b></div>`).join('');
        inRisk.style.display = rsel ? 'block' : 'none';
        if (rsel) inRisk.innerHTML = `<div style="position:absolute;inset:0;background:${C.redBg};border-top:2px solid ${C.red}"></div><div class="cp" style="position:absolute;left:10px;top:8px;color:${C.red};font-weight:700">⚠ RISK · ${levelName(rsel.level)}</div><div style="position:absolute;left:10px;top:23px;width:222px;font-size:9.6px;line-height:1.3;max-height:26px;overflow:hidden">${esc(rsel.reasons.join(' · ') || 'Flagged by an external analysis')}</div>`;
      }

      // bill of materials: the selected row inked, risky rows red
      BOM.forEach((g, i) => {
        const r = bomRows[i];
        const on = !!s.select && g.ids.some((id) => sel === id || s.inTree(sel, id) || s.inTree(id, sel));
        const rk = g.ids.some((id) => s.risk.byNode.has(id) || [...s.risk.byNode.keys()].some((k) => s.inTree(k, id)));
        r.style.color = on ? '#fff' : rk ? C.red : C.ink;
        r.style.background = on ? (rk ? C.red : C.ink) : rk ? C.redBg : 'transparent';
        r.style.fontWeight = on || rk ? '600' : '500';
        r.style.margin = '0 -4px';
        r.style.padding = '0 4px';
        r.firstChild.style.color = on ? '#fff' : C.mute;
      });

      // risk list
      if (s.risk !== lastRisk) {
        lastRisk = s.risk;
        const L = s.risk.list;
        rkCount.innerHTML = L.length ? `<b style="color:${C.red}">${L.length}</b> ACTIVE` : 'NONE';
        rkList.innerHTML = L.length
          ? L.slice(0, rkRows)
              .map((r) => `<div style="height:26px;border-top:1px solid ${C.line};display:flex;gap:7px;align-items:center"><span class="cp" style="flex:none;width:52px;height:15px;display:flex;align-items:center;justify-content:center;background:${r.level >= 0.75 ? C.red : '#fff'};color:${r.level >= 0.75 ? '#fff' : C.red};border:1px solid ${C.red};font-size:7.4px;letter-spacing:1px">${levelName(r.level)}</span><span style="font-size:9.4px;line-height:1.2;overflow:hidden;max-height:24px"><b>${esc(info(r.ids[0])?.name || r.match)}${r.ids.length > 1 ? ` ×${r.ids.length}` : ''}</b><br><span style="color:${C.mute}">${esc(r.reason || r.source || '')}</span></span></div>`)
              .join('') + (L.length > rkRows ? `<div class="cp mu" style="font-size:8px;padding-top:2px">+ ${L.length - rkRows} MORE</div>` : '')
          : `<div style="font-size:9.4px;color:${C.mute};line-height:1.45;border-top:1px solid ${C.line};padding-top:5px">No signals. Feed them with <b style="color:${C.ink}">?riskUrl=</b>, <b style="color:${C.ink}">postMessage</b> or <b style="color:${C.ink}">TEARDOWN.setRisk()</b>.</div>`;
      }

      // toggles
      for (const k of CAMS) tbOn(btn[k], s.cam === k);
      for (const k of OVERLAYS) tbOn(btn[k], !!s.overlays[k], k === 'risk' ? C.red : C.ink);

      // stepper
      {
        let h = `<line x1="20" x2="${20 + ST.dx * LMAX}" y1="14" y2="14" stroke="${C.line}" stroke-width="2"/><line x1="20" x2="${(20 + ST.dx * X).toFixed(1)}" y1="14" y2="14" stroke="${C.ink}" stroke-width="2"/>`;
        for (let i = 0; i <= LMAX; i++) {
          const done = X >= i - 0.02;
          const cur = i === si;
          h += `<circle cx="${20 + i * ST.dx}" cy="14" r="${cur ? 8 : 6}" fill="${done ? C.ink : '#fff'}" stroke="${done ? C.ink : C.faint}" stroke-width="1.4"/>`;
          if (cur) h += `<circle cx="${20 + i * ST.dx}" cy="14" r="11.5" fill="none" stroke="${C.ink}" stroke-width=".8" opacity=".5"/>`;
        }
        step.innerHTML = h;
        stLabels.forEach((n, i) => (n.style.color = i === si ? C.ink : C.mute));
      }

      // callouts
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        const col = c.risk ? C.red : C.mute;
        const w = c.w ?? Math.max(60, Math.min(170, c.name.length * 6.6));
        const right = c.right ?? false;
        const bx = right ? lx - w : lx;
        lh += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.2" fill="${c.risk ? C.red : C.ink}" opacity="${c.o.toFixed(2)}"/><polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${lx.toFixed(1)},${(ly + 16).toFixed(1)} ${(right ? bx : lx + w).toFixed(1)},${(ly + 16).toFixed(1)}" fill="none" stroke="${col}" stroke-width=".8" opacity="${c.o.toFixed(2)}"/>`;
        if (c.name) ch += `<div class="call${c.risk ? ' rk' : ''}" style="left:${bx.toFixed(1)}px;top:${(ly - 10).toFixed(1)}px;width:${w}px;${right ? 'text-align:right;' : ''}opacity:${c.o.toFixed(2)}"><b>${esc(c.name)}</b><span>${esc(c.sub || '')}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      pointer(s.cursor);
    },
    pointer,
  };
}
