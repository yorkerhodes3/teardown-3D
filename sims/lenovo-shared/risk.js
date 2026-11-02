// RISK SIGNALS. An external tool (supply chain, thermal, firmware, failure-rate analysis…) marks parts as at risk; the
// page paints every matching part red in 3D, reddens its bill-of-materials row and inspect card, and lists the
// signals in the risk panel. Red means risk and nothing else on this page.
//
// A signal:
//   {match: 'gpu.h100-nvl',  level: 'high', reason: 'Lot 23-41 HBM ECC errors', source: 'fleet-telemetry'}
// match, any of:
//   'gpu-3'            one node (ids: gpu-0…, dimm-0…, psu-0…, fan-0…, cpu-0…, drive-0…, nic-0…, server, rack, pdu-0, dev-4…)
//   'gpu.h100-nvl'     a catalog SKU from bom.js: every part of that SKU
//   'kind:psu'         every part of a kind (gpu, cpu, dimm, psu, fan, drive, nic, heatsink, …)
//   'U22' / 'U22-24'   whatever sits in those rack units
//   an array of any of the above
// level: 'low' | 'medium' | 'high' | 'critical', or a number 0..1. reason, source: free text (optional).
//
// Ways in, all merged (later wins per match):
//   1. DEFAULT_RISK below, built into the page
//   2. ?risk=<base64url JSON array>          in the page URL
//   3. ?riskUrl=<url of a JSON array>        fetched at load and every 30 s (riskPoll=<seconds> to change, 0 = once)
//   4. window.postMessage({type: 'teardown-risk', signals: [...], replace: true})  from a parent frame or tool
//   5. window.TEARDOWN.setRisk([...]) / addRisk(signal) / clearRisk()  from the console or an injected script
// The live page shows a few demo signals until any of these speaks (?demo=0 hides them from the start).
import {DEVICES, NODES} from './model.js';

export const DEFAULT_RISK = [];

export const LEVELS = {low: 0.35, medium: 0.6, high: 0.85, critical: 1};
const levelOf = (l) => (typeof l === 'number' ? Math.min(1, Math.max(0, l)) : LEVELS[String(l || 'high').toLowerCase()] ?? 0.85);
export const levelName = (v) => (v >= 0.95 ? 'CRITICAL' : v >= 0.75 ? 'HIGH' : v >= 0.5 ? 'MEDIUM' : 'LOW');

/** Node ids a match string names. Unknown matches return [] and are reported once. */
export function matchIds(m) {
  if (Array.isArray(m)) return [...new Set(m.flatMap(matchIds))];
  const s = String(m).trim();
  if (NODES.has(s)) return [s];
  const u = /^U(\d+)(?:-(\d+))?$/i.exec(s);
  if (u) {
    const a = +u[1];
    const b = +(u[2] || u[1]);
    return DEVICES.filter((d) => d.u <= b && d.top >= a).map((d) => d.id);
  }
  const out = [];
  const kind = s.startsWith('kind:') ? s.slice(5) : null;
  for (const n of NODES.values()) {
    if (kind ? n.kind === kind : n.cat === s || (n.dev && (n.dev.part === s || n.dev.server === s))) {
      // a SKU match takes whole parts, not their sub-components (they inherit the colour)
      if (!kind && n.parent && NODES.get(n.parent).cat === s) continue;
      out.push(n.id);
    }
  }
  return out;
}

const warned = new Set();
/** Normalise signals into {byNode: Map(id → {level, reasons}), list: [{match, ids, level, reason, source}]}. */
export function compileRisk(signals) {
  const byNode = new Map();
  const list = [];
  for (const sg of signals || []) {
    if (!sg || sg.match == null) continue;
    const ids = matchIds(sg.match);
    if (!ids.length) {
      const k = JSON.stringify(sg.match);
      if (!warned.has(k)) console.warn(`[risk] nothing matches ${k}`);
      warned.add(k);
      continue;
    }
    const level = levelOf(sg.level);
    list.push({match: sg.match, ids, level, reason: sg.reason || '', source: sg.source || ''});
    for (const id of ids) {
      const e = byNode.get(id) || {level: 0, reasons: []};
      e.level = Math.max(e.level, level);
      if (sg.reason) e.reasons.push(sg.reason);
      byNode.set(id, e);
    }
  }
  list.sort((a, b) => b.level - a.level);
  return {byNode, list};
}

