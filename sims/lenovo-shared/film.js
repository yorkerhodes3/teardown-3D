// Lenovo AI rack · Teardown, the film: the rack (rack.js, from bom.js) on the studio (stage.js) under the overlay
// (console.js). The operator steps the teardown from the closed cabinet to every component, inspects a GPU an
// external tool has flagged, a CPU, switches on the risk view, then puts it all back. A pure function of t.
import {runSim} from '../kit/runtime.js';
import {createConsole} from './console.js';
import {BENCH, BOM, cat, DEVICES, fanFrac, LMAX, NODES, rackPower, resolve, SERVER_HOME, serverPower, TARGET, TRAVEL, util} from './model.js';
import {compileRisk, riskAt, riskWithin} from './risk.js';
import {createRackStage} from './stage.js';

// a fixed set of signals so the film never depends on a network; the live page takes real ones (risk.js)
export const DEMO_RISK = [
  {match: 'gpu-2', level: 'high', reason: 'HBM ECC error rate 4× fleet baseline', source: 'Fleet telemetry'},
  {match: 'psu-1', level: 'medium', reason: 'Capacitor lot under supplier advisory', source: 'Supply chain'},
  {match: 'dimm-7', level: 'low', reason: 'SPD firmware one revision behind', source: 'Firmware audit'},
];
const STEP = 2.1; // seconds a stage change takes
export const SCRIPT = [
  {t: 2.6, stage: 1},
  {t: 5.6, stage: 2},
  {t: 8.6, stage: 3},
  {t: 11.6, stage: 4},
  {t: 15, stage: 5},
  {t: 18.4, select: 'gpu-2'},
  {t: 22.4, stage: 6},
  {t: 25.6, select: 'cpu-0'},
  {t: 29, riskView: true},
  {t: 32, riskView: false},
  {t: 33, stage: 0, dur: 3.6},
];
export const DURATION = 39;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'lenovo', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

// ------------------------------------------------------------ the script as functions of t
export const xAt = (t) => {
  let X = 0;
  for (const e of SCRIPT) if (e.stage !== undefined && t >= e.t) X = X + (e.stage - X) * ss(e.t, e.t + (e.dur || STEP), t);
  return X;
};
// a selection lasts until the next stage change or risk view
export const selectAt = (t) => {
  let sel = null;
  let at = -9;
  for (const e of SCRIPT) {
    if (e.t > t) break;
    if (e.select) [sel, at] = [e.select, e.t];
    else if (e.stage !== undefined || e.riskView) [sel, at] = [null, e.t];
  }
  return {sel, at};
};
export const riskViewAt = (t) => SCRIPT.filter((e) => e.riskView !== undefined && e.t <= t).pop()?.riskView ?? false;

// ------------------------------------------------------------ the camera: one view per stage, blended by X
const SY = SERVER_HOME[1] / 1000 + 0.07;
const VIEWS = [
  {tx: 0, ty: 1.0, tz: 0, az: 30, el: 9, d: 7.4},
  {tx: 0, ty: 1.0, tz: 0.1, az: 40, el: 12, d: 7.0},
  {tx: 0, ty: SY + 0.05, tz: (SERVER_HOME[2] + TRAVEL / 2) / 1000, az: 44, el: 20, d: 3.8},
  {tx: 0, ty: SY + 0.12, tz: BENCH[2], az: 38, el: 27, d: 2.7},
  {tx: 0, ty: SY + 0.2, tz: BENCH[2] - 0.02, az: 36, el: 30, d: 2.95},
  {tx: 0, ty: SY + 0.22, tz: BENCH[2] - 0.02, az: 33, el: 33, d: 3.2},
  {tx: 0, ty: SY + 0.26, tz: BENCH[2] + 0.04, az: 30, el: 36, d: 3.7},
];
const KEYS = ['tx', 'ty', 'tz', 'az', 'el', 'd'];
const lerpView = (a, b, k) => Object.fromEntries(KEYS.map((key) => [key, a[key] + (b[key] - a[key]) * k]));
/** The view for teardown level X (degrees), drifting slowly with t. */
export function viewForX(X, t = 0) {
  const i = clamp(Math.floor(X), 0, LMAX - 1);
  const v = lerpView(VIEWS[i], VIEWS[i + 1], clamp(X - i, 0, 1));
  v.az += 3 * Math.sin(t * 0.21);
  v.el += 1.2 * Math.sin(t * 0.17 + 1);
  v.sx = 0;
  v.sy = -12 - 40 * clamp(X - 2, 0, 1);
  return v;
}
// camera presets: same target and distance as the auto view, a fixed direction
export const PRESET = {front: {az: 0, el: 6}, side: {az: 90, el: 10}, top: {az: 20, el: 72}, rear: {az: 180, el: 12}};
/** Pull a view onto a part: centre it, close in to a distance that fits its size. k 0..1. */
export function focusView(v, c, size, k) {
  if (k <= 0 || !c) return v;
  const d = clamp(0.9 + size * 4.5, 1.5, 2.9);
  return {...v, tx: v.tx + (c.x - v.tx) * k, ty: v.ty + (c.y - v.ty) * k, tz: v.tz + (c.z - v.tz) * k, d: v.d + (d - v.d) * k, el: v.el + (Math.max(v.el, 50) - v.el) * k, sx: v.sx + (-120 - v.sx) * k, sy: v.sy + (-30 - v.sy) * k};
}

