// ── Visual pathway: schematic 3D model + lesion → visual field defect ──
// Built in code (no model file). Coordinates are the viewer's: millimetre-ish
// units, +X = patient's left, +Y = superior, +Z = anterior.
//
// The pathway is drawn as 8 fibre bundles: each eye × nasal / temporal retina
// × upper / lower visual field. Each bundle carries exactly one quadrant of one
// eye's visual field, so a lesion is simply "the bundles it cuts", and the
// field defect, the greyed-out fibres and the dimmed field cones all follow
// from that one rule:
//   • nasal retina sees the temporal field and crosses at the chiasm;
//     temporal retina sees the nasal field and stays on its own side;
//   • after the chiasm each optic tract carries the opposite visual field;
//   • the upper field (lower retina) runs through Meyer's loop in the temporal
//     lobe to the lower bank of the calcarine sulcus (lingual gyrus);
//     the lower field runs through the parietal radiation to the upper bank
//     (cuneus).
// Colours follow the usual teaching diagram: left visual field blue, right
// visual field green.

import * as THREE from 'three';

export const FIELD_COLORS = {
  left:  { upper: '#6f9bff', lower: '#3f6fe0' },  // left visual field (blue)
  right: { upper: '#7fd6a0', lower: '#3fae6c' },  // right visual field (green)
  lost:  '#4a4f63',
};

// Lesion sites. `side` is the side of the lesion ('L' / 'R'); `cuts(b, side)`
// says whether bundle b is cut. Text is written for a given side.
const SIDE = { L: 'left', R: 'right' };
const OTHER = { L: 'R', R: 'L' };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export const LESIONS = [
  {
    id: 'optic-nerve', num: 1, name: 'Optic nerve',
    cuts: (b, s) => b.eye === s,
    defect: s => `${cap(SIDE[s])} monocular blindness`,
    note: s => `Everything from the ${SIDE[s]} eye is lost before the chiasm, so only that eye is affected (e.g. optic neuritis, ischaemic optic neuropathy).`,
  },
  {
    id: 'chiasm', num: 2, name: 'Optic chiasm', midline: true,
    cuts: b => b.retina === 'nasal',
    defect: () => 'Bitemporal hemianopia',
    note: () => 'The crossing nasal fibres are cut, so both temporal (outer) fields are lost. Classic with a pituitary tumour pressing from below.',
  },
  {
    id: 'tract', num: 3, name: 'Optic tract',
    cuts: (b, s) => b.tract === s,
    defect: s => `${cap(SIDE[OTHER[s]])} homonymous hemianopia`,
    note: s => `Behind the chiasm the ${SIDE[s]} tract carries the ${SIDE[OTHER[s]]} visual field from both eyes, so the same half is lost in each eye.`,
  },
  {
    id: 'meyer', num: 4, name: "Meyer's loop (temporal lobe)",
    cuts: (b, s) => b.tract === s && b.field === 'upper',
    defect: s => `${cap(SIDE[OTHER[s]])} superior homonymous quadrantanopia`,
    note: s => `"Pie in the sky". The lower-retina fibres (upper field) loop forward through the ${SIDE[s]} temporal lobe; a temporal lobe lesion catches them.`,
  },
  {
    id: 'parietal', num: 5, name: 'Parietal optic radiation',
    cuts: (b, s) => b.tract === s && b.field === 'lower',
    defect: s => `${cap(SIDE[OTHER[s]])} inferior homonymous quadrantanopia`,
    note: s => `"Pie on the floor". The upper-retina fibres (lower field) run back through the ${SIDE[s]} parietal lobe.`,
  },
  {
    id: 'cortex', num: 6, name: 'Visual cortex (occipital)', sparing: true,
    cuts: (b, s) => b.tract === s,
    defect: s => `${cap(SIDE[OTHER[s]])} homonymous hemianopia with macular sparing`,
    note: () => 'Typical of a posterior cerebral artery stroke. The occipital pole (central vision) often also gets blood from the middle cerebral artery, so the centre is spared.',
  },
  {
    id: 'cuneus', num: 7, name: 'Upper bank (cuneus)', sparing: true,
    cuts: (b, s) => b.tract === s && b.field === 'lower',
    defect: s => `${cap(SIDE[OTHER[s]])} inferior quadrantanopia with macular sparing`,
    note: () => 'The cuneus, above the calcarine sulcus, receives the lower visual field.',
  },
  {
    id: 'lingual', num: 8, name: 'Lower bank (lingual gyrus)', sparing: true,
    cuts: (b, s) => b.tract === s && b.field === 'upper',
    defect: s => `${cap(SIDE[OTHER[s]])} superior quadrantanopia with macular sparing`,
    note: () => 'The lingual gyrus, below the calcarine sulcus, receives the upper visual field.',
  },
];
export const LESION_BY_ID = Object.fromEntries(LESIONS.map(l => [l.id, l]));

