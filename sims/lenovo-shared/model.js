// The teardown's math, no three.js: every part of the BOM placed in real millimetres, its explode moves, the power it
// draws and the text the panels show. One input, the teardown level X (0 closed rack … 6 every component apart),
// poses everything: pose(node, X) is the only motion in the page.
import {CATALOG, RACK, SERVERS, TITLE} from './bom.js';

export {CATALOG, RACK, SERVERS, TITLE};
export const U = 44.45;
export const LMAX = 6;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const cat = (id) => {
  const c = CATALOG[id];
  if (!c) throw new Error(`bom.js: no catalog entry "${id}"`);
  return c;
};
export const WARN = [];
const warn = (m) => {
  WARN.push(m);
  console.warn(`[bom] ${m}`);
};

// ------------------------------------------------------------ the rack
const RK = cat(RACK.part);
const [RW, , RD] = RK.dims;
const FRONT = RD / 2 - 80; // the front mounting plane: server faces sit here, the door 80 mm in front
export const RACKDIM = {w: RW, h: RK.dims[1], d: RD, plinth: RK.plinth, units: RK.units, front: FRONT, uY: (u) => RK.plinth + (u - 1) * U};
const RAIL = cat(RACK.rail);
export const TRAVEL = RAIL.travel; // mm the rails let the server slide out
export const PULL = 950; // mm further the server is carried clear of the rack onto the bench

export const DEVICES = RACK.layout.map((e, i) => {
  const srv = e.server ? SERVERS[e.server] : null;
  if (e.server && !srv) throw new Error(`bom.js: no server config "${e.server}"`);
  const c = e.part ? cat(e.part) : null;
  const units = srv ? srv.units : c.units || 1;
  return {...e, i, srv, c, units, top: e.u + units - 1, id: e.target ? 'server' : `dev-${i}`, name: e.name || (srv ? srv.name : c.name)};
});
{
  const used = new Map();
  for (const d of DEVICES) {
    if (d.u < 1 || d.top > RK.units) warn(`${d.name} at U${d.u} runs outside the ${RK.units}U rack`);
    for (let u = d.u; u <= d.top; u++) {
      if (used.has(u)) warn(`U${u}: ${d.name} overlaps ${used.get(u)}`);
      used.set(u, d.name);
    }
  }
}
export const TARGET = DEVICES.find((d) => d.target) || DEVICES.find((d) => d.srv && !d.srv.shell);
if (!TARGET || TARGET.srv?.shell) throw new Error('bom.js: mark one non-shell server in RACK.layout with target: true');
TARGET.id = 'server';
export const FREE_U = [];
for (let u = 1; u <= RK.units; u++) if (!DEVICES.some((d) => u >= d.u && u <= d.top)) FREE_U.push(u);

// ------------------------------------------------------------ nodes: every part, its parent, its place, its moves
// pos is mm in the parent's frame (rack: floor centre, server: bottom centre of the chassis, x right, y up, z front).
// moves: {s: stage 1..6, d: [x,y,z] metres, ry: radians, fade: 0..1, lag: 0..0.4 of the stage}
export const NODES = new Map();
const node = (id, o) => {
  const n = {id, parent: null, pos: [0, 0, 0], moves: [], sep: 0, ...o};
  NODES.set(id, n);
  return n;
};
const RACK_FADE = {s: 3, fade: 0.86};

