// Eye movements, cranial nerves III, IV and VI, and the pupils: a schematic
// 3D model for teaching. Both eyes with their six extraocular muscles and the
// lid, a simplified brainstem with the III, IV and VI nuclei, their nerves,
// the MLF and the optic nerves.
//
// Pick a lesion and a gaze position: each eye's position comes from which
// muscles (and which supranuclear connections) still work, so the classic
// pictures (CN III "down and out", CN VI esotropia, CN IV hypertropia, INO,
// gaze palsy, one-and-a-half) follow from the same few rules. The penlight
// shows direct and consensual pupil reflexes, a fixed dilated pupil, Horner's
// small pupil, and a relative afferent pupillary defect (swinging light).
//
// Coordinates: millimetre-ish units. +X = patient's left, +Y = superior,
// +Z = anterior. Eyes look along +Z.

import * as THREE from 'three';

const OTHER = { L: 'R', R: 'L' };
const SIDE_WORD = { L: 'left', R: 'right' };
const SIGN = { L: 1, R: -1 }; // patient's left is +X
const cap = s => s[0].toUpperCase() + s.slice(1);

export const NERVE_COLORS = { III: '#e0954a', IV: '#a77be0', VI: '#3fb6b0', II: '#e8d870', MLF: '#7aa7ff', off: '#4a4f63' };

// Muscle → nerve.
const MUSCLE_NERVE = { MR: 'III', SR: 'III', IR: 'III', IO: 'III', LPS: 'III', SO: 'IV', LR: 'VI' };

