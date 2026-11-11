// The Lenovo AI rack as a page you drive: the film's rack and overlay in real time. Step or scrub the teardown from
// the closed cabinet to every component, click any part (or its bill-of-materials row) to inspect it, orbit and zoom,
// isolate the selection, switch to the risk view. Risk signals from an external tool arrive through risk.js and turn
// the flagged parts red. Left alone it plays the film as an auto tour; any input hands control over, 25 s of quiet
// hands it back.
import {warmComposer} from '../kit/warm.js';
import {CAMS, createConsole, OVERLAYS} from './console.js';
import {DEMO_RISK, DURATION, filmState, focusView, makeConsoleFrame, makeCursor, PRESET, viewForX} from './film.js';
import {BOM, info, LMAX, NODES, resolve, STAGES} from './model.js';
import {currentBom} from './bom.js';
import {compileRisk, createRiskStore, levelName, riskAt, riskWithin} from './risk.js';
import {createRackStage} from './stage.js';
import {createDashboard} from './dashboard.js';
import {createRowState} from './row-state.js';

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
.row-toggle{position:fixed;z-index:90;left:50%;top:72px;transform:translateX(-50%);padding:10px 16px;border:1px solid #999;background:#fff;border-radius:4px;cursor:pointer;font:600 13px Inter,sans-serif}
.row-panel{position:fixed;z-index:90;left:50%;bottom:18px;transform:translateX(-50%);width:min(900px,calc(100vw - 24px));padding:12px;box-sizing:border-box;background:#fffffff2;border:1px solid #bbb;border-radius:6px;font:14px Inter,sans-serif}
.row-panel[hidden]{display:none}
.row-panel p{margin:0 0 8px}.row-list{display:flex;gap:8px;overflow-x:auto}.row-list button{flex:1;min-width:145px;padding:12px 8px;border:1px solid #999;background:#fff;border-radius:4px;cursor:pointer;font:inherit}.row-list button[aria-current=true]{border:2px solid #222}
.row-error{color:#a11612}
.mobile-controls{display:none}
@media(max-width:820px){
 .row-toggle{left:12px;top:10px;transform:none;padding:10px}
 .bom-dashboard{top:10px;right:10px;width:min(390px,calc(100vw - 20px))}
 .bom-dashboard:not([open]){width:auto}
 .mobile-controls{display:block;position:fixed;z-index:80;bottom:0;left:0;right:0;background:#f8f8f9f5;border-top:1px solid #bbb;padding:10px 12px calc(10px + env(safe-area-inset-bottom));font:14px Inter,sans-serif}
 .mobile-controls[hidden]{display:none}.mobile-controls label{display:block;font-weight:600}.mobile-controls input,.mobile-controls select{width:100%;margin:5px 0;box-sizing:border-box;font:inherit}
 .mobile-controls .mobile-actions{display:flex;gap:6px}.mobile-controls button{flex:1;min-height:44px;background:white;border:1px solid #aaa;border-radius:4px;font:600 13px Inter,sans-serif}.mobile-controls select{min-height:42px}
 .mobile-controls details{margin-top:5px}.mobile-controls details div{max-height:18vh;overflow:auto;white-space:pre-wrap;font-size:13px}
 .row-panel{bottom:8px}.row-panel p{font-size:13px}
}
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
    const mobile = innerWidth <= 820;
    const visibleHeight = mobile ? Math.max(180, h - 220) : h;
    scale = mobile ? Math.max(innerWidth / W, visibleHeight / H) : Math.min(innerWidth / W, h / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${top + (mobile ? 55 : 0) + (visibleHeight - H * scale) / 2}px) scale(${scale})`;
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
  const rowState = createRowState(currentBom());
  let rowOpen = false;
  const rowToggle = document.createElement('button');
  rowToggle.type = 'button';
  rowToggle.className = 'row-toggle';
  rowToggle.textContent = 'View rack row';
  rowToggle.setAttribute('aria-expanded', 'false');
  document.body.appendChild(rowToggle);
  const rowPanel = document.createElement('section');
  rowPanel.className = 'row-panel';
  rowPanel.hidden = true;
  rowPanel.setAttribute('aria-label', 'Data center rack row');
  const rowIntro = document.createElement('p');
  rowIntro.textContent = 'Select a cabinet to focus and take apart. Each rack retains its own tab-local BOM.';
  rowPanel.appendChild(rowIntro);
  const rowList = document.createElement('div');
  rowList.className = 'row-list';
  rowPanel.appendChild(rowList);
  const rowError = document.createElement('p');
  rowError.className = 'row-error';
  rowError.setAttribute('role', 'status');
  rowError.textContent = rowState.loadError;
  rowPanel.appendChild(rowError);
  document.body.appendChild(rowPanel);
  const mobile = document.createElement('section');
  mobile.className = 'mobile-controls';
  mobile.setAttribute('aria-label', 'Mobile teardown controls');
  mobile.innerHTML = `<label>Teardown stage <span data-stage></span><input type="range" min="0" max="6" step="1" value="0" aria-label="Teardown stage"></label>
    <div class="mobile-actions"><button type="button" data-prev>Previous</button><button type="button" data-next>Next</button><button type="button" data-fans>Fans on</button><button type="button" data-risk>Risks on</button></div>
    <label>Inspect a component<select aria-label="Inspect a component"><option value="">Choose a component</option></select></label>
    <details><summary>Component details</summary><div data-info>Select a component to inspect.</div></details>`;
  document.body.appendChild(mobile);
  const mobileStage = mobile.querySelector('input');
  const mobileName = mobile.querySelector('[data-stage]');
  const mobileParts = mobile.querySelector('select');
  const mobileFans = mobile.querySelector('[data-fans]');
  const mobileRisk = mobile.querySelector('[data-risk]');
  const mobileInfo = mobile.querySelector('[data-info]');
  for (const group of BOM) {
    const option = document.createElement('option');
    option.value = group.ids[0];
    option.textContent = `${group.qty} × ${group.name}`;
    mobileParts.appendChild(option);
  }
  const closeRow = () => {
    rowOpen = false;
    st.closeRow();
    rowPanel.hidden = true;
    mobile.hidden = false;
    rowToggle.textContent = 'View rack row';
    rowToggle.setAttribute('aria-expanded', 'false');
  };
  const selectRack = (index) => {
    if (index === rowState.active) {
      closeRow();
      return;
    }
    if (dashboard.hasUnsavedChanges && !confirm('Discard unapplied dashboard changes and switch racks?')) return;
    try {
      rowState.switchTo(index, currentBom());
      location.reload();
    } catch (error) {
      rowError.textContent = `Unable to switch racks: ${error.message}`;
    }
  };
  rowState.racks.forEach((bom, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${index + 1}. ${bom.title.name}`;
    button.setAttribute('aria-current', String(index === rowState.active));
    button.addEventListener('click', () => selectRack(index));
    rowList.appendChild(button);
  });
  rowToggle.addEventListener('click', () => {
    takeOver();
    if (rowOpen) return closeRow();
    rowOpen = true;
    st.setRow(rowState.racks);
    rowPanel.hidden = false;
    mobile.hidden = true;
    rowToggle.textContent = 'Back to rack';
    rowToggle.setAttribute('aria-expanded', 'true');
  });
  const stageStep = (value) => {
    takeOver();
    playing = false;
    Xt = clamp(value, 0, LMAX);
  };
  mobileStage.addEventListener('input', () => stageStep(Number(mobileStage.value)));
  mobile.querySelector('[data-prev]').addEventListener('click', () => stageStep(Math.ceil(Xt) - 1));
  mobile.querySelector('[data-next]').addEventListener('click', () => stageStep(Math.floor(Xt) + 1));
  mobileFans.addEventListener('click', () => {
    takeOver();
    ov.fans = ov.fans ? 0 : 1;
    mobileFans.textContent = ov.fans ? 'Fans on' : 'Fans off';
  });
  mobileRisk.addEventListener('click', () => {
    dashboard.setRiskVisibility(!risksVisible);
    mobileRisk.textContent = risksVisible ? 'Risks on' : 'Risks off';
  });
  mobileParts.addEventListener('change', () => {
    takeOver();
    if (mobileParts.value) pickNode(mobileParts.value);
    else setSelect(null);
  });
  for (const element of [mobile, rowPanel, rowToggle]) {
    element.addEventListener('pointerdown', (event) => event.stopPropagation());
    element.addEventListener('keydown', (event) => event.stopPropagation());
  }
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
      if (rowOpen) {
        const index = st.pickRowAt(x, y);
        if (index !== null) selectRack(index);
        drag = null;
        canvas.classList.remove('drag');
        return;
      }
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
      if (T - lastInput > IDLE && !dashboard.isOpen && !rowOpen) startTour();
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

    ui.root.style.display = hidden || rowOpen || innerWidth <= 820 ? 'none' : '';
    mobileStage.value = String(Math.round(X));
    mobileName.textContent = STAGES[Math.round(X)].name;
    mobileFans.textContent = ov.fans ? 'Fans on' : 'Fans off';
    mobileRisk.textContent = risksVisible ? 'Risks on' : 'Risks off';
    const inspection = select && info(select);
    const selectedRisk = inspection && (riskAt(visibleRisk, select) || riskWithin(visibleRisk, select));
    const details = inspection ? [inspection.name, inspection.sub, ...inspection.spec.map(([k, v]) => `${k}: ${v}`),
      ...(selectedRisk ? [`Risk: ${levelName(selectedRisk.level)}`, ...selectedRisk.reasons] : [])].join('\n') : 'Select a component to inspect.';
    if (mobileInfo.textContent !== details) mobileInfo.textContent = details;
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
