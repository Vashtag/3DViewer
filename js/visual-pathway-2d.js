// Visual pathway lesions as a flat, top-down diagram (like the textbook
// figure): eyes at the top, the patient's left on the screen's left. Both
// sides are drawn, so a lesion is picked by clicking its numbered spot on the
// side you want. Fibres past the cut turn grey.
//
// Drawn roughly to scale with faint context (orbits, lobes, midbrain,
// ventricles, pituitary, calcarine cortex). In front of each eye a wedge
// shows its visual field, ~95° temporal and ~60° nasal (left half blue,
// right half green; greyed when lost, striped when only the upper or lower
// quarter of that half is lost). Beside the diagram, a picture shows what
// each eye sees, with the lost part of the visual field blacked out. The
// picture is assets/visual-scene.jpg when that file exists (any
// landscape photo, looked at through its centre), otherwise a drawn street
// scene.
//
// Lesion definitions (which bundles each lesion cuts, names, defect text)
// come from visual-pathway.js.

import { LESIONS, LESION_BY_ID, fieldLoss, FIELD_COLORS } from './visual-pathway.js';

const NS = 'http://www.w3.org/2000/svg';
const OTHER = { L: 'R', R: 'L' };
const W = { L: 'left', R: 'right' };

// Where along a bundle each lesion cuts (index into bundlePoints()).
const CUT_AT = { 'optic-nerve': 1, chiasm: 3, tract: 4, meyer: 7, parietal: 8, cortex: 10, cuneus: 10, lingual: 10 };

// Fibre bundles: eye × retina half × field half.
const BUNDLES = [];
for (const eye of ['L', 'R']) for (const retina of ['nasal', 'temporal']) for (const field of ['upper', 'lower']) {
  const crosses = retina === 'nasal';
  BUNDLES.push({ eye, retina, field, fieldSide: (eye === 'L') === crosses ? 'left' : 'right', tract: crosses ? OTHER[eye] : eye });
}

// Drawn roughly to scale (about 2.3 units per mm), as on an axial scan at the
// level of the orbits, seen from above: optic nerve ~50 mm, chiasm ~13 mm
// wide, optic tract ~25 mm round the cerebral peduncle to the LGN, Meyer's
// loop tip ~28 mm behind the temporal pole, radiation lateral to the
// ventricle, ending along the calcarine cortex with the macula at the pole.
// Geometry is written for the left side and mirrored for the right.
const mx = (side, [x, y]) => [side === 'L' ? x : 400 - x, y];
function bundlePoints(b) {
  const n = b.retina === 'nasal', up = b.field === 'upper';
  const o = (n ? 2.2 : -2.2) + (up ? -0.9 : 0.9);
  const pre = [[131 + o, 131], [150 + o * 0.9, 160], [165 + o * 0.6, 188],
    n ? [200 + (b.eye === 'L' ? -1.5 : 1.5) + (up ? -0.8 : 0.8), 218] : [185 + o * 0.4, 221]]
    .map(p => mx(b.eye, p));
  const oo = up ? -1.4 : 1.4;
  const post = (up // upper field: lower retina, forward round Meyer's loop, to the lower bank
    ? [[171 + oo, 257], [156, 302], [134, 288], [104, 272], [88, 312], [86, 405], [140, 508], [182, 540]]
    : [[171 + oo, 257], [156, 302], [140, 328], [114, 368], [104, 420], [116, 470], [160, 512], [188, 526]]
  ).map(p => mx(b.tract, p));
  return [...pre, ...post];
}