node('rack', {kind: 'rack', cat: RACK.part, moves: [RACK_FADE], group: 'rack'});
node('door-front', {kind: 'door', cat: RACK.part, side: 1, pos: [-RW / 2, 0, RD / 2], moves: [{s: 1, ry: -1.95}, RACK_FADE], name: 'Front Door', group: 'rack'});
node('door-rear', {kind: 'door', cat: RACK.part, side: -1, pos: [RW / 2, 0, -RD / 2], moves: [{s: 1, ry: -1.95, lag: 0.15}, RACK_FADE], name: 'Rear Door', group: 'rack'});
for (const s of [-1, 1])
  node(`side-${s < 0 ? 'l' : 'r'}`, {kind: 'side', cat: RACK.part, side: s, pos: [(s * RW) / 2, 0, 0], moves: [{s: 1, d: [s * 0.55, 0, 0], fade: 1, lag: 0.2}], name: 'Side Panel', group: 'rack'});
{
  const P = cat(RACK.pdu.part);
  for (let i = 0; i < RACK.pdu.count; i++) {
    const s = i % 2 ? 1 : -1;
    node(`pdu-${i}`, {kind: 'pdu', cat: RACK.pdu.part, pos: [s * (RW / 2 - 45), RK.plinth + 60 + Math.floor(i / 2) * 20, -RD / 2 + 70 + P.dims[2] / 2 + Math.floor(i / 2) * 110], moves: [RACK_FADE], feed: 'AB'[i % 2], group: 'pdu'});
  }
}
const TY = RACKDIM.uY(TARGET.u);
const TS = TARGET.srv;
node('rail-outer', {kind: 'rail', cat: RACK.rail, stage: 0, pos: [0, TY, FRONT - RAIL.dims[2] / 2], moves: [RACK_FADE], width: TS.dims[0], group: 'rail'});
node('rail-mid', {kind: 'rail', cat: RACK.rail, stage: 1, pos: [0, TY, FRONT - RAIL.dims[2] / 2], moves: [{s: 2, d: [0, 0, TRAVEL / 2000]}, RACK_FADE], width: TS.dims[0], group: 'rail', sep: 9});
node('rail-inner', {kind: 'rail', cat: RACK.rail, stage: 2, pos: [0, TY, FRONT - RAIL.dims[2] / 2], moves: [{s: 2, d: [0, 0, TRAVEL / 1000]}, RACK_FADE], width: TS.dims[0], group: 'rail', sep: 9});
for (const d of DEVICES) {
  if (d === TARGET) continue;
  const depth = d.srv ? d.srv.dims[2] : d.c.dims[2];
  node(d.id, {kind: d.srv ? 'shell' : 'switch', cat: d.part, srv: d.srv, dev: d, pos: [0, RACKDIM.uY(d.u), FRONT - depth / 2], moves: [RACK_FADE], name: d.name, group: d.srv ? `srv:${d.server}` : d.part});
}
if (FREE_U.length) node('blanks', {kind: 'blank', cat: RACK.blank, units: FREE_U, pos: [0, 0, FRONT], moves: [RACK_FADE], group: 'blank'});

// the server that comes apart
const [SW, SH, SD] = TS.dims;
export const SERVER_HOME = [0, TY, FRONT - SD / 2];
node('server', {kind: 'server', srv: TS, dev: TARGET, pos: SERVER_HOME, moves: [{s: 2, d: [0, 0, TRAVEL / 1000]}, {s: 3, d: [0, 0, PULL / 1000]}], name: TARGET.name, group: `srv:${TARGET.server}`});
// world position of the server's bench (fully pulled), for the camera
export const BENCH = [SERVER_HOME[0] / 1000, SERVER_HOME[1] / 1000, (SERVER_HOME[2] + TRAVEL + PULL) / 1000];

// ------------------------------------------------------------ the server's interior from its config
const S = 'server';
const IW = SW - 8;
const ZF = SD / 2 - 14;
const inner = (id, o) => node(id, {parent: S, sep: 3, ...o});
const gp = TS.gpu && TS.gpu.count ? TS.gpu : null;
const dr = TS.drives && TS.drives.count ? TS.drives : null;
const G = gp ? cat(gp.part) : null;
const DR = dr ? cat(dr.part) : null;
export const LAYOUT = {};

