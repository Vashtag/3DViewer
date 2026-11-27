// Eye movements, cranial nerves III, IV and VI, and the pupils: the lesion
// rules behind the Eye Movements diagram (js/eye-movements-2d.js).
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