// Faint context: brain outline, orbits, ventricles, midbrain, pituitary, V1.
function drawContext(svg) {
  const both = (fn) => { fn('L'); fn('R'); };
  const P = (side, pts) => pts.map(p => mx(side, p));
  both(s => {
    // Cerebral hemisphere at this level: temporal lobe in front, occipital behind.
    el('path', { d: pathD(P(s, [[118, 286], [124, 240], [104, 206], [72, 206], [48, 244], [38, 320], [40, 420], [62, 512], [110, 574], [186, 594], [196, 590], [194, 470], [176, 400], [150, 350], [128, 318], [118, 286]])), class: 'vp-brain' }, svg);
    // Orbit: walls converging on the optic canal.
    el('path', { d: `M${mx(s, [84, 96]).join(',')} L${mx(s, [159, 186]).join(',')} L${mx(s, [173, 96]).join(',')}`, class: 'vp-orbit' }, svg);
    // Lateral ventricle: temporal horn, atrium, occipital horn.
    el('path', { d: pathD(P(s, [[114, 292], [116, 340], [126, 395], [146, 440], [168, 482]])), class: 'vp-vent' }, svg);
    // Primary visual cortex along the calcarine sulcus (medial occipital lobe).
    el('path', { d: pathD(P(s, [[178, 490], [176, 530], [180, 566], [190, 584], [196, 580], [196, 530], [195, 490], [178, 490]])), class: 'vp-v1' }, svg);
    // Pupil-reflex fibres leave the tract for the pretectum before the LGN.
    el('path', { d: pathD(P(s, [[166, 276], [180, 304], [192, 326]])), class: 'vp-pretect' }, svg);
  });
  // Midbrain: two cerebral peduncles in front, tegmentum and aqueduct behind.
  el('circle', { cx: 186, cy: 292, r: 13, class: 'vp-midbrain' }, svg);
  el('circle', { cx: 214, cy: 292, r: 13, class: 'vp-midbrain' }, svg);
  el('ellipse', { cx: 200, cy: 312, rx: 20, ry: 17, class: 'vp-midbrain' }, svg);
  el('circle', { cx: 200, cy: 318, r: 2.2, class: 'vp-aqueduct' }, svg);
  // Pituitary, below the chiasm; the chiasm itself.
  el('ellipse', { cx: 200, cy: 234, rx: 11, ry: 8, class: 'vp-pit' }, svg);
  el('path', { d: 'M184,206 Q200,214 216,206 L224,230 Q200,222 176,230 Z', class: 'vp-chiasm' }, svg);
}

// One eye: globe, cornea, lens, and the retina halves coloured by the half of
// the visual field they see (greyed when that half is lost).
function drawEye(svg, eye, x, loss) {
  const y = 108, r = 23;
  el('circle', { cx: x, cy: y, r, class: 'vp-eye' }, svg);
  el('path', { d: `M${x - 10},${y - r + 2} Q${x},${y - r - 9} ${x + 10},${y - r + 2}`, class: 'vp-cornea' }, svg);
  el('ellipse', { cx: x, cy: y - 14, rx: 8, ry: 3.6, class: 'vp-lens' }, svg);
  // Retina: the half nearer the nose is nasal. Left eye's nasal retina sees the left field.
  for (const half of ['left', 'right']) {
    const lost = loss[`${half}-upper`] && loss[`${half}-lower`];
    const nasalSide = eye === 'L' ? 1 : -1;         // +x is toward the nose for the left eye
    const seesLeft = (eye === 'L');                  // nasal retina of the left eye sees the left field
    const nasal = (half === 'left') === seesLeft;
    const sx = nasal ? nasalSide : -nasalSide;
    const a0 = Math.PI / 2, a1 = Math.PI / 2 + sx * -1.25; // from the back of the globe toward the side
    const rr = r - 3;
    const p0 = [x + Math.cos(a0) * rr, y + Math.sin(a0) * rr], p1 = [x + Math.cos(a1) * rr, y + Math.sin(a1) * rr];
    el('path', { d: `M${p0[0]},${p0[1]} A${rr},${rr} 0 0 ${sx > 0 ? 0 : 1} ${p1[0]},${p1[1]}`, class: 'vp-retina', stroke: lost ? FIELD_COLORS.lost : FIELD_COLORS[half].upper }, svg);
  }
}