// ── Lesions ──
// apply(state, s): switch off what the lesion on side s damages.
export const OCULAR_LESIONS = [
  { id: 'cn3', num: 1, name: 'Oculomotor nerve (CN III)',
    apply: (st, s) => { ['MR', 'SR', 'IR', 'IO', 'LPS'].forEach(m => { st.muscle[s][m] = 0; }); st.pupilEff[s] = 0; st.nerve[s].III = 0; },
    defect: s => `${cap(SIDE_WORD[s])} eye down and out, ptosis, fixed dilated pupil`,
    note: s => `CN III supplies MR, SR, IR, IO and the lid elevator, and carries the fibres that constrict the pupil. Only LR (CN VI) and SO (CN IV) still pull, so the ${SIDE_WORD[s]} eye rests down and out under a drooping lid. A painful CN III palsy with a dilated pupil suggests a posterior communicating artery aneurysm.` },
  { id: 'cn3-spare', num: 2, name: 'CN III, pupil-sparing',
    apply: (st, s) => { ['MR', 'SR', 'IR', 'IO', 'LPS'].forEach(m => { st.muscle[s][m] = 0; }); st.nerve[s].III = 0.5; },
    defect: s => `${cap(SIDE_WORD[s])} eye down and out with ptosis, pupil normal`,
    note: () => 'The pupil fibres run on the outside of the nerve, where they keep their blood supply when the core of the nerve is starved (diabetes, hypertension). The eye movements are lost but the pupil still reacts. Compression from outside (an aneurysm) hits the pupil fibres first.' },
  { id: 'cn4', num: 3, name: 'Trochlear nerve (CN IV)',
    apply: (st, s) => { st.muscle[s].SO = 0; st.nerve[s].IV = 0; },
    defect: s => `${cap(SIDE_WORD[s])} hypertropia, worst looking down and to the ${SIDE_WORD[OTHER[s]]}`,
    note: s => `SO pulls the eye down when it is turned in. Without it the ${SIDE_WORD[s]} eye rides up, most when looking down and in (reading, going down stairs), and patients tilt the head away from it. The CN IV nucleus serves the opposite eye: the nerve leaves the back of the midbrain and crosses over.` },
  { id: 'cn6', num: 4, name: 'Abducens nerve (CN VI)',
    apply: (st, s) => { st.muscle[s].LR = 0; st.nerve[s].VI = 0; },
    defect: s => `${cap(SIDE_WORD[s])} eye cannot abduct; turns in, worst looking ${SIDE_WORD[s]}`,
    note: s => `LR alone turns the eye out. The ${SIDE_WORD[s]} eye drifts in and the double vision is side by side, worst looking to the ${SIDE_WORD[s]}. Its long course up the clivus makes CN VI palsy a false localising sign of raised intracranial pressure.` },
  { id: 'mlf', num: 5, name: 'MLF (internuclear ophthalmoplegia)',
    apply: (st, s) => { st.mlf[s] = 0; },
    defect: s => `${cap(SIDE_WORD[s])} internuclear ophthalmoplegia (INO)`,
    note: s => `The MLF carries the signal from the opposite abducens nucleus up to the ${SIDE_WORD[s]} CN III nucleus. Looking ${SIDE_WORD[OTHER[s]]}, the ${SIDE_WORD[s]} eye fails to turn in and the ${SIDE_WORD[OTHER[s]]} eye overshoots with nystagmus. Convergence still works (try Near): the muscle and nerve are fine. Bilateral INO in a young adult suggests multiple sclerosis.` },
  { id: 'abd-nuc', num: 6, name: 'Abducens nucleus (gaze palsy)',
    apply: (st, s) => { st.abdNuc[s] = 0; },
    defect: s => `Horizontal gaze palsy to the ${SIDE_WORD[s]}`,
    note: s => `The abducens nucleus is the horizontal gaze centre: it holds the LR motor neurons and the interneurons that drive the opposite MR through the MLF. Neither eye can look to the ${SIDE_WORD[s]}. A ${SIDE_WORD[s]} facial palsy often comes with it, as CN VII fibres loop around this nucleus.` },
  { id: 'one-half', num: 7, name: 'One-and-a-half syndrome',
    apply: (st, s) => { st.abdNuc[s] = 0; st.mlf[s] = 0; },
    defect: s => `Gaze palsy to the ${SIDE_WORD[s]} plus ${SIDE_WORD[s]} INO`,
    note: s => `Abducens nucleus and MLF on the same side. The ${SIDE_WORD[s]} eye cannot move sideways at all ("one and a half"), and the ${SIDE_WORD[OTHER[s]]} eye can only turn out, with nystagmus. Convergence may be spared.` },
  { id: 'horner', num: 8, name: 'Sympathetic pathway (Horner)', noMarker: true,
    apply: (st, s) => { st.symp[s] = 0; },
    defect: s => `${cap(SIDE_WORD[s])} Horner syndrome: mild ptosis, small pupil`,
    note: s => `Sympathetic fibres widen the pupil and lift the lid a little (superior tarsal muscle). The ${SIDE_WORD[s]} pupil is small but still reacts to light; the difference shows most in the dark. Eye movements are normal. Anhidrosis may go with it.` },
  { id: 'cn2', num: 9, name: 'Optic nerve (CN II)',
    apply: (st, s) => { st.afferent[s] = 0.3; st.nerve[s].II = 0; },
    defect: s => `${cap(SIDE_WORD[s])} relative afferent pupillary defect (RAPD)`,
    note: s => `Light in the ${SIDE_WORD[s]} eye is sensed weakly, so both pupils constrict less. Swing the light: as it reaches the ${SIDE_WORD[s]} eye, both pupils dilate (Marcus Gunn pupil). Each pupil's own nerve (CN III) is fine, so the two stay equal in size. Eye movements are normal.` },
];
export const OCULAR_BY_ID = Object.fromEntries(OCULAR_LESIONS.map(l => [l.id, l]));

