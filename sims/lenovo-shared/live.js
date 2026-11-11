// The Lenovo AI rack as a page you drive: the film's rack and overlay in real time. Step or scrub the teardown from
// the closed cabinet to every component, click any part (or its bill-of-materials row) to inspect it, orbit and zoom,
// isolate the selection, switch to the risk view. Risk signals from an external tool arrive through risk.js and turn
// the flagged parts red. Left alone it plays the film as an auto tour; any input hands control over, 25 s of quiet
// hands it back.
import {warmComposer} from '../kit/warm.js';
import {CAMS, createConsole, OVERLAYS} from './console.js';
import {DEMO_RISK, DURATION, filmState, focusView, makeConsoleFrame, makeCursor, PRESET, viewForX} from './film.js';
import {BOM, LMAX, NODES, resolve} from './model.js';
import {compileRisk, createRiskStore} from './risk.js';
import {createRackStage} from './stage.js';
import {createDashboard} from './dashboard.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

const CSS = (top) => `
html,body{background:#ecedef;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
#gl.over{cursor:pointer}
.tb{pointer-events:auto;cursor:pointer}
.tb:hover{filter:brightness(.95)}
.hit{position:absolute;pointer-events:auto;cursor:pointer}
.hit.ew{cursor:ew-resize}
.hit.row:hover{background:rgba(22,24,27,.05)}
.tourchip{position:absolute;left:800px;top:36px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:21px;padding:0 11px;border:1px solid #e1e3e6;background:rgba(255,255,255,.95);color:#16181b;font:600 8.8px Inter,sans-serif;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#16181b}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#8b8f95;text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;

export function runLive() {
  const top = Number(document.body.dataset.top || 0);
  const style = document.createElement('style');
  style.textContent = CSS(top);
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createRackStage({canvas});
  const ui = createConsole(app);
  const tourCursor = makeCursor(ui);
  const frameConsole = makeConsoleFrame(ui, st);
  const q = new URLSearchParams(location.search);
  let risk = null;
  const store = createRiskStore((c) => (risk = c), {demo: q.get('demo') === '0' ? [] : DEMO_RISK});
  const noRisk = compileRisk([]);
  let risksVisible = true;

  // ------------------------------------------------------------ quality tiers
  const TIERS = [
    {samples: 8, ao: true, shadow: 4096, pr: 2},
    {samples: 4, ao: false, shadow: 2048, pr: 1.5},
    {samples: 2, ao: false, shadow: 1024, pr: 1},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let scale = 1;
  const fit = () => {
    const h = innerHeight - top;
    scale = Math.min(innerWidth / W, h / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${top + (h - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...qq} = TIERS[tier];
    st.setQuality(qq);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Turn your phone sideways for the full console';
  document.body.appendChild(note);

  // ------------------------------------------------------------ state
  let T = 0;
  let X = 0;
  let Xt = 0;
  let playing = false;
  let dir = 1;
  let dwell = 0;
  let speedI = 2;
  let select = null;
  let selAt = -9;
  let lastSel = null;
  let hover = null;
  let camKey = 'auto';
  let hidden = false;
  const ov = {labels: 1, isolate: 0, risk: 0, fans: 1};
  const off = {az: 0, el: 0, k: 1};
  const cam = {...viewForX(0)};
  let ring = {t: -9, x: 0, y: 0};
  const pulse = (x, y) => (ring = {t: T, x, y});
  const pulseBtn = (k) => pulse(...ui.spots[k]);
  let spin = 0;

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, loop: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.loop = 0;
    playing = false;
    camKey = 'auto';
    Object.assign(ov, {labels: 1, isolate: 0, risk: 0, fans: 1});
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const s = filmState((T - AP.t0) % DURATION, st, risk);
    X = Xt = Math.round(s.X * 100) / 100;
    setSelect(s.select);
    ov.risk = s.riskView ? 1 : 0;
    ov.isolate = s.select ? 1 : 0;
  };
  const dashboard = createDashboard({
    onInteract: takeOver,
    onRiskVisibility: (visible) => {
      takeOver();
      risksVisible = visible;
    },
  });
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => {
    if (e.target !== tourChip) takeOver();
  });

  // ------------------------------------------------------------ selection
  function setSelect(id) {
    if (id === select) return;
    if (select) lastSel = select;
    select = id;
    selAt = T;
  }
  // a BOM row or a part asks for a teardown level deep enough to see it on its own
  const showLevel = (id) => {
    const n = NODES.get(id);
    return n && n.sep > 0 && n.sep < LMAX + 1 ? clamp(Math.ceil(n.sep + 0.5), 0, LMAX) : 0;
  };
  const pickNode = (id) => {
    const need = showLevel(id);
    if (need > Xt) {
      Xt = need;
      playing = false;
    }
    setSelect(id);
  };

  // ------------------------------------------------------------ controls
  for (const k of CAMS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      camKey = k;
      Object.assign(off, {az: 0, el: 0});
    });
  for (const k of OVERLAYS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      ov[k] = ov[k] ? 0 : 1;
    });
  ui.btn.play.addEventListener('click', () => {
    takeOver();
    pulseBtn('play');
    playing = !playing;
    if (playing && Xt >= LMAX) dir = -1;
    if (playing && Xt <= 0) dir = 1;
    dwell = 0.6;
  });
  for (const [k, d] of [['back', -1], ['fwd', 1]])
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      playing = false;
      Xt = clamp(d > 0 ? Math.floor(Xt + 1e-3) + 1 : Math.ceil(Xt - 1e-3) - 1, 0, LMAX);
    });
  // the stage stepper
  for (let i = 0; i <= LMAX; i++) {
    const [x, y] = ui.stageSpot(i);
    const d = document.createElement('div');
    d.className = 'hit';
    Object.assign(d.style, {left: `${x - 40}px`, top: `${y - 16}px`, width: '80px', height: '46px'});
    d.addEventListener('click', () => {
      takeOver();
      pulse(x, y);
      playing = false;
      Xt = i;
    });
    ui.root.appendChild(d);
  }
  // the bill of materials: a row selects the first of its parts
  BOM.forEach((g, i) => {
    const d = document.createElement('div');
    d.className = 'hit row';
    Object.assign(d.style, {left: '1325px', top: `${ui.bomHit.top + i * ui.bomHit.h - 1}px`, width: '232px', height: `${ui.bomHit.h}px`});
    d.addEventListener('click', () => {
      takeOver();
      pulse(...ui.bomSpot(i));
      const cur = g.ids.indexOf(select);
      pickNode(g.ids[(cur + 1) % g.ids.length]);
    });
    ui.root.appendChild(d);
  });
  // sliders: the teardown level and the speed
  const slider = (knobAt, apply) => {
    const [x0, y] = knobAt(0);
    const [x1] = knobAt(1);
    const d = document.createElement('div');
    d.className = 'hit ew';
    Object.assign(d.style, {left: `${x0 - 8}px`, top: `${y - 11}px`, width: `${x1 - x0 + 16}px`, height: '22px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      apply(clamp((x - x0) / (x1 - x0), 0, 1));
      lastInput = T;
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      d.setPointerCapture(e.pointerId);
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  };
  slider(
    (v) => ui.levelKnob(v * LMAX),
    (k) => {
      playing = false;
      X = Xt = k * LMAX;
    },
  );
  slider(ui.speedKnob, (k) => (speedI = Math.round(k * (SPEEDS.length - 1))));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const v = {1: 'auto', 2: 'front', 3: 'side', 4: 'top', 5: 'rear'}[key];
    takeOver();
    if (v) camKey = v;
    else if (key === ' ') playing = !playing;
    else if (key === 'h') hidden = !hidden;
    else if (key === 'i') ov.isolate = ov.isolate ? 0 : 1;
    else if (key === 'r') ov.risk = ov.risk ? 0 : 1;
    else if (key === 'escape') setSelect(null);
    else if (key === 'arrowleft' || key === 'arrowright') {
      playing = false;
      Xt = clamp(key === 'arrowright' ? Math.floor(Xt + 1e-3) + 1 : Math.ceil(Xt - 1e-3) - 1, 0, LMAX);
    } else return;
    e.preventDefault();
  });
  // orbit, hover and pick on the canvas: a press that barely moves is a click
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY, moved: 0};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      const [x, y] = toStage(e.clientX, e.clientY);
      const id = st.pickAt(x, y);
      hover = id ? resolve(id, X) : null;
      canvas.classList.toggle('over', !!hover);
      return;
    }
    const dx = (e.clientX - drag.x) / scale;
    const dy = (e.clientY - drag.y) / scale;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    off.az -= dx * 0.3;
    off.el = clamp(off.el + dy * 0.2, -20, 60);
    drag.x = e.clientX;
    drag.y = e.clientY;
    lastInput = T;
  });
  const endDrag = (e) => {
    if (drag && drag.moved < 5 && e.type === 'pointerup') {
      const [x, y] = toStage(e.clientX, e.clientY);
      const id = st.pickAt(x, y);
      if (id) {
        const r = resolve(id, X);
        // clicking the selection again goes one level deeper into it
        if (r === select) {
          const kid = [...NODES.values()].find((n) => n.parent === select && n.id === resolve(id, LMAX));
          pickNode(kid ? kid.id : r);
        } else setSelect(r);
      } else setSelect(null);
    }
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.3, 2.4);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.022 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    let tgt;
    let cursor;
    let riskView;
    let isolate;
    if (AP.on) {
      const c = T - AP.t0;
      const loop = Math.floor(c / DURATION);
      const cyc = c - loop * DURATION;
      if (loop > AP.loop) AP.loop = loop;
      const s = filmState(cyc, st, risk);
      X = Xt = s.X;
      select = s.select;
      riskView = s.riskView;
      isolate = !!s.select;
      ov.risk = riskView ? 1 : 0;
      ov.isolate = isolate ? 1 : 0;
      tgt = s.view;
      cursor = tourCursor(cyc);
      if (AP.loop > 0 && cyc < 0.8) {
        const end = tourCursor(DURATION - 0.01);
        const k = ss(0, 0.8, cyc);
        cursor = {...cursor, x: end.x + (cursor.x - end.x) * k, y: end.y + (cursor.y - end.y) * k};
      }
    } else {
      if (T - lastInput > IDLE && !dashboard.isOpen) startTour();
      // play: one stage at a time, a short dwell at each, back to the start from the end
      if (playing) {
        if (Math.abs(X - Xt) < 1e-3) {
          dwell -= dt;
          if (dwell <= 0) {
            if (Xt + dir > LMAX || Xt + dir < 0) {
              dir = -dir;
              playing = false;
            } else {
              Xt = Math.round(Xt) + dir;
              dwell = 1.4;
            }
          }
        }
      }
      const rate = 0.55 * SPEEDS[speedI];
      X += clamp(Xt - X, -rate * dt, rate * dt);
      // a selection that the level no longer separates rolls up to its container
      if (select && resolve(select, X) !== select) setSelect(resolve(select, X));
      riskView = !!ov.risk;
      isolate = !!ov.isolate && !!select;
      tgt = viewForX(X, T);
      if (camKey !== 'auto') Object.assign(tgt, PRESET[camKey]);
      const fk = ss(selAt, selAt + 1.2, T);
      if (select) {
        tgt = focusView(tgt, st.rack.centre(select), st.rack.parts.get(select).size, fk);
      } else if (lastSel && NODES.has(lastSel)) tgt = focusView(tgt, st.rack.centre(lastSel), st.rack.parts.get(lastSel).size, 1 - fk);
      tgt.az += off.az;
      tgt.el = clamp(tgt.el + off.el, -10, 85);
      tgt.d *= off.k;
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    if (ov.fans) spin += dt * 9;

    const k = 1 - Math.exp(-dt / (AP.on ? 0.12 : 0.3));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    const visibleRisk = risksVisible ? risk : noRisk;
    riskView = riskView && risksVisible;
    st.frame(X, T, {...cam, az: cam.az * D2R, el: cam.el * D2R}, {select, hover: AP.on ? null : hover, isolate, risk: visibleRisk, riskView, spin});

    ui.root.style.display = hidden ? 'none' : '';
    frameConsole(T, {
      X,
      select,
      risk: visibleRisk,
      riskView,
      cursor,
      live: {playing, dir, speedK: speedI / (SPEEDS.length - 1), speedText: `${SPEEDS[speedI]}×`, cam: camKey, overlays: {...ov}},
    });
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : '▶ RESUME TOUR';
    }
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {
    st,
    cam,
    startTour,
    takeOver,
    store,
    select: (id) => {
      takeOver();
      pickNode(id);
    },
    level: (x) => {
      takeOver();
      Xt = clamp(x, 0, LMAX);
    },
    get X() {
      return X;
    },
    get tier() {
      return tier;
    },
    get T() {
      return T;
    },
  };
  // the risk API sits on window.TEARDOWN (risk.js); select and level ride along for an external tool
  Object.assign(window.TEARDOWN, {select: window.LIVE.select, level: window.LIVE.level});
}