// Which quadrants of each eye's field are lost: { L: { 'left-upper': true, … }, R: … }.
export function fieldLoss(lesionId, side) {
  const lesion = LESION_BY_ID[lesionId];
  const loss = { L: {}, R: {} };
  if (!lesion) return loss;
  BUNDLES.forEach(b => { if (lesion.cuts(b, side)) loss[b.eye][`${b.fieldSide}-${b.field}`] = true; });
  return loss;
}

// ── The 8 bundles ──
// eye: 'L' / 'R'; retina: 'nasal' / 'temporal'; field: 'upper' / 'lower'
// (upper field = lower retina). fieldSide: which half of the visual field it
// sees; tract: which optic tract carries it.
const BUNDLES = [];
for (const eye of ['L', 'R']) {
  for (const retina of ['nasal', 'temporal']) {
    for (const field of ['upper', 'lower']) {
      const s = eye === 'L' ? 1 : -1;                   // +X is the patient's left
      const crosses = retina === 'nasal';
      const tract = crosses ? OTHER[eye] : eye;
      // Left eye: nasal retina sees the left (temporal) field.
      const fieldSide = (eye === 'L') === crosses ? 'left' : 'right';
      BUNDLES.push({ eye, retina, field, crosses, tract, fieldSide, s, t: tract === 'L' ? 1 : -1 });
    }
  }
}

// Key points along a bundle, with the name of the segment that *ends* there.
// Small offsets keep the 8 bundles visible as separate strands.
function bundlePoints(b) {
  const { s, t } = b;
  const lat = b.retina === 'temporal' ? 1 : -1;        // temporal retina = lateral
  const dy = b.field === 'upper' ? -1.1 : 1.1;         // upper field = lower retina
  const eo = b.eye === b.tract ? 0.7 : -0.7;           // ipsi / contra strands side by side in the tract
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const pts = [
    ['retina',  P(s * (32 + lat * 4), dy, 60)],
    ['nerve',   P(s * (26 + lat * 1.6), dy, 46)],
    ['nerve',   P(s * (16 + lat * 1.4), dy * 0.9, 32)],
    ['chiasm',  P(s * (6 + lat * 1.2), dy * 0.8, 22)],
    ['chiasm',  P(t * (6 + eo), dy * 0.8, 14)],
    ['tract',   P(t * (13 + eo), dy * 0.9 - 1, 4)],
    ['tract',   P(t * (20 + eo * 0.8), dy - 3, -8)],
    ['lgn',     P(t * 23, dy * 0.6 - 4, -14)],
  ];
  if (b.field === 'upper') {         // Meyer's loop: forward, lateral, down into the temporal lobe
    pts.push(
      ['meyer',   P(t * (33 + eo * 0.5), -13 + dy * 0.5, -4)],
      ['meyer',   P(t * (37 + eo * 0.5), -12 + dy * 0.5, -26)],
      ['meyer',   P(t * (26 + eo * 0.5), -7 + dy * 0.4, -56)],
      ['cortex',  P(t * (9 + eo * 0.4), -4.5 + dy * 0.3, -80)],
    );
  } else {                           // parietal radiation: straight back, higher up
    pts.push(
      ['parietal', P(t * (29 + eo * 0.5), 6 + dy * 0.5, -24)],
      ['parietal', P(t * (25 + eo * 0.5), 9 + dy * 0.5, -48)],
      ['parietal', P(t * (16 + eo * 0.4), 7 + dy * 0.4, -68)],
      ['cortex',   P(t * (9 + eo * 0.4), 4.5 + dy * 0.3, -80)],
    );
  }
  return pts;
}

