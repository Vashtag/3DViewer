// Eye Movements as a flat diagram: both eyes face-on as the examiner sees
// them (the patient's right eye on the left), each with its six extraocular
// muscles, and between them a brainstem panel with the III, IV and VI nuclei,
// the PPRF, the MLF and each frontal eye field (FEF). Pick a gaze: the eyes
// move, the muscles doing the work light up, and the signal lights up along
// its path (FEF -> opposite PPRF -> VI nucleus -> LR, and across the MLF to
// the opposite III nucleus -> MR). Click a numbered spot to place a lesion;
// a muscle that cannot do what is asked is outlined in red.
//
// Eye positions come from eye-movements.js (lesionState / eyePose), so the
// rules are the same ones the 3D version used.

import { OCULAR_BY_ID, lesionState, eyePose, lidOpening, pupilSize } from './eye-movements.js';

const NS = 'http://www.w3.org/2000/svg';
const SIGN = { L: 1, R: -1 };       // +h = toward the patient's left
const OTHER = { L: 'R', R: 'L' };
const W = { L: 'left', R: 'right' };
const lerp = (a, b, t) => a + (b - a) * t;
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.appendChild(e);
  return e;
};

// Layout (viewBox 1000 x 600). Examiner's view: the patient's right side is
// on the screen's left, so a right-side x is mirrored for the left side.
const X = (side, x) => (side === 'R' ? x : 1000 - x);
const EYE = { R: { cx: 215, cy: 300 }, L: { cx: 785, cy: 300 } };
const ER = 108;
const NUC = side => ({
  III: [X(side, 472), 182], IV: [X(side, 476), 234], PPRF: [X(side, 466), 372], VI: [X(side, 478), 404],
});

// Lesions shown on the diagram, numbered in reading order.
const SITES = [
  { id: 'cn3', num: 1 }, { id: 'cn4', num: 2 }, { id: 'cn6', num: 3 },
  { id: 'mlf', num: 4 }, { id: 'abd-nuc', num: 5 }, { id: 'one-half', num: 6 },
];