function freshState() {
  const muscles = () => ({ MR: 1, LR: 1, SR: 1, IR: 1, SO: 1, IO: 1, LPS: 1 });
  const nerves = () => ({ II: 1, III: 1, IV: 1, VI: 1 });
  return {
    muscle: { L: muscles(), R: muscles() },
    nerve: { L: nerves(), R: nerves() },
    mlf: { L: 1, R: 1 },      // MLF that ends at the L / R CN III nucleus
    abdNuc: { L: 1, R: 1 },
    pupilEff: { L: 1, R: 1 }, // parasympathetic (CN III) to the pupil
    symp: { L: 1, R: 1 },
    afferent: { L: 1, R: 1 }, // how well each eye senses light (CN II)
  };
}
export function lesionState(id, side) {
  const st = freshState();
  OCULAR_BY_ID[id]?.apply(st, side);
  return st;
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Where one eye points. gaze: { h, v, near } with h + = patient's left,
// v + = up, both -1..1. Returns { ab, h, v } in the same units (ab = abduction).
export function eyePose(st, eye, gaze) {
  const m = st.muscle[eye];
  const s = SIGN[eye];
  const other = OTHER[eye];
  const near = !!gaze.near;
  const wantAb = near ? -0.5 : gaze.h * s;
  const wantV = near ? -0.15 : gaze.v;
  // Horizontal: LR needs its own nucleus; MR in a conjugate movement needs the
  // MLF and the opposite abducens nucleus (convergence bypasses both).
  const abdCap = m.LR * st.abdNuc[eye];
  const addCap = m.MR * (near ? 1 : st.mlf[eye] * st.abdNuc[other]);
  // Resting pull of the muscles that still work (nerve and muscle lesions only).
  const driftAb = 0.45 * (m.LR - m.MR);
  const ab = clamp(wantAb + driftAb, -addCap, abdCap);
  // Vertical: SR elevates best abducted, IO best adducted; IR depresses best
  // abducted, SO best adducted.
  const t = (ab + 1) / 2;
  const upCap = lerp(m.IO, m.SR, t);
  const downCap = lerp(m.SO, m.IR, t);
  const driftV = 0.35 * ((m.SR + m.IO) / 2 - (m.IR + m.SO) / 2);
  const v = clamp(wantV + driftV, -downCap, upCap);
  return { ab, h: ab * s, v };
}

// Lid opening (0 closed .. 1 normal) and pupil diameter in mm.
export function lidOpening(st, eye) {
  return clamp(lerp(0.05, 1, st.muscle[eye].LPS) - (st.symp[eye] ? 0 : 0.25), 0, 1);
}
export function pupilSize(st, eye, lit) {
  // Light drive reaches both pupils equally (both Edinger-Westphal nuclei).
  const drive = lit ? st.afferent[lit] : 0;
  let d = 5.5 - 3 * drive;
  if (!st.pupilEff[eye]) return 6.8;          // fixed and dilated
  if (!st.symp[eye]) d = 2 + (d - 2.5) * 0.35; // small, still reacts
  return d;
}

const MAX_H = THREE.MathUtils.degToRad(38);
const MAX_V = THREE.MathUtils.degToRad(30);
const EYE_X = 32, EYE_R = 12;
const IRIS_R = 5;

export const OCULAR_LABELS = [
  { name: 'Eye (left)', position: [EYE_X, 15, 4] },
  { name: 'Eye (right)', position: [-EYE_X, 15, 4] },
  { name: 'Medial rectus', position: [EYE_X - 13, 0, -6], category: 'muscle' },
  { name: 'Lateral rectus', position: [EYE_X + 13, 0, -6], category: 'muscle' },
  { name: 'Superior rectus', position: [EYE_X + 2, 13, -8], category: 'muscle' },
  { name: 'Inferior rectus', position: [EYE_X, -13, -8], category: 'muscle' },
  { name: 'Superior oblique', position: [EYE_X - 9, 12, -16], category: 'muscle' },
  { name: 'Inferior oblique', position: [EYE_X - 2, -11, 2], category: 'muscle' },
  { name: 'Trochlea', position: [EYE_X - 11, 13, 9] },
  { name: 'Oculomotor nerve (CN III)', position: [12, 3, -55], category: 'nerve' },
  { name: 'Trochlear nerve (CN IV)', position: [-14, 8, -66], category: 'nerve' },
  { name: 'Abducens nerve (CN VI)', position: [8, -10, -52], category: 'nerve' },
  { name: 'Optic nerve (CN II)', position: [EYE_X - 6, 0, -20], category: 'nerve' },
  { name: 'Oculomotor nucleus', position: [2.5, 9, -80], category: 'nuclei' },
  { name: 'Abducens nucleus', position: [3, -6, -82], category: 'nuclei' },
  { name: 'Medial longitudinal fasciculus', position: [-1.5, 2, -82], category: 'nerve' },
];

export function createEyeMovements({ CSS2DObject } = {}) {
  const group = new THREE.Group();
  group.name = 'eye-movements';
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...extra });
  const tube = (pts, r, mat, seg = 64) => new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.5), seg, r, 8, false), mat);

  // ── Eyes, lids ──
  const eyes = {};
  for (const e of ['L', 'R']) {
    const s = SIGN[e];
    const socket = new THREE.Group();
    socket.position.set(s * EYE_X, 0, 0);
    const ball = new THREE.Group();
    ball.rotation.order = 'YXZ';
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 48, 32), std('#ece7df')));
    const iris = new THREE.Mesh(new THREE.CircleGeometry(IRIS_R, 40), std('#5b7fa6', { side: THREE.DoubleSide }));
    iris.position.z = EYE_R + 0.04; // just in front of the sclera
    ball.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(1, 32), std('#07080b', { side: THREE.DoubleSide }));
    pupil.position.z = EYE_R + 0.1;
    ball.add(pupil);
    socket.add(ball);
    // Lids: front halves of slightly larger spheres; the upper one rotates
    // about X to open and close.
    const skin = std('#c99a86', { side: THREE.DoubleSide });
    const upper = new THREE.Mesh(new THREE.SphereGeometry(EYE_R + 1.6, 40, 16, Math.PI * 0.2, Math.PI * 0.6, 0, Math.PI / 2), skin);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(EYE_R + 1.5, 40, 16, Math.PI * 0.2, Math.PI * 0.6, Math.PI / 2, Math.PI / 2), skin);
    upper.rotation.order = lower.rotation.order = 'XYZ';
    lower.rotation.x = 0.5;
    socket.add(upper, lower);
    group.add(socket);
    eyes[e] = { socket, ball, pupil, upper, lower, pose: { h: 0, v: 0 }, pupilD: 4, lid: 1 };
  }

  // ── Brainstem with nuclei ──
  const stem = new THREE.Mesh(new THREE.CapsuleGeometry(7, 26, 8, 24), std('#9aa3b8', { transparent: true, opacity: 0.18, depthWrite: false }));
  stem.position.set(0, 0, -82);
  group.add(stem);
  const nucleus = (pos, color) => { const n = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), std(color)); n.position.set(...pos); group.add(n); return n; };
  const NUC = {};
  for (const e of ['L', 'R']) {
    const s = SIGN[e];
    NUC[e] = {
      III: [s * 2.2, 9, -80], IV: [s * 2.2, 5, -82], VI: [s * 2.8, -6, -82],
    };
    nucleus(NUC[e].III, NERVE_COLORS.III);
    nucleus(NUC[e].IV, NERVE_COLORS.IV);
    nucleus(NUC[e].VI, NERVE_COLORS.VI);
  }

  // ── Nerves (tubes; greyed when cut) ──
  const nerves = []; // { mesh, key: [side, nerve], base }
  const addNerve = (side, key, pts, color, r = 0.7) => {
    const mat = std(color);
    const mesh = tube(pts, r, mat);
    group.add(mesh);
    nerves.push({ mesh, side, key, color });
    return mesh;
  };
  const apex = e => [SIGN[e] * 20, 0, -26];
  for (const e of ['L', 'R']) {
    const s = SIGN[e];
    const [ax, ay, az] = apex(e);
    // CN III: front of the midbrain, forward to the orbit, branches to its muscles.
    addNerve(e, 'III', [NUC[e].III, [s * 4, 6, -70], [s * 10, 3, -50], [ax, ay + 2, az]], NERVE_COLORS.III);
    // CN VI: from the pons, up the clivus to the orbit.
    addNerve(e, 'VI', [NUC[e].VI, [s * 4, -9, -74], [s * 8, -9, -55], [s * 14, -4, -38], [ax + s * 2, ay - 1, az]], NERVE_COLORS.VI);
    // CN IV to eye e starts at the OPPOSITE nucleus, exits the back and crosses.
    const o = SIGN[OTHER[e]];
    addNerve(e, 'IV', [NUC[OTHER[e]].IV, [o * 2, 6, -88], [s * 3, 7, -91], [s * 12, 7, -82], [s * 15, 6, -60], [s * 16, 5, -40], [ax - s * 1, ay + 4, az]], NERVE_COLORS.IV, 0.5);
    // Optic nerve: back of the eye to the chiasm.
    addNerve(e, 'II', [[s * EYE_X, 0, -EYE_R + 0.5], [s * 24, 0, -24], [s * 8, 0, -40], [0, 0, -44]], NERVE_COLORS.II, 0.9);
    // MLF ending at the e-side CN III nucleus starts at the opposite VI nucleus.
    addNerve(e, 'MLF', [NUC[OTHER[e]].VI, [0.4 * o, -3, -82], [s * 1, 2, -81], NUC[e].III], NERVE_COLORS.MLF, 0.45);
  }
  // Chiasm stub so the optic nerves have somewhere to go.
  const chiasm = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 5), std(NERVE_COLORS.II, { transparent: true, opacity: 0.4 }));
  chiasm.position.set(0, 0, -45);
  group.add(chiasm);

  // ── Extraocular muscles: cylinders from origin (or trochlea) to the
  //    insertion, which moves with the eye ──
  const muscles = []; // { eye, name, from: Vector3 (group space), ins: local Vector3, mesh, base }
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false);
  for (const e of ['L', 'R']) {
    const s = SIGN[e];
    const [ax, ay, az] = apex(e);
    const ex = s * EYE_X;
    const add = (name, from, ins, r) => {
      const color = NERVE_COLORS[MUSCLE_NERVE[name]];
      const mesh = new THREE.Mesh(unitCyl, std(color));
      mesh.userData.radius = r;
      group.add(mesh);
      muscles.push({ eye: e, name, from: new THREE.Vector3(...from), ins: new THREE.Vector3(...ins), mesh, color });
    };
    add('MR', [ax - s * 2, ay, az], [-s * 10.2, 0, 5.5], 1.5);
    add('LR', [ax + s * 2, ay, az], [s * 10.2, 0, 5.5], 1.5);
    add('SR', [ax, ay + 2.5, az], [0, 10.2, 5.5], 1.5);
    add('IR', [ax, ay - 2.5, az], [0, -10.2, 5.5], 1.5);
    // SO: apex to the trochlea, then back out to the top of the eye behind its
    // equator. The first part is fixed; the tendon moves with the eye.
    const troch = [ex - s * 11, 13, 9];
    const so1 = new THREE.Mesh(unitCyl, std(NERVE_COLORS.IV));
    so1.userData.radius = 1.1;
    group.add(so1);
    placeCyl(so1, new THREE.Vector3(ax - s * 1.5, ay + 3.5, az), new THREE.Vector3(...troch));
    muscles.push({ eye: e, name: 'SO-belly', fixed: so1, color: NERVE_COLORS.IV });
    add('SO', troch, [s * 3, 9.5, -5], 0.6);
    // IO: from the floor of the orbit at the front, under the eye, to the
    // back of its outer side.
    add('IO', [ex - s * 10, -13, 6], [s * 7, -8, -5], 1.2);
    // Lid elevator (levator palpebrae superioris), above SR, to the lid.
    add('LPS', [ax, ay + 4.5, az], [0, 0, 0], 0.9);
    const trochlea = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.45, 8, 20), std('#d8d2c4'));
    trochlea.position.set(...troch);
    trochlea.rotation.y = Math.PI / 2;
    group.add(trochlea);
  }

  function placeCyl(mesh, a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const r = mesh.userData.radius;
    mesh.scale.set(r, len, r);
  }

  // ── Lesion markers (clickable) ──
  const markers = [];
  const markerMat = std('#e04848', { emissive: '#5a1010' });
  const idleMat = std('#8a8fa8', { transparent: true, opacity: 0.8 });
  const nerveMesh = (side, key) => nerves.find(n => n.side === side && n.key === key).mesh;
  const pointOn = (mesh, u) => mesh.geometry.parameters.path.getPointAt(u);
  const MARKER_AT = {
    cn3: s => pointOn(nerveMesh(s, 'III'), 0.55),
    cn4: s => pointOn(nerveMesh(s, 'IV'), 0.62),
    cn6: s => pointOn(nerveMesh(s, 'VI'), 0.55),
    mlf: s => pointOn(nerveMesh(s, 'MLF'), 0.62),
    'abd-nuc': s => new THREE.Vector3(...NUC[s].VI),
    cn2: s => pointOn(nerveMesh(s, 'II'), 0.35),
  };
  for (const l of OCULAR_LESIONS) {
    const at = MARKER_AT[l.id];
    if (!at) continue;
    for (const side of ['L', 'R']) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(2, 18, 12), idleMat);
      m.position.copy(at(side));
      m.userData.lesion = { id: l.id, side };
      if (CSS2DObject) {
        const tag = document.createElement('div');
        tag.className = 'lesion-tag';
        tag.textContent = String(l.num);
        const label = new CSS2DObject(tag);
        label.position.set(0, 3.6, 0);
        m.add(label);
        m.userData.tag = tag;
      }
      group.add(m);
      markers.push(m);
    }
  }

  // ── Penlight ──
  const light = new THREE.Group();
  const torch = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 12, 16), std('#3b3f4f'));
  torch.rotation.x = Math.PI / 2;
  torch.position.z = 6;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff3a8' }));
  const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 20, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3a8', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  beam.rotation.x = Math.PI / 2; // tip at the bulb, opening toward the eye
  beam.position.z = -10;
  light.add(torch, bulb, beam);
  light.visible = false;
  group.add(light);

  const grey = new THREE.Color(NERVE_COLORS.off);
  let state = freshState();
  let current = { id: null, side: 'R' };
  let gaze = { h: 0, v: 0, near: false };
  let lightMode = 'off'; // off | L | R | swing
  let swingT = 0, lit = null, clock = 0;

  function apply() {
    state = lesionState(current.id, current.side);
    // Nerves: grey from the lesion onward (whole nerve, kept simple).
    nerves.forEach(n => {
      let ok = 1;
      if (n.key === 'MLF') ok = state.mlf[n.side];
      else ok = state.nerve[n.side][n.key] ?? 1;
      n.mesh.material.color.set(ok >= 1 ? n.color : ok > 0 ? n.color : NERVE_COLORS.off);
      if (ok > 0 && ok < 1) n.mesh.material.color.lerp(grey, 0.45);
    });
    muscles.forEach(mu => {
      const nm = mu.name === 'SO-belly' ? 'SO' : mu.name;
      const ok = state.muscle[mu.eye][nm];
      (mu.fixed || mu.mesh).material.color.set(ok ? mu.color : NERVE_COLORS.off);
    });
    markers.forEach(m => {
      const { id, side } = m.userData.lesion;
      const active = id === current.id && side === current.side
        || (current.id === 'one-half' && side === current.side && (id === 'abd-nuc' || id === 'mlf'))
        || (current.id === 'cn3-spare' && id === 'cn3' && side === current.side);
      m.material = active ? markerMat : idleMat;
      m.scale.setScalar(active ? 1.3 : 1);
      m.userData.tag?.classList.toggle('active', active);
    });
  }

  function setLesion(id, side = current.side) { current = { id: id || null, side }; apply(); }
  function setGaze(g) { gaze = { h: g.h ?? 0, v: g.v ?? 0, near: !!g.near }; }
  function setLight(mode) { lightMode = mode; swingT = 0; }

  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  // Called every frame: eyes, lids and pupils move toward their targets.
  function update(dt) {
    clock += dt;
    // Which eye the light is in.
    if (lightMode === 'swing') {
      swingT += dt;
      lit = Math.floor(swingT / 2.2) % 2 === 0 ? 'R' : 'L';
    } else lit = lightMode === 'L' || lightMode === 'R' ? lightMode : null;
    light.visible = !!lit;
    if (lit) {
      const target = new THREE.Vector3(SIGN[lit] * EYE_X, 4, 34);
      light.position.lerp(target, lightMode === 'swing' ? Math.min(1, dt * 9) : 1);
      light.lookAt(SIGN[lit] * EYE_X, 0, 0);
      light.rotateY(Math.PI); // the torch's front (bulb end) faces the eye
    }

    const k = 1 - Math.exp(-dt * 9);
    for (const e of ['L', 'R']) {
      const E = eyes[e];
      const p = eyePose(state, e, gaze);
      let h = p.h;
      // INO: the abducting eye on the other side beats outward (jerk nystagmus).
      const ino = !gaze.near && state.mlf[OTHER[e]] === 0 && p.ab > 0.55;
      if (ino) h += SIGN[e] * -0.09 * ((clock * 2.6) % 1) + SIGN[e] * 0.05;
      E.pose.h = ino ? h : lerp(E.pose.h, h, k);
      E.pose.v = lerp(E.pose.v, p.v, k);
      E.ball.rotation.y = E.pose.h * MAX_H;
      E.ball.rotation.x = -E.pose.v * MAX_V;
      // Lid: open amount, and it follows the eye up and down.
      const open = lidOpening(state, e);
      E.lid = lerp(E.lid, open, k);
      E.upper.rotation.x = 0.36 - 0.78 * E.lid - 0.75 * E.pose.v * MAX_V;
      E.lower.rotation.x = 0.5 - 0.25 * E.pose.v * MAX_V;
      // Pupil: constricts fast, dilates slowly.
      const want = pupilSize(state, e, lit);
      E.pupilD = lerp(E.pupilD, want, 1 - Math.exp(-dt * (want < E.pupilD ? 7 : 1.6)));
      E.pupil.scale.setScalar((E.pupilD / 2) * (IRIS_R / 6));
      E.ball.updateMatrix();
    }
    // Muscles follow the eyes.
    for (const mu of muscles) {
      if (mu.fixed) continue;
      const E = eyes[mu.eye];
      if (mu.name === 'LPS') {
        // to the upper lid, above the cornea; drops with a drooping lid
        _b.set(E.socket.position.x, E.socket.position.y + 14 - 2 * (1 - E.lid), 3);
      } else {
        _b.copy(mu.ins).applyEuler(E.ball.rotation).add(E.socket.position);
      }
      _a.copy(mu.from);
      placeCyl(mu.mesh, _a, _b);
    }
  }

  apply();
  update(1);

  function dispose() { markers.forEach(m => m.userData.tag?.remove()); }

  return {
    group, markers, setLesion, setGaze, setLight, update, dispose,
    get lesion() { return current; }, get gaze() { return gaze; }, get light() { return lightMode; },
    get state() { return state; },
  };
}