inner('chassis', {kind: 'chassis', cat: TS.chassis, dims: TS.dims, sep: 3.5, group: TS.chassis});
inner('cover', {kind: 'cover', cat: TS.cover, dims: TS.dims, pos: [0, SH - 1.5, 0], moves: [{s: 3, d: [0, 0.42, 0], lag: 0.25}, {s: 4, d: [0, 0.3, -0.25], fade: 1}], sep: 2.5, group: TS.cover});

// front: GPUs in two banks either side of the drive block
let zA = ZF;
{
  const n = gp ? gp.count : 0;
  const m = dr ? dr.count : 0;
  const [dt, dh, dl] = DR ? DR.dims : [0, 0, 0];
  const rows = m ? Math.max(1, Math.min(m, Math.floor((SH - 24) / (dh + 4)))) : 0;
  const cols = m ? Math.ceil(m / rows) : 0;
  const dW = cols * (dt + 3);
  const gap = m ? dW + 16 : 8;
  let pitch = G ? G.dims[0] + 2 : 0;
  if (n && n * pitch + gap > IW) {
    warn(`${n} × ${G.name} (${G.dims[0]} mm) and ${m} drives need ${Math.round(n * pitch + gap)} mm, the chassis has ${IW}: squeezed`);
    pitch = (IW - gap) / n;
  }
  const nL = Math.ceil(n / 2);
  const total = n * pitch + gap;
  const x0 = n ? -total / 2 : 0;
  const dx = n ? x0 + nL * pitch + gap / 2 : 0;
  const gl = G ? G.dims[2] : 0;
  const L1 = Math.max(gl, dl) + 10;
  zA = ZF - L1;
  LAYOUT.front = {z0: zA, z1: ZF, rows, cols};
  if (TS.gpuBoard && n) inner('pcieboard', {kind: 'pcieboard', cat: TS.gpuBoard, pos: [0, 2, (zA + ZF) / 2], len: L1, gpuX: [], group: TS.gpuBoard});
  const gx = [];
  for (let i = 0; i < n; i++) {
    const x = i < nL ? x0 + pitch * (i + 0.5) : x0 + nL * pitch + gap + pitch * (i - nL + 0.5);
    gx.push(x);
    const spread = (i - (n - 1) / 2) * 0.05;
    inner(`gpu-${i}`, {kind: 'gpu', cat: gp.part, idx: i, pos: [x, 8, ZF - gl / 2], moves: [{s: 4, d: [0, 0.3, 0], lag: i * 0.03}, {s: 5, d: [spread, 0.02, 0.08]}], group: gp.part});
    for (const [sub, dy] of [['board', 0], ['sink', 0.085], ['shroud', 0.17]])
      node(`gpu-${i}-${sub}`, {parent: `gpu-${i}`, kind: `gpu-${sub}`, cat: gp.part, sub, moves: dy ? [{s: 6, d: [0, dy, 0], lag: i * 0.02}] : [], sep: 5.5, group: gp.part});
  }
  if (NODES.has('pcieboard')) NODES.get('pcieboard').gpuX = gx;
  if (gp && gp.bridge) {
    const B = cat(gp.bridge);
    for (let k = 0; k + 1 < n; k += 2) {
      const sp = ((k - (n - 1) / 2) * 0.05 + (k + 1 - (n - 1) / 2) * 0.05) / 2;
      // a pair split across the drive block cannot be bridged
      if (k < nL && k + 1 >= nL) continue;
      inner(`nvl-${k / 2}`, {kind: 'nvlink', cat: gp.bridge, count: gp.bridgesPerPair || 1, x0: gx[k], x1: gx[k + 1], pos: [(gx[k] + gx[k + 1]) / 2, 8 + G.dims[1], ZF - gl / 2], moves: [{s: 4, d: [0, 0.3, 0], lag: k * 0.03}, {s: 5, d: [sp, 0.09, 0.08]}, {s: 6, d: [0, 0.2, 0]}], group: gp.bridge});
      void B;
    }
  }
  for (let i = 0; i < m; i++) {
    const c = Math.floor(i / rows);
    const r = i % rows;
    inner(`drive-${i}`, {kind: 'drive', cat: dr.part, pos: [dx + (c - (cols - 1) / 2) * (dt + 3), 10 + r * (dh + 4), ZF - dl / 2 + 8], moves: [{s: 4, d: [0, 0, 0.24], lag: i * 0.04}, {s: 5, d: [(c - (cols - 1) / 2) * 0.03, r * 0.02, 0.05]}], group: dr.part});
  }
}