// Labels for the "Show labels" toggle and the quiz (model-local positions).
export const PATHWAY_LABELS = [
  { name: 'Eye (left)', position: [32, 13, 70] },
  { name: 'Eye (right)', position: [-32, 13, 70] },
  { name: 'Optic nerve', position: [21, 3, 40], category: 'nerve' },
  { name: 'Optic chiasm', position: [0, 3, 18], category: 'nerve' },
  { name: 'Optic tract', position: [-17, 1, -2], category: 'nerve' },
  { name: 'Lateral geniculate nucleus', position: [23, -1, -14], category: 'nuclei' },
  { name: "Meyer's loop", position: [-37, -15, -22], category: 'nerve' },
  { name: 'Optic radiation (parietal)', position: [27, 12, -42], category: 'nerve' },
  { name: 'Cuneus (upper bank)', position: [-10, 10, -86] },
  { name: 'Lingual gyrus (lower bank)', position: [10, -10, -86] },
  { name: 'Calcarine sulcus', position: [-11, 0, -92] },
  { name: 'Occipital pole (macula)', position: [8, 0, -97] },
];

// Builds the scene. Returns the group plus a controller for lesions.
export function createVisualPathway({ CSS2DObject } = {}) {
  const group = new THREE.Group();
  group.name = 'visual-pathway';

  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...extra });

  // ── Eyes ──
  for (const s of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 32, 0, 70);
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(12, 48, 32), std('#e9e4dc')));
    const iris = new THREE.Mesh(new THREE.CircleGeometry(5, 40), std('#5b7fa6', { side: THREE.DoubleSide }));
    iris.position.z = 12.04; eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), std('#0b0c10', { side: THREE.DoubleSide }));
    pupil.position.z = 12.1; eye.add(pupil);
    group.add(eye);
  }

  // ── Visual field cones in front of each eye, one piece per quadrant ──
  // Patient's left = +X. Each piece is a quarter of an open cone.
  const fieldPieces = [];
  // ConeGeometry wraps around its +Y axis with x = sin θ, z = cos θ and its tip
  // at +Y. Rotating it -90° about X points the tip back at the eye (-Z) and
  // turns local +Z into world +Y (superior), so in θ: 0..90° = left-upper,
  // 90..180° = left-lower, 180..270° = right-lower, 270..360° = right-upper.
  const QUAD_THETA = { 'left-upper': 0, 'left-lower': Math.PI / 2, 'right-lower': Math.PI, 'right-upper': Math.PI * 1.5 };
  for (const eye of ['L', 'R']) {
    const s = eye === 'L' ? 1 : -1;
    for (const fieldSide of ['left', 'right']) {
      for (const field of ['upper', 'lower']) {
        const geo = new THREE.ConeGeometry(30, 70, 12, 1, true, QUAD_THETA[`${fieldSide}-${field}`], Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: FIELD_COLORS[fieldSide][field], transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
        const piece = new THREE.Mesh(geo, mat);
        piece.rotation.x = -Math.PI / 2;
        piece.position.set(s * 32, 0, 82 + 35);     // tip just in front of the cornea
        group.add(piece);
        fieldPieces.push({ eye, fieldSide, field, mat });
      }
    }
  }

  // ── Nuclei and cortex ──
  const lgnMat = std('#c9883a');
  for (const t of [1, -1]) {
    const lgn = new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 16), lgnMat);
    lgn.scale.set(1, 0.7, 1.3);
    lgn.position.set(t * 23, -4, -14);
    group.add(lgn);
    // Calcarine banks: cuneus above, lingual gyrus below, pole at the back.
    const cuneus = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), std('#b98fd6', { transparent: true, opacity: 0.55 }));
    cuneus.scale.set(6, 4.2, 12); cuneus.position.set(t * 10, 6.5, -86);
    const lingual = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), std('#d68fb3', { transparent: true, opacity: 0.55 }));
    lingual.scale.set(6, 4.2, 12); lingual.position.set(t * 10, -6.5, -86);
    const pole = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 16), std('#f1e6a8'));
    pole.position.set(t * 9, 0, -97);
    group.add(cuneus, lingual, pole);
  }
  const chiasm = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 9), std('#e8d870', { transparent: true, opacity: 0.25 }));
  chiasm.position.set(0, 0, 18);
  group.add(chiasm);

  // ── Fibre bundles: tubes with per-vertex colour so the part after a lesion
  //    can be greyed out ──
  const bundleMeshes = BUNDLES.map(b => {
    const pts = bundlePoints(b);
    const curve = new THREE.CatmullRomCurve3(pts.map(p => p[1]), false, 'catmullrom', 0.5);
    const tubular = 220;
    const geo = new THREE.TubeGeometry(curve, tubular, 0.75, 8, false);
    // arc-length position (0..1) where each key point sits, to find segments
    const N = 400, lengths = curve.getLengths(N), total = lengths[N];
    const keyU = pts.map((p, i) => lengths[Math.round((i / (pts.length - 1)) * N)] / total);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, std('#ffffff', { vertexColors: true }));
    mesh.userData.pathway = true;
    group.add(mesh);
    return { b, pts, keyU, geo, colors, curve, base: new THREE.Color(FIELD_COLORS[b.fieldSide][b.field]) };
  });

  // Arc position where lesion `id` cuts bundle `bm` (start of that segment).
  const SEGMENT_FOR = { 'optic-nerve': 'nerve', chiasm: 'chiasm', tract: 'tract', meyer: 'meyer', parietal: 'parietal', cortex: 'cortex', cuneus: 'cortex', lingual: 'cortex' };
  function cutU(bm, id) {
    const seg = SEGMENT_FOR[id];
    const i = bm.pts.findIndex(p => p[0] === seg);
    if (i <= 0) return 0;
    return id === 'chiasm' ? bm.keyU[i] : bm.keyU[i - 1] + (bm.keyU[i] - bm.keyU[i - 1]) * 0.5;
  }

  // ── Lesion markers (clickable) ──
  // Each sits where the bundles it cuts actually are (their average position
  // at the cut), turned across their direction like the bars in a textbook
  // diagram, and wide enough to cover them.
  const markers = [];
  const markerMat = std('#e04848', { emissive: '#5a1010' });
  const idleMat = std('#8a8fa8', { transparent: true, opacity: 0.75 });
  const _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0);
  for (const l of LESIONS) {
    for (const side of l.midline ? ['L'] : ['L', 'R']) {
      const cut = bundleMeshes.filter(bm => l.cuts(bm.b, side));
      const pos = new THREE.Vector3(), dir = new THREE.Vector3();
      cut.forEach(bm => {
        const u = cutU(bm, l.id);
        pos.add(bm.curve.getPointAt(u));
        dir.add(bm.curve.getTangentAt(u));
      });
      pos.divideScalar(cut.length);
      let spread = 0;
      cut.forEach(bm => { spread = Math.max(spread, bm.curve.getPointAt(cutU(bm, l.id)).distanceTo(pos)); });
      const across = new THREE.Vector3().crossVectors(dir.normalize(), _up);
      if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(7, spread * 2 + 4), 3.2, 2.2), idleMat);
      m.position.copy(pos);
      m.quaternion.setFromUnitVectors(_x, across.normalize());
      m.userData.lesion = { id: l.id, side: l.midline ? null : side };
      if (CSS2DObject) {
        const tag = document.createElement('div');
        tag.className = 'lesion-tag';
        tag.textContent = String(l.num);
        const label = new CSS2DObject(tag);
        label.position.set(0, 4.5, 0);
        m.add(label);
        m.userData.tag = tag;
      }
      group.add(m);
      markers.push(m);
    }
  }

  const grey = new THREE.Color(FIELD_COLORS.lost);
  let current = { id: null, side: 'R' };

  function apply() {
    const lesion = LESION_BY_ID[current.id];
    // fibres
    bundleMeshes.forEach(bm => {
      const cut = lesion && lesion.cuts(bm.b, current.side);
      const u0 = cut ? cutU(bm, current.id) : 2;
      const uv = bm.geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const c = uv.getX(i) >= u0 ? grey : bm.base;
        bm.colors[i * 3] = c.r; bm.colors[i * 3 + 1] = c.g; bm.colors[i * 3 + 2] = c.b;
      }
      bm.geo.attributes.color.needsUpdate = true;
    });
    // field cones
    const loss = fieldLoss(current.id, current.side);
    fieldPieces.forEach(p => {
      const lost = loss[p.eye][`${p.fieldSide}-${p.field}`];
      p.mat.color.set(lost ? FIELD_COLORS.lost : FIELD_COLORS[p.fieldSide][p.field]);
      p.mat.opacity = lost ? 0.08 : 0.16;
    });
    // markers: only this side's (and the chiasm); the chosen one in red
    markers.forEach(m => {
      const { id, side } = m.userData.lesion;
      const onSide = side === null || side === current.side;
      m.visible = onSide;
      if (m.userData.tag) m.userData.tag.style.display = onSide ? '' : 'none';
      const active = id === current.id && onSide;
      m.material = active ? markerMat : idleMat;
      m.scale.setScalar(active ? 1.25 : 1);
      m.userData.tag?.classList.toggle('active', active);
    });
  }

  function setLesion(id, side = current.side) {
    current = { id: id || null, side };
    apply();
  }
  apply();

  // Number tags are HTML elements; take them out of the page with the model.
  function dispose() { markers.forEach(m => m.userData.tag?.remove()); }

  return { group, markers, setLesion, dispose, get lesion() { return current; } };
}

