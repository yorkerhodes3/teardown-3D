// The rack and the server as geometry, every part built from its catalog dimensions by the builder for its kind
// (BUILD below). One group per node of model.js; update(X, t, ops) poses them from the teardown level, spins the fans,
// blinks the LEDs, and paints risk (red, the page's one accent), selection and isolation into each part's materials.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {cat, FREE_U, LAYOUT, NODES, pose, RACKDIM, resolve, TARGET, U} from './model.js';

const RED = new THREE.Color('#e0201b');
const V3 = THREE.Vector3;

// ------------------------------------------------------------ textures drawn in code
const canvasTex = (w, h, draw, repeat) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
};
const hexPerf = (base, hole, repeat) =>
  canvasTex(64, 56, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = hole;
    for (const [x, y] of [[16, 14], [48, 14], [0, 42], [32, 42], [64, 42]]) {
      g.beginPath();
      for (let k = 0; k < 6; k++) g.lineTo(x + 11 * Math.cos((k * Math.PI) / 3), y + 11 * Math.sin((k * Math.PI) / 3));
      g.fill();
    }
  }, repeat);
const textTex = (w, h, bg, draw) =>
  canvasTex(w, h, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }
    draw(g, w, h);
  });

// ------------------------------------------------------------ materials (cloned per part so each can be lit alone)
const MAT_DEFS = {
  rack: {color: '#25272b', roughness: 0.6, metalness: 0.35},
  rackEdge: {color: '#34373c', roughness: 0.5, metalness: 0.4},
  steel: {color: '#c3c7cc', roughness: 0.48, metalness: 0.55},
  steelDark: {color: '#8d9298', roughness: 0.5, metalness: 0.5},
  bezel: {color: '#1d1f22', roughness: 0.55, metalness: 0.2},
  black: {color: '#141518', roughness: 0.6, metalness: 0.1},
  pcb: {color: '#1f3b2e', roughness: 0.55, metalness: 0.1},
  pcbDark: {color: '#17221d', roughness: 0.55, metalness: 0.1},
  gold: {color: '#c8a24a', roughness: 0.35, metalness: 0.9},
  copper: {color: '#b8733f', roughness: 0.4, metalness: 0.85},
  alu: {color: '#d4d7db', roughness: 0.45, metalness: 0.6},
  shroud: {color: '#b9b2a3', roughness: 0.45, metalness: 0.65},
  substrate: {color: '#3c4a2e', roughness: 0.5, metalness: 0.1},
  die: {color: '#9aa0a8', roughness: 0.25, metalness: 0.8},
  terra: {color: '#c4532d', roughness: 0.55, metalness: 0.05},
  blue: {color: '#3a6fb5', roughness: 0.55, metalness: 0.05},
  plastic: {color: '#26282c', roughness: 0.75, metalness: 0},
  psu: {color: '#b4b8bd', roughness: 0.5, metalness: 0.55},
  sticker: {color: '#e9eaec', roughness: 0.8, metalness: 0},
  led: {color: '#1c3a22', emissive: '#37e05a', emissiveIntensity: 0.9, roughness: 0.4, led: true},
  ledBlue: {color: '#1c2a3a', emissive: '#4aa3ff', emissiveIntensity: 0.9, roughness: 0.4, led: true},
};
const matCache = new Map();
const mat = (key) => {
  if (key instanceof THREE.Material) return key;
  if (!matCache.has(key)) {
    const d = MAT_DEFS[key];
    if (!d) throw new Error(`no material ${key}`);
    const {led, ...p} = d;
    const m = new THREE.MeshStandardMaterial({envMapIntensity: 0.5, ...p});
    m.userData.led = !!led;
    matCache.set(key, m);
  }
  return matCache.get(key);
};
const texMat = (key, make, extra = {}) => {
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({map: make(), roughness: 0.6, metalness: 0.2, envMapIntensity: 0.5, ...extra}));
  return matCache.get(key);
};
const decal = (key, make) => {
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({map: make(), transparent: true, alphaTest: 0.05, roughness: 0.6, metalness: 0.1, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    m.userData.decal = true;
    matCache.set(key, m);
  }
  return matCache.get(key);
};
const lenovoBadge = () =>
  textTex(256, 80, '#e0201b', (g, w, h) => {
    g.fillStyle = '#fff';
    g.font = '700 50px Inter, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Lenovo', w / 2, h / 2 + 2);
  });