// Each eye's visual field seen from above: ~95° to the temporal side, ~60° to
// the nasal side. Halves are coloured by side; striped when one quarter of a
// half is lost, grey when both are.
function drawField(svg, eye, x, loss) {
  const cy = 86, R = 74;
  const temporal = eye === 'L' ? 'left' : 'right';
  for (const half of ['left', 'right']) {
    const deg = half === temporal ? 95 : 60;
    const dir = half === 'left' ? -1 : 1;
    const steps = 12, pts = [[x, cy]];
    for (let i = 0; i <= steps; i++) {
      const a = (deg * i / steps) * Math.PI / 180;
      pts.push([x + dir * Math.sin(a) * R, cy - Math.cos(a) * R]);
    }
    const up = loss[`${half}-upper`], lo = loss[`${half}-lower`];
    const fill = up && lo ? FIELD_COLORS.lost : up || lo ? `url(#vp-part-${half})` : FIELD_COLORS[half].upper;
    el('path', { d: 'M' + pts.map(p => p.join(',')).join(' L') + ' Z', fill, class: 'vp-field' + (up && lo ? ' lost' : '') }, svg);
  }
  el('line', { x1: x, y1: cy, x2: x, y2: cy - R, class: 'vp-field-mid' }, svg);
}

// Smooth path through points (Catmull-Rom as cubic Béziers).
function pathD(p) {
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6},${c[1] - (e[1] - b[1]) / 6} ${c[0]},${c[1]}`;
  }
  return d;
}
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.appendChild(e);
  return e;
};

// The picture the patient looks at. A photo at SCENE_URL is used when it
// loads; until then (or without one) a drawn scene.
const SCENE_URL = 'assets/visual-scene.jpg';
let sceneOk = null; // null: not tried yet; true / false once known
const SCENE_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="vp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb7ea"/><stop offset="1" stop-color="#cfe6f7"/></linearGradient>
  <pattern id="vp-part-left" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${FIELD_COLORS.lost}"/><rect width="3" height="6" fill="${FIELD_COLORS.left.upper}"/></pattern>
  <pattern id="vp-part-right" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${FIELD_COLORS.lost}"/><rect width="3" height="6" fill="${FIELD_COLORS.right.upper}"/></pattern>
  <filter id="vp-feather" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"/></filter>
  <symbol id="vp-scene" viewBox="0 0 320 200">
      <rect width="320" height="200" fill="url(#vp-sky)"/>
      <circle cx="52" cy="38" r="17" fill="#ffd45c"/>
      <g fill="none" stroke="#ffd45c" stroke-width="2.5" stroke-linecap="round">
        <path d="M52 12v-6M52 70v-6M26 38h-6M84 38h-6M34 20l-4-4M74 60l-4-4M34 56l-4 4M74 16l-4 4"/>
      </g>
      <g fill="none" stroke="#2d3446" stroke-width="2" stroke-linecap="round">
        <path d="M226 34q6-6 12 0q6-6 12 0"/><path d="M256 52q5-5 10 0q5-5 10 0"/><path d="M240 64q4-4 8 0q4-4 8 0"/>
      </g>
      <path d="M0 118 Q80 92 160 112 T320 106 V200 H0 Z" fill="#8fc27a"/>
      <rect x="22" y="84" width="74" height="50" fill="#e7c9a0"/><path d="M16 86 L59 58 L102 86 Z" fill="#b8573f"/>
      <rect x="50" y="104" width="16" height="30" fill="#6b4a33"/><rect x="28" y="96" width="14" height="12" fill="#bfe3ff"/><rect x="74" y="96" width="14" height="12" fill="#bfe3ff"/>
      <rect x="258" y="82" width="8" height="46" fill="#7a5638"/><circle cx="262" cy="70" r="24" fill="#3f9a55"/><circle cx="246" cy="82" r="15" fill="#4fae63"/><circle cx="280" cy="82" r="15" fill="#4fae63"/>
      <path d="M120 200 L148 120 H172 L200 200 Z" fill="#8a8f9c"/>
      <path d="M160 132 V142 M160 154 V166 M160 180 V196" stroke="#f2f2f2" stroke-width="2.5"/>
      <g transform="translate(26 150)"><rect x="0" y="10" width="70" height="20" rx="6" fill="#d9483b"/><path d="M12 10 L22 0 H48 L58 10 Z" fill="#d9483b"/><rect x="24" y="3" width="10" height="7" fill="#cfeaff"/><rect x="37" y="3" width="10" height="7" fill="#cfeaff"/><circle cx="16" cy="30" r="7" fill="#222"/><circle cx="54" cy="30" r="7" fill="#222"/></g>
      <g transform="translate(236 150)" fill="#a8743e"><ellipse cx="24" cy="18" rx="20" ry="9"/><circle cx="46" cy="10" r="8"/><path d="M50 4 l6 -6 l1 8 z"/><rect x="8" y="22" width="4" height="12"/><rect x="34" y="22" width="4" height="12"/><path d="M4 16 q-8 -6 -6 -12" stroke="#a8743e" stroke-width="3" fill="none"/></g>
    </symbol>
</defs></svg>`;

