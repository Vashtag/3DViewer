// ── Visual pathway lesions → visual field defect (data and rules) ──
// Drawn by visual-pathway-2d.js as a flat, top-down diagram.
//
// The pathway is drawn as 8 fibre bundles: each eye × nasal / temporal retina
// × upper / lower visual field. Each bundle carries exactly one quadrant of one
// eye's visual field, so a lesion is simply "the bundles it cuts", and the
// field defect and the greyed-out fibres both follow
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