// ------------------------------------------------------------ the builder: boxes and cylinders in mm, merged per material
class Geo {
  constructor() {
    this.by = new Map();
  }
  add(m, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z);
    const k = mat(m);
    if (!this.by.has(k)) this.by.set(k, []);
    this.by.get(k).push(g.index ? g.toNonIndexed() : g);
    return this;
  }
  /** a box centred at x, y, z */
  box(m, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(m, new THREE.BoxGeometry(Math.max(w, 0.05), Math.max(h, 0.05), Math.max(d, 0.05)), x, y, z, rx, ry, rz);
  }
  /** a box standing on y0 */
  boxB(m, w, h, d, x, y0, z) {
    return this.box(m, w, h, d, x, y0 + h / 2, z);
  }
  cyl(m, r, len, x, y, z, axis = 'y', seg = 16) {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    return this.add(m, g, x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0);
  }
  /** a flat decal facing +z (rot to turn it) */
  plane(m, w, h, x, y, z, rx = 0, ry = 0) {
    return this.add(m, new THREE.PlaneGeometry(w, h), x, y, z, rx, ry, 0);
  }
}

// ------------------------------------------------------------ builders, one per kind (part-local mm)
const R = RACKDIM;
const BUILD = {
  rack(b) {
    const {w: W, h: H, d: D, plinth: P} = R;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        b.boxB('rack', 45, H - P - 40, 45, sx * (W / 2 - 22.5), P, sz * (D / 2 - 22.5));
        b.cyl('steelDark', 14, 24, sx * (W / 2 - 50), 12, sz * (D / 2 - 60));
      }
    for (const y of [P + 20, H - 20]) {
      for (const sz of [-1, 1]) b.box('rack', W, 40, 45, 0, y, sz * (D / 2 - 22.5));
      for (const sx of [-1, 1]) b.box('rack', 45, 40, D - 90, sx * (W / 2 - 22.5), y, 0);
    }
    b.boxB('rack', W, 6, D, 0, H - 6, 0);
    b.boxB('rackEdge', W - 12, P - 24, D - 12, 0, 22, 0);
    // EIA mounting strips with their square holes, front and rear
    const eia = texMat('eia', () =>
      canvasTex(32, 96, (g) => {
        g.fillStyle = '#9aa0a7';
        g.fillRect(0, 0, 32, 96);
        g.fillStyle = '#0d0e10';
        for (const y of [10, 42, 74]) g.fillRect(10, y, 12, 12);
      }, [1, R.units]), {metalness: 0.5, roughness: 0.45});
    for (const z of [R.front - 15, R.front - 775])
      for (const sx of [-1, 1]) {
        b.boxB(eia, 16, R.units * U, 2, sx * 233.3, P, z + 15);
        b.boxB('steelDark', 2, R.units * U, 30, sx * 241.3, P, z);
      }
  },
  door(b, n) {
    const {w: W, h: H, plinth: P} = R;
    const s = n.side;
    const x0 = s > 0 ? 0 : -W;
    const cx = x0 + W / 2;
    const z = s * 12;
    const hh = H - P - 20;
    const perf = texMat('perf', () => hexPerf('#2b2d31', '#08090a', [44, 140]), {metalness: 0.4, roughness: 0.55});
    b.box(perf, W - 60, hh - 60, 4, cx, P + hh / 2, z);
    for (const [w, h, x, y] of [[W, 30, cx, P + 15], [W, 30, cx, P + hh - 15], [30, hh, x0 + 15, P + hh / 2], [30, hh, x0 + W - 15, P + hh / 2]]) b.box('rack', w, h, 22, x, y, z);
    // the handle on the side away from the hinge
    const hx = s > 0 ? x0 + W - 15 : x0 + 15;
    b.box('steelDark', 14, 220, 14, hx, P + hh * 0.55, z + s * 16);
    if (s > 0) b.plane(texMat('badge', lenovoBadge, {roughness: 0.5}), 150, 47, cx, P + hh - 70, z + 2.6);
  },
  side(b, n) {
    const {h: H, d: D, plinth: P} = R;
    b.boxB('rack', 4, H - P - 30, D - 50, n.side * 3, P, 0);
  },
  pdu(b, n) {
    const [w, h, d] = cat(n.cat).dims;
    const s = n.pos[0] < 0 ? 1 : -1;
    b.boxB('black', w, h, d, 0, 0, 0);
    for (let i = 0; i < 48; i++) {
      const big = i % 4 === 3;
      b.box('plastic', 3, big ? 22 : 15, big ? 26 : 20, s * (w / 2 + 1), 120 + i * 32, 0);
    }
    b.box('ledBlue', 2, 40, 34, s * (w / 2 + 1), h - 60, 0);
    b.box('sticker', 1, 60, 60, s * (w / 2 + 0.6), h - 140, 0);
    b.cyl('black', 14, 140, 0, -70, 0);
  },
  rail(b, n) {
    const [, rh, rl] = cat(n.cat).dims;
    const half = n.width / 2;
    const st = n.stage;
    const off = [7.5, 4.5, 1.5][st];
    const hh = rh - st * 6;
    for (const sx of [-1, 1]) b.boxB(st === 1 ? 'steelDark' : 'steel', 3, hh, rl - st * 20, sx * (half + off), 30 - hh / 2 + 18, -st * 10);
  },
  blank(b, n) {
    for (const u of n.units) {
      b.box('bezel', 482.6, U - 0.8, 2, 0, R.uY(u) + U / 2, 1);
      for (const sx of [-1, 1]) b.cyl('steelDark', 3, 3, sx * 233.3, R.uY(u) + U / 2, 3, 'z', 10);
    }
  },
  switch(b, n) {
    const c = cat(n.cat);
    const [w, h, d] = c.dims;
    b.boxB('rack', w, h, d, 0, 0, 0);
    b.boxB('bezel', 482.6, h, 3, 0, 0, d / 2 + 1.5);
    const face = texMat(`face:${n.cat}`, () =>
      canvasTex(1024, 100, (g, W, H) => {
        g.fillStyle = '#1b1d20';
        g.fillRect(0, 0, W, H);
        const per = Math.ceil(c.ports / 2);
        const pw = c.portStyle === 'qsfp' ? 30 : 15;
        for (let i = 0; i < c.ports; i++) {
          const x = 140 + (i % per) * ((W - 260) / per);
          const y = i < per ? 14 : 54;
          g.fillStyle = c.portStyle === 'qsfp' ? '#9aa0a7' : '#3a3d42';
          g.fillRect(x, y, pw, 30);
          g.fillStyle = '#060607';
          g.fillRect(x + 3, y + 5, pw - 6, 20);
          g.fillStyle = '#38d158';
          g.fillRect(x + pw - 6, y - 4, 4, 3);
        }
        g.fillStyle = '#8b8f95';
        g.font = '600 18px Inter, Arial';
        g.fillText(n.name.toUpperCase(), 20, 56);
      }), {roughness: 0.5});
    b.plane(face, w, h - 2, 0, h / 2, d / 2 + 3.2);
  },
  shell(b, n) {
    const srv = n.srv;
    const [w, h, d] = srv.dims;
    if (n.dev.server === TARGET.server) {
      BUILD.chassis(b, {dims: srv.dims});
      b.boxB('steel', w, 1.5, d, 0, h - 1.5, 0);
      for (const id of NODES.keys())
        if (/^drive-\d+$/.test(id)) {
          const dn = NODES.get(id);
          const g = new Geo();
          BUILD.drive(g, dn);
          for (const [m, list] of g.by) for (const geo of list) b.add(m, geo, dn.pos[0], dn.pos[1], dn.pos[2]);
        }
      return;
    }
    b.boxB('steelDark', w, h, d, 0, 0, 0);
    const dc = srv.drives ? srv.drives.count : 0;
    const face = texMat(`shell:${n.dev.server}`, () =>
      canvasTex(1024, 200, (g, W, H) => {
        g.fillStyle = '#1b1d20';
        g.fillRect(0, 0, W, H);
        const bw = (W - 120) / Math.max(1, dc);
        for (let i = 0; i < dc; i++) {
          const x = 60 + i * bw;
          g.fillStyle = '#2c2f33';
          g.fillRect(x + 2, 14, bw - 4, H - 28);
          g.fillStyle = '#c4532d';
          g.fillRect(x + 4, H - 40, bw - 8, 20);
          g.fillStyle = '#38d158';
          g.fillRect(x + bw / 2 - 2, 22, 4, 6);
        }
      }), {roughness: 0.5});
    b.plane(face, w, h - 4, 0, h / 2, d / 2 + 0.6);
    for (const sx of [-1, 1]) b.boxB('bezel', 17.3, h, 3, sx * (w / 2 + 8.65), 0, d / 2 + 1.5);
  },
  chassis(b, n) {
    const [W, H, D] = n.dims;
    b.boxB('steel', W, 2, D, 0, 0, 0);
    for (const sx of [-1, 1]) b.boxB('steel', 1.2, H - 3.5, D, sx * (W / 2 - 0.6), 2, 0);
    b.boxB('steel', W, 8, 2, 0, H - 10, -D / 2 + 1);
    // the front: rack ears, a grille over each GPU bank, an opening for the drive block
    const zf = D / 2;
    for (const sx of [-1, 1]) {
      b.boxB('bezel', 17.3, H, 4, sx * (W / 2 + 8.65), 0, zf + 2);
      b.boxB('bezel', 8, H * 0.55, 10, sx * (W / 2 + 8.65), H * 0.22, zf + 9);
    }
    b.cyl('steel', 4, 3, -(W / 2 + 8.65), H * 0.86, zf + 4.5, 'z', 16);
    b.box('led', 3, 3, 1.5, -(W / 2 + 8.65), H * 0.78, zf + 4.5);
    b.box('ledBlue', 3, 3, 1.5, -(W / 2 + 8.65), H * 0.72, zf + 4.5);
    b.plane(texMat('badgeV', () => textTex(80, 256, '#e0201b', (g) => {
      g.translate(40, 128);
      g.rotate(-Math.PI / 2);
      g.fillStyle = '#fff';
      g.font = '700 46px Inter, Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Lenovo', 0, 2);
    })), 12, 38, W / 2 + 8.65, H * 0.8, zf + 4.2);
    const drives = [...NODES.values()].filter((d) => d.kind === 'drive');
    const perf = texMat('grille', () => hexPerf('#2a2c30', '#060607', [1, 1]), {metalness: 0.35});
    const span = (x0, x1) => {
      if (x1 - x0 < 2) return;
      const g = new THREE.PlaneGeometry(x1 - x0, H - 8);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / 22, (uv.getY(i) * (H - 8)) / 19);
      b.add(perf, g, (x0 + x1) / 2, H / 2, zf + 0.5);
      b.box('bezel', x1 - x0, H - 8, 1, (x0 + x1) / 2, H / 2, zf - 0.2);
    };
    if (drives.length) {
      const DR = cat(drives[0].cat).dims;
      const xs = drives.map((d) => d.pos[0]);
      const a = Math.min(...xs) - DR[0] / 2 - 3;
      const c = Math.max(...xs) + DR[0] / 2 + 3;
      span(-W / 2, a);
      span(c, W / 2);
      b.box('bezel', c - a, 6, 3, (a + c) / 2, 3, zf);
      b.box('bezel', c - a, H - 10 - (Math.max(...drives.map((d) => d.pos[1])) + DR[1]), 3, (a + c) / 2, (H + Math.max(...drives.map((d) => d.pos[1])) + DR[1]) / 2, zf);
    } else span(-W / 2, W / 2);
  },
  cover(b, n) {
    const [W, , D] = n.dims;
    b.boxB('steel', W, 1.5, D, 0, 0, 0);
    for (const sx of [-1, 1]) b.boxB('steel', 1, 8, D, sx * (W / 2 + 0.5), -6.5, 0);
    b.boxB('sticker', 170, 0.3, 120, 90, 1.5, -D / 2 + 110);
    b.boxB('blue', 46, 5, 26, 0, 1.5, -D / 2 + 60);
  },
  board(b, n) {
    const W = LAYOUT.IW;
    const L = n.len;
    b.boxB('pcbDark', W, 2, L, 0, 0, 0);
    const zc = LAYOUT.cpu.z - n.pos[2];
    for (const x of LAYOUT.cpu.slots) {
      b.boxB('black', 6, 7, LAYOUT.cpu.len + 6, x, 2, zc);
      for (const sz of [-1, 1]) b.boxB('sticker', 6, 9, 4, x, 2, zc + sz * (LAYOUT.cpu.len / 2 + 4));
    }
    for (const cx of LAYOUT.cpu.cx)
      for (let i = 0; i < 8; i++) {
        b.boxB('black', 8, 5, 8, cx - 42 + i * 12, 2, zc - LAYOUT.cpu.len / 2 - 22);
        b.cyl('steelDark', 3.5, 8, cx - 40 + i * 12, 6, zc - LAYOUT.cpu.len / 2 - 34);
      }
    // BMC, rear I/O
    b.boxB('black', 14, 1.5, 14, -60, 2, -L / 2 + 70);
    b.boxB('steelDark', 16, 14, 18, -112, 2, -L / 2 + 8);
    b.boxB('steelDark', 14, 7, 16, -96, 2, -L / 2 + 8);
  },
  pcieboard(b, n) {
    const W = LAYOUT.IW;
    const L = n.len;
    b.boxB('pcb', W, 2, L, 0, 0, 0);
    for (const x of n.gpuX) b.boxB('black', 9, 6, 90, x, 0, L / 2 - 140);
    const sw = cat(n.cat).switches || 0;
    for (let i = 0; i < sw; i++) {
      const z = -L / 2 + 60 + i * 80;
      b.boxB('black', 30, 1.5, 30, 0, 2, z);
      for (let f = 0; f < 9; f++) b.boxB('alu', 0.8, 5, 30, -14 + f * 3.5, 3.5, z);
    }
  },
  gpu() {},
  'gpu-board'(b, n) {
    const [t, h, l] = cat(n.cat).dims;
    const px = -t / 2 + 4.8;
    b.boxB('pcbDark', 1.6, h - 6, l - 10, px, 0, 0);
    b.boxB('gold', 1.7, 7, 89, px, -6, l / 2 - 140);
    b.box('black', 1, h - 12, l - 24, -t / 2 + 1, h / 2, 0);
    b.box('substrate', 2, 56, 56, px + 1.8, h / 2, 10);
    b.box('die', 1.2, 30, 27, px + 3.4, h / 2, 10);
    for (let i = 0; i < 6; i++) b.box('die', 1.4, 9, 11, px + 3.4, h / 2 + (i % 3 - 1) * 12, 10 + (i < 3 ? -21 : 21));
    b.boxB('black', 7, 8, 20, px + 4, h - 14, -l / 2 + 26);
    for (let i = 0; i < 10; i++) b.box('steelDark', 2.4, 4, 3, px + 2, 10 + (i % 5) * 18, -80 + Math.floor(i / 5) * 160);
  },
  'gpu-sink'(b, n) {
    const [t, h, l] = cat(n.cat).dims;
    const x0 = -t / 2 + 7.5;
    b.box('copper', 3, 70, 190, x0 + 1.5, h / 2, 10);
    const fins = 12;
    const w = t / 2 - 3 - (x0 + 3);
    for (let i = 0; i < fins; i++) b.box('alu', 0.6, h - 18, l - 40, x0 + 3.5 + (i * w) / (fins - 1), h / 2, 0);
    for (const y of [h * 0.3, h * 0.7]) b.cyl('copper', 3, w, x0 + 3 + w / 2, y, -l / 2 + 40, 'x', 10);
  },
  'gpu-shroud'(b, n) {
    const c = cat(n.cat);
    const [t, h, l] = c.dims;
    b.box('shroud', 1.2, h, l, t / 2 - 0.6, h / 2, 0);
    b.box('shroud', t, 1.2, l, 0, h - 0.6, 0);
    b.box('shroud', t, 1.2, l, 0, 4, 0);
    for (const sz of [-1, 1]) {
      const z = sz * (l / 2 - 1);
      b.box('bezel', t, 8, 2, 0, h - 4, z);
      b.box('bezel', t, 8, 2, 0, 8, z);
      b.box('bezel', 4, h, 2, t / 2 - 2, h / 2, z);
    }
    b.plane(decal(`gpuLabel:${n.cat}`, () => textTex(512, 128, null, (g) => {
      g.fillStyle = '#1b1c1e';
      g.font = '800 54px Inter, Arial';
      g.fillText('NVIDIA', 18, 62);
      g.font = '600 40px Inter, Arial';
      g.fillText(c.label || c.name, 18, 112);
    })), 120, 30, t / 2 + 0.05, h * 0.62, -l * 0.18, 0, Math.PI / 2);
  },
  nvlink(b, n) {
    const t = cat(NODES.get('gpu-0').cat).dims[0];
    const span = n.x1 - n.x0 + t - 6;
    const [, h, d] = cat(n.cat).dims;
    for (let k = 0; k < n.count; k++) {
      const z = -70 + k * 36;
      b.boxB('black', span, h, d, 0, 0, z);
      b.boxB('steelDark', span - 8, 0.8, d - 6, 0, h, z);
    }
  },
  drive(b, n) {
    const [t, h, l] = cat(n.cat).dims;
    b.boxB('alu', t - 2, h, l - 10, 0, 0, -5);
    for (let i = 0; i < 4; i++) b.boxB('steelDark', t, 1.2, l - 30, 0, 4 + i * ((h - 8) / 3), -10);
    b.boxB('terra', t, h, 9, 0, 0, l / 2 - 4.5);
    b.box('led', 3, 3, 0.8, 0, h - 5, l / 2 + 0.4);
  },
  fan(b, n) {
    const [w, h, d] = cat(n.cat).dims;
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, -h / 2);
    sh.lineTo(w / 2, -h / 2);
    sh.lineTo(w / 2, h / 2);
    sh.lineTo(-w / 2, h / 2);
    const hole = new THREE.Path();
    hole.absarc(0, 0, w / 2 - 3, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    b.add('plastic', new THREE.ExtrudeGeometry(sh, {depth: d, bevelEnabled: false, curveSegments: 28}), 0, 0, -d / 2);
    for (const a of [Math.PI / 4, -Math.PI / 4]) b.box('plastic', 3, w - 8, 3, 0, 0, -d / 2 + 2, 0, 0, a);
    rotor(b, w, -d / 4, -1);
    b.boxB('terra', 34, 6, 14, 0, h / 2, 0);
  },
  'fan-rotor'(b, n) {
    const [w, , d] = cat(n.cat).dims;
    rotor(b, w, d / 4, 1);
  },
  fancage(b, n) {
    const [fw, fh, fd] = n.fan;
    const W = LAYOUT.IW;
    b.boxB('steel', W, 2, fd + 8, 0, 0, 0);
    b.boxB('steel', W, 3, 10, 0, fh + 18, fd / 2);
    const pitch = W / n.count;
    for (let i = 0; i <= n.count; i++) b.boxB('steelDark', 1.5, fh + 18, fd + 8, -W / 2 + i * pitch, 0, 0);
    void fw;
  },
  cpu(b, n) {
    const c = cat(n.cat);
    const [w, h, l] = c.dims;
    b.boxB('substrate', w, 1.6, l, 0, 0, 0);
    b.boxB('die', w - 8, h - 1.6, l - 12, 0, 1.6, 0);
    b.plane(texMat(`ihs:${n.cat}`, () => textTex(256, 256, '#a7adb4', (g) => {
      g.fillStyle = '#2a2c30';
      g.font = '800 30px Inter, Arial';
      g.fillText(c.label || 'CPU', 22, 120);
      g.font = '600 24px Inter, Arial';
      g.fillText(c.name.replace(c.label || '', '').trim(), 22, 156);
    }), {metalness: 0.7, roughness: 0.3}), w - 10, l - 14, 0, h + 0.05, 0, -Math.PI / 2);
  },
  socket(b, n) {
    const [w, h, l] = cat(n.cat).dims;
    for (const [a, c, x, z] of [[w, 7, 0, l / 2 - 3.5], [w, 7, 0, -l / 2 + 3.5], [7, l, w / 2 - 3.5, 0], [7, l, -w / 2 + 3.5, 0]]) b.boxB('black', a, h, c, x, 0, z);
    b.boxB('gold', w - 14, 1, l - 14, 0, 0, 0);
    for (const [x, z] of [[-w / 2 - 6, -l / 2 + 10], [w / 2 + 6, -l / 2 + 10], [0, l / 2 + 6]]) b.cyl('steel', 3.5, h + 2, x, (h + 2) / 2, z, 'y', 10);
  },
  heatsink(b, n) {
    const c = cat(n.cat);
    const [w, h, l] = c.dims;
    b.boxB('copper', w - 10, 8, l - 20, 0, 0, 0);
    for (let i = 0; i < c.fins; i++) b.boxB('alu', 0.5, h - 14, l, -w / 2 + 1 + (i * (w - 2)) / (c.fins - 1), 10, 0);
    for (let i = 0; i < c.pipes; i++) b.cyl('copper', 3, h - 6, -w / 2 + 18 + (i * (w - 36)) / Math.max(1, c.pipes - 1), h / 2, i % 2 ? 18 : -18, 'y', 10);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl('blue', 4, 14, sx * (w / 2 - 6), 8, sz * (l / 2 - 6), 'y', 12);
  },
  dimm(b, n) {
    const [t, h, l] = cat(n.cat).dims;
    b.boxB('pcb', 1.2, h, l, 0, 0, 0);
    for (const sx of [-1, 1]) b.boxB('black', 2.4, h - 6, l - 6, sx * (t / 2 - 1.2), 4, 0);
    b.boxB('gold', 1.4, 3.2, l - 8, 0, -0.2, 0);
    b.boxB('sticker', 0.2, 12, 40, t / 2 + 0.1, 10, 20);
  },
  duct(b, n) {
    const W = LAYOUT.IW;
    const L = n.len;
    const drop = n.pos[1] - 5;
    b.boxB('plastic', W, 2, L, 0, 0, 0);
    for (const sx of [-1, 1]) b.boxB('plastic', 2, drop, L, sx * (W / 2 - 1), -drop, 0);
    b.boxB('plastic', W, 2, 12, 0, -10, L / 2 - 6);
    for (const sx of [-1, 1]) b.boxB('blue', 22, 6, 14, sx * W * 0.3, 2, 0);
  },
  psu(b, n) {
    const [w, h, l] = cat(n.cat).dims;
    b.boxB('psu', w, h, l, 0, 0, 0);
    const z = -l / 2;
    b.boxB('black', w, h, 3, 0, 0, z - 1.5);
    b.cyl('plastic', 15, 3.4, -w / 2 + 22, h / 2, z - 2.2, 'z', 22);
    b.boxB('black', 16, 12, 12, w / 2 - 16, h / 2 - 6, z - 6);
    b.boxB('terra', 8, h - 8, 14, w / 2 - 6, 4, z - 7);
    b.box('led', 3, 3, 1, -w / 2 + 44, h - 7, z - 3.3);
    b.boxB('sticker', w - 12, 0.3, l * 0.5, 0, h, 10);
  },
  riser(b, n) {
    const w = n.width;
    const L = n.len;
    const H = cat(n.cat).dims[1];
    b.boxB('pcb', w - 6, 2, 36, 0, 0, -L / 2 + 60);
    for (const nn of NODES.values()) if (nn.kind === 'nic') b.boxB('black', 9, 4, 90, nn.pos[0], 2, nn.pos[2] - n.pos[2]);
    b.boxB('steel', w, 1.5, L, 0, H - 1.5, 0);
    for (const sx of [-1, 1]) b.boxB('steel', 1.5, H, L, sx * (w / 2 - 0.75), 0, 0);
    b.boxB('blue', 26, 6, 14, 0, H, L / 2 - 20);
  },
  nic(b, n) {
    const [t, h, l] = cat(n.cat).dims;
    const px = -t / 2 + 3;
    b.boxB('pcb', 1.6, h, l, px, 0, 0);
    b.boxB('gold', 1.7, 6, 82, px, -6, 10);
    b.box('black', 9, 42, 50, px + 5.5, h * 0.55, 15);
    for (let i = 0; i < 6; i++) b.box('steelDark', 9.4, 1, 50, px + 5.5, h * 0.55 - 18 + i * 7.2, 15);
    b.box('steel', 14, 18, 52, px + 7.5, h - 14, -l / 2 + 26);
    b.box('steel', t, h + 10, 1, 0, h / 2, -l / 2 - 0.5);
    b.box('black', 12, 14, 1.2, px + 7.5, h - 14, -l / 2 - 1);
  },
  ocp(b, n) {
    const [w, h, l] = cat(n.cat).dims;
    b.boxB('pcb', w, 1.6, l, 0, 0, 0);
    for (const sx of [-1, 1]) b.boxB('steel', 15, 10, 46, sx * 16, 1.6, -l / 2 + 23);
    b.boxB('black', 24, 6, 24, 0, 1.6, 20);
    b.boxB('steelDark', w, h, 1, 0, 0, -l / 2 - 0.5);
    b.boxB('blue', 14, 5, 6, w / 2 - 12, 2, -l / 2 - 3.5);
  },
  boot(b, n) {
    const [w, h, l] = cat(n.cat).dims;
    b.boxB('pcb', w, 1.6, l, 0, 0, 0);
    for (const sx of [-1, 1]) b.boxB('pcbDark', 18, 1.2, 80, sx * 10, 1.6, 0);
    b.boxB('alu', w - 2, h - 4, l - 20, 0, 3, 0);
  },
};
function rotor(b, w, z, dir) {
  const r = w / 2 - 5;
  b.cyl('plastic', 15, 14, 0, 0, z, 'z', 24);
  for (let i = 0; i < 7; i++) {
    const g = new THREE.BoxGeometry(16, r - 14, 1.2);
    g.translate(0, 14 + (r - 14) / 2, 0);
    g.rotateY(dir * 0.55);
    g.rotateZ((i / 7) * Math.PI * 2);
    b.add('black', g, 0, 0, z);
  }
}