// ------------------------------------------------------------ the operator's pointer
const REST = [[800, 520], [720, 440], [900, 470], [760, 560]];
export function makeCursor(ui) {
  const EV = SCRIPT.map((e) => {
    let spot;
    if (e.stage !== undefined) spot = ui.stageSpot(e.stage);
    else if (e.select) spot = ui.bomSpot(BOM.findIndex((g) => g.ids.includes(e.select)));
    else spot = ui.spots.risk;
    return {t: e.t, spot};
  });
  const WP = [[0, 980, 640]];
  EV.forEach((e, i) => {
    WP.push([e.t - 0.2, ...e.spot]);
    WP.push([e.t + 0.25, ...e.spot]);
    WP.push([e.t + 1.6, ...REST[i % REST.length]]);
  });
  WP.sort((a, b) => a[0] - b[0]);
  return (t) => {
    let i = 0;
    while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
    const [t0, x0, y0] = WP[i];
    const [t1, x1, y1] = WP[i + 1];
    const k = t1 - t0 < 0.2 ? clamp((t - t0) / (t1 - t0), 0, 1) : ss(t0, t1, t);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bow = Math.sin(Math.PI * k) * Math.min(24, len * 0.07);
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of EV) {
      if (t >= e.t - 0.07 && t < e.t + 0.1) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        [rx, ry] = e.spot;
      }
    }
    return {x: x0 + (x1 - x0) * k + (len ? (-(y1 - y0) / len) * bow : 0), y: y0 + (y1 - y0) * k + (len ? ((x1 - x0) / len) * bow : 0), press, ring, ringX: rx, ringY: ry};
  };
}