// ── Field chart (SVG): two circles, as the patient sees them ──
// Left of each circle = left visual field. Lost quadrants are filled dark;
// with macular sparing a small central disc stays clear.
export function fieldChartSVG(loss, sparing) {
  const R = 44, gap = 26, W = R * 4 + gap + 8, H = R * 2 + 26;
  const quad = (cx, cy, q) => {
    const [h, v] = q.split('-');
    const x = h === 'left' ? -R : R, y = v === 'upper' ? -R : R;
    return `M${cx},${cy} L${cx + x},${cy} A${R},${R} 0 0 ${(h === 'left') === (v === 'upper') ? 1 : 0} ${cx},${cy + y} Z`;
  };
  const eye = (key, cx, label) => {
    const cy = R + 4;
    let s = `<g><circle cx="${cx}" cy="${cy}" r="${R}" class="vf-bg"/>`;
    for (const h of ['left', 'right']) for (const v of ['upper', 'lower']) {
      const q = `${h}-${v}`;
      s += `<path d="${quad(cx, cy, q)}" class="${loss[key][q] ? 'vf-lost' : `vf-ok vf-${h}-${v}`}"/>`;
    }
    if (sparing && Object.keys(loss[key]).length) s += `<circle cx="${cx}" cy="${cy}" r="${R * 0.2}" class="vf-spared"/>`;
    s += `<line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}" class="vf-axis"/><line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" class="vf-axis"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" class="vf-rim"/><circle cx="${cx}" cy="${cy}" r="1.8" class="vf-fix"/>`;
    s += `<text x="${cx}" y="${H - 4}" class="vf-label">${label}</text></g>`;
    return s;
  };
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Visual fields of the left and right eye">`
    + eye('L', R + 4, 'Left eye') + eye('R', R * 3 + gap + 4, 'Right eye') + '</svg>';
}