// ── Nine-gaze chart (SVG): both eyes in each gaze position, as the examiner
//    sees the patient (the patient's left eye on the right). The middle cell
//    is the primary position. ──
export const GAZES = [
  { h: -1, v: 1 }, { h: 0, v: 1 }, { h: 1, v: 1 },
  { h: -1, v: 0 }, { h: 0, v: 0 }, { h: 1, v: 0 },
  { h: -1, v: -1 }, { h: 0, v: -1 }, { h: 1, v: -1 },
];
// Screen right = patient's left (+h), as in the 3D front view.
export function gazeCellSVG(st, gaze, { lit = null } = {}) {
  const parts = [];
  for (const e of ['R', 'L']) { // examiner's view: patient's right eye on the left
    const cx = e === 'R' ? 22 : 58, cy = 20;
    const p = eyePose(st, e, gaze);
    const ix = cx + p.h * 9, iy = cy - p.v * 6;
    const pr = (pupilSize(st, e, lit) / 2) * 0.95;
    const open = lidOpening(st, e);
    const lidY = cy - 9 + (1 - open) * 11 - p.v * 3; // upper lid edge
    const id = `c${Math.random().toString(36).slice(2, 8)}`;
    parts.push(`<clipPath id="${id}"><ellipse cx="${cx}" cy="${cy}" rx="15" ry="9"/></clipPath>`,
      `<ellipse cx="${cx}" cy="${cy}" rx="15" ry="9" class="eom-sclera"/>`,
      `<g clip-path="url(#${id})"><circle cx="${ix}" cy="${iy}" r="6" class="eom-iris"/><circle cx="${ix}" cy="${iy}" r="${pr.toFixed(2)}" class="eom-pupil"/>`,
      `<rect x="${cx - 16}" y="${cy - 12}" width="32" height="${Math.max(0, lidY - (cy - 12)).toFixed(2)}" class="eom-lid"/></g>`,
      `<ellipse cx="${cx}" cy="${cy}" rx="15" ry="9" class="eom-rim"/>`);
  }
  return `<svg viewBox="0 0 80 40" aria-hidden="true">${parts.join('')}</svg>`;
}