// ------------------------------------------------------------ the overlay's data for a frame
// the parts the labels name, by stage; a flagged part is always named
const CALL = [
  {ids: ['server'], from: 0, to: 2.6, sub: 'THE NODE WE TAKE APART'},
  {ids: ['gpu-0'], from: 3.6, sub: 'GPU · PCIe GEN5'},
  {ids: ['fan-2'], from: 3.6, to: 5.4, sub: 'FAN WALL'},
  {ids: ['hs-0', 'cpu-0'], from: 3.6, sub: 'CPU'},
  {ids: ['psu-0'], from: 3.6, sub: 'POWER SUPPLY'},
  {ids: ['nic-0'], from: 3.6, sub: 'NETWORK'},
  {ids: ['dimm-0'], from: 4.6, sub: 'MEMORY'},
  {ids: ['drive-0'], from: 3.6, to: 5.4, sub: 'STORAGE'},
];
export function makeConsoleFrame(ui, st) {
  const F = TARGET.srv.fans ? cat(TARGET.srv.fans.part) : null;
  let rkCache = null;
  let rkMap = new Map();
  return (t, {X, select, risk, riskView, cursor, live}) => {
    const u = util(t);
    if (risk !== rkCache) {
      rkCache = risk;
      rkMap = new Map();
      for (const d of DEVICES) {
        const r = riskWithin(risk, d.id);
        if (r) rkMap.set(d.id, r.level);
      }
      for (const id of NODES.keys()) if (id.startsWith('pdu-') && risk.byNode.has(id)) rkMap.set(id, risk.byNode.get(id).level);
    }
    const sparks = [];
    for (let k = 39; k >= 0; k--) sparks.push(util(t - k * 0.1));
    // labels: what this stage shows, the flagged parts, or just the selection
    const show = live ? live.overlays.labels : true;
    const settle = 1 - smoother(Math.abs(X - Math.round(X)) * 3.2);
    const items = [];
    if (show) {
      if (select) items.push({id: select, sub: 'SELECTED', o: 1});
      else {
        for (const c of CALL) {
          if (X < c.from - 0.6 || X > (c.to ?? 99) + 0.4) continue;
          const id = c.ids.map((i) => resolve(i, X)).find((i) => NODES.has(i) && i === c.ids.find((j) => j === i));
          if (!id || items.some((q) => q.id === id)) continue;
          items.push({id, sub: c.sub, o: settle * ss(c.from - 0.6, c.from, X) * (1 - ss(c.to ?? 99, (c.to ?? 99) + 0.4, X))});
        }
        for (const [id] of risk.byNode) {
          const r = resolve(id, X);
          if (items.some((q) => q.id === r)) continue;
          if (r === id || X < 2.5) items.push({id: r, sub: 'AT RISK', o: X < 2.5 ? 1 : settle});
        }
      }
    }
    const pts = [];
    for (const it of items) {
      const c = st.rack.centre(it.id);
      const at = st.project(c);
      if (!at) continue;
      const rk = riskAt(risk, it.id) || riskWithin(risk, it.id);
      const nm = NODES.get(it.id);
      const name = nm.name && !nm.cat ? nm.name : nm.kind === 'server' ? TARGET.name : cat(nm.cat).name;
      pts.push({at, name, sub: rk ? `⚠ ${it.sub === 'SELECTED' ? 'SELECTED · AT RISK' : 'AT RISK'}` : it.sub, risk: !!rk, o: it.o});
    }
    // left labels for parts left of centre, right labels for the rest; stacked in the order they sit on screen
    const sides = [pts.filter((p) => p.at[0] < 800), pts.filter((p) => p.at[0] >= 800)];
    sides.forEach((list, s) => {
      list.sort((a, b) => a.at[1] - b.at[1]);
      const n = list.length;
      const GAP = 46;
      let y = 130;
      for (const p of list) {
        y = Math.max(y, clamp(p.at[1] - 40, 130, 700));
        p.label = [s ? 1250 : 340, y];
        y += GAP;
      }
      // pushed past the bottom: shift the stack back up
      const over = list.length ? list[list.length - 1].label[1] - 700 : 0;
      if (over > 0) for (const p of list) p.label[1] -= over;
      for (const p of list) {
        p.right = !!s;
        p.w = Math.max(90, Math.min(210, Math.max(p.name.length * 6.8, (p.sub || '').length * 7.8)));
      }
    });
    const sel = select;
    const p = serverPower(u);
    ui.update({
      X,
      playing: live ? live.playing : true,
      dir: live ? live.dir : 1,
      speedK: live ? live.speedK : 0.5,
      speedText: live ? live.speedText : '1×',
      select: sel,
      selRisk: sel ? riskAt(risk, sel) || riskWithin(risk, sel) : null,
      risk,
      rackRisk: rkMap,
      power: p,
      rackW: rackPower(u),
      util: u,
      sparks,
      fanRpm: F ? (F.rpm || 0) * fanFrac(u) : 0,
      cam: live ? live.cam : 'auto',
      overlays: live ? live.overlays : {labels: 1, isolate: sel ? 1 : 0, risk: riskView ? 1 : 0, fans: 1},
      callouts: pts,
      cursor,
      inTree: st.rack.inTree,
    });
  };
}

/** Everything the film shows at t, used by both the film and the live page's tour. */
export function filmState(t, st, risk) {
  const X = xAt(t);
  const {sel, at} = selectAt(t);
  const riskView = riskViewAt(t);
  let v = viewForX(X, t);
  // hold the focus for the selection, easing in, and out again into the next move
  const {sel: prev, at: pat} = selectAt(at - 0.001);
  // centres must come from this frame's pose, so a seek to any t gives the same picture
  if (sel || prev) st.rack.update(X, t);
  if (sel) v = focusView(v, st.rack.centre(sel), st.rack.parts.get(sel).size, ss(at, at + 1.5, t));
  else if (prev && at > 0) v = focusView(v, st.rack.centre(prev), st.rack.parts.get(prev).size, 1 - ss(at, at + 1.5, t));
  void pat;
  return {X, select: sel, riskView, view: v, risk};
}

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createRackStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    const risk = compileRisk(DEMO_RISK);
    window.RACK = st;
    return {
      resize,
      render(t) {
        const s = filmState(t, st, risk);
        const v = s.view;
        st.frame(s.X, t, {...v, az: v.az * D2R, el: v.el * D2R}, {select: s.select, isolate: !!s.select, risk, riskView: s.riskView, spin: t * 9});
        frame(t, {X: s.X, select: s.select, risk, riskView: s.riskView, cursor: cursorAt(t)});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