/** The risk at a node: its own, or the highest of its ancestors' (a flagged GPU colours its shroud too). */
export function riskAt(compiled, id) {
  let best = null;
  for (let n = NODES.get(id); n; n = n.parent ? NODES.get(n.parent) : null) {
    const e = compiled.byNode.get(n.id);
    if (e && (!best || e.level > best.level)) best = e;
  }
  return best;
}
/** The highest risk inside a node's subtree (a flagged DIMM makes its closed server read as at risk). */
export function riskWithin(compiled, id) {
  let best = compiled.byNode.get(id) || null;
  for (const n of NODES.values()) {
    if (n.id === id) continue;
    for (let p = n.parent; p; p = NODES.get(p).parent)
      if (p === id) {
        const e = compiled.byNode.get(n.id);
        if (e && (!best || e.level > best.level)) best = e;
        break;
      }
  }
  return best;
}

const fromB64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/**
 * The page's risk store. onChange(compiled) fires on every update. Pure film renders call compileRisk on a fixed list
 * instead, so a recorded video never depends on a network.
 */
export function createRiskStore(onChange, {demo = []} = {}) {
  const sources = {demo, default: DEFAULT_RISK, url: [], remote: [], api: []};
  let compiled = compileRisk([]);
  let external = false;
  const emit = () => {
    // the demo signals only stand in until a real source has said anything (?demo=0 turns them off)
    if (sources.url.length || sources.remote.length || sources.api.length || sources.default.length || external) sources.demo = [];
    const merged = new Map();
    for (const k of ['demo', 'default', 'url', 'remote', 'api']) for (const s of sources[k]) merged.set(JSON.stringify(s.match), s);
    compiled = compileRisk([...merged.values()]);
    onChange?.(compiled);
  };
  const q = new URLSearchParams(location.search);
  external = q.has('risk') || q.has('riskUrl') || q.get('demo') === '0';
  if (q.get('risk')) {
    try {
      sources.url = JSON.parse(fromB64(q.get('risk')));
    } catch (e) {
      console.warn('[risk] bad ?risk', e);
    }
  }
  const url = q.get('riskUrl');
  if (url) {
    const poll = Number(q.get('riskPoll') ?? 30);
    const pull = () =>
      fetch(url, {cache: 'no-store'})
        .then((r) => r.json())
        .then((j) => {
          sources.remote = Array.isArray(j) ? j : j.signals || [];
          emit();
        })
        .catch((e) => console.warn('[risk] fetch failed', e));
    pull();
    if (poll > 0) setInterval(pull, poll * 1000);
  }
  addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'teardown-risk') return;
    external = true;
    sources.api = d.replace === false ? [...sources.api, ...(d.signals || [])] : d.signals || [];
    emit();
  });
  const api = {
    setRisk(signals) {
      external = true;
      sources.api = signals || [];
      emit();
    },
    addRisk(sg) {
      external = true;
      sources.api = [...sources.api, sg];
      emit();
    },
    clearRisk() {
      external = true;
      for (const k of Object.keys(sources)) sources[k] = [];
      emit();
    },
    get risk() {
      return compiled;
    },
  };
  window.TEARDOWN = window.TEARDOWN || {};
  Object.defineProperties(window.TEARDOWN, Object.getOwnPropertyDescriptors(api));
  window.TEARDOWN.nodes = () => [...NODES.keys()];
  emit();
  return api;
}