// fan wall
let zB = zA;
if (TS.fans && TS.fans.count) {
  const F = cat(TS.fans.part);
  const f = TS.fans.count;
  const [fw, fh, fd] = F.dims;
  const pitch = IW / f;
  if (fw > pitch + 0.5) warn(`${f} × ${fw} mm fans need ${f * fw} mm, the chassis has ${IW}`);
  const z = zA - 6 - fd / 2;
  if (TS.fanCage) inner('fancage', {kind: 'fancage', cat: TS.fanCage, count: f, fan: F.dims, pos: [0, 2, z], moves: [{s: 5, d: [0, 0.1, 0]}], group: TS.fanCage});
  for (let i = 0; i < f; i++) {
    const id = `fan-${i}`;
    inner(id, {kind: 'fan', cat: TS.fans.part, idx: i, pos: [-IW / 2 + pitch * (i + 0.5), Math.max(10 + fh / 2, SH / 2 - 3), z], moves: [{s: 4, d: [0, 0.2, 0], lag: i * 0.04}, {s: 5, d: [(i - (f - 1) / 2) * 0.035, 0, 0]}], group: TS.fans.part});
    node(`${id}-rotor`, {parent: id, kind: 'fan-rotor', cat: TS.fans.part, moves: [{s: 6, d: [0, 0, 0.075]}], sep: 5.5, group: TS.fans.part});
  }
  zB = zA - 12 - fd - 8;
}

// CPUs, sockets, heat sinks and DIMMs on the system board
let zC = zB;
{
  const cp = TS.cpu;
  const n = cp ? cp.count : 0;
  const HS = cp && cp.heatsink ? cat(cp.heatsink) : null;
  const SK = cp && cp.socket ? cat(cp.socket) : null;
  const CP = cp ? cat(cp.part) : null;
  const M = TS.memory ? cat(TS.memory.part) : null;
  const per = TS.memory ? TS.memory.perCpu : 0;
  const bank = Math.ceil(per / 2);
  const hsW = HS ? HS.dims[0] : CP ? CP.dims[0] + 10 : 0;
  let mp = M ? M.dims[0] + 1.5 : 0;
  const slot = n ? IW / n : IW;
  if (n && 2 * bank * mp + hsW + 8 > slot) {
    warn(`${per} DIMMs per CPU do not fit beside the ${hsW} mm heat sink: squeezed`);
    mp = (slot - hsW - 8) / (2 * bank);
  }
  const len = Math.max(M ? M.dims[2] : 0, HS ? HS.dims[2] : 0, SK ? SK.dims[2] : 0);
  const zc = zB - len / 2 - 4;
  LAYOUT.cpu = {z: zc, len, cx: [], slots: []};
  for (let k = 0; k < n; k++) {
    const cx = n === 1 ? 0 : -IW / 2 + slot * (k + 0.5);
    LAYOUT.cpu.cx.push(cx);
    const sk = SK ? SK.dims[1] : 0;
    if (SK) inner(`sock-${k}`, {kind: 'socket', cat: cp.socket, pos: [cx, 5, zc], sep: 3.5, group: cp.socket});
    inner(`cpu-${k}`, {kind: 'cpu', cat: cp.part, pos: [cx, 5 + sk - 1, zc], moves: [{s: 6, d: [0, 0.12, 0]}], group: cp.part, sep: 4.5});
    if (HS) inner(`hs-${k}`, {kind: 'heatsink', cat: cp.heatsink, pos: [cx, 5 + sk - 1 + CP.dims[1], zc], moves: [{s: 5, d: [0, 0.2, 0], lag: k * 0.08}, {s: 6, d: [0, 0.08, 0]}], group: cp.heatsink});
    let j = 0;
    for (const s of [-1, 1])
      for (let b = 0; b < bank && j < per; b++, j++) {
        const x = cx + s * (hsW / 2 + 4 + mp * (b + 0.5));
        LAYOUT.cpu.slots.push(x);
        const id = k * per + j;
        inner(`dimm-${id}`, {kind: 'dimm', cat: TS.memory.part, pos: [x, 9, zc], moves: [{s: 5, d: [0, 0.12, 0], lag: (j / Math.max(1, per - 1)) * 0.3}], group: TS.memory.part});
      }
  }
  zC = zc - len / 2 - 8;
  if (TS.duct && n) inner('duct', {kind: 'duct', cat: TS.duct, pos: [0, 5 + (SK ? SK.dims[1] : 0) - 1 + (CP ? CP.dims[1] : 0) + (HS ? HS.dims[1] : 0) + 2, (zB + zC) / 2], len: zB - zC, moves: [{s: 4, d: [0, 0.32, 0]}, {s: 5, d: [0, 0.12, 0]}], group: TS.duct});
}

