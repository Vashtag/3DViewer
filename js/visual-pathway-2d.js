// Visual pathway lesions as a flat, top-down diagram (like the textbook
// figure): eyes at the top, the patient's left on the screen's left. Both
// sides are drawn, so a lesion is picked by clicking its numbered spot on the
// side you want. Fibres past the cut turn grey.
//
// In front of each eye a triangle shows its visual field (left half blue,
// right half green; greyed when lost, striped when only the upper or lower
// quarter of that half is lost). Beside the diagram, a picture shows what
// each eye sees, with the lost part of the visual field blacked out. The picture is assets/visual-scene.jpg when that file exists (any
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
const CUT_AT = { 'optic-nerve': 1, chiasm: 2, tract: 3, meyer: 5, parietal: 5, cortex: 7, cuneus: 7, lingual: 7 };

// Fibre bundles: eye × retina half × field half.
const BUNDLES = [];
for (const eye of ['L', 'R']) for (const retina of ['nasal', 'temporal']) for (const field of ['upper', 'lower']) {
  const crosses = retina === 'nasal';
  BUNDLES.push({ eye, retina, field, fieldSide: (eye === 'L') === crosses ? 'left' : 'right', tract: crosses ? OTHER[eye] : eye });
}

// Geometry is written for the left side and mirrored for the right (x -> 400 - x).
const mx = (side, [x, y]) => [side === 'L' ? x : 400 - x, y];
function bundlePoints(b, dy) {
  const n = b.retina === 'nasal', up = b.field === 'upper';
  const o = (n ? 3 : -3) + (up ? -1.2 : 1.2);
  const pre = [[130 + o * 1.4, 129], [158 + o, 166], n ? [200 + (b.eye === 'L' ? -2 : 2) + (up ? -1 : 1), 203] : [184 + o * 0.6, 207]]
    .map(p => mx(b.eye, p));
  const oo = up ? -1.6 : 1.6;
  const post = (up // upper field: lower fibres, through Meyer's loop to the lingual gyrus
    ? [[168 + oo, 246], [142, 288], [96, 306], [86, 372], [148, 442], [176, 470]]
    : [[168 + oo, 246], [142, 288], [126, 330], [136, 396], [160, 436], [178, 454]]
  ).map(p => mx(b.tract, p));
  return [...pre, ...post].map(([x, y]) => [x, y + dy]);
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
  const svg = el('svg', { viewBox: '0 -44 400 580', role: 'group', 'aria-label': 'Visual pathway seen from above. Numbered spots are lesion sites.' }, host.querySelector('.vp-figure'));

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
    // Visual field triangles in front of the eyes. Seen from above only the
    // left / right halves show; a half missing one quarter is striped.
    const loss = fieldLoss(current.id, current.side);
    for (const [eye, x] of [['L', 130], ['R', 270]]) {
      for (const half of ['left', 'right']) {
        const up = loss[eye][`${half}-upper`], lo = loss[eye][`${half}-lower`];
        const fill = up && lo ? FIELD_COLORS.lost : up || lo ? `url(#vp-part-${half})` : FIELD_COLORS[half].upper;
        const edge = half === 'left' ? x - 58 : x + 58;
        el('path', { d: `M${x},70 L${edge},-34 L${x},-34 Z`, fill, class: 'vp-field' + (up && lo ? ' lost' : '') }, svg);
      }
      el('line', { x1: x, y1: 70, x2: x, y2: -34, class: 'vp-field-mid' }, svg);
    }
    for (const x of [130, 270]) {
      el('circle', { cx: x, cy: 100, r: 28, class: 'vp-eye' }, svg);
      el('ellipse', { cx: x, cy: 75, rx: 11, ry: 3.5, class: 'vp-iris' }, svg);
    }
    for (const s of ['L', 'R']) {
      el('ellipse', { cx: mx(s, [178, 0])[0], cy: 462, rx: 18, ry: 28, class: 'vp-cortex' }, svg);
      el('ellipse', { cx: mx(s, [142, 0])[0], cy: 288, rx: 8, ry: 6, class: 'vp-lgn' }, svg);
    }
    // Fibres: coloured up to the cut, grey after it.
    const k = l ? CUT_AT[l.id] : 0;
    for (const b of BUNDLES) {
      const p = bundlePoints(b, 0);
      const cut = l && l.cuts(b, current.side);
      el('path', { d: pathD(cut ? p.slice(0, k + 1) : p), class: 'vp-strand', stroke: FIELD_COLORS[b.fieldSide][b.field] }, svg);
      if (cut) el('path', { d: pathD(p.slice(k)), class: 'vp-strand', stroke: FIELD_COLORS.lost }, svg);
    }
    [[96, 104, 'Left eye', 'end'], [304, 104, 'Right eye', 'start'], [60, 150, 'Optic nerve', 'start'], [222, 206, 'Optic chiasm', 'start'],
     [100, 252, 'Optic tract', 'end'], [152, 300, 'LGN', 'start'], [70, 338, "Meyer's loop", 'end'], [150, 352, 'Parietal', 'start'], [200, 515, 'Visual cortex', 'middle']]
      .forEach(([x, y, t, a]) => { el('text', { x, y, class: 'vp-label', 'text-anchor': a }, svg).textContent = t; });

    // Lesion spots, both sides (the chiasm once).
    for (const les of LESIONS) for (const side of les.midline ? ['L'] : ['L', 'R']) {
      const at = CUT_AT[les.id];
      const cutB = BUNDLES.filter(b => les.cuts(b, side));
      let x = 0, y = 0;
      cutB.forEach(b => { const p = bundlePoints(b, 0)[at]; x += p[0]; y += p[1]; });
      x /= cutB.length; y /= cutB.length;
      const on = current.id === les.id && (les.midline || current.side === side);
      if (on) { // the cut bar sits on the fibres
        const spread = Math.max(...cutB.map(b => { const p = bundlePoints(b, 0)[at]; return Math.hypot(p[0] - x, p[1] - y); }));
        el('line', { x1: x - spread - 6, y1: y, x2: x + spread + 6, y2: y, class: 'vp-cutbar' }, svg);
      }
      // Badges: beside the fibres on the nerves and tracts, above the chiasm,
      // and spread apart at the cortex.
      const out = side === 'L' ? -1 : 1;
      if (les.id === 'cortex') { x += out * 24; y += 2; }
      if (les.id === 'cuneus') { x -= out * 10; y -= 6; }
      if (les.id === 'lingual') { x -= out * 10; y += 10; }
      const bx = x + (at <= 3 && !les.midline ? out * 13 : 0);
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