// One view: the picture, the lost quarters blacked out (soft edges), and the
// fixation cross. loss: { 'left-upper': true, ... }; the left half of the
// picture is the left half of the visual field.
function paintView(svg, loss, sparing) {
  svg.textContent = '';
  // A circle of radius 160 around the fixation point (160, 100).
  const id = svg.dataset.mask;
  const clip = el('clipPath', { id: `${id}-c` }, svg);
  el('circle', { cx: 160, cy: 100, r: 159 }, clip);
  const view = el('g', { 'clip-path': `url(#${id}-c)` }, svg);
  if (sceneOk) {
    el('image', { href: SCENE_URL, x: 0, y: -60, width: 320, height: 320, preserveAspectRatio: 'xMidYMid slice' }, view);
  } else {
    // The drawn scene is wider than tall: carry its sky up and its grass and
    // road down to fill the circle.
    el('rect', { x: 0, y: -60, width: 320, height: 160, fill: '#7fb7ea' }, view);
    el('rect', { x: 0, y: 150, width: 320, height: 110, fill: '#8fc27a' }, view);
    el('path', { d: 'M120 199 L200 199 L222 260 L98 260 Z', fill: '#8a8f9c' }, view);
    el('path', { d: 'M160 212 V226 M160 240 V254', stroke: '#f2f2f2', 'stroke-width': 2.5 }, view);
    el('use', { href: '#vp-scene', width: 320, height: 200 }, view);
  }
  const mask = el('mask', { id }, svg);
  el('rect', { x: 0, y: -60, width: 320, height: 320, fill: 'white' }, mask);
  if (sparing) el('circle', { cx: 160, cy: 100, r: 34, fill: 'black', filter: 'url(#vp-feather)' }, mask);
  const shade = el('g', { mask: `url(#${id})` }, view);
  const dark = el('g', { filter: 'url(#vp-feather)', fill: '#05060a', opacity: 0.94 }, shade);
  // Quarters: left half of the circle = left visual field.
  const Q = { 'left-upper': [-8, -68], 'right-upper': [160, -68], 'left-lower': [-8, 100], 'right-lower': [160, 100] };
  for (const key in Q) if (loss[key]) el('rect', { x: Q[key][0], y: Q[key][1], width: 168, height: 168 }, dark);
  el('line', { x1: 0, y1: 100, x2: 320, y2: 100, class: 'vp-view-axis' }, view);
  el('line', { x1: 160, y1: -60, x2: 160, y2: 260, class: 'vp-view-axis' }, view);
  el('circle', { cx: 160, cy: 100, r: 159, class: 'vp-view-ring' }, svg);
  el('path', { d: 'M160 92 V108 M152 100 H168', stroke: '#e04848', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
}

// Mounts the diagram and pictures into `host`. onChange(lesion, side) is
// called after each pick. Returns { destroy, setLesion }.
export function mountPathwayDiagram(host, { onChange } = {}) {
  host.innerHTML = `${SCENE_DEFS}
    <div class="vp-views">
      <div class="vp-pair">
        <figure class="vp-view"><figcaption>Left eye</figcaption><svg viewBox="-2 -62 324 324" data-mask="vp-m-L" role="img" aria-label="What the left eye sees"></svg></figure>
        <figure class="vp-view"><figcaption>Right eye</figcaption><svg viewBox="-2 -62 324 324" data-mask="vp-m-R" role="img" aria-label="What the right eye sees"></svg></figure>
      </div>
      <div class="vp-caption" aria-live="polite"><b></b><span></span></div>
    </div>
    <div class="vp-figure"></div>`;
  const [vL, vR] = host.querySelectorAll('.vp-view svg');
  const caption = host.querySelector('.vp-caption');
  const svg = el('svg', { viewBox: '0 6 400 606', role: 'group', 'aria-label': 'Visual pathway seen from above. Numbered spots are lesion sites.' }, host.querySelector('.vp-figure'));

  let current = { id: null, side: 'R' };
  let alive = true;

  function paintViews() {
    const l = LESION_BY_ID[current.id];
    const loss = fieldLoss(current.id, current.side);
    paintView(vL, loss.L, l?.sparing);
    paintView(vR, loss.R, l?.sparing);
  }

  function render() {
    svg.textContent = '';
    const l = LESION_BY_ID[current.id];
    const loss = fieldLoss(current.id, current.side);
    drawContext(svg);
    drawField(svg, 'L', 128, loss.L);
    drawField(svg, 'R', 272, loss.R);
    drawEye(svg, 'L', 128, loss.L);
    drawEye(svg, 'R', 272, loss.R);
    for (const s of ['L', 'R']) el('ellipse', { cx: mx(s, [156, 0])[0], cy: 302, rx: 8.5, ry: 6, class: 'vp-lgn' }, svg);
    // Optic radiation: a faint band under the fibres, as it is a broad sheet.
    for (const s of ['L', 'R']) for (const field of ['upper', 'lower']) {
      const b = BUNDLES.find(x => x.tract === s && x.field === field);
      el('path', { d: pathD(bundlePoints(b).slice(5)), class: 'vp-sheet' }, svg);
    }
    // Fibres: coloured up to the cut, grey after it.
    const k = l ? CUT_AT[l.id] : 0;
    for (const b of BUNDLES) {
      const p = bundlePoints(b);
      const cut = l && l.cuts(b, current.side);
      el('path', { d: pathD(cut ? p.slice(0, k + 1) : p), class: 'vp-strand', stroke: FIELD_COLORS[b.fieldSide][b.field] }, svg);
      if (cut) el('path', { d: pathD(p.slice(k)), class: 'vp-strand', stroke: FIELD_COLORS.lost }, svg);
    }
    [[98, 112, 'Left eye', 'end'], [302, 112, 'Right eye', 'start'],
     [124, 150, 'Optic nerve', 'end'], [228, 212, 'Optic chiasm', 'start'], [150, 242, 'Optic tract', 'end'],
     [258, 306, 'LGN', 'start'], [96, 266, "Meyer's loop", 'end'], [78, 432, 'Optic radiation', 'end'],
     [200, 482, 'Visual cortex (V1)', 'middle'], [200, 606, 'Occipital pole (macula)', 'middle']]
      .forEach(([x, y, t, a]) => { el('text', { x, y, class: 'vp-label', 'text-anchor': a }, svg).textContent = t; });
    [[244, 236, 'Pituitary (below)', 'start'], [200, 344, 'Midbrain', 'middle'], [216, 330, 'Pupil fibres', 'start'],
     [178, 452, 'Ventricle', 'start'], [60, 222, 'Temporal lobe', 'start'], [70, 548, 'Occipital lobe', 'start']]
      .forEach(([x, y, t, a]) => { el('text', { x, y, class: 'vp-label faint', 'text-anchor': a }, svg).textContent = t; });

    // Lesion spots, both sides (the chiasm once).
    for (const les of LESIONS) for (const side of les.midline ? ['L'] : ['L', 'R']) {
      const at = CUT_AT[les.id];
      const cutB = BUNDLES.filter(b => les.cuts(b, side));
      let x = 0, y = 0;
      cutB.forEach(b => { const p = bundlePoints(b)[at]; x += p[0]; y += p[1]; });
      x /= cutB.length; y /= cutB.length;
      const on = current.id === les.id && (les.midline || current.side === side);
      if (on) { // the cut bar sits across the fibres
        const spread = Math.max(...cutB.map(b => { const p = bundlePoints(b)[at]; return Math.hypot(p[0] - x, p[1] - y); }));
        let tx = 0, ty = 0;
        cutB.forEach(b => { const p = bundlePoints(b); tx += p[at + 1][0] - p[at - 1][0]; ty += p[at + 1][1] - p[at - 1][1]; });
        const len = Math.hypot(tx, ty) || 1, nx = -ty / len, ny = tx / len, h = spread + 6;
        el('line', { x1: x - nx * h, y1: y - ny * h, x2: x + nx * h, y2: y + ny * h, class: 'vp-cutbar' }, svg);
      }
      // Badges: beside the fibres on the nerves and tracts, above the chiasm,
      // and spread apart at the cortex.
      const out = side === 'L' ? -1 : 1;
      if (les.id === 'cortex') { x += out * 24; y += 2; }
      if (les.id === 'cuneus') { x -= out * 10; y -= 6; }
      if (les.id === 'lingual') { x -= out * 10; y += 10; }
      const bx = x + (at <= 4 && !les.midline ? out * 12 : 0);
      const by = y - (les.midline ? 14 : 0);
      const where = les.midline ? '' : `, ${W[side]}`;
      const g = el('g', { class: 'vp-spot' + (on ? ' on' : ''), tabindex: 0, role: 'button', 'aria-pressed': String(on), 'aria-label': `${les.num}. ${les.name}${where}` }, svg);
      el('title', {}, g).textContent = `${les.num}. ${les.name}${les.midline ? '' : ` (${W[side]})`}`;
      el('circle', { cx: x, cy: y, r: 14, class: 'vp-hit' }, g);
      el('circle', { cx: bx, cy: by, r: 8, class: 'vp-badge' }, g);
      el('text', { x: bx, y: by, class: 'vp-num' }, g).textContent = les.num;
      const pick = () => setLesion(on ? null : les.id, side, true);
      g.addEventListener('click', pick);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    }

    caption.querySelector('b').textContent = l ? l.defect(current.side) : 'Normal visual fields';
    caption.querySelector('span').textContent = l
      ? l.note(current.side)
      : 'Click a numbered spot on the pathway to place a lesion; click it again to clear it. The pictures show what the patient sees while looking at the red cross.';
    paintViews();
  }

  function setLesion(id, side = current.side, fromClick = false) {
    current = { id: id || null, side };
    render();
    if (fromClick) svg.querySelector('.vp-spot.on')?.focus?.();
    onChange?.(LESION_BY_ID[current.id] || null, current.side);
  }

  render();
  // Swap in the photo once we know it exists.
  if (sceneOk === null) {
    const img = new Image();
    img.onload = () => { sceneOk = true; if (alive) paintViews(); };
    img.onerror = () => { sceneOk = false; };
    img.src = SCENE_URL;
  }
  return { setLesion, destroy() { alive = false; host.innerHTML = ''; } };
}