// rear: PSUs in the corners, the NIC riser between them, the OCP card under it
let rearW = IW;
{
  let pw = 0;
  if (TS.psu && TS.psu.count) {
    const P = cat(TS.psu.part);
    const [w, h, l] = P.dims;
    pw = w;
    const perSide = Math.ceil(TS.psu.count / 2);
    if (4 + perSide * (h + 2) > SH - 4) warn(`${TS.psu.count} PSUs stack higher than the chassis`);
    for (let i = 0; i < TS.psu.count; i++) {
      const s = i % 2 ? 1 : -1;
      const lv = Math.floor(i / 2);
      inner(`psu-${i}`, {kind: 'psu', cat: TS.psu.part, pos: [s * (IW / 2 - w / 2), 4 + lv * (h + 2), -SD / 2 + l / 2 - 4], moves: [{s: 4, d: [0, 0, -0.26], lag: i * 0.05}, {s: 5, d: [s * 0.06, lv * 0.03, 0]}], group: TS.psu.part});
    }
  }
  const nc = TS.nics ? TS.nics.count : 0;
  rearW = IW - 2 * pw - 20;
  if (nc) {
    const N = cat(TS.nics.part);
    const [nt, , nl] = N.dims;
    let pitch = Math.min(nt + 18, rearW / nc);
    if (nt > pitch) {
      warn(`${nc} NICs do not fit between the PSUs: squeezed`);
      pitch = rearW / nc;
    }
    const R = TS.nics.riser ? cat(TS.nics.riser) : null;
    const rl = R ? R.dims[2] : nl + 8;
    if (R) inner('riser', {kind: 'riser', cat: TS.nics.riser, width: nc * pitch + 12, pos: [0, 20, -SD / 2 + rl / 2], len: rl, moves: [{s: 4, d: [0, 0.24, 0]}, {s: 5, d: [0, 0.14, 0]}], group: TS.nics.riser});
    for (let i = 0; i < nc; i++)
      inner(`nic-${i}`, {kind: 'nic', cat: TS.nics.part, pos: [(i - (nc - 1) / 2) * pitch, 26, -SD / 2 + nl / 2 + 2], moves: [{s: 4, d: [0, 0.24, 0]}, {s: 5, d: [(i - (nc - 1) / 2) * 0.035, 0.01, -0.06]}], group: TS.nics.part});
  }
  if (TS.ocp) {
    const O = cat(TS.ocp.part);
    inner('ocp', {kind: 'ocp', cat: TS.ocp.part, pos: [0, 5, -SD / 2 + O.dims[2] / 2 - 2], moves: [{s: 4, d: [0, 0, -0.24]}], group: TS.ocp.part});
  }
  if (TS.boot) {
    const B = cat(TS.boot.part);
    inner('boot', {kind: 'boot', cat: TS.boot.part, pos: [0, 5, zC - 10 - B.dims[2] / 2], moves: [{s: 5, d: [0, 0.16, 0]}], group: TS.boot.part});
  }
}
if (TS.board) inner('board', {kind: 'board', cat: TS.board, pos: [0, 3, (zB - SD / 2) / 2], len: zB + SD / 2, layout: LAYOUT, rearW, sep: 3.5, group: TS.board});
LAYOUT.zA = zA;
LAYOUT.zB = zB;
LAYOUT.zC = zC;
LAYOUT.IW = IW;