// Smooth path through points (Catmull-Rom as cubic Béziers).
function pathD(p) {
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6},${c[1] - (e[1] - b[1]) / 6} ${c[0]},${c[1]}`;
  }
  return d;
}

// Points around an eye: angle in degrees measured from "medial" (toward the
// brainstem), positive downward; r as a fraction of the eye radius.
function polar(side, ang, r) {
  const { cx, cy } = EYE[side];
  const med = side === 'R' ? 1 : -1;
  const a = ang * Math.PI / 180;
  return [cx + med * Math.cos(a) * r * ER, cy + Math.sin(a) * r * ER];
}

// Wires: id, side, points. Keys say what each carries.
function wires(side) {
  const n = NUC(side), o = NUC(OTHER[side]);
  const e = EYE[side];
  return [
    // CN III: nucleus to the same eye, branching to MR, SR, IR, IO.
    { key: 'III', side, pts: [n.III, [X(side, 430), 186], [X(side, 372), 236], polar(side, -18, 1.36)] },
    // CN IV to this eye starts at the opposite nucleus, leaves the back of the
    // midbrain and crosses over the top.
    { key: 'IV', side, pts: [o.IV, [X(OTHER[side], 488), 160], [500, 128], [X(side, 452), 118], [X(side, 380), 128], polar(side, -48, 1.42)] },
    // CN VI: down and round under the eye to LR on the outer side.
    { key: 'VI', side, pts: [n.VI, [X(side, 474), 470], [X(side, 430), 556], [X(side, 120), 564], [X(side, 52), 470], polar(side, 180, 1.42)] },
    // MLF ending at this side's III nucleus starts at the opposite VI nucleus.
    { key: 'MLF', side, pts: [o.VI, [X(OTHER[side], 506), 386], [X(side, 468), 300], [X(side, 458), 232], n.III] },
    // PPRF (this side) to the VI nucleus.
    { key: 'PPRF', side, pts: [n.PPRF, n.VI] },
    // The FEF on this side drives the opposite PPRF (gaze away from this side).
    { key: 'FEF', side, pts: [[X(side, 392), 74], [X(side, 444), 112], [500, 250], [X(OTHER[side], 526), 336], o.PPRF] },
  ];
}

// Muscles in the front view. Each: belly (outside the globe, going back),
// tendon (on the globe). Angles from medial (0) clockwise-down.
const RECTI = { MR: 0, IR: 90, LR: 180, SR: -90 };

function drawMuscles(g, side, refs) {
  // Rectus bellies: wedges behind the rim.
  for (const [m, ang] of Object.entries(RECTI)) {
    const pts = [];
    for (let a = -17; a <= 17; a += 4) pts.push(polar(side, ang + a, 1.32));
    for (let a = 21; a >= -21; a -= 4) pts.push(polar(side, ang + a, 0.9));
    const belly = el('path', { d: 'M' + pts.map(p => p.join(',')).join(' L') + ' Z', class: 'em-belly' }, g);
    refs[`${side}${m}`] = [belly];
  }
  // IO: a strap from the inner floor of the orbit sweeping under the eye.
  const io = el('path', { d: pathD([polar(side, 122, 1.18), polar(side, 108, 1.28), polar(side, 70, 1.3), polar(side, 40, 1.12)]), class: 'em-strap' }, g);
  // SO: belly from the back up to the trochlea (pulley), tendon over the top.
  const troch = polar(side, -46, 1.2);
  const soBelly = el('path', { d: pathD([polar(side, -18, 1.55), polar(side, -30, 1.42), troch]), class: 'em-strap' }, g);
  refs[`${side}IO`] = [io];
  refs[`${side}SO`] = [soBelly];
  refs[`${side}troch`] = troch;
}

function drawTendons(g, side, refs) {
  for (const [m, ang] of Object.entries(RECTI)) {
    const pts = [];
    for (let a = -21; a <= 21; a += 4) pts.push(polar(side, ang + a, 0.9));
    for (let a = 19; a >= -19; a -= 4) pts.push(polar(side, ang + a, 0.74));
    el('path', { d: 'M' + pts.map(p => p.join(',')).join(' L') + ' Z', class: 'em-tendon' }, g);
    const lab = polar(side, { MR: 0, IR: 90, LR: 168, SR: -90 }[m], m === 'IR' ? 1.5 : 1.52);
    el('text', { x: lab[0], y: lab[1] + (m === 'LR' ? -14 : 0), class: 'em-mlabel' }, g).textContent = m;
  }
  const troch = refs[`${side}troch`];
  const soTendon = el('path', { d: pathD([troch, polar(side, -70, 0.98), polar(side, -112, 0.8)]), class: 'em-sotendon' }, g);
  refs[`${side}SO`].push(soTendon);
  el('ellipse', { cx: troch[0], cy: troch[1], rx: 11, ry: 8, class: 'em-troch' }, g);
  const so = polar(side, -44, 1.62); el('text', { x: so[0], y: so[1], class: 'em-mlabel' }, g).textContent = 'SO';
  const io = polar(side, 128, 1.42); el('text', { x: io[0], y: io[1], class: 'em-mlabel' }, g).textContent = 'IO';
}

export function mountEyeMovements(host, { onChange } = {}) {
  host.innerHTML = `
    <div class="em-figure"></div>
    <div class="em-bottom">
      <div class="em-caption" aria-live="polite"><b></b><span></span></div>
      <div class="em-dock" role="group" aria-label="Gaze">
        <div class="em-pad" role="group" aria-label="Where the patient looks">
          ${[[-1, 1], [0, 1], [1, 1], [-1, 0], [0, 0], [1, 0], [-1, -1], [0, -1], [1, -1]].map(([h, v]) => {
            const where = h === 0 && v === 0 ? 'Straight ahead' : `${v > 0 ? 'Up' : v < 0 ? 'Down' : ''}${v && h ? ' and ' : ''}${h ? `to the patient's ${h > 0 ? 'left' : 'right'}` : ''}`;
            // Examiner's view: the patient's left is on the screen's right.
            const arrow = { '0,0': '•', '1,0': '→', '-1,0': '←', '0,1': '↑', '0,-1': '↓', '1,1': '↗', '-1,1': '↖', '1,-1': '↘', '-1,-1': '↙' }[`${h},${v}`];
            return `<button type="button" data-h="${h}" data-v="${v}" title="${where}" aria-label="Look: ${where}">${arrow}</button>`;
          }).join('')}
        </div>
        <div class="em-actions">
          <button type="button" class="em-near" aria-pressed="false" title="Look at something close: both eyes turn in">Near</button>
          <button type="button" class="em-h" aria-pressed="false" title="Follow the H pattern used at the bedside">H test</button>
        </div>
      </div>
    </div>`;
  const svg = el('svg', { viewBox: '0 0 1000 600', role: 'group', 'aria-label': 'Both eyes with their muscles and the brainstem gaze pathways. Numbered spots are lesion sites.' }, host.querySelector('.em-figure'));
  const caption = host.querySelector('.em-caption');

  const defs = el('defs', {}, svg);
  defs.innerHTML = `
    <radialGradient id="em-iris"><stop offset="0" stop-color="#2b3a4a"/><stop offset="0.45" stop-color="#5d7690"/><stop offset="1" stop-color="#3c4f63"/></radialGradient>
    <radialGradient id="em-globe" cx="0.42" cy="0.38" r="0.7"><stop offset="0" stop-color="#fbf4ee"/><stop offset="0.75" stop-color="#ecd9d2"/><stop offset="1" stop-color="#d9b8b0"/></radialGradient>
    <filter id="em-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

  // Brainstem panel and labels.
  const stem = el('g', { class: 'em-stem' }, svg);
  el('path', { d: 'M430,140 L570,140 L566,224 Q552,262 556,300 L576,330 Q584,392 568,452 L548,486 L540,560 L460,560 L452,486 L432,452 Q416,392 424,330 L444,300 Q448,262 434,224 Z', class: 'em-stem-shape' }, stem);
  el('text', { x: 500, y: 546, class: 'em-region' }, stem).textContent = 'Brainstem';
  for (const side of ['L', 'R']) {
    const fef = [X(side, 392), 62];
    el('rect', { x: fef[0] - 28, y: fef[1] - 15, width: 56, height: 26, rx: 13, class: 'em-fef', 'data-fef': side }, svg);
    el('text', { x: fef[0], y: fef[1] - 1, class: 'em-fef-t' }, svg).textContent = 'FEF';
    el('text', { x: fef[0], y: fef[1] + 24, class: 'em-side' }, svg).textContent = side === 'R' ? 'right' : 'left';
  }

  // Wires (drawn under the nuclei).
  const wireEls = {};
  const wireG = el('g', {}, svg);
  for (const side of ['R', 'L']) for (const w of wires(side)) {
    const p = el('path', { d: pathD(w.pts), class: `em-wire em-${w.key.toLowerCase()}` }, wireG);
    wireEls[`${w.key}${side}`] = { el: p, w };
  }
  // CN III branches inside the orbit.
  for (const side of ['R', 'L']) {
    const hub = polar(side, -18, 1.36);
    for (const [m, to] of [['MR', polar(side, 0, 1.18)], ['SR', polar(side, -82, 1.18)], ['IR', polar(side, 84, 1.18)], ['IO', polar(side, 114, 1.24)]]) {
      const p = el('path', { d: pathD([hub, [lerp(hub[0], to[0], 0.5) + (side === 'R' ? 18 : -18), lerp(hub[1], to[1], 0.5)], to]), class: 'em-wire em-iii em-branch' }, wireG);
      wireEls[`III${side}-${m}`] = { el: p };
    }
  }
  // Nuclei.
  const nucEls = {};
  for (const side of ['R', 'L']) {
    const n = NUC(side);
    for (const k of ['III', 'IV', 'VI', 'PPRF']) {
      const r = k === 'PPRF' ? 9 : 15;
      const c = el('circle', { cx: n[k][0], cy: n[k][1], r, class: `em-nuc${k === 'PPRF' ? ' pprf' : ''}` }, svg);
      if (k !== 'PPRF') el('text', { x: n[k][0], y: n[k][1], class: 'em-nuc-t' }, svg).textContent = k;
      nucEls[`${k}${side}`] = c;
    }
  }
  el('text', { x: 500, y: 378, class: 'em-region small' }, svg).textContent = 'PPRF';
  el('text', { x: 500, y: 322, class: 'em-region small' }, svg).textContent = 'MLF';

  // Eyes: muscles behind, globe, tendons, iris, lids.
  const refs = {}, eyeEls = {};
  for (const side of ['R', 'L']) {
    const g = el('g', {}, svg);
    drawMuscles(g, side, refs);
    const { cx, cy } = EYE[side];
    el('circle', { cx, cy, r: ER, fill: 'url(#em-globe)', class: 'em-globe' }, g);
    drawTendons(g, side, refs);
    const iris = el('g', {}, g);
    el('circle', { cx: 0, cy: 0, r: 40, fill: 'url(#em-iris)' }, iris);
    const pupil = el('circle', { cx: 0, cy: 0, r: 14, class: 'em-pupil' }, iris);
    el('circle', { cx: -12, cy: -13, r: 6, class: 'em-shine' }, iris);
    const clip = el('clipPath', { id: `em-clip-${side}` }, defs);
    el('circle', { cx, cy, r: ER + 1 }, clip);
    const lid = el('path', { class: 'em-lid', 'clip-path': `url(#em-clip-${side})` }, g);
    el('text', { x: cx, y: cy + ER + 96, class: 'em-eyename' }, svg).textContent = side === 'R' ? "Patient's right eye" : "Patient's left eye";
    eyeEls[side] = { iris, pupil, lid, pose: { h: 0, v: 0 }, lidOpen: 1, pupilD: 4 };
  }

  // Lesion spots.
  const spots = [];
  const spotG = el('g', {}, svg);
  const spotAt = (id, side) => {
    const n = NUC(side);
    const along = (key, t) => { const w = wireEls[`${key}${side}`].el; const L = w.getTotalLength(); const p = w.getPointAtLength(L * t); return [p.x, p.y]; };
    switch (id) {
      case 'cn3': return along('III', 0.55);
      case 'cn4': return along('IV', 0.78);
      case 'cn6': return along('VI', 0.62);
      case 'mlf': return along('MLF', 0.6);
      case 'abd-nuc': return [X(side, 432), 400];
      case 'one-half': return [X(side, 440), 436];
    }
  };
  for (const site of SITES) for (const side of ['R', 'L']) {
    const les = OCULAR_BY_ID[site.id];
    const [x, y] = spotAt(site.id, side);
    const g = el('g', { class: 'em-spot', tabindex: 0, role: 'button', 'aria-label': `${site.num}. ${les.name}, ${W[side]}` }, spotG);
    el('title', {}, g).textContent = `${site.num}. ${les.name} (${W[side]})`;
    el('circle', { cx: x, cy: y, r: 13, class: 'em-spot-bg' }, g);
    el('text', { x, y, class: 'em-spot-t' }, g).textContent = site.num;
    g.dataset.id = site.id; g.dataset.side = side;
    const pick = () => setLesion(current.id === site.id && current.side === side ? null : site.id, side);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    spots.push(g);
  }

  let current = { id: null, side: 'R' };
  let state = lesionState(null, 'R');
  let gaze = { h: 0, v: 0, near: false };
  let hTest = null, raf = 0, alive = true, last = performance.now();

  function setLesion(id, side) {
    current = { id: id || null, side };
    state = lesionState(current.id, side);
    spots.forEach(s => s.classList.toggle('on', s.dataset.id === current.id && s.dataset.side === side));
    const l = OCULAR_BY_ID[current.id];
    caption.querySelector('b').textContent = l ? l.defect(side) : 'Normal eye movements';
    caption.querySelector('span').textContent = l
      ? l.note(side)
      : 'Pick where the patient looks below. The muscles doing the work light up, and so does the signal from the frontal eye field (FEF) through the brainstem. Click a numbered spot to place a lesion.';
    onChange?.(l || null, side);
  }

  function setGaze(g) {
    gaze = { h: g.h ?? 0, v: g.v ?? 0, near: !!g.near };
    host.querySelectorAll('.em-pad button').forEach(b => b.setAttribute('aria-pressed', String(!gaze.near && +b.dataset.h === gaze.h && +b.dataset.v === gaze.v)));
    host.querySelector('.em-near').setAttribute('aria-pressed', String(gaze.near));
  }

  // H test: the bedside pattern, about 0.9 s per position.
  const H_SEQ = [[0, 0], [-1, 0], [-1, 1], [-1, -1], [-1, 0], [0, 0], [1, 0], [1, 1], [1, -1], [1, 0], [0, 0]];
  function setH(on) {
    hTest = on ? { t: 0 } : null;
    host.querySelector('.em-h').setAttribute('aria-pressed', String(on));
  }

  // Per frame: move the eyes, then light the muscles and the pathways.
  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (hTest) {
      hTest.t += dt;
      const i = Math.floor(hTest.t / 0.9);
      if (i >= H_SEQ.length) setH(false);
      else if (gaze.near || gaze.h !== H_SEQ[i][0] || gaze.v !== H_SEQ[i][1]) setGaze({ h: H_SEQ[i][0], v: H_SEQ[i][1] });
    }
    const k = 1 - Math.exp(-dt * 8);
    const drive = {}, weak = {};
    for (const side of ['L', 'R']) {
      const E = eyeEls[side];
      const p = eyePose(state, side, gaze);
      E.pose.h = lerp(E.pose.h, p.h, k);
      E.pose.v = lerp(E.pose.v, p.v, k);
      const { cx, cy } = EYE[side];
      // On screen the patient's left is to the right.
      E.iris.setAttribute('transform', `translate(${cx + E.pose.h * 52} ${cy - E.pose.v * 40})`);
      E.lidOpen = lerp(E.lidOpen, lidOpening(state, side), k);
      const want = pupilSize(state, side, null);
      E.pupilD = lerp(E.pupilD, want, k);
      E.pupil.setAttribute('r', (E.pupilD * 3).toFixed(1));
      // Upper lid: covers from the top down to its edge.
      const edge = cy - ER * 0.62 + (1 - E.lidOpen) * ER * 0.9 - E.pose.v * 14;
      E.lid.setAttribute('d', `M${cx - ER - 2},${cy - ER - 30} L${cx + ER + 2},${cy - ER - 30} L${cx + ER + 2},${edge - 30} Q${cx},${edge + 26} ${cx - ER - 2},${edge - 30} Z`);

      // What each muscle is doing (actual), and what was asked of it.
      const m = state.muscle[side];
      const ab = E.pose.h * SIGN[side], v = E.pose.v, t = (ab + 1) / 2;
      const s = SIGN[side];
      const wantAb = gaze.near ? -0.5 : gaze.h * s, wantV = gaze.near ? -0.15 : gaze.v, wt = (wantAb + 1) / 2;
      const act = {
        LR: Math.max(0, ab) * m.LR, MR: Math.max(0, -ab) * m.MR,
        SR: Math.max(0, v) * t * m.SR, IO: Math.max(0, v) * (1 - t) * m.IO,
        IR: Math.max(0, -v) * t * m.IR, SO: Math.max(0, -v) * (1 - t) * m.SO,
      };
      const asked = {
        LR: Math.max(0, wantAb), MR: Math.max(0, -wantAb),
        SR: Math.max(0, wantV) * wt, IO: Math.max(0, wantV) * (1 - wt),
        IR: Math.max(0, -wantV) * wt, SO: Math.max(0, -wantV) * (1 - wt),
      };
      for (const mm in act) {
        drive[`${side}${mm}`] = Math.min(1, act[mm] * 1.6);
        weak[`${side}${mm}`] = asked[mm] > 0.3 && act[mm] < asked[mm] * 0.35;
      }
    }
    // Muscles: brighter with effort; grey when paralysed; red outline when it
    // cannot do what was asked.
    for (const side of ['L', 'R']) for (const mm of ['MR', 'LR', 'SR', 'IR', 'SO', 'IO']) {
      const d = drive[`${side}${mm}`];
      const dead = state.muscle[side][mm] === 0;
      for (const e of refs[`${side}${mm}`]) {
        e.style.setProperty('--act', d.toFixed(3));
        e.classList.toggle('dead', dead);
        e.classList.toggle('weak', weak[`${side}${mm}`]);
      }
    }
    // Pathways.
    const lit = (key, v, cut) => {
      const w = wireEls[key]; if (!w) return;
      w.el.style.setProperty('--act', Math.max(0, Math.min(1, v)).toFixed(3));
      w.el.classList.toggle('cut', !!cut);
    };
    const hor = gaze.near ? 0 : gaze.h;
    for (const side of ['L', 'R']) {
      const toward = Math.max(0, hor * SIGN[side]);       // command to look toward this side
      const other = OTHER[side];
      const nerveOk = state.nerve[side];
      const iii = Math.max(drive[`${side}MR`], drive[`${side}SR`], drive[`${side}IR`], drive[`${side}IO`]);
      lit(`III${side}`, iii, nerveOk.III < 1 && current.id?.startsWith('cn3'));
      for (const mm of ['MR', 'SR', 'IR', 'IO']) lit(`III${side}-${mm}`, drive[`${side}${mm}`], nerveOk.III < 1 && current.id?.startsWith('cn3'));
      lit(`IV${side}`, drive[`${side}SO`], nerveOk.IV < 1);
      lit(`VI${side}`, drive[`${side}LR`], nerveOk.VI < 1);
      // MLF to this side's III: carries the adduction command from the other VI nucleus.
      lit(`MLF${side}`, Math.max(0, -hor * SIGN[side]) * state.abdNuc[other] * state.mlf[side], state.mlf[side] === 0);
      lit(`PPRF${side}`, toward * state.abdNuc[side], state.abdNuc[side] === 0);
      lit(`FEF${other}`, toward, false);
      nucEls[`VI${side}`].style.setProperty('--act', (toward * state.abdNuc[side]).toFixed(3));
      nucEls[`VI${side}`].classList.toggle('cut', state.abdNuc[side] === 0);
      nucEls[`PPRF${side}`].style.setProperty('--act', toward.toFixed(3));
      nucEls[`III${side}`].style.setProperty('--act', iii.toFixed(3));
      nucEls[`IV${other}`].style.setProperty('--act', drive[`${side}SO`].toFixed(3));
      svg.querySelector(`[data-fef="${other}"]`).style.setProperty('--act', toward.toFixed(3));
    }
    raf = requestAnimationFrame(frame);
  }

  host.querySelectorAll('.em-pad button').forEach(b => b.addEventListener('click', () => { setH(false); setGaze({ h: +b.dataset.h, v: +b.dataset.v }); }));
  host.querySelector('.em-near').addEventListener('click', () => { setH(false); setGaze(gaze.near ? { h: 0, v: 0 } : { near: true }); });
  host.querySelector('.em-h').addEventListener('click', () => setH(!hTest));

  setLesion(null, 'R');
  setGaze({ h: 0, v: 0 });
  raf = requestAnimationFrame(frame);
  return {
    setLesion, setGaze,
    destroy() { alive = false; cancelAnimationFrame(raf); host.innerHTML = ''; },
  };
}