// ------------------------------------------------------------ the scene graph
export function buildRack() {
  const root = new THREE.Group();
  const parts = new Map();
  const pickables = [];
  for (const n of NODES.values()) {
    const obj = new THREE.Group();
    obj.name = n.id;
    const b = new Geo();
    BUILD[n.kind]?.(b, n);
    const mats = [];
    const box = new THREE.Box3();
    for (const [m, list] of b.by) {
      const g = mergeGeometries(list, false);
      g.scale(0.001, 0.001, 0.001);
      g.computeBoundingBox();
      box.union(g.boundingBox);
      const mm = m.clone();
      mm.userData = {...m.userData, color: m.color.clone(), emissive: m.emissive.clone(), ei: m.emissiveIntensity};
      const mesh = new THREE.Mesh(g, mm);
      mesh.castShadow = !m.userData.decal;
      mesh.receiveShadow = true;
      mesh.userData.node = n.id;
      obj.add(mesh);
      mats.push(mm);
      pickables.push(mesh);
    }
    const parent = n.parent ? parts.get(n.parent).obj : root;
    parent.add(obj);
    parts.set(n.id, {n, obj, mats, centre: box.isEmpty() ? new V3() : box.getCenter(new V3()), size: box.isEmpty() ? 0 : box.getSize(new V3()).length(), anc: n.parent ? [n.parent, ...parts.get(n.parent).anc] : []});
  }
  for (const p of parts.values()) p.leds = p.mats.filter((m) => m.userData.led);

  const inTree = (id, rootId) => id === rootId || parts.get(id).anc.includes(rootId);
  const centre = (id, out = new V3()) => {
    const p = parts.get(id);
    if (!p) return out.set(0, 0, 0);
    p.obj.updateWorldMatrix(true, false);
    // a part with no geometry of its own (the server, a GPU) is centred on its children
    if (!p.size) {
      const kids = [...parts.values()].filter((q) => q.n.parent === id && q.size);
      if (kids.length) {
        out.set(0, 0, 0);
        const v = new V3();
        for (const k of kids) out.add(centre(k.n.id, v));
        return out.multiplyScalar(1 / kids.length);
      }
    }
    return out.copy(p.centre).applyMatrix4(p.obj.matrixWorld);
  };

  /**
   * X teardown level, t seconds. ops: select (node id), hover, isolate (bool), risk (compiled, risk.js), riskView
   * (bool: everything without risk fades back), spin (fan turns, radians).
   */
  const update = (X, t, ops = {}) => {
    // risk: each flagged part, or the closed container that still hides it, is painted
    const paint = new Map();
    if (ops.risk)
      for (const [id, e] of ops.risk.byNode) {
        const rep = resolve(id, X);
        if (rep && (!paint.has(rep) || paint.get(rep) < e.level)) paint.set(rep, e.level);
      }
    const riskOf = (p) => {
      let best = paint.get(p.n.id) || 0;
      for (const a of p.anc) best = Math.max(best, paint.get(a) || 0);
      return best;
    };
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
    const sel = ops.select && parts.has(ops.select) ? ops.select : null;
    for (const p of parts.values()) {
      const q = pose(p.n, X);
      p.obj.position.set(q.x, q.y, q.z);
      p.obj.rotation.y = q.ry;
      if (p.n.kind === 'fan-rotor') p.obj.rotation.z = (ops.spin || 0) * (p.n.parent.endsWith('1') || p.n.parent.endsWith('3') ? 1.07 : 1);
      p.op = q.op * (p.n.parent ? parts.get(p.n.parent).op : 1);
    }
    for (const p of parts.values()) {
      let op = p.op;
      const rk = riskOf(p);
      const focus = (sel && ops.isolate) || ops.riskView;
      if (focus) {
        const keep = (sel && ops.isolate && (inTree(p.n.id, sel) || parts.get(sel).anc.includes(p.n.id))) || (ops.riskView && rk > 0);
        if (!keep) op *= 0.05;
      }
      const isSel = sel && inTree(p.n.id, sel);
      const isHov = ops.hover && inTree(p.n.id, ops.hover);
      p.obj.visible = op > 0.01;
      for (const m of p.mats) {
        const d = m.userData;
        m.opacity = op;
        const tr = d.decal || op < 0.999;
        if (m.transparent !== tr) {
          m.transparent = tr;
          m.needsUpdate = true;
        }
        m.depthWrite = op > 0.5;
        m.color.copy(d.color);
        m.emissive.copy(d.emissive);
        m.emissiveIntensity = d.ei;
        if (d.led) m.emissiveIntensity = d.ei * (Math.sin(t * 9 + p.n.id.length * 1.7 + (p.n.pos[0] || 0)) > -0.3 ? 1 : 0.15);
        if (rk > 0) {
          m.color.lerp(RED, 0.35 + 0.4 * rk);
          m.emissive.copy(RED);
          m.emissiveIntensity = (0.18 + 0.22 * pulse) * rk;
        } else if (isSel || isHov) {
          m.emissive.set('#ffffff');
          m.emissiveIntensity = isSel ? 0.07 : 0.035;
        }
      }
      p.risk = rk;
    }
    root.updateMatrixWorld(true);
  };

  return {root, parts, pickables, update, centre, inTree};
}