// ------------------------------------------------------------ pose
const MAXLAG = 0.4;
const stageK = (X, m) => smoother((X - (m.s - 1) - (m.lag || 0)) / (1 - MAXLAG));
/** The pose of one node at teardown level X, in its parent's frame: metres, y rotation, opacity. */
export function pose(n, X) {
  let x = n.pos[0] / 1000;
  let y = n.pos[1] / 1000;
  let z = n.pos[2] / 1000;
  let ry = 0;
  let op = 1;
  for (const m of n.moves) {
    const k = stageK(X, m);
    if (!k) continue;
    if (m.d) {
      x += m.d[0] * k;
      y += m.d[1] * k;
      z += m.d[2] * k;
    }
    if (m.ry) ry += m.ry * k;
    if (m.fade) op *= 1 - m.fade * k;
  }
  return {x, y, z, ry, op};
}
/** The node a click on `id` means at level X: a part still inside its parent answers for the parent. */
export function resolve(id, X) {
  let n = NODES.get(id);
  while (n && n.parent && X < n.sep - 0.5) n = NODES.get(n.parent);
  return n ? n.id : null;
}
/** Is the node moving at X (the accent goes on it)? */
export function moving(n, X) {
  return n.moves.some((m) => {
    const k = stageK(X, m);
    return k > 0.02 && k < 0.98;
  });
}

// ------------------------------------------------------------ stages
export const STAGES = [
  {key: 'rack', name: 'Rack', sub: `${RK.units}U cabinet, closed`},
  {key: 'doors', name: 'Doors', sub: 'Doors open, side panels off'},
  {key: 'slide', name: 'Slide out', sub: `Rails extend ${TRAVEL} mm`},
  {key: 'lid', name: 'Lid off', sub: 'Off the rails, cover lifted'},
  {key: 'modules', name: 'Modules', sub: 'GPU bank, fans, PSUs, riser out'},
  {key: 'parts', name: 'Parts', sub: 'Every part on its own'},
  {key: 'components', name: 'Components', sub: 'GPU, CPU and fan internals'},
];

// ------------------------------------------------------------ bill of materials, counted from the nodes
export const BOM = [];
{
  const by = new Map();
  for (const n of NODES.values()) {
    if (!n.group || !n.cat || n.kind.includes('-') || n.kind === 'door' || n.kind === 'side') continue;
    if (n.parent !== S && n.group !== 'pdu') continue;
    if (!by.has(n.group)) by.set(n.group, {key: n.group, cat: n.cat, ids: [], qty: 0});
    const g = by.get(n.group);
    g.ids.push(n.id);
    g.qty += n.kind === 'nvlink' ? n.count : 1;
  }
  const ORDER = ['gpu', 'nvlink', 'cpu', 'heatsink', 'dimm', 'drive', 'fan', 'psu', 'nic', 'ocp', 'boot', 'board', 'pcieboard', 'socket', 'duct', 'fancage', 'riser', 'cover', 'chassis', 'pdu'];
  for (const k of ORDER) for (const g of by.values()) if (cat(g.cat).kind === k) BOM.push({...g, name: cat(g.cat).name, watts: cat(g.cat).watts || 0});
}

