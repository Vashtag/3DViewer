// Visual pathway lesions as a flat, top-down diagram (like the textbook
// figure): eyes at the top, the patient's left on the screen's left. Both
// sides are drawn, so a lesion is picked by clicking its numbered spot on the
// side you want. What each eye sees is drawn above that eye; the defect is
// named under the diagram. Fibres past the cut turn grey.
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

// One eye's field, as the patient sees it: left half = left visual field.
function fieldCircle(g, cx, cy, r, loss, sparing, caption) {
  const q = { 'left-upper': [-1, -1], 'right-upper': [1, -1], 'left-lower': [-1, 1], 'right-lower': [1, 1] };
  for (const key in q) {
    const [sx, sy] = q[key];
    const [side, half] = key.split('-');
    el('path', {
      d: `M${cx},${cy} L${cx + sx * r},${cy} A${r},${r} 0 0 ${sx * sy > 0 ? 1 : 0} ${cx},${cy + sy * r} Z`,
      fill: loss[key] ? FIELD_COLORS.lost : FIELD_COLORS[side][half],
    }, g);
  }
  if (sparing && Object.keys(loss).length) el('circle', { cx, cy, r: r * 0.22, fill: FIELD_COLORS.left.upper, class: 'vp-spared' }, g);
  el('line', { x1: cx - r, y1: cy, x2: cx + r, y2: cy, class: 'vp-axis' }, g);
  el('line', { x1: cx, y1: cy - r, x2: cx, y2: cy + r, class: 'vp-axis' }, g);
  el('circle', { cx, cy, r, class: 'vp-ring' }, g);
  el('text', { x: cx, y: cy + r + 13, class: 'vp-cap' }, g).textContent = caption;
}

const DY = 44;        // room above the eyes for the field circles
const HEIGHT = 530 + DY;

// Mounts the diagram into `host` (an element). onChange(lesion, side) is
// called after each pick. Returns { destroy, setLesion }.
export function mountPathwayDiagram(host, { onChange } = {}) {
  host.innerHTML = '';
  const figure = document.createElement('div');
  figure.className = 'vp-figure';
  const svg = el('svg', { viewBox: `0 0 400 ${HEIGHT}`, role: 'group', 'aria-label': 'Visual pathway seen from above. Numbered spots are lesion sites.' });
  figure.appendChild(svg);
  const caption = document.createElement('div');
  caption.className = 'vp-caption';
  caption.setAttribute('aria-live', 'polite');
  caption.innerHTML = '<b></b><span></span>';
  host.append(figure, caption);

  let current = { id: null, side: 'R' };

  function render() {
    svg.textContent = '';
    const l = LESION_BY_ID[current.id];
    const loss = fieldLoss(current.id, current.side);
    const fields = el('g', {}, svg);
    fieldCircle(fields, 130, 44, 32, loss.L, l?.sparing, 'Left eye sees');
    fieldCircle(fields, 270, 44, 32, loss.R, l?.sparing, 'Right eye sees');

    for (const x of [130, 270]) {
      el('circle', { cx: x, cy: 100 + DY, r: 28, class: 'vp-eye' }, svg);
      el('ellipse', { cx: x, cy: 75 + DY, rx: 11, ry: 3.5, class: 'vp-iris' }, svg);
    }
    for (const s of ['L', 'R']) {
      el('ellipse', { cx: mx(s, [178, 0])[0], cy: 462 + DY, rx: 18, ry: 28, class: 'vp-cortex' }, svg);
      el('ellipse', { cx: mx(s, [142, 0])[0], cy: 288 + DY, rx: 8, ry: 6, class: 'vp-lgn' }, svg);
    }
    // Fibres: coloured up to the cut, grey after it.
    const k = l ? CUT_AT[l.id] : 0;
    for (const b of BUNDLES) {
      const p = bundlePoints(b, DY);
      const cut = l && l.cuts(b, current.side);
      el('path', { d: pathD(cut ? p.slice(0, k + 1) : p), class: 'vp-strand', stroke: FIELD_COLORS[b.fieldSide][b.field] }, svg);
      if (cut) el('path', { d: pathD(p.slice(k)), class: 'vp-strand', stroke: FIELD_COLORS.lost }, svg);
    }
    [[60, 150, 'Optic nerve', 'start'], [222, 206, 'Optic chiasm', 'start'], [100, 252, 'Optic tract', 'end'],
     [152, 300, 'LGN', 'start'], [70, 338, "Meyer's loop", 'end'], [150, 352, 'Parietal', 'start'], [200, 515, 'Visual cortex', 'middle']]
      .forEach(([x, y, t, a]) => { el('text', { x, y: y + DY, class: 'vp-label', 'text-anchor': a }, svg).textContent = t; });

    // Lesion spots, both sides (the chiasm once).
    for (const les of LESIONS) for (const side of les.midline ? ['L'] : ['L', 'R']) {
      const at = CUT_AT[les.id];
      const cutB = BUNDLES.filter(b => les.cuts(b, side));
      let x = 0, y = 0;
      cutB.forEach(b => { const p = bundlePoints(b, DY)[at]; x += p[0]; y += p[1]; });
      x /= cutB.length; y /= cutB.length;
      const out = side === 'L' ? -1 : 1;
      if (les.id === 'cortex') { x += out * 24; y += 2; }
      if (les.id === 'cuneus') { x -= out * 10; y -= 6; }
      if (les.id === 'lingual') { x -= out * 10; y += 10; }
      const on = current.id === les.id && (les.midline || current.side === side);
      if (on) {
        const spread = Math.max(...cutB.map(b => { const p = bundlePoints(b, DY)[at]; return Math.hypot(p[0] - x, p[1] - y); }));
        el('line', { x1: x - spread - 6, y1: y, x2: x + spread + 6, y2: y, class: 'vp-cutbar' }, svg);
      }
      // The badge sits beside the fibres on the nerves and tracts, above the chiasm.
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
      : 'Click a numbered spot on the pathway to place a lesion; click it again to clear it. Blue fibres carry the left half of what the patient sees, green the right.';
  }

  function setLesion(id, side = current.side, fromClick = false) {
    current = { id: id || null, side };
    render();
    if (fromClick) svg.querySelector('.vp-spot.on')?.focus?.();
    onChange?.(LESION_BY_ID[current.id] || null, current.side);
  }

  render();
  return { setLesion, destroy() { host.innerHTML = ''; } };
}