// ------------------------------------------------------------ power, from the same counts
const count = (k) => BOM.filter((b) => cat(b.cat).kind === k).reduce((a, b) => a + b.qty, 0);
const wattsOf = (k) => BOM.filter((b) => cat(b.cat).kind === k).reduce((a, b) => a + b.qty * (b.watts || 0), 0);
/** GPU utilisation of a training job: 1.5 s of compute near full, 0.5 s of all-reduce, repeating. */
export const util = (t) => {
  const p = (((t % 2) + 2) % 2) / 2;
  const sync = smoother((p - 0.72) / 0.04) * (1 - smoother((p - 0.96) / 0.04));
  return 0.96 - 0.4 * sync + 0.015 * Math.sin(t * 7.3);
};
export const fanFrac = (u) => 0.5 + 0.45 * u;
export const CATS = [
  {key: 'gpu', label: 'GPU'},
  {key: 'cpu', label: 'CPU'},
  {key: 'mem', label: 'MEMORY'},
  {key: 'fan', label: 'FANS'},
  {key: 'io', label: 'NET · DISK · BOARD'},
];
export function serverPower(u) {
  const G0 = gp ? G : null;
  const gpu = G0 ? count('gpu') * ((G0.idle || G0.watts * 0.15) + u * (G0.watts - (G0.idle || G0.watts * 0.15))) : 0;
  const cpu = wattsOf('cpu') * (0.45 + 0.5 * u);
  const mem = wattsOf('dimm') * (0.6 + 0.4 * u);
  const fan = wattsOf('fan') * fanFrac(u) ** 3;
  const io = wattsOf('nic') + wattsOf('ocp') + wattsOf('boot') + wattsOf('drive') * (0.5 + 0.3 * u) + wattsOf('board') + wattsOf('pcieboard');
  const dc = gpu + cpu + mem + fan + io;
  const P = TS.psu ? cat(TS.psu.part) : null;
  const pc = TS.psu ? TS.psu.count : 0;
  const red = TS.psu?.redundancy || 'N';
  const usable = P ? (red === 'N+N' ? Math.floor(pc / 2) : red === 'N+1' ? pc - 1 : pc) * P.output : 0;
  return {cats: {gpu, cpu, mem, fan, io}, dc, wall: dc / (P?.efficiency || 0.94), usable, max: serverMax()};
}
function serverMax() {
  return (gp ? count('gpu') * G.watts : 0) + wattsOf('cpu') + wattsOf('dimm') + wattsOf('fan') + wattsOf('nic') + wattsOf('ocp') + wattsOf('boot') + wattsOf('drive') + wattsOf('board') + wattsOf('pcieboard');
}
export function rackPower(u) {
  let w = 0;
  for (const d of DEVICES) {
    if (d.srv && d.server === TARGET.server) w += serverPower(u).wall;
    else if (d.srv) w += (d.srv.watts || 600) * (0.6 + 0.3 * u);
    else w += (d.c.watts || 0) * 0.7;
  }
  return w;
}
const PD = cat(RACK.pdu.part);
export const PDU_KW = (Math.sqrt(PD.phases === 3 ? 3 : 1) * PD.volts * PD.amps) / 1000;

// ------------------------------------------------------------ the totals the title and the inspect card read
const gpuNodes = DEVICES.filter((d) => d.srv && d.srv.gpu && d.srv.gpu.count);
export const TOTALS = {
  gpus: gpuNodes.reduce((a, d) => a + d.srv.gpu.count, 0),
  gpuName: G ? G.name : '',
  nodes: gpuNodes.length,
  memTB: (count('dimm') * (TS.memory ? cat(TS.memory.part).gb : 0)) / 1024,
  hbmGB: gp ? gp.count * (G.gb || 0) : 0,
  nvmeTB: dr ? dr.count * (DR.tb || 0) : 0,
  cores: TS.cpu ? TS.cpu.count * (cat(TS.cpu.part).spec.find((s) => s[0] === 'Cores') ? parseInt(cat(TS.cpu.part).spec.find((s) => s[0] === 'Cores')[1], 10) : 0) : 0,
};

const fmt = (v) => v.toLocaleString('en-US');
/** What the inspect card shows for a node. */
export function info(id) {
  const n = NODES.get(id);
  if (!n) return null;
  if (n.kind === 'server' || n.kind === 'shell') {
    const s = n.srv;
    if (s.shell) return {name: s.name, sub: `${n.name} · ${s.sub}`, spec: [['Height', `${s.units}U`], ['Drives', s.drives ? `${s.drives.count} × ${cat(s.drives.part).name}` : '—'], ['Power', `${fmt(s.watts || 0)} W max`]], qty: 1};
    const gpuLine = s.gpu ? `${s.gpu.count} × ${cat(s.gpu.part).name}` : '—';
    return {
      name: s.name,
      sub: `${n.name} · ${s.sub}`,
      spec: [['GPUs', gpuLine], ['CPUs', s.cpu ? `${s.cpu.count} × ${cat(s.cpu.part).name}` : '—'], ['Memory', `${TOTALS.memTB.toFixed(1)} TB DDR5 + ${fmt(TOTALS.hbmGB)} GB HBM`], ['Power', `${fmt(Math.round(serverMax()))} W max`]],
      qty: TOTALS.nodes,
    };
  }
  if (n.kind === 'rack') return {name: RK.name, sub: RK.sub, spec: [...RK.spec, ['Load', `${TOTALS.nodes} GPU nodes · ${TOTALS.gpus} GPUs`]], qty: 1};
  const c = cat(n.cat);
  if (n.kind === 'door' || n.kind === 'side') return {name: n.name, sub: 'Perforated steel', spec: [['Airflow', 'Cold aisle in, hot aisle out'], ['Removal', 'Lift-off hinges']], qty: n.kind === 'door' ? 2 : 2};
  if (n.kind === 'switch') return {name: c.name, sub: `${n.name} · ${c.sub}`, spec: [...c.spec, ['Power', `${fmt(c.watts)} W max`]], qty: DEVICES.filter((d) => d.part === n.cat).length};
  if (n.kind === 'blank') return {name: c.name, sub: c.sub, spec: [['Fills', `${n.units.length} empty U`], ...c.spec], qty: n.units.length};
  if (n.kind === 'rail') return {name: c.name, sub: c.sub, spec: [['Travel', `${fmt(TRAVEL)} mm out`], ...c.spec], qty: 1};
  if (n.kind === 'pdu') return {name: c.name, sub: `Feed ${n.feed} · ${c.sub}`, spec: [...c.spec, ['Capacity', `${PDU_KW.toFixed(1)} kW per feed`]], qty: RACK.pdu.count};
  const sub = {'gpu-shroud': 'Shroud', 'gpu-sink': 'Heat sink', 'gpu-board': 'Board · GH100 die · HBM3', 'fan-rotor': 'Rotor'}[n.kind];
  const b = BOM.find((g) => g.key === n.group);
  const dims = c.dims[0] && c.dims[2] ? [['Size', `${c.dims.map((v) => +v.toFixed(1)).join(' × ')} mm`]] : [];
  const watts = c.watts ? [['Power', `${fmt(c.watts)} W max each`]] : [];
  return {name: sub ? `${c.name} · ${sub}` : c.name, sub: c.sub, spec: [...c.spec, ...(c.spec.length < 4 ? dims : []), ...(c.spec.some((s) => s[0] === 'Power') ? [] : watts)].slice(0, 5), qty: b ? b.qty : 1};
}
