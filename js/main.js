import * as THREE from 'three';
import { GLTFLoader } from './GLTFLoader.js';
import { DRACOLoader } from './DRACOLoader.js';
import { OrbitControls } from './OrbitControls.js';
import { PointerLockControls } from './PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject } from './CSS2DRenderer.js';
import { scormModelOpened, scormReportInteraction, scormReportScore } from './scorm.js';
import { createVisualPathway, LESIONS, LESION_BY_ID, fieldLoss, fieldChartSVG, PATHWAY_LABELS } from './visual-pathway.js';

// ── DOM refs ──────────────────────────────────────────────
const canvas          = document.getElementById('viewer-canvas');
const container       = document.getElementById('viewer-container');
const loadingOverlay  = document.getElementById('loading-overlay');
const loadingText     = document.getElementById('loading-text');
const progressFill    = document.getElementById('progress-bar-fill');
const viewerToolbar   = document.getElementById('viewer-toolbar');
const resetBtn        = document.getElementById('reset-btn');
const screenshotBtn   = document.getElementById('screenshot-btn');
const gizmoCanvas     = document.getElementById('gizmo-canvas');
const bottomBar       = document.getElementById('bottom-bar');
const controlsHint    = document.getElementById('controls-hint');
const emptyState      = document.getElementById('empty-state');
const displayControls = document.getElementById('display-controls');
const regionSelector  = document.getElementById('region-selector');
const bgSwatches      = document.querySelectorAll('.bg-swatch');
const viewButtons     = document.getElementById('view-buttons');
const navBtns         = document.querySelectorAll('.nav-btn');
const labelsSection    = document.getElementById('labels-section');
const labelsToggle     = document.getElementById('labels-toggle');
const categoryFilters  = document.getElementById('category-filters');
const labelModal       = document.getElementById('label-modal');
const labelModalName   = document.getElementById('label-modal-name');
const labelModalConfirm = document.getElementById('label-modal-confirm');
const labelModalCancel = document.getElementById('label-modal-cancel');
const editSection     = document.getElementById('edit-section');
const labelPlaceBtn   = document.getElementById('label-place-btn');
const editDownload    = document.getElementById('edit-download');
const lineDrawBtn     = document.getElementById('line-draw-btn');
const lineFinishBtn   = document.getElementById('line-finish-btn');
const pinBtn          = document.getElementById('pin-btn');
const orientSave      = document.getElementById('orient-save');
const orientDownload  = document.getElementById('orient-download');
const orientViewRow   = document.getElementById('orient-view-row');
const orientViewSel   = document.getElementById('orient-view-select');
const mobileMenuBtn   = document.getElementById('mobile-menu-btn');
const sidebarEl       = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const bodyEl              = document.getElementById('body');
const sidebarCollapseBtn  = document.getElementById('sidebar-collapse-btn');
const sidebarOpenBtn      = document.getElementById('sidebar-open-btn');
const loadingPoster   = document.getElementById('loading-poster');
const modeBanner      = document.getElementById('mode-banner');
const modeBannerText  = document.getElementById('mode-banner-text');
const modeBannerDone  = document.getElementById('mode-banner-done');
const drawTools       = document.getElementById('draw-tools');
const drawBtn         = document.getElementById('draw-btn');
const drawCanvas      = document.getElementById('draw-canvas');
const drawCtx         = drawCanvas.getContext('2d');
const toastEl         = document.getElementById('toast');
const srStatus        = document.getElementById('sr-status');

// Draw mode state. Declared up here because resize() (run at startup) redraws it.
let drawMode    = false;
let drawStrokes = [];       // [{ color, w, pts: [[x, y], …] }] in CSS px
let _drawing    = null;     // the stroke being drawn right now
let drawColor   = '#ffd23f';

// Single-key shortcuts (R, L, Q, E, ?) can be switched off in Settings
// (WCAG 2.1.4). Arrow keys and +/- only act while the 3D canvas has focus.
let singleKeyShortcuts = localStorage.getItem('singleKeys') !== '0';

// ── Mobile drawer ─────────────────────────────────────────
function openDrawer()  {
  sidebarEl.classList.add('open');
  sidebarBackdrop.classList.add('visible');
  mobileMenuBtn.setAttribute('aria-expanded', 'true');
}
function closeDrawer() {
  sidebarEl.classList.remove('open');
  sidebarBackdrop.classList.remove('visible');
  mobileMenuBtn.setAttribute('aria-expanded', 'false');
}
mobileMenuBtn.addEventListener('click', () =>
  sidebarEl.classList.contains('open') ? closeDrawer() : openDrawer()
);
sidebarBackdrop.addEventListener('click', closeDrawer);

// ── Sidebar collapse (desktop) ────────────────────────────
// Hide the whole sidebar to give the model more room; a floating button on the
// viewer brings it back. The choice sticks across sessions. The viewer's
// ResizeObserver re-fits the canvas automatically when the column width changes.
function setSidebarCollapsed(collapsed) {
  bodyEl.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
}
sidebarCollapseBtn.addEventListener('click', () => setSidebarCollapsed(true));
sidebarOpenBtn.addEventListener('click', () => setSidebarCollapsed(false));
if (localStorage.getItem('sidebarCollapsed') === '1') setSidebarCollapsed(true);

// ── Settings modal (top-right gear) ───────────────────────
const settingsBtn        = document.getElementById('settings-btn');
const settingsModal      = document.getElementById('settings-modal');
const settingsModalBox   = document.getElementById('settings-modal-box');
const settingsModalClose = document.getElementById('settings-modal-close');
const colorblindToggle    = document.getElementById('colorblind-toggle');
const autorotateToggle    = document.getElementById('autorotate-toggle');

let _settingsLastFocus = null;
function openSettings() {
  _settingsLastFocus = document.activeElement;
  settingsModal.classList.remove('hidden');
  settingsModalClose.focus();
}
function closeSettings() {
  settingsModal.classList.add('hidden');
  // Return focus to whatever opened the modal (usually the gear button).
  if (_settingsLastFocus && document.contains(_settingsLastFocus)) _settingsLastFocus.focus();
}
function settingsOpen() { return !settingsModal.classList.contains('hidden'); }

settingsBtn.addEventListener('click', openSettings);
settingsModalClose.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', e => {
  if (e.target === settingsModal) closeSettings();
});
// Esc closes; Tab is trapped inside the dialog while it's open.
settingsModal.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.stopPropagation(); closeSettings(); return; }
  if (e.key !== 'Tab') return;
  const focusable = settingsModalBox.querySelectorAll(
    'button, input, [href], select, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
// Colour-blind toggle behaviour is wired up further down, once the
// category colour schemes are defined.

// ── Keyboard shortcuts sheet ("?" or the header button) ───
const shortcutsBtn        = document.getElementById('shortcuts-btn');
const shortcutsModal      = document.getElementById('shortcuts-modal');
const shortcutsModalClose = document.getElementById('shortcuts-modal-close');
const shortcutNote        = document.getElementById('shortcut-note');

let _shortcutsLastFocus = null;
function openShortcuts() {
  _shortcutsLastFocus = document.activeElement;
  shortcutNote.textContent = singleKeyShortcuts
    ? 'Single-key shortcuts can be turned off in Settings.'
    : 'Single-key shortcuts are off. Turn them back on in Settings.';
  shortcutsModal.classList.remove('hidden');
  shortcutsModalClose.focus();
}
function closeShortcuts() {
  shortcutsModal.classList.add('hidden');
  if (_shortcutsLastFocus && document.contains(_shortcutsLastFocus)) _shortcutsLastFocus.focus();
}
function shortcutsOpen() { return !shortcutsModal.classList.contains('hidden'); }

shortcutsBtn.addEventListener('click', openShortcuts);
shortcutsModalClose.addEventListener('click', closeShortcuts);
shortcutsModal.addEventListener('click', e => { if (e.target === shortcutsModal) closeShortcuts(); });
shortcutsModal.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopPropagation(); closeShortcuts(); return; }
  if (e.key === 'Tab') { e.preventDefault(); shortcutsModalClose.focus(); } // only one control inside
});

// ── Model catalogue ───────────────────────────────────────
// To add a model: convert your OBJ to a Draco GLB (see tools/README.md),
// drop it in models/<id>/<id>.glb, then add one entry here.
//   rotation: (degrees, [x,y,z]) orients the scan so its anatomical anterior
//             faces +Z — i.e. so the default "Anterior" view looks correct.
//   views:    the shortcut buttons under the gizmo — { label, dir } where dir
//             is the camera direction (front/back/left/right/top/bottom).
//             Omit to use DEFAULT_VIEWS.
//   category: optional group name (e.g. "Central Nervous System") — models
//             sharing a category are nested under one expandable region
//             group instead of listed as a top-level region button.
//   devFeature: optional developer-feature id; the model is only listed while
//             that feature is switched on (Settings > Developer).
//   slicer:   true to offer the Cross-section panel for this model.
//   noFly:    true to hide the Orbit / Fly switch (orbit only).
//   sliceByDefault: true to open the model already sliced (needs slicer).
//   sections: optional <id>_regions.json with region names and a voxel
//             volume used to colour the cut face by region (see the brain).
//   build:    optional function returning a THREE.Object3D, for models made
//             in code instead of loaded from `file`.
//   labels / savedViews: optional inline versions of <id>_labels.json and
//             <id>_view.json (used instead of fetching them).
//   pathway:  true for the visual pathway (shows the lesion panel).
//   credit:   optional source/licence line shown in the viewer's corner while
//             the model is open: [{ text, href? }, …].
const DEFAULT_VIEWS = [
  { label: 'Anterior',  dir: 'front' },
  { label: 'Posterior', dir: 'back'  },
  { label: 'Left',      dir: 'left'  },
  { label: 'Right',     dir: 'right' },
];

const MODELS = [
  {
    id: 'shoulder', label: 'Shoulder', file: 'models/shoulder/shoulder.glb',
    rotation: [0, 90, 0],
    views: [
      { label: 'Anterior',  dir: 'front' },
      { label: 'Posterior', dir: 'back'  },
      { label: 'Lateral',   dir: 'left'  },
      { label: 'Medial',    dir: 'right' },
    ],
  },
  {
    id: 'pelvis', label: 'Pelvis', file: 'models/pelvis/pelvis.glb',
    rotation: [0, 0, 6], // level out the roll so the anterior view sits straight
    // Left/Right are swapped so each button shows the opposite anatomical side.
    // "Anatomical Position" is a pelvis-only preset view: orient it in edit mode
    // (?edit → Orient → pick "Anatomical Position" → Save → Download) so the
    // saved rotation lands in models/pelvis/pelvis_view.json for everyone.
    views: [
      { label: 'Anterior',  dir: 'front' },
      { label: 'Posterior', dir: 'back'  },
      { label: 'Left',      dir: 'right' },
      { label: 'Right',     dir: 'left'  },
      { label: 'Anatomical Position', dir: 'anatomical' },
    ],
  },
  {
    id: 'knee', label: 'Knee', file: 'models/knee/knee.glb',
    rotation: [-30, 0, 0], // tip the scan's tilted long axis upright (anterior/lateral sit straight)
    views: [
      { label: 'Anterior',  dir: 'front' },
      { label: 'Posterior', dir: 'back'  },
      { label: 'Lateral',   dir: 'left'  },
      { label: 'Medial',    dir: 'right' },
    ],
  },
  {
    id: 'brainstem', label: 'Brainstem', file: 'models/brainstem/brainstem.glb',
    rotation: [0, 0, 0],
    brightness: 2.2,
    views: [
      { label: 'Anterior',  dir: 'front' },
      { label: 'Posterior', dir: 'back'  },
    ],
  },
  {
    // Allen Human Reference Atlas via BrainGlobe (built by tools/build-brain.py).
    // One mesh per atlas region, in the atlas colours. +X is the patient's
    // left, so the Left/Right buttons look from +X/-X respectively.
    id: 'brain', label: 'Sliceable Brain', file: 'models/brain/brain.glb',
    slicer: true,         // shows the Cross-section panel
    noFly: true,          // orbit only (no Fly mode)
    sliceByDefault: true, // opens already sliced
    sections: 'models/brain/brain_regions.json', // region names + section volume
    // Shown in the viewer's bottom-right corner while this model is open.
    credit: [
      { text: 'Allen Human Reference Atlas, 3D, 2020', href: 'https://atlas.brain-map.org' },
      { text: '© Allen Institute' },
      { text: 'Terms of use', href: 'https://alleninstitute.org/terms-of-use/' },
      { text: 'Ding et al. 2016', href: 'https://doi.org/10.1002/cne.24080' },
      { text: 'via BrainGlobe', href: 'https://brainglobe.info' },
    ],
    rotation: [0, 0, 0],
    views: [
      { label: 'Anterior',  dir: 'front'  },
      { label: 'Posterior', dir: 'back'   },
      { label: 'Left',      dir: 'right'  },
      { label: 'Right',     dir: 'left'   },
      { label: 'Superior',  dir: 'top'    },
      { label: 'Inferior',  dir: 'bottom' },
    ],
  },
  {
    // Schematic visual pathway built in code (js/visual-pathway.js): pick a
    // lesion site, see the visual field defect.
    id: 'visual-pathway', label: 'Visual Pathway', build: () => buildPathwayModel(),
    devFeature: 'visual', // developer mode only, while in testing
    noFly: true,
    pathway: true,        // shows the lesion panel
    labels: PATHWAY_LABELS,
    savedViews: { top: { cameraUp: [0, 0, 1] } }, // from above, eyes at the top (like the textbook diagram)
    views: [
      { label: 'Superior',  dir: 'top'    },
      { label: 'Anterior',  dir: 'front'  },
      { label: 'Left',      dir: 'right'  },
      { label: 'Right',     dir: 'left'   },
      { label: 'Inferior',  dir: 'bottom' },
      { label: 'Posterior', dir: 'back'   },
    ],
  },
];
const MODEL_BY_ID = Object.fromEntries(MODELS.map(m => [m.id, m]));

// ── Main renderer ─────────────────────────────────────────
// alpha: true makes the canvas transparent so the CSS background (lab photo
// or solid colour) shows through behind the 3D model.
// stencil: the cross-section slicer masks the cut face to the model's outline.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, stencil: true });
renderer.localClippingEnabled = true; // the slicer clips per material
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0); // fully transparent

// ── Scene & Camera ────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);

// ── Lighting ──────────────────────────────────────────────
// A fixed multi-directional rig lights the specimen from every side so no
// orientation ever falls dark, plus a camera-following "headlamp" that keeps
// whatever the student is looking at brightly lit. Only the headlamp is
// adjustable (the Brightness slider); the rig is baked in.

// Soft sky/ground ambient — gentle fill from all directions at once.
const hemiLight = new THREE.HemisphereLight(0xf2f6ff, 0x4a4f60, 0.9);
scene.add(hemiLight);

// A low floor of flat ambient so nothing is ever pure black.
const ambient = new THREE.AmbientLight(0xffffff, 0.22);
scene.add(ambient);

// Fixed directional accents from several directions give the surface form and
// relief. They live in world space (added to the scene, not the model), so they
// stay put as the model rotates — turning it always reveals a lit face.
const RIG = [
  { pos: [  3,  5,  3 ], color: 0xffffff, intensity: 0.45 }, // key: upper front-right
  { pos: [ -4,  2, -1 ], color: 0xdde9ff, intensity: 0.30 }, // fill: upper back-left
  { pos: [  4,  1, -2 ], color: 0xffffff, intensity: 0.22 }, // fill: right
  { pos: [  0, -3,  1 ], color: 0xf0f4ff, intensity: 0.18 }, // subtle underside
  { pos: [  0,  1.5,-5 ], color: 0xeaf2ff, intensity: 0.55 }, // back rim, lifts silhouette
];
RIG.forEach(l => {
  const d = new THREE.DirectionalLight(l.color, l.intensity);
  d.position.set(...l.pos);
  scene.add(d);
});

// Headlamp: a directional light kept at the camera's position each frame (see
// animate()), so it shines from the viewer toward the model — the facing
// surface is always well-lit. Its intensity is the Brightness control. Target
// defaults to the origin, where the model is kept centred.
const HEADLAMP_DEFAULT = 0.9;
const headlamp = new THREE.DirectionalLight(0xffffff, HEADLAMP_DEFAULT);
scene.add(headlamp);

// ── OrbitControls ─────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.autoRotate = false;
controls.autoRotateSpeed = 1.2;
// min/max distance are set per-model in fitCameraToModel.
// If the user grabs the view mid-transition (drag / scroll), hand control back
// immediately by cancelling any in-progress preset-view tween.
controls.addEventListener('start', () => { _viewTween = null; });

autorotateToggle.checked = localStorage.getItem('autorotate') === '1';
controls.autoRotate = autorotateToggle.checked;
autorotateToggle.addEventListener('change', () => {
  controls.autoRotate = autorotateToggle.checked;
  localStorage.setItem('autorotate', autorotateToggle.checked ? '1' : '0');
});

// ── Fly mode (first-person WASD navigation) ──────────────
// PointerLockControls: click the viewer to capture the mouse for looking,
// WASD to walk, Space/Shift to rise/descend, Esc to release the pointer.
const flyControls = new PointerLockControls(camera, renderer.domElement);
let navMode = 'orbit';
const keys = { w: false, a: false, s: false, d: false, up: false, down: false };
// Q/E roll the camera in orbit mode (rotate the view around its own axis).
const rollKeys = { ccw: false, cw: false };
let prevTime = performance.now();

function flySpeedPerSec() {
  return Math.max(fitRadius * 0.9, 1); // scale movement to model size
}

document.addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    if (drawMode) { setDrawMode(false); return; }
    if (lineDrawing) { setLineDrawing(false); return; }
    if (labelPlacementMode) { setLabelPlacementMode(false); return; }
    if (pinMode) { setPinMode(false); return; }
  }
  // Don't hijack keys while the user is typing (quiz answers, label names…).
  if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
  // Q/E roll works in orbit mode (a single-key shortcut, so it can be turned off).
  if (navMode === 'orbit') {
    if (!singleKeyShortcuts || e.ctrlKey || e.metaKey || e.altKey) return;
    if (settingsOpen() || shortcutsOpen()) return;
    if (e.code === 'KeyQ') rollKeys.ccw = true;
    if (e.code === 'KeyE') rollKeys.cw = true;
    return;
  }
  // WASD / Space / Shift fly when pointer is locked.
  if (navMode !== 'fly' || !flyControls.isLocked) return;
  switch (e.code) {
    case 'KeyW': keys.w = true; break;
    case 'KeyS': keys.s = true; break;
    case 'KeyA': keys.a = true; break;
    case 'KeyD': keys.d = true; break;
    case 'Space': keys.up = true; e.preventDefault(); break;
    case 'ShiftLeft': case 'ShiftRight': keys.down = true; break;
  }
});
document.addEventListener('keyup', e => {
  switch (e.code) {
    case 'KeyW': keys.w = false; break;
    case 'KeyS': keys.s = false; break;
    case 'KeyA': keys.a = false; break;
    case 'KeyD': keys.d = false; break;
    case 'Space': keys.up = false; break;
    case 'ShiftLeft': case 'ShiftRight': keys.down = false; break;
    case 'KeyQ': rollKeys.ccw = false; break;
    case 'KeyE': rollKeys.cw = false; break;
  }
});

// Click the viewer to lock the pointer when in fly mode.
renderer.domElement.addEventListener('click', () => {
  if (navMode === 'fly' && !flyControls.isLocked) flyControls.lock();
});
// Note: PointerLockControls dispatches lock/unlock BEFORE updating isLocked,
// so pass the state explicitly rather than reading flyControls.isLocked here.
flyControls.addEventListener('lock', () => updateHint(true));
flyControls.addEventListener('unlock', () => {
  for (const k in keys) keys[k] = false; // stop drifting when released
  updateHint(false);
});

// ── Label renderer (CSS2D) ────────────────────────────────
// HTML labels that track 3D anchor points — crisp at any zoom, always facing
// the camera. The overlay ignores pointer events so orbit/fly still work;
// only interactive bits (the edit-mode delete buttons) re-enable them.
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
// Own stacking context: CSS2DRenderer gives each label a depth z-index, which
// would otherwise lift labels above docked panels (e.g. the lesion sheet).
labelRenderer.domElement.style.zIndex = '1';
container.appendChild(labelRenderer.domElement);

// ── Resize ────────────────────────────────────────────────
function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  sizeDrawCanvas(w, h);
}
new ResizeObserver(resize).observe(container);
resize();

// ── Orientation gizmo ─────────────────────────────────────
// A small secondary Three.js scene showing a labelled cube + axis vectors.
// The gizmo camera mirrors the main camera's viewing direction so the cube
// always reflects the current orientation. Passive (not interactive).

const GIZMO_PX = 90; // CSS size — renderer uses devicePixelRatio internally

const gizmoRenderer = new THREE.WebGLRenderer({
  canvas: gizmoCanvas,
  antialias: true,
  alpha: true,
});
gizmoRenderer.setSize(GIZMO_PX, GIZMO_PX);
gizmoRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const gizmoScene  = new THREE.Scene();
const gizmoCamera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, 0.1, 10);

// Cube faces: BoxGeometry material order is +X, -X, +Y, -Y, +Z, -Z.
// The gizmo is a passive orientation indicator (not clickable). Each face maps
// to a camera direction; its letter is derived per-model from the view buttons
// (so e.g. the pelvis's swapped L/R, or the shoulder's Medial/Lateral, match).
const GIZMO_FACES = [
  { dir: 'right',  bg: '#b83030' }, // +X
  { dir: 'left',   bg: '#7a1f1f' }, // -X
  { dir: 'top',    bg: '#2e8b2e' }, // +Y
  { dir: 'bottom', bg: '#1a5c1a' }, // -Y
  { dir: 'front',  bg: '#2255bb' }, // +Z
  { dir: 'back',   bg: '#163a80' }, // -Z
];

// Default single-letter labels per direction; overridden by a model's views.
const DEFAULT_DIR_LETTERS = { front: 'A', back: 'P', left: 'L', right: 'R', top: 'S', bottom: 'I' };

function dirLetters(model) {
  const letters = { ...DEFAULT_DIR_LETTERS };
  (model?.views || []).forEach(v => { letters[v.dir] = v.label.charAt(0).toUpperCase(); });
  return letters;
}

function updateGizmoLabels(model) {
  const letters = dirLetters(model);
  GIZMO_FACES.forEach((f, i) => {
    const mat = gizmoCube.material[i];
    mat.map?.dispose();
    mat.map = makeFaceTex(letters[f.dir], f.bg);
    mat.needsUpdate = true;
  });
}

function makeFaceTex(label, bgColor) {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  // Fill
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, s, s);
  // Subtle border
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, s - 4, s - 4);
  // Label
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${label.length > 1 ? 40 : 54}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, s / 2, s / 2);
  return new THREE.CanvasTexture(c);
}

const gizmoCube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  GIZMO_FACES.map(f => new THREE.MeshBasicMaterial({ map: makeFaceTex(DEFAULT_DIR_LETTERS[f.dir], f.bg) }))
);
gizmoScene.add(gizmoCube);

// Short colored axis cues sticking out of the cube (X=red, Y=green, Z=blue).
// No labelled dots — the cube faces are already lettered, and dots would sit
// on top of a face letter whenever that axis points at the camera.
function addAxis(x, y, z, color) {
  const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y, z)];
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color })
  );
  gizmoScene.add(line);
}

addAxis(1.4, 0, 0, 0xff4444); // X – red
addAxis(0, 1.4, 0, 0x44cc44); // Y – green
addAxis(0, 0, 1.4, 0x4488ff); // Z – blue

// ── Label state ───────────────────────────────────────────
// Declared before the render loop because animate() (kicked off below) calls
// updateLabelLeaders(), which reads these. Saved labels live in
// models/<id>/<id>_labels.json as [{ name, position: [x,y,z] }] with position
// in the model's local space, so they track rotation, centring and zoom.
const EDIT_MODE = new URLSearchParams(location.search).has('edit')
               && !window.matchMedia('(pointer: coarse)').matches;
let labelLayer = null;     // THREE.Group (child of currentModel) holding labels
let labelData = [];        // current label records
let labelsVisible      = false;
let activeModelId      = null;
let dragging           = null; // { entry, obj } while a label is being dragged in edit mode
let labelPlacementMode = false; // edit-mode: explicit button activates click-to-place
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

// ── Render loop ───────────────────────────────────────────
let fitRadius = 0; // bounding-sphere radius of current model

// Active preset-view transition (see setView / _stepViewTween). Declared here,
// before animate() first runs, so the render loop can read it safely.
let _viewTween = null;

const _gizmoDir = new THREE.Vector3();
const _flyFwd   = new THREE.Vector3();
const _flyRight = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.1);
  prevTime = now;

  if (navMode === 'fly') {
    if (flyControls.isLocked) {
      const step = flySpeedPerSec() * dt;
      // Free flight: W/S follow the actual look direction (so looking up and
      // pressing W climbs), A/D strafe, Space/Shift move along world up.
      camera.getWorldDirection(_flyFwd);
      _flyRight.crossVectors(_flyFwd, camera.up).normalize();
      if (keys.w) camera.position.addScaledVector(_flyFwd, step);
      if (keys.s) camera.position.addScaledVector(_flyFwd, -step);
      if (keys.d) camera.position.addScaledVector(_flyRight, step);
      if (keys.a) camera.position.addScaledVector(_flyRight, -step);
      if (keys.up)   camera.position.y += step;
      if (keys.down) camera.position.y -= step;
    }
  } else {
    // Q/E roll: rotate the camera's up vector around the view axis, which
    // tilts the OrbitControls horizon. In orient mode, roll the model itself
    // (about the view axis) so the roll becomes part of the saved rotation.
    if (rollKeys.ccw || rollKeys.cw) {
      const rollAng = ((rollKeys.ccw ? 1 : 0) - (rollKeys.cw ? 1 : 0)) * 1.4 * dt;
      camera.getWorldDirection(_flyFwd);
      if (orientMode && currentModel) {
        currentModel.quaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(_flyFwd, -rollAng)
        );
        recenterModel();
      } else {
        camera.up.applyAxisAngle(_flyFwd, rollAng);
      }
    }
    _stepViewTween(dt); // glide toward a preset view, if one is in progress
    controls.update();
  }

  // Dynamically shrink near plane as user zooms/flies in so the model never
  // clips prematurely. Far plane also scales so depth precision stays sane.
  if (fitRadius > 0) {
    const dist = Math.max(camera.position.length(), fitRadius * 0.01);
    camera.near = Math.max(dist * 0.002, 0.001);
    camera.far  = dist * 200 + fitRadius * 4;
    camera.updateProjectionMatrix();
  }

  updateSlicer(dt); // cross-section planes follow the model (dev feature)

  // Keep the headlamp at the camera so the viewed face is always lit.
  headlamp.position.copy(camera.position);

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  updateLabelLeaders();

  // Sync gizmo to the main camera's actual view direction, so it reflects
  // orientation correctly in both orbit and fly modes.
  camera.getWorldDirection(_gizmoDir);
  gizmoCamera.position.copy(_gizmoDir).multiplyScalar(-5);
  gizmoCamera.up.copy(camera.up);
  gizmoCamera.lookAt(0, 0, 0);
  gizmoRenderer.render(gizmoScene, gizmoCamera);
}
animate();

// ── Loading helpers ───────────────────────────────────────
let currentModel = null;

let _loadingMsg = '';
function setProgress(pct) {
  progressFill.style.width = pct + '%';
  if (_loadingMsg) loadingText.textContent = pct > 0 && pct < 100 ? `${_loadingMsg} ${pct}%` : _loadingMsg;
}

// Still image shown in place of the model while it downloads. Captured at the
// default framing (square, model filling the height), so object-fit: contain
// lines it up with where the model appears. Missing posters fall back to a
// dimmed overlay.
function posterUrl(model) { return `models/${model.id}/${model.id}_poster.webp`; }

function showLoading(msg = 'Loading model…', poster = null) {
  _loadingMsg = msg;
  loadingText.textContent = msg;
  setProgress(0);
  emptyState.classList.add('hidden'); // don't show "Select a region" over the poster
  loadingOverlay.classList.add('no-poster');
  if (poster) {
    loadingPoster.onload  = () => loadingOverlay.classList.remove('no-poster');
    loadingPoster.onerror = () => loadingOverlay.classList.add('no-poster');
    loadingPoster.src = poster;
    if (loadingPoster.complete && loadingPoster.naturalWidth) loadingOverlay.classList.remove('no-poster');
  }
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() { loadingOverlay.classList.add('hidden'); }

// Source / licence line for models that need one (e.g. atlas data), shown in
// the viewer's bottom-right corner while that model is open.
const modelCredit = document.getElementById('model-credit');
function showModelCredit(model) {
  modelCredit.replaceChildren();
  const parts = model?.credit ?? [];
  modelCredit.classList.toggle('hidden', !parts.length);
  parts.forEach((part, i) => {
    if (i) modelCredit.append(' · ');
    if (part.href) {
      const a = document.createElement('a');
      a.href = part.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = part.text;
      modelCredit.append(a);
    } else {
      modelCredit.append(part.text);
    }
  });
}

function showViewerUI() {
  emptyState.classList.add('hidden');
  bottomBar.classList.remove('hidden');
  viewerToolbar.classList.remove('hidden');
  displayControls.classList.remove('hidden');
  setNavMode('orbit'); // always start a freshly-loaded model in orbit mode
  // Models marked noFly (the brain) are orbit-only: no Orbit / Fly switch.
  document.getElementById('nav-modes').style.display = activeModelDef?.noFly ? 'none' : '';
  // Apply the saved background on first load (defaults to black).
  if (!container.dataset.bgSet) {
    setBackground(localStorage.getItem('background') || 'dark');
    container.dataset.bgSet = '1';
  }
}

// ── Material softening ────────────────────────────────────
// Artec scans export near-mirror MTL (Ks 1 1 1, Ns 1000).
// Flatten specular so surface texture reads clearly at all angles.
function softenMaterials(object, brightness = 1) {
  object.traverse(child => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(m => {
      if ('shininess' in m) m.shininess = 6;
      if (m.specular)       m.specular.setScalar(0.03);
      if ('roughness' in m) m.roughness = 0.9;
      if ('metalness' in m) m.metalness = 0.0;
      if (brightness !== 1 && m.color) m.color.multiplyScalar(brightness);
      m.needsUpdate = true;
    });
  });
}

// Keep the model's geometric centre pinned at the orbit origin, regardless of
// its current orientation. Driven by userData.centerLocal (computed once at
// load, in rotation-independent local space) so re-orienting in edit mode
// doesn't make the model drift off-centre.
// Per-view pan offset (world space) applied on top of the centred position so
// authors can nudge a model to line its anatomy up with the centring guides.
const _orientOffset = new THREE.Vector3();

function recenterModel() {
  const c = currentModel?.userData?.centerLocal;
  if (!c) return;
  const w = c.clone().applyQuaternion(currentModel.quaternion);
  currentModel.position.copy(w.negate()).add(_orientOffset);
  currentModel.updateMatrixWorld(true);
}

// ── Camera fit ────────────────────────────────────────────
function fitCameraToModel(object) {
  const box    = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius;
  fitRadius    = radius;

  // Distance that fits the bounding sphere in the vertical FOV
  const fov = camera.fov * (Math.PI / 180);
  let distance = radius / Math.sin(fov / 2);
  if (camera.aspect < 1) distance /= camera.aspect; // portrait viewports
  distance *= 1.0; // sphere fills the view; the mesh (inscribed) keeps a margin

  camera.up.set(0, 1, 0);
  camera.position.set(0, 0, distance);
  camera.near = distance * 0.002;
  camera.far  = distance * 200 + radius * 4;
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  // Allow zooming very close — students may want to inspect fine details.
  // minDistance is 1% of radius so the model stays on screen before going through.
  controls.minDistance = radius * 0.01;
  controls.maxDistance = radius * 12;
  controls.update();

  camera._defaultPos  = camera.position.clone();
  camera._defaultNear = camera.near;
  camera._defaultFar  = camera.far;
}

// ── View presets (used by gizmo click) ───────────────────
const VIEW_DIRS = {
  front:  [ 0,  0,  1],
  back:   [ 0,  0, -1],
  left:   [-1,  0,  0],
  right:  [ 1,  0,  0],
  top:    [ 0,  1,  0],
  bottom: [ 0, -1,  0],
  // Custom preset views (e.g. the pelvis "Anatomical Position") view from the
  // front; the saved per-view rotation does the actual orienting.
  anatomical: [ 0,  0,  1],
};

// Per-view saved orientation, loaded from <id>_view.json. Keyed by view dir:
//   { front: { rotation: [x,y,z], zoom: dist }, back: {…}, … }
// Authored in edit mode; applied here so each view button snaps to its own
// model orientation and zoom.
let savedViews = {};

// A preset view transition (_viewTween, declared up by the render loop) is
// advanced each frame by animate(), letting a view glide into place (model
// orientation + camera arc) instead of snapping. See setView(name, animate=true).
// Motion effects (this tween, orbit inertia) follow the explicit in-app
// settings only — the OS prefers-reduced-motion flag is intentionally not read
// live, so it never silently removes the animation or the drag-coast.
let reducedMotionSetting = localStorage.getItem('reducedMotion') === '1';

// Whether preset-view changes glide (vs. snap). Its own setting, on by default,
// independent of the OS reduce-motion flag so the transition still plays for
// users who have that enabled — they can turn it off explicitly in Settings.
let animateViewsOn = localStorage.getItem('animateViews') !== '0';
const VIEW_TWEEN_DUR = 0.6; // seconds

// Computes the target camera/model state for a named view without applying it.
function _computeViewTarget(name) {
  const d = VIEW_DIRS[name];
  if (!d) return null;
  const saved = savedViews[name];

  const offset = new THREE.Vector3(
    ...(Array.isArray(saved?.offset) ? saved.offset : [0, 0, 0])
  );

  // Model orientation: the view's saved rotation, or unchanged if none authored.
  const quat = (saved && Array.isArray(saved.rotation))
    ? new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(saved.rotation[0]),
        THREE.MathUtils.degToRad(saved.rotation[1]),
        THREE.MathUtils.degToRad(saved.rotation[2])
      ))
    : currentModel.quaternion.clone();

  const up = new THREE.Vector3();
  if (saved?.cameraUp)          up.set(...saved.cameraUp);
  else if (name === 'top')      up.set(0, 0, -1);
  else if (name === 'bottom')   up.set(0, 0,  1);
  else                          up.set(0, 1,  0);

  const dist = saved?.zoom
            ?? (camera._defaultPos ? camera._defaultPos.length()
                                    : fitRadius / Math.sin((camera.fov * Math.PI / 180) / 2) * 1.15);
  const pos = new THREE.Vector3(d[0] * dist, d[1] * dist, d[2] * dist);

  return { quat, up, pos, offset };
}

// Applies a target state to the model + camera immediately.
function _applyViewTarget(t) {
  currentModel.quaternion.copy(t.quat);
  _orientOffset.copy(t.offset);
  recenterModel();
  camera.up.copy(t.up);
  camera.position.copy(t.pos);
  controls.target.set(0, 0, 0);
  controls.update();
}

function setView(name, animate = false) {
  if (!currentModel || !fitRadius) return;
  if (slicer) hideRegionTip(); // the name would point at the wrong place
  const target = _computeViewTarget(name);
  if (!target) return;

  if (animate && animateViewsOn) {
    _viewTween = {
      t: 0,
      from: {
        quat: currentModel.quaternion.clone(),
        up:   camera.up.clone(),
        pos:  camera.position.clone(),
        offset: _orientOffset.clone(),
      },
      to: target,
    };
    controls.target.set(0, 0, 0); // camera arcs around the origin during the tween
  } else {
    _viewTween = null;
    _applyViewTarget(target);
  }
}

// Advances the active view transition. Called from animate() once per frame.
// The camera direction is slerped along a spherical arc (so front↔back doesn't
// pass through the model centre) while its distance lerps; the model orientation
// slerps as a quaternion, and the pan offset + up vector interpolate linearly.
const _twFromDir = new THREE.Vector3();
const _twToDir   = new THREE.Vector3();
const _twArc     = new THREE.Quaternion();
function _stepViewTween(dt) {
  if (!_viewTween || !currentModel) return;
  _viewTween.t += dt / VIEW_TWEEN_DUR;
  const k = Math.min(_viewTween.t, 1);
  // easeInOutCubic
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const { from, to } = _viewTween;

  // Model orientation + pan offset.
  currentModel.quaternion.copy(from.quat).slerp(to.quat, e);
  _orientOffset.copy(from.offset).lerp(to.offset, e);
  recenterModel();

  // Camera up (linear is fine — view-to-view up changes are ≤90°). If two views
  // are ~180° rolled apart the midpoint lerps toward zero, so fall back to the
  // target up rather than normalising a near-zero vector into NaN.
  camera.up.copy(from.up).lerp(to.up, e);
  if (camera.up.lengthSq() < 1e-6) camera.up.copy(to.up);
  camera.up.normalize();

  // Camera position: slerp the direction, lerp the radius. setFromUnitVectors
  // gives a well-defined axis even for the 180° front↔back case.
  _twFromDir.copy(from.pos).normalize();
  _twToDir.copy(to.pos).normalize();
  _twArc.identity().slerp(new THREE.Quaternion().setFromUnitVectors(_twFromDir, _twToDir), e);
  const radius = THREE.MathUtils.lerp(from.pos.length(), to.pos.length(), e);
  camera.position.copy(_twFromDir).applyQuaternion(_twArc).multiplyScalar(radius);

  controls.target.set(0, 0, 0);
  if (k >= 1) _viewTween = null;
}

// ── Model loading (Draco-compressed GLB) ─────────────────
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('js/draco/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

async function loadRegion(region) {
  const model = MODEL_BY_ID[region];
  if (!model) { console.error('Unknown model:', region); return; }
  activeModelDef = model;
  showModelCredit(model);
  // Region data downloads alongside the 3D model; the large full-resolution
  // map waits until the model is on screen so it doesn't slow it down.
  let modelArrived;
  const modelReady = new Promise(r => { modelArrived = r; });
  if (model.sections) startSectionsFetch(model, modelReady);
  showLoading('Loading ' + model.label + '…', posterUrl(model));
  canvas.setAttribute('aria-label', `3D model of the ${model.label}. Arrow keys rotate, plus and minus zoom.`);
  setDrawMode(false);
  buildViewButtons(model);
  updateGizmoLabels(model);
  if (EDIT_MODE) populateOrientViewSelect(model);

  // Saved per-view orientation (authored in edit mode) overrides the default.
  savedViews = {};
  _orientOffset.set(0, 0, 0);
  if (model.savedViews) savedViews = structuredClone(model.savedViews);
  else try {
    const res = await fetch(`models/${model.id}/${model.id}_view.json`, { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && typeof cfg === 'object') savedViews = cfg;
    }
  } catch (e) { /* no saved orientation — use the default */ }

  // The model loads showing its first view (e.g. Anterior); use that view's
  // saved orientation if present, otherwise the hardcoded default.
  const firstDir = (model.views ?? DEFAULT_VIEWS)[0]?.dir;
  const savedRotation = savedViews[firstDir]?.rotation ?? null;

  if (currentModel) {
    if (!quizPanel.classList.contains('hidden')) endQuiz(); // close any open quiz
    clearLabels();
    clearLines();
    setLineDrawing(false);
    if (EDIT_MODE) { setLabelPlacementMode(false); setOrientMode(false); }
    clearPins();
    setPinMode(false);
    setSlicing(false);
    disposeSections();
    closePathway();
    scene.remove(currentModel);
    currentModel.traverse(child => {
      if (child.isMesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
    currentModel = null;
    fitRadius = 0;
    _viewTween = null; // drop any in-progress transition from the old model
  }

  const onModelObject = (object) => {
      setProgress(100);
      softenMaterials(object, model.brightness ?? 1);

      // Geometric centre in rotation-independent local space — computed at
      // identity so re-orienting later keeps the model pinned at the origin.
      object.updateMatrixWorld(true);
      const box0 = new THREE.Box3().setFromObject(object);
      object.userData.centerLocal = box0.getCenter(new THREE.Vector3());

      const rot = savedRotation ?? model.rotation ?? [0, 0, 0];
      object.rotation.set(
        THREE.MathUtils.degToRad(rot[0]),
        THREE.MathUtils.degToRad(rot[1]),
        THREE.MathUtils.degToRad(rot[2])
      );

      scene.add(object);
      currentModel = object;
      recenterModel();
      prepareSliceMaterials(object, model);
      applySlicerFeature();
      // Region data (already downloading) is set up once the brain is on
      // screen, so the model appears first and the cut's colours follow.
      if (model.sections) modelReady.then(() => loadSections(model));
      fitCameraToModel(object);
      // If the first view was authored, frame the model with its saved
      // zoom and pan offset.
      if (savedViews[firstDir]) setView(firstDir);
      showViewerUI();
      if (model.slicer && model.sliceByDefault) setSlicing(true);
      scormModelOpened(); // count toward SCORM completion (no-op outside an LMS)
      loadLabels(model);
      initLineLayer();
      loadLines(model);
      initPinLayer();
      setTimeout(() => { hideLoading(); modelArrived(); }, 300); // model on screen: the big downloads may start
      if (model.pathway) openPathway();
  };

  // Models made in code are built right away; the rest load from their file.
  if (model.build) {
    setTimeout(() => onModelObject(model.build()), 0);
    return;
  }
  gltfLoader.load(
    model.file,
    (gltf) => onModelObject(gltf.scene),
    (xhr) => {
      if (xhr.lengthComputable) setProgress(Math.round((xhr.loaded / xhr.total) * 100));
    },
    (err) => { modelArrived(); _loadingMsg = ''; loadingText.textContent = 'Could not load the model. Check your connection and try again.'; console.error(err); }
  );
}

// ── Region buttons (generated from MODELS) ───────────────
// Models with no `category` are listed directly; models sharing a category
// are nested under one expandable group button (e.g. "CNS" containing
// Brainstem, with room for more CNS models later). Only one thing — a
// top-level region, or one group — is ever highlighted/open at a time.
function closeAllRegionGroups(except) {
  regionSelector.querySelectorAll('.region-group.open').forEach(g => {
    if (g === except) return;
    g.classList.remove('open');
    g.querySelector('.region-group-body').classList.add('hidden');
    g.querySelector('.region-group-toggle').setAttribute('aria-expanded', 'false');
  });
}

function makeRegionButton(model) {
  const btn = document.createElement('button');
  btn.className = 'region-btn';
  btn.dataset.region = model.id;
  btn.innerHTML = `<span class="region-label">${model.label}</span>`;
  if (model.devFeature) {
    btn.dataset.devFeature = model.devFeature;
    btn.hidden = true; // revealed by applyDevModelButtons() once dev mode is read
  }
  btn.addEventListener('click', () => {
    regionSelector.querySelectorAll('.region-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
    btn.classList.add('active');
    btn.setAttribute('aria-current', 'true');
    // Closing unrelated groups keeps the picked model's own group open
    // (if it's nested) while making sure nothing else stays highlighted.
    closeAllRegionGroups(btn.closest('.region-group'));
    loadRegion(model.id);
    closeDrawer();
  });
  return btn;
}

const regionCategories = new Map(); // category name -> [models]
MODELS.forEach(model => {
  if (!model.category) { regionSelector.appendChild(makeRegionButton(model)); return; }
  if (!regionCategories.has(model.category)) regionCategories.set(model.category, []);
  regionCategories.get(model.category).push(model);
});

regionCategories.forEach((models, categoryName) => {
  const group = document.createElement('div');
  group.className = 'region-group';

  const toggle = document.createElement('button');
  toggle.className = 'region-group-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = `<span>${categoryName}</span><span class="region-group-caret" aria-hidden="true">▸</span>`;

  const body = document.createElement('div');
  body.className = 'region-group-body hidden';
  models.forEach(model => body.appendChild(makeRegionButton(model)));

  toggle.addEventListener('click', () => {
    const wasOpen = group.classList.contains('open');
    closeAllRegionGroups();
    if (!wasOpen) {
      group.classList.add('open');
      body.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      // Opening a group deselects any active top-level region.
      regionSelector.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
    }
  });

  group.appendChild(toggle);
  group.appendChild(body);
  regionSelector.appendChild(group);
});

// ── Reset view ────────────────────────────────────────────
// Returns to the default orbit framing (and out of fly mode if active).
resetBtn.addEventListener('click', resetView);
function resetView() {
  if (!camera._defaultPos) return;
  _viewTween = null;
  if (navMode === 'fly') setNavMode('orbit');
  // A model that opens on an authored view returns to it.
  const firstDir = (activeModelDef?.views ?? DEFAULT_VIEWS)[0]?.dir;
  if (currentModel && savedViews[firstDir]) {
    camera.near = camera._defaultNear;
    camera.far  = camera._defaultFar;
    camera.updateProjectionMatrix();
    setView(firstDir, true);
    return;
  }
  camera.up.set(0, 1, 0);
  camera.position.copy(camera._defaultPos);
  camera.near = camera._defaultNear;
  camera.far  = camera._defaultFar;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

// ── View shortcut buttons (built per-model) ──────────────
function buildViewButtons(model) {
  viewButtons.innerHTML = '';
  const views = model.views || DEFAULT_VIEWS;
  views.forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'view-btn';
    // Long-labelled preset views span the full grid row instead of wrapping
    // inside a narrow half-width cell.
    if (v.label.length > 10) btn.classList.add('view-btn-wide');
    btn.textContent = v.label;
    btn.addEventListener('click', () => {
      if (navMode === 'fly') setNavMode('orbit');
      setView(v.dir, true); // animate the transition into the preset view
    });
    viewButtons.appendChild(btn);
  });
}

// ── Annotations / labels ─────────────────────────────────
// Author tools appear only when the URL contains ?edit (hidden from students).

const CATEGORY_COLOR_SCHEMES = {
  normal: {
    ligament: '#70d0ff',
    nerve:    '#f0e040',
    nuclei:   '#e89020', // darker amber/orange, distinct from the bright nerve yellow
    vessel:   '#e04040',
    other:    '#a0a0b8',
    '':       '#4f7cff', // default / structure
  },
  // Okabe–Ito inspired palette: avoids hues that are hard to tell apart
  // under red-green colour vision deficiency.
  colorblind: {
    ligament: '#56b4e9', // sky blue
    nerve:    '#f0e442', // yellow
    nuclei:   '#e69f00', // orange
    vessel:   '#cc79a7', // reddish purple
    other:    '#999999', // neutral grey
    '':       '#0072b2', // blue
  },
};

let colorblindMode = localStorage.getItem('colorblindMode') === '1';
function categoryColors() {
  return colorblindMode ? CATEGORY_COLOR_SCHEMES.colorblind : CATEGORY_COLOR_SCHEMES.normal;
}

// Re-colours every category-driven swatch: placed label dots, the show-
// labels filter legend, and the add-label category picker.
function applyCategoryColorScheme() {
  const colors = categoryColors();
  document.querySelectorAll('.anno-label[data-category]').forEach(el => {
    const dot = el.querySelector('.anno-dot');
    if (dot) dot.style.background = colors[el.dataset.category] ?? colors[''];
  });
  document.querySelectorAll('.cat-filter-row[data-filter-cat]').forEach(row => {
    const ind = row.querySelector('.cat-indicator');
    if (ind) ind.style.background = colors[row.dataset.filterCat] ?? colors[''];
  });
  document.querySelectorAll('#label-modal-cats .lcat-option').forEach(opt => {
    const input = opt.querySelector('input[name="lcat"]');
    const dot = opt.querySelector('.lcat-dot');
    if (input && dot) dot.style.background = colors[input.value] ?? colors[''];
  });
}

colorblindToggle.checked = colorblindMode;
colorblindToggle.addEventListener('change', () => {
  colorblindMode = colorblindToggle.checked;
  localStorage.setItem('colorblindMode', colorblindMode ? '1' : '0');
  applyCategoryColorScheme();
});
applyCategoryColorScheme();

// ── Settings: accessibility / display / performance ───────
// Each setting reads its saved value at startup, applies it, and persists on
// change so choices stick across sessions.
const animateViewsToggle  = document.getElementById('animate-views-toggle');
const reducedMotionToggle = document.getElementById('reduced-motion-toggle');
const labelsDefaultToggle = document.getElementById('labels-default-toggle');
const hintToggle          = document.getElementById('hint-toggle');
const performanceToggle   = document.getElementById('performance-toggle');
const labelSizeSeg        = document.getElementById('label-size-seg');
const settingsReset       = document.getElementById('settings-reset');

let labelsDefaultOn = localStorage.getItem('labelsDefault') === '1';
let showHint        = localStorage.getItem('showHint') !== '0'; // default on
let labelSize       = localStorage.getItem('labelSize') || 'm';
let performanceMode = localStorage.getItem('performance') === '1';

const LABEL_SIZES = { s: '0.66rem', m: '0.78rem', l: '0.94rem' };

// Reduced motion drops orbit damping (the coast-after-release inertia). Follows
// the in-app setting only; the view-change animation has its own toggle.
function applyReducedMotion() { controls.enableDamping = !reducedMotionSetting; }
function applyLabelSize(size) {
  document.documentElement.style.setProperty('--label-font-size', LABEL_SIZES[size] || LABEL_SIZES.m);
  labelSizeSeg.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.size === size);
    b.setAttribute('aria-pressed', String(b.dataset.size === size));
  });
}
function applyControlsHint(show) { controlsHint.classList.toggle('hidden', !show); }
function applyPerformanceMode(on) {
  renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio, 2));
  resize(); // apply the new pixel ratio to the drawing buffer
}

// Animate view changes
animateViewsToggle.checked = animateViewsOn;
animateViewsToggle.addEventListener('change', () => {
  animateViewsOn = animateViewsToggle.checked;
  localStorage.setItem('animateViews', animateViewsOn ? '1' : '0');
});

// Reduce motion
reducedMotionToggle.checked = reducedMotionSetting;
reducedMotionToggle.addEventListener('change', () => {
  reducedMotionSetting = reducedMotionToggle.checked;
  localStorage.setItem('reducedMotion', reducedMotionSetting ? '1' : '0');
  applyReducedMotion();
});
applyReducedMotion();

// Show labels by default
labelsDefaultToggle.checked = labelsDefaultOn;
labelsDefaultToggle.addEventListener('change', () => {
  labelsDefaultOn = labelsDefaultToggle.checked;
  localStorage.setItem('labelsDefault', labelsDefaultOn ? '1' : '0');
  if (currentModel) setLabelsVisible(EDIT_MODE || (labelsDefaultOn && labelData.length > 0));
});

// Controls hint
hintToggle.checked = showHint;
hintToggle.addEventListener('change', () => {
  showHint = hintToggle.checked;
  localStorage.setItem('showHint', showHint ? '1' : '0');
  applyControlsHint(showHint);
});
applyControlsHint(showHint);

// Label text size (segmented S / M / L)
applyLabelSize(labelSize);
labelSizeSeg.addEventListener('click', e => {
  const btn = e.target.closest('button[data-size]');
  if (!btn) return;
  labelSize = btn.dataset.size;
  localStorage.setItem('labelSize', labelSize);
  applyLabelSize(labelSize);
});

// Performance mode
performanceToggle.checked = performanceMode;
performanceToggle.addEventListener('change', () => {
  performanceMode = performanceToggle.checked;
  localStorage.setItem('performance', performanceMode ? '1' : '0');
  applyPerformanceMode(performanceMode);
});
if (performanceMode) applyPerformanceMode(true);

// Single-key shortcuts
const singleKeyToggle = document.getElementById('single-key-toggle');
singleKeyToggle.checked = singleKeyShortcuts;
singleKeyToggle.addEventListener('change', () => {
  singleKeyShortcuts = singleKeyToggle.checked;
  localStorage.setItem('singleKeys', singleKeyShortcuts ? '1' : '0');
  if (!singleKeyShortcuts) { rollKeys.ccw = rollKeys.cw = false; }
  if (currentModel) updateHint();
});

// Reset every setting to its default and apply immediately.
settingsReset.addEventListener('click', () => {
  singleKeyShortcuts = true; singleKeyToggle.checked = true;
  localStorage.setItem('singleKeys', '1');

  colorblindMode = false; colorblindToggle.checked = false;
  localStorage.setItem('colorblindMode', '0'); applyCategoryColorScheme();

  autorotateToggle.checked = false; controls.autoRotate = false;
  localStorage.setItem('autorotate', '0');

  animateViewsOn = true; animateViewsToggle.checked = true;
  localStorage.setItem('animateViews', '1');

  reducedMotionSetting = false; reducedMotionToggle.checked = false;
  localStorage.setItem('reducedMotion', '0'); applyReducedMotion();

  labelsDefaultOn = false; labelsDefaultToggle.checked = false;
  localStorage.setItem('labelsDefault', '0');

  showHint = true; hintToggle.checked = true;
  localStorage.setItem('showHint', '1'); applyControlsHint(true);

  performanceMode = false; performanceToggle.checked = false;
  localStorage.setItem('performance', '0'); applyPerformanceMode(false);

  labelSize = 'm'; localStorage.setItem('labelSize', 'm'); applyLabelSize('m');

  setBackground('dark');
  setSidebarCollapsed(false);

  if (currentModel) setLabelsVisible(EDIT_MODE);
});

// ── Developer mode ────────────────────────────────────────
// Unlocked from Settings with a password. It gates work-in-progress features
// so they can be tested in the real app before everyone gets them.
//
// To add a WIP feature:
//   1. Add an entry to DEV_FEATURES below.
//   2. Guard its code with isDevFeatureEnabled('<id>'), and/or put the
//      class "dev-only" on its HTML so it only shows in developer mode.
//   3. To react when it's switched on/off, listen for 'devfeaturechange' on
//      window (event.detail = { id, enabled }).
// When the feature is ready, remove its entry and the guards.
//
// The password only keeps casual users out; it's visible in this source file,
// so don't rely on it to protect anything sensitive.
const DEV_PASSWORD = 'developer';
const DEV_FEATURES = [
  // { id: 'example', label: 'Example feature', description: 'What it does and what to test.' },
  { id: 'visual', label: 'Visual pathway & lesions',
    description: 'Adds a schematic Visual Pathway model: pick a lesion site (optic nerve to visual cortex) and see the visual field defect in each eye.' },
];

// Developer mode is hidden from Settings unless the page address has ?dev
// (e.g. index.html?dev); without it, it is always off.
const DEV_ALLOWED = new URLSearchParams(location.search).has('dev');
let devMode = DEV_ALLOWED && localStorage.getItem('devMode') === '1';
document.getElementById('dev-section').style.display = DEV_ALLOWED ? '' : 'none';
let devFlags = {};
try { devFlags = JSON.parse(localStorage.getItem('devFlags') || '{}') || {}; } catch { devFlags = {}; }

function isDevFeatureEnabled(id) { return devMode && !!devFlags[id]; }

const devUnlockForm  = document.getElementById('dev-unlock');
const devPassword    = document.getElementById('dev-password');
const devUnlockError = document.getElementById('dev-unlock-error');
const devPanel       = document.getElementById('dev-panel');
const devFeaturesEl  = document.getElementById('dev-features');
const devDisableBtn  = document.getElementById('dev-disable');
const devBadge       = document.getElementById('dev-badge');

function notifyDevFeatures(prevEnabled) {
  DEV_FEATURES.forEach(f => {
    const enabled = isDevFeatureEnabled(f.id);
    if (enabled !== prevEnabled[f.id]) {
      window.dispatchEvent(new CustomEvent('devfeaturechange', { detail: { id: f.id, enabled } }));
    }
  });
}
function devSnapshot() {
  return Object.fromEntries(DEV_FEATURES.map(f => [f.id, isDevFeatureEnabled(f.id)]));
}

function renderDevFeatures() {
  devFeaturesEl.replaceChildren();
  if (!DEV_FEATURES.length) {
    const p = document.createElement('p');
    p.className = 'dev-empty';
    p.textContent = 'No features are in testing right now.';
    devFeaturesEl.appendChild(p);
    return;
  }
  DEV_FEATURES.forEach(f => {
    const wrap = document.createElement('div');
    wrap.className = 'dev-feature';
    const row = document.createElement('label');
    row.className = 'settings-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!devFlags[f.id];
    cb.addEventListener('change', () => {
      const prev = devSnapshot();
      devFlags[f.id] = cb.checked;
      localStorage.setItem('devFlags', JSON.stringify(devFlags));
      notifyDevFeatures(prev);
    });
    row.append(cb, document.createTextNode(f.label));
    wrap.appendChild(row);
    if (f.description) {
      const d = document.createElement('p');
      d.className = 'dev-feature-desc';
      d.textContent = f.description;
      wrap.appendChild(d);
    }
    devFeaturesEl.appendChild(wrap);
  });
}

function applyDevMode() {
  document.body.classList.toggle('dev-mode', devMode);
  devBadge.classList.toggle('hidden', !devMode);
  devUnlockForm.classList.toggle('hidden', devMode);
  devPanel.classList.toggle('hidden', !devMode);
  if (devMode) renderDevFeatures();
}

function setDevMode(on) {
  const prev = devSnapshot();
  devMode = on;
  localStorage.setItem('devMode', on ? '1' : '0');
  applyDevMode();
  notifyDevFeatures(prev);
}

devUnlockForm.addEventListener('submit', e => {
  e.preventDefault();
  if (devPassword.value === DEV_PASSWORD) {
    devPassword.value = '';
    devUnlockError.textContent = '';
    setDevMode(true);
    devDisableBtn.focus();
    showToast('Developer mode on');
  } else {
    devUnlockError.textContent = 'Incorrect password.';
    devPassword.select();
  }
});
devDisableBtn.addEventListener('click', () => {
  setDevMode(false);
  devPassword.focus();
  showToast('Developer mode off');
});
applyDevMode();

// ── Cross-section slicer ──────────────────────────────────
// Cuts the model with a plane, in
// the spirit of brainglobe-heatmap's Slicer. Only offered for models with
// `slicer: true` (currently the dev-mode brain). The plane is defined in the
// model's own anatomical frame (captured at load, where anterior faces +Z and
// superior +Y), so the cut stays on the same anatomy when a preset view
// rotates the model.
//
// Clipping is per material (everything under the model shares one array of
// active planes). The cut face is filled two ways:
//   • Back faces are drawn in a flat colour (the region's own colour on the
//     brain), so looking through the cut the far wall reads as solid.
//   • Models with a `sections` volume also get a "cap" plane on the cut that
//     looks up which atlas region each point is in and paints it in that
//     region's colour with thin borders, like an atlas section. A stencil
//     mask built from the model's "__outline" mesh trims the cap to the
//     real (smooth) brain surface, so its 1 mm voxel steps never stick out.
//
// State lives in one `var` so the render loop (which starts before this code
// runs) can safely check it.
var slicer = null;
var activeModelDef = null; // MODELS entry of the model being shown

const SLICE_AXES = {
  coronal:    new THREE.Vector3(0, 0, 1), // anterior
  sagittal:   new THREE.Vector3(1, 0, 0),
  transverse: new THREE.Vector3(0, 1, 0), // superior
};
// The two axes each plane can tilt about (anatomical frame), with the name of
// that rotation: about left-right = pitch, vertical = yaw, front-back = roll.
const _AX_LR = new THREE.Vector3(1, 0, 0), _AX_SI = new THREE.Vector3(0, 1, 0), _AX_AP = new THREE.Vector3(0, 0, 1);
const SLICE_TILTS = {
  coronal:    [{ axis: _AX_LR, name: 'Pitch' }, { axis: _AX_SI, name: 'Yaw' }],
  sagittal:   [{ axis: _AX_AP, name: 'Roll' },  { axis: _AX_SI, name: 'Yaw' }],
  transverse: [{ axis: _AX_LR, name: 'Pitch' }, { axis: _AX_AP, name: 'Roll' }],
};
// Written straight to the output after colour conversion, so store the sRGB
// values as-is (no linear conversion).
const SLICE_CAP_COLOR = new THREE.Color().setRGB(0xd0 / 255, 0x8a / 255, 0x78 / 255, THREE.LinearSRGBColorSpace);

slicer = {
  on: false,
  axis: 'coronal',
  pos: 0.5,          // 0..1 across the model's extent along the axis
  face: 'atlas',     // cut face: 'atlas' colours, or 'mri' (the plain scan)
  tilt: [0, 0],      // degrees about the plane's two tilt axes (SLICE_TILTS)
  samplePts: null,   // model-local vertex sample for measuring extents
  flip: false,
  showPlane: true,
  sweep: null,       // { t } while sweeping
  baseQuat: new THREE.Quaternion(), // model orientation at load = anatomical frame
  extents: {},       // axis -> { min, max } in model-local space
  localPlanes: [new THREE.Plane(), new THREE.Plane()],
  worldPlanes: [new THREE.Plane(), new THREE.Plane()],
  activePlanes: [],  // the world planes in use; shared by every clipped material
  outline: null,     // the model's "__outline" mesh (stencil mask source), if any
  stencils: null,    // per-cap stencil passes built from the outline
  capOn: { value: 0 },
  capGrey: { value: 0 }, // 1 in MRI mode: inner walls drawn grey to match the scan
  helpers: null,     // THREE.Group with the plane outlines
  caps: null,        // THREE.Group with the region-coloured cut faces
  sections: null,    // { data, dims, voxelMm, regions, byAcronym, tex, pal, localToTex }
  worldToTex: new THREE.Matrix4(),
};

const sliceSection   = document.getElementById('slice-section');
const sliceToggle    = document.getElementById('slice-toggle');
const sliceDock      = document.getElementById('slice-dock');
const sliceStart     = document.getElementById('slice-start');
const sliceMore      = document.getElementById('slice-more');
const sliceExtras    = document.getElementById('slice-extras');
const sliceAxes      = document.getElementById('slice-axes');
const slicePos       = document.getElementById('slice-pos');
const slicePosVal    = document.getElementById('slice-pos-val');
const slicePlaneShow = document.getElementById('slice-plane-show');
const sliceFlip      = document.getElementById('slice-flip');
const sliceSweep     = document.getElementById('slice-sweep');
const sliceFace      = document.getElementById('slice-face');
const sliceTilt      = [document.getElementById('slice-tilt-a'), document.getElementById('slice-tilt-b')];
const sliceTiltName  = [document.getElementById('slice-tilt-a-name'), document.getElementById('slice-tilt-b-name')];
const sliceTiltVal   = [document.getElementById('slice-tilt-a-val'), document.getElementById('slice-tilt-b-val')];
const sliceStraighten = document.getElementById('slice-straighten');
const regionTip      = document.getElementById('region-tip');

// Called once per loaded model: hooks the back-face cap colour into its
// materials. Models with region sections cap each region in its own colour.
function prepareSliceMaterials(object, model) {
  slicer.baseQuat.copy(object.quaternion);
  slicer.extents = {};
  slicer.samplePts = null;
  slicer.outline = null;
  slicer.stencils = null;
  object.traverse(child => {
    if (!child.isMesh) return;
    if (child.name === '__outline') {
      // Never drawn itself (material hidden so its stencil children still
      // render); only its shape is used.
      child.userData.sliceOutline = true;
      child.material.visible = false;
      slicer.outline = child;
      return;
    }
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(m => {
      if ('sliceOrigSide' in m.userData) return; // shared material: already prepared
      m.userData.sliceOrigSide = m.side;
      const capColor = model?.sections && m.color
        ? m.color.clone().convertLinearToSRGB()
        : SLICE_CAP_COLOR;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, r) => {
        if (prev) prev(shader, r);
        shader.uniforms.sliceCapOn = slicer.capOn;
        shader.uniforms.sliceCapGrey = slicer.capGrey;
        shader.uniforms.sliceCapColor = { value: capColor };
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'uniform float sliceCapOn;\nuniform float sliceCapGrey;\nuniform vec3 sliceCapColor;\nvoid main() {')
          .replace('#include <dithering_fragment>',
            '#include <dithering_fragment>\n' +
            'if (sliceCapOn > 0.5 && !gl_FrontFacing) gl_FragColor = vec4(mix(sliceCapColor, vec3(0.62), sliceCapGrey), gl_FragColor.a);');
      };
      m.customProgramCacheKey = () => 'slice-cap';
      m.needsUpdate = true;
    });
  });
}

// Back faces must be drawn for the cap to show; restore the original side after.
function setSliceMaterialsDoubleSided(on) {
  if (!currentModel) return;
  currentModel.traverse(child => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(m => {
      if (!('sliceOrigSide' in m.userData)) return;
      const side = on ? THREE.DoubleSide : m.userData.sliceOrigSide;
      if (m.side !== side) { m.side = side; m.needsUpdate = true; }
    });
  });
}

// ── Region section volume (brain) ──
// <id>_regions.json lists the regions and points at a gzipped uint8 volume
// holding the region index of every voxel (see tools/build-brain.py).
async function fetchMaybeGzip(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) return buf; // already decoded by the server
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Downloads + unpacks a volume in a worker (js/volume-worker.js) so the page
// stays responsive; falls back to the main thread if workers aren't available.
let _volWorker = null, _volSeq = 0;
const _volJobs = new Map();
function volumeWorker() {
  if (_volWorker !== null) return _volWorker;
  try {
    _volWorker = new Worker(new URL('./volume-worker.js', import.meta.url));
    _volWorker.onmessage = e => {
      const job = _volJobs.get(e.data.id);
      if (!job) return;
      _volJobs.delete(e.data.id);
      if (e.data.error) job.reject(new Error(e.data.error)); else job.resolve(e.data.data);
    };
    _volWorker.onerror = () => { // worker couldn't start: finish its jobs here instead
      const jobs = [..._volJobs.values()];
      _volJobs.clear();
      _volWorker = false;
      jobs.forEach(j => loadVolumeHere(j.opts).then(j.resolve, j.reject));
    };
  } catch (e) {
    _volWorker = false;
  }
  return _volWorker;
}
async function loadVolumeHere({ url, delta, plane }) {
  const data = await fetchMaybeGzip(url);
  if (delta && plane > 0) {
    for (let cur = plane; cur < data.length; cur += plane) {
      const prev = cur - plane;
      for (let i = 0; i < plane; i++) data[cur + i] = (data[cur + i] + data[prev + i]) & 255;
    }
  }
  return data;
}
function loadVolume(url, { delta = false, plane = 0, priority } = {}) {
  const opts = { url: new URL(url, location.href).href, delta, plane, priority };
  const w = volumeWorker();
  if (!w) return loadVolumeHere(opts);
  return new Promise((resolve, reject) => {
    const id = ++_volSeq;
    _volJobs.set(id, { resolve, reject, opts });
    w.postMessage({ id, ...opts });
  });
}

// Starts a model's region data downloading as soon as the model is picked,
// alongside the 3D model itself (instead of one after the other). Each part
// is a promise; loadSections() picks them up. Kept per model so reopening
// the brain doesn't download it again.
const _sectionsFetch = new Map();
function startSectionsFetch(model, modelReady = Promise.resolve()) {
  if (_sectionsFetch.has(model.id)) return _sectionsFetch.get(model.id);
  const base = model.sections.slice(0, model.sections.lastIndexOf('/') + 1);
  const meta = fetch(model.sections).then(r => {
    if (!r.ok) throw new Error(`${model.sections}: ${r.status}`);
    return r.json();
  });
  const vol = meta.then(m => loadVolume(base + m.sections.file));
  // The full-resolution region map (every device).
  const hd = Promise.all([meta, modelReady])
    .then(([m]) => (m.mri?.hd?.labels ? loadVolume(base + m.mri.hd.labels) : null));
  const entry = { base, meta, vol, hd };
  [meta, vol, hd].forEach(p => p.catch(() => { _sectionsFetch.delete(model.id); })); // retry next time
  _sectionsFetch.set(model.id, entry);
  return entry;
}

async function loadSections(model) {
  try {
    const fetching = startSectionsFetch(model);
    const base = fetching.base;
    const meta = await fetching.meta;
    const data = await fetching.vol;
    if (activeModelDef !== model) return; // switched models while loading
    const [w, h, d] = meta.sections.dims;
    if (data.length !== w * h * d) throw new Error('Section volume has the wrong size');

    const tex = new THREE.Data3DTexture(data, w, h, d);
    tex.format = THREE.RedFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;

    const palData = new Uint8Array(256 * 4);
    const regions = [];
    meta.regions.forEach(r => {
      regions[r.index] = r;
      // Store the original sRGB bytes (written to the screen unconverted).
      const hex = parseInt(r.color.slice(1), 16);
      palData.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], r.index * 4);
    });
    const pal = new THREE.DataTexture(palData, 256, 1, THREE.RGBAFormat);
    pal.minFilter = pal.magFilter = THREE.NearestFilter;
    pal.needsUpdate = true;

    // Model-local (mm, viewer axes) -> texture coords (0..1). The volume's
    // texture x/y/z run along +X, -Y, -Z (left, inferior, posterior), starting
    // from the corner at originMm (the model-local origin when omitted).
    const v = meta.sections.voxelMm;
    const origin = new THREE.Vector3(...(meta.sections.originMm ?? [0, 0, 0]));
    const localToTex = new THREE.Matrix4().makeScale(1 / (w * v), -1 / (h * v), -1 / (d * v))
      .multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));

    slicer.sections = {
      data, dims: [w, h, d], voxelMm: v, origin, regions, tex, pal, palData, localToTex,
      byAcronym: Object.fromEntries(meta.regions.map(r => [r.acronym, r])),
      // MRI, loaded on first use: the 0.5 mm scan on computers, 1 mm on phones.
      mriUrl: meta.mri ? base + (MRI_HD && meta.mri.hd ? meta.mri.hd.file : meta.mri.file) : null,
      mriHd: MRI_HD && meta.mri?.hd ? meta.mri.hd : null,
      mriTex: null,
      mriScale: new THREE.Vector3(1, 1, 1),
      mriOffset: new THREE.Vector3(0, 0, 0),
      // The 0.5 mm grid (cropped), shared by the full-resolution region map
      // (every device) and the 0.5 mm MRI (computers).
      hdGrid: meta.mri?.hd ?? null,
      hdScale: new THREE.Vector3(1, 1, 1),
      hdOffset: new THREE.Vector3(0, 0, 0),
      labelsHdTex: null, // the 0.5 mm region map, loaded after this
    };
    const sec = slicer.sections;
    if (sec.hdGrid) {
      // Section texture coord t -> HD voxel t * dims * k, minus the crop corner.
      const hd = sec.hdGrid, k = hd.voxelScale, [hw, hh, hdep] = hd.dims;
      sec.hdScale.set(w * k / hw, h * k / hh, d * k / hdep);
      sec.hdOffset.set(-hd.corner[0] / hw, -hd.corner[1] / hh, -hd.corner[2] / hdep);
      if (sec.mriHd) { sec.mriScale.copy(sec.hdScale); sec.mriOffset.copy(sec.hdOffset); }
    }
    syncCapUniforms();
    if (sec.hdGrid?.labels) loadSectionLabelsHd(sec, fetching.hd);
    initStructures(model);
    setSliceFace('atlas');
    sliceFace.classList.toggle('hidden', !slicer.sections.mriUrl);
  } catch (e) {
    console.error('Could not load the region sections:', e);
  }
}

function disposeSections() {
  resetStructures();
  sliceFace.classList.add('hidden');
  if (!slicer.sections) return;
  slicer.sections.mriTex?.dispose();
  slicer.sections.labelsHdTex?.dispose();
  slicer.sections.tex.dispose();
  slicer.sections.pal.dispose();
  slicer.sections = null;
  hideRegionTip();
}

const _ONE3 = new THREE.Vector3(1, 1, 1), _ZERO3 = new THREE.Vector3(0, 0, 0);
const SECTION_CAP_VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const SECTION_CAP_FRAG = /* glsl */`
  precision highp sampler3D;
  uniform sampler3D uVol;
  uniform sampler2D uPal;
  uniform mat4 uWorldToTex;
  uniform vec3 uTexU;   // one voxel along the plane's x axis, in texture units
  uniform vec3 uTexV;   // one voxel along the plane's y axis
  uniform float uHover; // region index under the pointer (0 = none)
  uniform float uSel;   // selected region index (0 = none)
  uniform sampler3D uMri; // MRI template (MRI mode)
  uniform vec3 uMriScale;  // section texture coords -> MRI texture coords
  uniform vec3 uMriOffset; //   (the HD scan is finer and cropped)
  uniform float uMode;  // 0 = atlas colours, 1 = the MRI only
  uniform sampler3D uVolHd; // the region map at full 0.5 mm (every device)
  uniform float uUseHd;     // 1 once uVolHd is loaded
  uniform vec3 uHdScale;    // section texture coords -> HD texture coords
  uniform vec3 uHdOffset;
  uniform vec3 uDims;       // voxel counts of uVol / uVolHd
  uniform vec3 uDimsHd;
  uniform float uSmooth;    // 1 = smooth boundaries between voxels
  varying vec3 vWorld;
  float labelAt(sampler3D v, ivec3 c, ivec3 n) {
    return floor(texelFetch(v, clamp(c, ivec3(0), n - 1), 0).r * 255.0 + 0.5);
  }
  // The region at texture coords tc of volume v, as vec3(region, how
  // firmly it wins 0..1, runner-up region). Smoothing treats each region as
  // a soft shape: the 8 voxels around the point vote with their trilinear
  // weights and the region with the most weight wins. Boundaries then
  // follow the curve the voxels describe (never more than half a voxel from
  // the data) instead of a staircase; no region is invented or moved. The
  // winning margin also says how close a boundary is, which draws the
  // border lines without extra lookups.
  vec3 labelIn(sampler3D v, vec3 tc, vec3 dims) {
    if (uSmooth < 0.5) return vec3(floor(texture(v, tc).r * 255.0 + 0.5), 1.0, -1.0);
    vec3 p = tc * dims - 0.5;
    ivec3 b = ivec3(floor(p));
    vec3 f = p - floor(p);
    ivec3 n = ivec3(dims);
    float L[8];
    float W[8];
    for (int i = 0; i < 8; i++) {
      ivec3 o = ivec3(i & 1, (i >> 1) & 1, (i >> 2) & 1);
      L[i] = labelAt(v, b + o, n);
      vec3 w = mix(1.0 - f, f, vec3(o));
      W[i] = w.x * w.y * w.z;
    }
    float S[8]; // total weight of each voxel's region
    for (int i = 0; i < 8; i++) {
      S[i] = 0.0;
      for (int j = 0; j < 8; j++) S[i] += L[j] == L[i] ? W[j] : 0.0;
    }
    float best = L[0], bestW = S[0];
    for (int i = 1; i < 8; i++) if (S[i] > bestW) { best = L[i]; bestW = S[i]; }
    float second = -1.0, secondW = -1.0;
    for (int i = 0; i < 8; i++) if (L[i] != best && S[i] > secondW) { second = L[i]; secondW = S[i]; }
    return vec3(best, bestW, second);
  }
  vec3 regionAt(vec3 t) {
    if (uUseHd > 0.5) {
      vec3 th = t * uHdScale + uHdOffset;
      if (any(lessThan(th, vec3(0.0))) || any(greaterThan(th, vec3(1.0)))) return vec3(0.0, 1.0, -1.0);
      return labelIn(uVolHd, th, uDimsHd);
    }
    return labelIn(uVol, t, uDims);
  }
  // 1 when a neighbour is a different region (not empty space: the outer
  // edge is trimmed smoothly by the outline stencil instead).
  float border(float n, float r) { return step(0.5, n) * step(0.5, abs(n - r)); }
  void main() {
    vec3 t = (uWorldToTex * vec4(vWorld, 1.0)).xyz;
    if (any(lessThan(t, vec3(0.0))) || any(greaterThan(t, vec3(1.0)))) discard;
    vec3 here = regionAt(t);
    float r = here.x;
    bool mri = uMode > 0.5;
    // Atlas mode shows labelled voxels only; MRI mode also shows the scan
    // between them (fluid in sulci, ...) inside the outline mask.
    if (r < 0.5 && !mri) discard;
    vec4 pc = texture(uPal, vec2((r + 0.5) / 256.0, 0.5));
    if (r > 0.5 && pc.a < 0.5) discard; // region hidden in the Structures panel
    if (mri) { // just the scan
      vec3 tm = t * uMriScale + uMriOffset;
      float g = all(greaterThanEqual(tm, vec3(0.0))) && all(lessThanEqual(tm, vec3(1.0))) ? texture(uMri, tm).r : 0.0;
      gl_FragColor = vec4(vec3(g), 1.0);
      return;
    }
    vec3 col = pc.rgb;
    if (uSmooth > 0.5) {
      // Smooth border line where the vote is close between two regions (not
      // against empty space: the outline stencil trims the outer edge).
      if (here.z > 0.5) col *= mix(0.66, 1.0, smoothstep(0.55, 0.9, here.y));
    } else {
      // Darken voxels on a border between regions (neighbours within the plane).
      vec3 du = uTexU * (uUseHd > 0.5 ? 0.5 : 1.0), dv = uTexV * (uUseHd > 0.5 ? 0.5 : 1.0);
      float edge = border(regionAt(t + du).x, r) + border(regionAt(t - du).x, r)
                 + border(regionAt(t + dv).x, r) + border(regionAt(t - dv).x, r);
      if (edge > 0.0) col *= 0.7;
    }
    if (r > 0.5 && (abs(r - uHover) < 0.5 || abs(r - uSel) < 0.5)) col = mix(col, vec3(1.0), 0.35);
    gl_FragColor = vec4(col, 1.0);
  }`;

// ── Cut face mode: atlas colours, or the plain MRI ──
// The 3D atlas model stays visible around the cut either way; in MRI mode
// the cut face is the scan alone (no atlas colours on it).
const SLICE_FACE_MODES = { atlas: 0, mri: 1 };

// Every device gets the full 0.5 mm region map. Computers also get the
// 0.5 mm MRI; phones / tablets the 1 mm one (an eighth of the download and
// graphics memory).
const MRI_HD = !window.matchMedia('(pointer: coarse)').matches;
// Smooth the cut face's region boundaries (see labelIn in the shader). Off:
// voxels are drawn as they are, at full 0.5 mm resolution on computers.
const SLICE_SMOOTH = false;

// Pushes the current section textures and settings to the cut-face shader.
function syncCapUniforms() {
  if (!slicer.caps) return;
  const u = slicer.caps.children[0].material.uniforms;
  const sec = slicer.sections;
  u.uVol.value = sec?.tex ?? null;
  u.uPal.value = sec?.pal ?? null;
  u.uMri.value = sec?.mriTex ?? null;
  u.uMode.value = SLICE_FACE_MODES[slicer.face] ?? 0;
  u.uMriScale.value.copy(sec?.mriScale ?? _ONE3);
  u.uMriOffset.value.copy(sec?.mriOffset ?? _ZERO3);
  u.uVolHd.value = sec?.labelsHdTex ?? null;
  u.uUseHd.value = sec?.labelsHdTex ? 1 : 0;
  u.uHdScale.value.copy(sec?.hdScale ?? _ONE3);
  u.uHdOffset.value.copy(sec?.hdOffset ?? _ZERO3);
  if (sec) u.uDims.value.set(...sec.dims);
  if (sec?.hdGrid) u.uDimsHd.value.set(...sec.hdGrid.dims);
}

// The 0.5 mm region map (every device): sharper cut-face boundaries. Fetched
// alongside the brain (startSectionsFetch); the 1 mm map is used until it
// arrives. Afterwards, on computers, the MRI is fetched quietly in the background, so
// switching the cut face to MRI is near-instant.
async function loadSectionLabelsHd(sec, pending) {
  try {
    const data = await pending;
    if (!data) return;
    const [w, h, d] = sec.hdGrid.dims;
    if (data.length !== w * h * d) throw new Error('Region map has the wrong size');
    if (slicer.sections !== sec) return; // switched models meanwhile
    const tex = new THREE.Data3DTexture(data, w, h, d);
    tex.format = THREE.RedFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    sec.labelsHdTex = tex;
    syncCapUniforms();
    if (MRI_HD) setTimeout(() => { // computers: warm up the 0.5 mm MRI too
      if (slicer.sections !== sec) return;
      loadSectionMri({ priority: 'low' })
        .then(tex => { if (tex && slicer.sections === sec) renderer.initTexture(tex); }) // upload now, not on first use
        .catch(() => {});
    }, 1500);
  } catch (e) {
    console.warn('Sharper region map not loaded; using the 1 mm one.', e);
  }
}
let _mriLoading = null;

// Fetches the MRI template (models with `mri` in <id>_regions.json) once.
async function loadSectionMri({ priority } = {}) {
  const sec = slicer.sections;
  if (!sec?.mriUrl) return null;
  if (sec.mriTex) return sec.mriTex;
  if (!_mriLoading) {
    _mriLoading = (async () => {
      const hd = sec.mriHd;
      const [w, h, d] = hd ? hd.dims : sec.dims;
      // The HD scan stores slice-to-slice differences; the worker undoes them.
      const data = await loadVolume(sec.mriUrl, { delta: !!hd, plane: w * h, priority });
      if (data.length !== w * h * d) throw new Error('MRI volume has the wrong size');
      const tex = new THREE.Data3DTexture(data, w, h, d);
      tex.format = THREE.RedFormat;
      tex.type = THREE.UnsignedByteType;
      tex.minFilter = tex.magFilter = THREE.LinearFilter; // smooth grey levels
      tex.unpackAlignment = 1;
      tex.needsUpdate = true;
      if (slicer.sections === sec) sec.mriTex = tex; else tex.dispose();
      return tex;
    })().finally(() => { _mriLoading = null; });
  }
  return _mriLoading;
}

async function setSliceFace(face) {
  if (face !== 'atlas' && !slicer.sections?.mriTex) {
    const btns = [...sliceFace.querySelectorAll(`button[data-face="${face}"]`)];
    const labels = btns.map(b => b.textContent);
    btns.forEach(b => { b.textContent = '…'; b.disabled = true; });
    try {
      await loadSectionMri();
    } catch (e) {
      console.error('Could not load the MRI:', e);
      showToast('Could not load the MRI', '', false);
      face = 'atlas';
    } finally {
      btns.forEach((b, i) => { b.textContent = labels[i]; b.disabled = false; });
    }
  }
  slicer.face = face;
  slicer.capGrey.value = face === 'mri' ? 1 : 0;
  sliceFace.querySelectorAll('button[data-face]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.face === face)));
  syncCapUniforms();
}

function buildSectionCaps() {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    vertexShader: SECTION_CAP_VERT,
    fragmentShader: SECTION_CAP_FRAG,
    uniforms: {
      uVol: { value: slicer.sections?.tex ?? null },
      uPal: { value: slicer.sections?.pal ?? null },
      uWorldToTex: { value: slicer.worldToTex },
      uTexU: { value: new THREE.Vector3() },
      uTexV: { value: new THREE.Vector3() },
      uHover: { value: 0 },
      uSel: { value: structState.selected?.index ?? 0 },
      uMri: { value: slicer.sections?.mriTex ?? null },
      uMriScale: { value: (slicer.sections?.mriScale ?? _ONE3).clone() },
      uMriOffset: { value: (slicer.sections?.mriOffset ?? _ZERO3).clone() },
      uMode: { value: SLICE_FACE_MODES[slicer.face] ?? 0 },
      uVolHd: { value: null },
      uUseHd: { value: 0 },
      uHdScale: { value: new THREE.Vector3(1, 1, 1) },
      uHdOffset: { value: new THREE.Vector3() },
      uDims: { value: new THREE.Vector3(1, 1, 1) },
      uDimsHd: { value: new THREE.Vector3(1, 1, 1) },
      uSmooth: { value: SLICE_SMOOTH ? 1 : 0 },
    },
    side: THREE.DoubleSide,
    // In front of mesh fragments lying on the plane. The slope factor covers
    // anti-aliasing samples of surfaces that meet the plane at a grazing angle.
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    // Drawn only where the outline's stencil pass marked "inside the model",
    // and resets the stencil as it goes so the next cap starts clean.
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  for (let i = 0; i < 2; i++) {
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    cap.visible = false;
    cap.renderOrder = 2 + i * 2; // right after its own stencil pass
    g.add(cap);
  }
  scene.add(g);
  return g;
}

// For each cap, two invisible passes of the outline mesh clipped by that cap's
// plane: back faces count up, front faces count down. Where the count is
// non-zero, the cap point is inside the model (three.js clipping-stencil
// technique).
function buildOutlineStencils() {
  const o = slicer.outline;
  return [0, 1].map(i => {
    const g = new THREE.Group();
    const make = (side, op) => {
      const m = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({
        side, colorWrite: false, depthWrite: false, depthTest: false,
        stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: op, stencilZFail: op, stencilZPass: op,
        clippingPlanes: [slicer.worldPlanes[i]],
      }));
      m.userData.sliceStencil = true;
      m.renderOrder = 1 + i * 2;
      return m;
    };
    g.add(make(THREE.BackSide, THREE.IncrementWrapStencilOp));
    g.add(make(THREE.FrontSide, THREE.DecrementWrapStencilOp));
    g.visible = false;
    o.add(g); // child of the outline, so it follows the model's transform
    return g;
  });
}

// Every material under the model clips against the active planes (including
// pins and drawn lines added later), except the stencil passes.
function applyModelClipping() {
  if (!currentModel) return;
  const planes = slicer.on ? slicer.activePlanes : null;
  currentModel.traverse(o => {
    if (!o.material || o.userData.sliceStencil) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if (m.clippingPlanes !== planes) { m.clippingPlanes = planes; m.needsUpdate = true; }
    });
  });
}

// The model's extent along the current cutting direction, in model-local
// space. Measured on a sample of the real vertices (tighter than a bounding
// box for tilted planes), cached per direction.
function sliceExtent() {
  const key = `${slicer.axis}|${slicer.tilt[0]}|${slicer.tilt[1]}`;
  if (slicer.extents[key]) return slicer.extents[key];
  if (!slicer.samplePts) slicer.samplePts = sampleModelPoints(60000);
  const n = sliceLocalNormal();
  const p = slicer.samplePts;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const dd = p[i] * n.x + p[i + 1] * n.y + p[i + 2] * n.z;
    if (dd < min) min = dd;
    if (dd > max) max = dd;
  }
  if (!isFinite(min)) { min = -1; max = 1; }
  return (slicer.extents[key] = { min, max });
}

// Up to `limit` model-local vertex positions (every k-th vertex).
function sampleModelPoints(limit) {
  currentModel.updateMatrixWorld(true);
  const inv = currentModel.matrixWorld.clone().invert();
  const meshes = [];
  let total = 0;
  currentModel.traverse(child => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    if (child.userData.sliceOutline || child.userData.sliceStencil) return;
    if (!('sliceOrigSide' in (Array.isArray(child.material) ? child.material[0] : child.material).userData)) return;
    meshes.push(child);
    total += child.geometry.attributes.position.count;
  });
  const stride = Math.max(1, Math.ceil(total / limit));
  const out = [];
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  meshes.forEach(child => {
    m.multiplyMatrices(inv, child.matrixWorld);
    const pos = child.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      out.push(v.x, v.y, v.z);
    }
  });
  return new Float32Array(out);
}

// Cutting direction in model-local space: the plane's axis, tilted, in the
// anatomical frame captured at load.
function sliceLocalNormal() {
  const n = SLICE_AXES[slicer.axis].clone();
  SLICE_TILTS[slicer.axis].forEach((t, i) => {
    if (slicer.tilt[i]) n.applyAxisAngle(t.axis, THREE.MathUtils.degToRad(slicer.tilt[i]));
  });
  return n.applyQuaternion(slicer.baseQuat.clone().invert()).normalize();
}

// Rebuilds the local-space planes from the current settings.
function updateSlicePlanes() {
  if (!currentModel) return;
  const n = sliceLocalNormal();
  const { min, max } = sliceExtent();
  const span = max - min;
  const c = min + slicer.pos * span;
  const p0 = slicer.localPlanes[0];
  if (slicer.flip) {
    p0.set(n.clone(), -c);              // keep the anterior/left/superior side
  } else {
    p0.set(n.clone().negate(), c);      // keep the posterior/right/inferior side
  }
  slicePosVal.textContent = Math.round(slicer.pos * 100) + '%';
  SLICE_TILTS[slicer.axis].forEach((t, i) => {
    sliceTiltName[i].textContent = t.name;
    sliceTiltVal[i].textContent = `${slicer.tilt[i]}°`;
    sliceTilt[i].value = String(slicer.tilt[i]);
  });
  sliceStraighten.disabled = !slicer.tilt[0] && !slicer.tilt[1];
  sliceAxes.querySelectorAll('button[data-axis]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.axis === slicer.axis)));
  slicePos.value = String(Math.round(slicer.pos * 1000));
}

function buildSliceHelpers() {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x4f7cff, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x9db6ff, transparent: true, opacity: 0.7 }));
    fill.add(edge);
    fill.renderOrder = 2;
    g.add(fill);
  }
  scene.add(g);
  return g;
}

const _sliceQ   = new THREE.Quaternion();
const _sliceZ   = new THREE.Vector3(0, 0, 1);
const _sliceP   = new THREE.Vector3();
const _sliceDir = new THREE.Vector3();
const _sliceM3  = new THREE.Matrix3();
const _sliceInv = new THREE.Matrix4();
// Per frame: move the planes with the model and advance a sweep.
function updateSlicer(dt) {
  if (!slicer || !currentModel) return;
  currentModel.updateMatrixWorld(true);
  if (slicer.sections) {
    _sliceInv.copy(currentModel.matrixWorld).invert();
    slicer.worldToTex.multiplyMatrices(slicer.sections.localToTex, _sliceInv);
  }
  if (!slicer.on) return;

  if (slicer.sweep) {
    slicer.sweep.t += dt / 6; // full pass in ~6 s
    slicer.pos = Math.min(slicer.sweep.t, 1);
    slicePos.value = String(Math.round(slicer.pos * 1000));
    updateSlicePlanes();
    if (slicer.sweep.t >= 1) setSliceSweep(false);
  }

  const count = 1; // one cutting plane (the code supports two)
  for (let i = 0; i < count; i++) {
    slicer.worldPlanes[i].copy(slicer.localPlanes[i]).applyMatrix4(currentModel.matrixWorld);
  }
  slicer.activePlanes.length = 0;
  for (let i = 0; i < count; i++) slicer.activePlanes.push(slicer.worldPlanes[i]);
  applyModelClipping();
  if (slicer.stencils) slicer.stencils.forEach((g, i) => { g.visible = i < count && !!slicer.sections; });

  // Outlines and caps sit exactly on the plane (they aren't clipped; the cap
  // wins the depth test against the cut edges via polygonOffset). Outlines fade as they turn to face the camera, where a tint over the
  // whole section would only get in the way; edge-on they're most useful.
  const outline = Math.max(fitRadius, 0.001) * 1.6;
  const capSize = Math.max(fitRadius, 0.001) * 2.4;
  camera.getWorldDirection(_sliceDir);
  for (let i = 0; i < 2; i++) {
    const active = i < count;
    const wp = slicer.worldPlanes[i];
    if (active) {
      wp.coplanarPoint(_sliceP);
      _sliceQ.setFromUnitVectors(_sliceZ, wp.normal);
    }
    const h = slicer.helpers.children[i];
    h.visible = active && slicer.showPlane;
    if (h.visible) {
      h.position.copy(_sliceP);
      h.quaternion.copy(_sliceQ);
      h.scale.setScalar(outline);
      const facing = Math.abs(_sliceDir.dot(wp.normal)); // 1 = head-on
      h.material.opacity = 0.14 * (1 - facing * facing);
      h.children[0].material.opacity = 0.15 + 0.6 * (1 - facing);
    }
    if (slicer.caps) {
      const cap = slicer.caps.children[i];
      cap.visible = active && !!slicer.sections && !!slicer.outline;
      if (cap.visible) {
        cap.position.copy(_sliceP);
        cap.quaternion.copy(_sliceQ);
        cap.scale.setScalar(capSize);
      }
    }
  }

  // In-plane voxel steps (texture units) for the region-border lines.
  if (slicer.caps && slicer.sections) {
    const u = slicer.caps.children[0].material.uniforms;
    _sliceM3.setFromMatrix4(slicer.worldToTex);
    const vox = slicer.sections.voxelMm * currentModel.matrixWorld.getMaxScaleOnAxis();
    u.uTexU.value.set(1, 0, 0).applyQuaternion(_sliceQ).multiplyScalar(vox).applyMatrix3(_sliceM3);
    u.uTexV.value.set(0, 1, 0).applyQuaternion(_sliceQ).multiplyScalar(vox).applyMatrix3(_sliceM3);
  }

  // Hide labels whose point has been cut away.
  if (labelLayer) {
    labelLayer.children.forEach(o => {
      o.getWorldPosition(_sliceP);
      o.element?.classList.toggle('slice-hidden', isPointSliced(_sliceP));
    });
  }
}

// True when a world-space point is in the cut-away part of the model.
function isPointSliced(p) {
  if (!slicer || !slicer.on) return false;
  return slicer.activePlanes.some(pl => pl.distanceToPoint(p) < 0);
}

// Raycast against the model, ignoring surface that has been sliced away, so
// pins, labels and line points can only land on what's actually visible.
function modelHits(ray) {
  if (!currentModel) return [];
  const hits = ray.intersectObject(currentModel, true)
    .filter(h => h.object.visible && !h.object.userData.sliceOutline && !h.object.userData.sliceStencil);
  return slicer && slicer.on ? hits.filter(h => !isPointSliced(h.point)) : hits;
}

function setSliceSweep(on) {
  slicer.sweep = on ? { t: slicer.pos >= 0.999 ? 0 : slicer.pos } : null;
  sliceSweep.setAttribute('aria-pressed', String(on));
  sliceSweep.textContent = on ? 'Stop' : 'Sweep';
}

function setSlicing(on) {
  if (on && !currentModel) return;
  slicer.on = on;
  sliceToggle.setAttribute('aria-pressed', String(on));
  sliceToggle.textContent = on ? 'Stop slicing' : 'Slice model';
  sliceDock.classList.toggle('hidden', !on);
  sliceStart.classList.toggle('hidden', on || !activeModelDef?.slicer);
  container.classList.toggle('slicing', on);
  slicer.capOn.value = on ? 1 : 0;
  setSliceMaterialsDoubleSided(on);
  if (on) {
    if (!slicer.helpers) slicer.helpers = buildSliceHelpers();
    if (!slicer.caps) { slicer.caps = buildSectionCaps(); syncCapUniforms(); }
    if (slicer.outline && !slicer.stencils) slicer.stencils = buildOutlineStencils();
    updateSlicePlanes();
  } else {
    setSliceSweep(false);
    slicer.activePlanes.length = 0;
    applyModelClipping();
    [slicer.helpers, slicer.caps].forEach(g => g?.children.forEach(h => { h.visible = false; }));
    slicer.stencils?.forEach(g => { g.visible = false; });
    document.querySelectorAll('.anno-label.slice-hidden').forEach(el => el.classList.remove('slice-hidden'));
  }
}

// The panel shows only for models that opt in, while their feature is on.
function applySlicerFeature() {
  const feature = activeModelDef?.devFeature;
  const enabled = !!activeModelDef?.slicer && (!feature || isDevFeatureEnabled(feature));
  sliceSection.classList.toggle('hidden', !enabled);
  sliceStart.classList.toggle('hidden', !enabled || slicer.on);
  if (!enabled && slicer.on) setSlicing(false);
}

// Models tied to a developer feature are listed only while it's on.
function applyDevModelButtons() {
  regionSelector.querySelectorAll('.region-btn[data-dev-feature]').forEach(btn => {
    btn.hidden = !isDevFeatureEnabled(btn.dataset.devFeature);
  });
}

// ── Region names under the pointer (models with sections) ──
// Hover with a mouse, or tap on a touch screen, to see the region's name.
//
// Picking never raycasts the ~500k-triangle region meshes. Instead it walks
// the pointer's ray through the section volume (in the model's own space) in
// half-voxel steps and stops at the first voxel that belongs to a region and
// hasn't been sliced away: that's what is visible at that pixel. If that
// voxel sits on a cut plane, the pointer is on the cut face. A walk is a few
// hundred array reads, well under a millisecond.
const _tipRay  = new THREE.Raycaster();
const _tipNdc  = new THREE.Vector2();
const _tipP    = new THREE.Vector3();
const _tipInv  = new THREE.Matrix4();
const _tipLRay = new THREE.Ray();
const _tipBox  = new THREE.Box3();
let _tipPos = null, _tipFrame = 0, _tipRegion = null;

// Returns { region, cap } for the pixel at client (x, y), or null.
function pickRegionAt(clientX, clientY) {
  const sec = slicer.sections;
  if (!sec || !currentModel) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  _tipNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  _tipRay.setFromCamera(_tipNdc, camera);

  // Into model-local space, where the volume is an axis-aligned box: with
  // corner o, voxel (x, y, z) spans X o.x+[x, x+1]v, Y o.y-[y, y+1]v,
  // Z o.z-[z, z+1]v.
  _tipInv.copy(currentModel.matrixWorld).invert();
  const ray = _tipLRay.copy(_tipRay.ray).applyMatrix4(_tipInv);
  ray.direction.normalize();
  const [w, h, d] = sec.dims, v = sec.voxelMm, o = sec.origin;
  _tipBox.min.set(o.x, o.y - h * v, o.z - d * v);
  _tipBox.max.set(o.x + w * v, o.y, o.z);
  let t = 0;
  if (!_tipBox.containsPoint(ray.origin)) {
    if (!ray.intersectBox(_tipBox, _tipP)) return null;
    t = ray.origin.distanceTo(_tipP);
  }
  const planes = slicer.on ? slicer.localPlanes.slice(0, 1) : [];
  const step = v * 0.5;
  const end = t + _tipBox.min.distanceTo(_tipBox.max);
  for (; t <= end; t += step) {
    ray.at(t, _tipP);
    const x = Math.floor((_tipP.x - o.x) / v), y = Math.floor((o.y - _tipP.y) / v), z = Math.floor((o.z - _tipP.z) / v);
    if (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d) continue;
    if (planes.some(pl => pl.distanceToPoint(_tipP) < 0)) continue; // sliced away
    const region = sec.regions[sec.data[(z * h + y) * w + x]];
    if (!region || !regionPickable(region)) continue; // see through hidden / faded ones
    const cap = planes.some(pl => pl.distanceToPoint(_tipP) < step * 1.5);
    return { region, cap };
  }
  return null;
}

function hideRegionTip() {
  _tipPos = null;
  _tipRegion = null;
  regionTip.classList.add('hidden');
  if (slicer.caps) slicer.caps.children[0].material.uniforms.uHover.value = 0;
}

// Places the tip next to the pointer, kept inside the viewer. Touch puts it
// above the finger so it isn't hidden under it.
function placeRegionTip(clientX, clientY, touch) {
  const rect = container.getBoundingClientRect();
  const w = regionTip.offsetWidth, h = regionTip.offsetHeight;
  let left = clientX - rect.left + (touch ? -w / 2 : 14);
  let top  = clientY - rect.top  + (touch ? -h - 28 : 16);
  if (top < 8) top = clientY - rect.top + 28;
  left = Math.max(8, Math.min(left, rect.width - w - 8));
  top  = Math.max(8, Math.min(top, rect.height - h - 8));
  regionTip.style.left = `${left}px`;
  regionTip.style.top  = `${top}px`;
}

function showRegionTipAt(clientX, clientY, touch) {
  const hit = pickRegionAt(clientX, clientY);
  if (slicer.caps) slicer.caps.children[0].material.uniforms.uHover.value = hit?.cap ? hit.region.index : 0;
  if (!hit) { _tipRegion = null; regionTip.classList.add('hidden'); return; }
  if (hit.region !== _tipRegion) {
    const name = hit.region.name;
    regionTip.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    _tipRegion = hit.region;
  }
  regionTip.classList.remove('hidden');
  placeRegionTip(clientX, clientY, touch);
}

function regionTipAllowed() {
  return !!slicer.sections && navMode === 'orbit' && currentClickMode() === null && !drawMode;
}

// Mouse: the tip follows the cursor every move; the (cheap) pick runs at
// most once per frame.
renderer.domElement.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !regionTipAllowed()) return;
  if (e.buttons || !structPop.classList.contains('hidden')) { hideRegionTip(); return; } // dragging, or pop-up open
  _tipPos = [e.clientX, e.clientY];
  if (!regionTip.classList.contains('hidden')) placeRegionTip(e.clientX, e.clientY, false);
  if (_tipFrame) return;
  _tipFrame = requestAnimationFrame(() => {
    _tipFrame = 0;
    if (_tipPos) showRegionTipAt(_tipPos[0], _tipPos[1], false);
  });
});
renderer.domElement.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideRegionTip(); });

// Pointer gestures on the 3D view (models with region sections):
//   • tap (touch)                   → name tip for the region under the finger
//   • right-click, or press & hold  → Isolate pop-up for that structure
//     (mouse or finger, ~half a second without moving)
// A plain mouse click does nothing extra (hovering already names things),
// apart from closing an open pop-up. Pointer events are used rather than
// "click", which touch browsers don't always send after a tap on the canvas.
const LONG_PRESS_MS = 550;
let _press = null; // { x, y, t, touch, button, timer, long }

function cancelLongPress() {
  if (_press?.timer) clearTimeout(_press.timer);
  if (_press) _press.timer = null;
}

renderer.domElement.addEventListener('pointerdown', e => {
  cancelLongPress();
  _press = null;
  if (!e.isPrimary || !regionTipAllowed()) return;
  const touch = e.pointerType !== 'mouse';
  _press = { x: e.clientX, y: e.clientY, t: performance.now(), touch, button: e.button, timer: null, long: false };
  if (e.button === 0 && structState.active) {
    const press = _press;
    press.timer = setTimeout(() => {
      press.timer = null;
      if (_press !== press) return;
      press.long = true;
      if (onStructureMenu(press.x, press.y, press.touch)) navigator.vibrate?.(12);
    }, LONG_PRESS_MS);
  }
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!_press || !e.isPrimary) return;
  if (Math.hypot(e.clientX - _press.x, e.clientY - _press.y) > (_press.touch ? 10 : 5)) {
    cancelLongPress();
    _press = null; // it's a drag (rotate / pan), not a tap or press
  }
});
renderer.domElement.addEventListener('pointerup', e => {
  const press = _press;
  cancelLongPress();
  _press = null;
  if (!press || !e.isPrimary || !regionTipAllowed()) return;
  if (press.long) return; // the long press already opened the pop-up
  const quick = performance.now() - press.t < LONG_PRESS_MS;
  if (press.button === 2) { // right-click
    if (structState.active) onStructureMenu(e.clientX, e.clientY, false);
    return;
  }
  if (!quick) return;
  if (!structPop.classList.contains('hidden')) { closeStructPop(); return; }
  if (press.touch) showRegionTipAt(e.clientX, e.clientY, true); // tap: name it
});
renderer.domElement.addEventListener('pointercancel', () => { cancelLongPress(); _press = null; });
// No browser menu on right-click over the model (right-click opens ours).
renderer.domElement.addEventListener('contextmenu', e => { if (structState.active) e.preventDefault(); });

controls.addEventListener('start', () => { if (slicer.sections) hideRegionTip(); }); // the view is about to move
window.addEventListener('keydown', () => { if (slicer.sections) hideRegionTip(); });

// ── Structures: isolate (models with region sections) ──
// Right-click or press and hold a structure on the model to open a small
// pop-up with Isolate; "Show whole brain" (floating button, or the pop-up on
// the isolated structure) brings everything back. Hidden structures also drop
// out of the cut face, and hover / tap see through them.
// `var` so code that runs before this block (render loop, caps) can check it.
var structState = {
  active: false,
  meshes: new Map(),   // region index -> [mesh]
  hidden: new Set(),   // region indices hidden by Isolate
  selected: null,      // region shown in the pop-up
};

const structSection   = document.getElementById('struct-section');
const structPop       = document.getElementById('struct-pop');
const structPopName   = document.getElementById('struct-pop-name');
const structPopIsolate = document.getElementById('struct-pop-isolate');
const structPopClose  = document.getElementById('struct-pop-close');
const isolateRestore  = document.getElementById('isolate-restore');

const structName = r => r.name.charAt(0).toUpperCase() + r.name.slice(1);

function regionOpacity(idx) { return structState.hidden.has(idx) ? 0 : 1; }
// Hover and taps pass through hidden structures.
function regionPickable(region) {
  return !structState.active || regionOpacity(region.index) > 0;
}

function initStructures(model) {
  resetStructures();
  if (!slicer.sections || activeModelDef !== model) return;
  currentModel.traverse(o => {
    if (!o.isMesh || o.userData.sliceOutline || o.userData.sliceStencil) return;
    const r = slicer.sections.byAcronym[o.name];
    if (!r) return;
    if (!structState.meshes.has(r.index)) structState.meshes.set(r.index, []);
    structState.meshes.get(r.index).push(o);
  });
  structState.active = structState.meshes.size > 0;
  structSection.classList.toggle('hidden', !structState.active);
  applyStructures();
}

function resetStructures() {
  closeStructPop();
  structState.active = false;
  structState.meshes = new Map();
  structState.hidden = new Set();
  structSection.classList.add('hidden');
  isolateRestore.classList.add('hidden');
}

// Pushes the current state to the meshes, the cut face and the restore button.
function applyStructures() {
  if (!structState.active) return;
  structState.meshes.forEach((list, idx) => {
    const visible = regionOpacity(idx) > 0;
    list.forEach(o => { o.visible = visible; });
  });
  const sec = slicer.sections;
  if (sec) {
    sec.regions.forEach(r => { if (r) sec.palData[r.index * 4 + 3] = regionOpacity(r.index) > 0 ? 255 : 0; });
    sec.pal.needsUpdate = true;
  }
  isolateRestore.classList.toggle('hidden', structState.hidden.size === 0);
}

function setEmissive(idx, on) {
  structState.meshes.get(idx)?.forEach(o => {
    const m = o.material;
    if (!m.emissive) return;
    if (on) m.emissive.copy(m.color).multiplyScalar(0.55);
    else m.emissive.setRGB(0, 0, 0);
  });
}

function setSelected(region) {
  if (structState.selected) setEmissive(structState.selected.index, false);
  structState.selected = region;
  if (region) setEmissive(region.index, true);
  if (slicer.caps) slicer.caps.children[0].material.uniforms.uSel.value = region?.index ?? 0;
}

// True when `region` is the only structure showing (it was isolated).
function isIsolated(region) {
  return structState.hidden.size > 0 && structState.hidden.size === structState.meshes.size - 1
    && !structState.hidden.has(region.index);
}

// Opens the pop-up for `region` next to the pointer / finger.
function openStructPop(region, clientX, clientY, touch) {
  setSelected(region);
  structPopName.textContent = structName(region);
  const isolated = isIsolated(region);
  structPopIsolate.textContent = isolated ? 'Show whole brain' : 'Isolate';
  structPopIsolate.dataset.action = isolated ? 'show-all' : 'isolate';
  structPop.classList.remove('hidden');
  // Beside the cursor, above a finger, always inside the viewer.
  const rect = container.getBoundingClientRect();
  const w = structPop.offsetWidth, h = structPop.offsetHeight;
  const left = clientX - rect.left + (touch ? -w / 2 : 14);
  let top = clientY - rect.top + (touch ? -h - 28 : 14);
  if (top < 8) top = clientY - rect.top + 28;
  structPop.style.left = `${Math.max(8, Math.min(left, rect.width - w - 8))}px`;
  structPop.style.top  = `${Math.max(8, Math.min(top, rect.height - h - 8))}px`;
}

function closeStructPop() {
  structPop.classList.add('hidden');
  setSelected(null);
}

// Right-click / long press: open the pop-up for what's under the pointer.
// Returns true when there was a structure there.
function onStructureMenu(clientX, clientY, touch) {
  const hit = pickRegionAt(clientX, clientY);
  if (!hit) { closeStructPop(); return false; }
  hideRegionTip();
  openStructPop(hit.region, clientX, clientY, touch);
  return true;
}

function showAllStructures() {
  structState.hidden.clear();
  applyStructures();
}

structPopIsolate.addEventListener('click', () => {
  const r = structState.selected;
  if (!r) return;
  if (structPopIsolate.dataset.action === 'show-all') {
    showAllStructures();
    announce('Showing the whole brain');
  } else {
    structState.hidden = new Set(structState.meshes.keys());
    structState.hidden.delete(r.index);
    applyStructures();
    announce(`Showing only ${r.name}`);
  }
  closeStructPop();
});
structPopClose.addEventListener('click', closeStructPop);
isolateRestore.addEventListener('click', () => {
  closeStructPop();
  showAllStructures();
  announce('Showing the whole brain');
});
controls.addEventListener('start', () => { if (!structPop.classList.contains('hidden')) closeStructPop(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !structPop.classList.contains('hidden')) closeStructPop(); });

// ── Slice dock (the controls on the 3D view) ──
const PHONE_LAYOUT = window.matchMedia('(max-width: 600px)');
sliceToggle.addEventListener('click', () => {
  setSlicing(!slicer.on);
  if (slicer.on && PHONE_LAYOUT.matches) closeDrawer(); // the dock is on the main view
});
sliceStart.addEventListener('click', () => setSlicing(true));
document.getElementById('slice-close').addEventListener('click', () => setSlicing(false));
sliceMore.addEventListener('click', () => {
  const open = sliceExtras.hidden;
  sliceExtras.hidden = !open;
  sliceMore.setAttribute('aria-expanded', String(open));
});
sliceAxes.addEventListener('click', e => {
  const btn = e.target.closest('button[data-axis]');
  if (!btn || btn.dataset.axis === slicer.axis) return;
  slicer.axis = btn.dataset.axis;
  slicer.tilt = [0, 0]; // a new plane starts straight
  updateSlicePlanes();
});
sliceTilt.forEach((input, i) => input.addEventListener('input', () => {
  slicer.tilt[i] = Number(input.value);
  updateSlicePlanes();
}));
sliceStraighten.addEventListener('click', () => { slicer.tilt = [0, 0]; updateSlicePlanes(); });
sliceFace.addEventListener('click', e => {
  const btn = e.target.closest('button[data-face]');
  if (btn && !btn.disabled) setSliceFace(btn.dataset.face);
});
slicePos.addEventListener('input', () => {
  setSliceSweep(false);
  slicer.pos = Number(slicePos.value) / 1000;
  updateSlicePlanes();
});
slicePlaneShow.addEventListener('change', () => { slicer.showPlane = slicePlaneShow.checked; });
sliceFlip.addEventListener('click', () => { slicer.flip = !slicer.flip; updateSlicePlanes(); });
sliceSweep.addEventListener('click', () => setSliceSweep(!slicer.sweep));
window.addEventListener('devfeaturechange', () => { applySlicerFeature(); applyDevModelButtons(); });
applySlicerFeature();
applyDevModelButtons();

function addLabel(name, localPos, category = '', record = true) {
  if (!labelLayer) return;
  const entry = { name, position: [localPos.x, localPos.y, localPos.z], category };

  // The label is a zero-size anchor so CSS2DRenderer pins the DOT exactly on
  // the 3D point. The text/buttons float to the side without shifting it,
  // so the dot stays accurate at any zoom level.
  const el = document.createElement('div');
  el.className = 'anno-label';
  el.dataset.category = category;
  const dot = document.createElement('span');
  dot.className = 'anno-dot';
  dot.style.background = categoryColors()[category] ?? categoryColors()[''];
  const leader = document.createElement('span'); leader.className = 'anno-leader';
  const content = document.createElement('span'); content.className = 'anno-content';
  const txt = document.createElement('span'); txt.className = 'anno-text'; txt.textContent = name;
  content.append(txt);
  el.append(dot, leader, content);

  const obj = new CSS2DObject(el);
  obj.position.copy(localPos);
  obj.userData.leader = leader;
  obj.userData.content = content;

  if (EDIT_MODE) {
    // Delete button
    const del = document.createElement('span');
    del.className = 'anno-del'; del.textContent = '×'; del.title = 'Remove';
    del.addEventListener('pointerdown', e => e.stopPropagation());
    del.addEventListener('click', e => { e.stopPropagation(); removeLabel(entry, obj); });
    content.appendChild(del);

    // Drag the dot to move the pin (re-raycasts onto the surface).
    dot.classList.add('draggable');
    dot.addEventListener('pointerdown', e => {
      e.stopPropagation();
      e.preventDefault();
      dragging = { entry, obj };
      controls.enabled = false;
    });
  }

  labelLayer.add(obj);
  entry._obj = obj;
  if (dotsOnlyMode) el.classList.add('dots-only');
  if (record) {
    labelData.push(entry);
    updateCategoryFilterVisibility();
  }
}

function removeLabel(entry, obj) {
  labelLayer.remove(obj); // fires CSS2DObject 'removed' → cleans up the DOM node
  const i = labelData.indexOf(entry);
  if (i >= 0) labelData.splice(i, 1);
  updateCategoryFilterVisibility();
}

function clearLabels() {
  if (labelLayer) {
    [...labelLayer.children].forEach(o => labelLayer.remove(o));
    labelLayer.parent?.remove(labelLayer);
  }
  labelLayer = null;
  labelData = [];
}

function updateCategoryFilterVisibility() {
  const usedCats = new Set([
    ...labelData.map(e => e.category || ''),
    ...lineData.map(e => e.category || 'other'),
  ]);
  categoryFilters.querySelectorAll('.cat-filter-row[data-filter-cat]').forEach(row => {
    row.style.display = usedCats.has(row.dataset.filterCat) ? '' : 'none';
  });
}

function applyCategoryFilters() {
  const hiddenCats = new Set(
    [...categoryFilters.querySelectorAll('input[type="checkbox"][data-cat]')]
      .filter(cb => !cb.checked).map(cb => cb.dataset.cat)
  );
  labelData.forEach(entry => {
    entry._filtered = hiddenCats.has(entry.category || '');
    if (entry._obj) entry._obj.visible = !entry._filtered;
  });
  lineData.forEach(entry => {
    const hidden = hiddenCats.has(entry.category || 'other');
    if (entry._obj) entry._obj.visible = !hidden; // tube mesh
    if (entry._css) entry._css.visible = !hidden; // midpoint label
  });
  applyDotsOnlyMode();
}
categoryFilters.addEventListener('change', e => {
  if (e.target.id === 'dots-only-toggle') {
    dotsOnlyMode = e.target.checked;
    applyDotsOnlyMode();
  } else {
    applyCategoryFilters();
  }
});

let dotsOnlyMode = false;

function applyDotsOnlyMode() {
  const allEntries = [
    ...labelData.map(e => e._obj),
    ...lineData.map(e => e._css),
  ];
  allEntries.forEach(obj => {
    if (!obj) return;
    const el = obj.element;
    if (dotsOnlyMode) {
      el.classList.add('dots-only');
      el.classList.remove('label-peek');
    } else {
      el.classList.remove('dots-only', 'label-peek');
    }
  });
}

function setLabelsVisible(v) {
  labelsVisible = v;
  if (labelLayer) {
    labelLayer.visible = v;
    if (!v) {
      // Clear any peek state when fully hiding.
      labelData.forEach(entry => {
        if (entry._obj) entry._obj.element.classList.remove('label-peek');
      });
    }
    applyDotsOnlyMode();
  }
  labelsToggle.textContent = v ? 'Hide labels' : 'Show labels';
  labelsToggle.classList.toggle('active', v);
  labelsToggle.setAttribute('aria-pressed', String(v));
  categoryFilters.classList.toggle('hidden', !v);
  setLinesVisible(v);
}

async function loadLabels(model) {
  clearLabels();
  activeModelId = model.id;
  labelLayer = new THREE.Group();
  currentModel.add(labelLayer);

  let raw = [];
  if (model.labels) raw = model.labels;
  else try {
    const res = await fetch(`models/${model.id}/${model.id}_labels.json`, { cache: 'no-store' });
    if (res.ok) raw = await res.json();
  } catch (e) { /* no labels file — fine */ }

  // Support both old array format (labels only) and combined {labels, lines} format.
  const labels = Array.isArray(raw) ? raw       : (raw.labels || []);
  const lines  = Array.isArray(raw) ? []        : (raw.lines  || []);

  labels.forEach(d => addLabel(d.name, new THREE.Vector3(d.position[0], d.position[1], d.position[2]), d.category || ''));

  // Load lines from the combined file (lineLayer exists by now — initLineLayer
  // is called synchronously right after loadLabels in the model-load callback).
  if (lines.length && lineLayer) {
    lines.forEach(d => { lineData.push(d); _addLineEntry(d); });
    _lineColorIdx = lineData.length;
    setLinesVisible(labelsVisible);
  }

  labelsSection.classList.toggle('hidden', !(labelData.length || lines.length || EDIT_MODE));
  editSection.classList.toggle('hidden', !EDIT_MODE);
  updateCategoryFilterVisibility();
  // The quiz needs at least a correct answer plus a few distractors to be worth
  // offering; show "Test me" only when the model has enough named labels.
  quizBtn.classList.toggle('hidden', labelData.filter(l => l.name && l.name.trim()).length < 4);
  // Show labels up front in edit mode, or when the student has opted into the
  // "Show labels by default" setting (and this model actually has some).
  setLabelsVisible(EDIT_MODE || (labelsDefaultOn && labelData.length > 0));
}

// Models that should open straight into dots-only mode when labels are shown.
const DOTS_ONLY_DEFAULT_MODELS = new Set(['brainstem']);

labelsToggle.addEventListener('click', () => {
  const next = !labelsVisible;
  const wantDotsDefault = isTouchPrimary || DOTS_ONLY_DEFAULT_MODELS.has(activeModelId);
  if (next && wantDotsDefault && !dotsOnlyMode) {
    dotsOnlyMode = true;
    const cb = document.getElementById('dots-only-toggle');
    if (cb) cb.checked = true;
  }
  setLabelsVisible(next);
});

// Orient each label's leader line radially outward from the model centre
// (which sits at world origin and is the orbit target), so callouts fan out
// away from the mesh instead of all pointing the same way and covering it.
const _lblWorld = new THREE.Vector3();
const LEADER_LEN = 45; // keep in sync with .anno-leader width
function updateLabelLeaders() {
  if (!labelLayer || !labelsVisible || !labelLayer.children.length) return;
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  // Model centre (origin) in screen space.
  _lblWorld.set(0, 0, 0).project(camera);
  const cx = (_lblWorld.x * 0.5 + 0.5) * w;
  const cy = (-_lblWorld.y * 0.5 + 0.5) * h;

  labelLayer.children.forEach(o => {
    const leader = o.userData.leader, content = o.userData.content;
    if (!leader || !content) return;
    o.getWorldPosition(_lblWorld).project(camera);
    const sx = (_lblWorld.x * 0.5 + 0.5) * w;
    const sy = (-_lblWorld.y * 0.5 + 0.5) * h;
    let dx = sx - cx, dy = sy - cy;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) { dx = 0.7; dy = -0.7; } else { dx /= len; dy /= len; }

    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    leader.style.transform = `rotate(${angle}deg)`;

    const tipX = (LEADER_LEN + 4) * dx;
    const tipY = (LEADER_LEN + 4) * dy;
    content.style.left = `${tipX}px`;
    content.style.top = `${tipY}px`;
    // Anchor the text box on the side facing the model so it always reads
    // outward: right-edge at the tip when pointing left, left-edge when right.
    const tx = dx < -0.15 ? '-100%' : dx > 0.15 ? '0' : '-50%';
    content.style.transform = `translate(${tx}, -50%)`;
  });
}

// Edit mode: label placement — only active when labelPlacementMode is on.
function setLabelPlacementMode(on) {
  if (on) { setOrientMode(false); setDrawMode(false); }
  labelPlacementMode = on;
  labelPlaceBtn.classList.toggle('active', on);
  container.classList.toggle('label-place-mode', on);
  updateModeBanner();
}

labelPlaceBtn.addEventListener('click', () => setLabelPlacementMode(!labelPlacementMode));

let _pendingLabelHit = null;

renderer.domElement.addEventListener('click', e => {
  if (!labelPlacementMode || navMode !== 'orbit' || !currentModel) return;
  const rect = renderer.domElement.getBoundingClientRect();
  _ndc.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  _ndc.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  _ray.setFromCamera(_ndc, camera);
  const hits = modelHits(_ray);
  if (!hits.length) return;
  _pendingLabelHit = hits[0].point.clone();
  labelModalName.value = '';
  document.querySelector('input[name="lcat"][value=""]').checked = true;
  labelModal.classList.remove('hidden');
  setTimeout(() => labelModalName.focus(), 30);
});

function _commitLabel() {
  const name = labelModalName.value.trim();
  if (!name) { labelModalName.focus(); return; }
  const cat = document.querySelector('input[name="lcat"]:checked')?.value ?? '';
  labelModal.classList.add('hidden');
  if (!labelsVisible) setLabelsVisible(true);
  addLabel(name, currentModel.worldToLocal(_pendingLabelHit.clone()), cat);
  _pendingLabelHit = null;
}

labelModalConfirm.addEventListener('click', () => {
  if (_pendingLineEntry) _commitLine(labelModalName.value.trim());
  else _commitLabel();
});
labelModalCancel.addEventListener('click', () => {
  if (_pendingLineEntry) {
    _commitLine(''); // keep the drawn line, just unnamed
  } else {
    labelModal.classList.add('hidden');
    _pendingLabelHit = null;
  }
});
labelModalName.addEventListener('keydown', e => {
  e.stopPropagation(); // prevent OrbitControls / app hotkeys from firing while typing
  if (e.key === 'Enter') {
    if (_pendingLineEntry) _commitLine(labelModalName.value.trim());
    else _commitLabel();
  }
  if (e.key === 'Escape') labelModalCancel.click();
});

// Edit mode: drag a pin's dot to re-place it on the surface (a spot chosen in
// one view often needs nudging in another).
window.addEventListener('pointermove', e => {
  if (!dragging || !currentModel) return;
  const rect = renderer.domElement.getBoundingClientRect();
  _ndc.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  _ndc.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  _ray.setFromCamera(_ndc, camera);
  const hits = modelHits(_ray);
  if (!hits.length) return; // keep last valid spot if dragged off the model
  const local = currentModel.worldToLocal(hits[0].point.clone());
  dragging.obj.position.copy(local);
  dragging.entry.position = [local.x, local.y, local.z];
});
window.addEventListener('pointerup', () => {
  if (!dragging) return;
  dragging = null;
  if (navMode === 'orbit') controls.enabled = true;
});

const editLoad       = document.getElementById('edit-load');
const labelFileInput = document.getElementById('label-file-input');

editLoad.addEventListener('click', () => labelFileInput.click());

labelFileInput.addEventListener('change', () => {
  const file = labelFileInput.files[0];
  if (!file || !currentModel) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const raw = JSON.parse(e.target.result);
      // Support old array format (labels only) and new combined {labels, lines} format.
      const labels = Array.isArray(raw) ? raw : (raw.labels || []);
      const lines  = Array.isArray(raw) ? []  : (raw.lines  || []);
      labels.forEach(d => {
        if (!d.name || !Array.isArray(d.position)) return;
        addLabel(d.name, new THREE.Vector3(d.position[0], d.position[1], d.position[2]), d.category || '');
      });
      lines.forEach(d => {
        if (!Array.isArray(d.points)) return;
        lineData.push(d);
        _addLineEntry(d);
      });
      if (lines.length) _lineColorIdx = lineData.length;
      if (labels.length || lines.length) {
        labelsSection.classList.remove('hidden');
        if (!labelsVisible) setLabelsVisible(true);
      }
    } catch { alert('Invalid annotations JSON file.'); }
  };
  reader.readAsText(file);
  labelFileInput.value = '';
});

editDownload.addEventListener('click', () => {
  const exportData = {
    labels: labelData.map(({ name, position, category }) => ({ name, position, category })),
    lines:  lineData.map(({ color, points, name, category }) => ({ color, points, name: name || '', category: category || 'other' })),
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${activeModelId || 'model'}_labels.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ── Edit-mode collapsible groups ──────────────────────────
// Each edit tool (Orient, Labels, Lines) lives behind its own toggle so the
// sidebar stays short. Opening one collapses the others.
document.querySelectorAll('.edit-group-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    const group = toggle.closest('.edit-group');
    const body  = group.querySelector('.edit-group-body');
    const open  = group.classList.contains('open');
    document.querySelectorAll('.edit-group').forEach(g => {
      g.classList.remove('open');
      g.querySelector('.edit-group-body').classList.add('hidden');
    });
    const nowOpen = !open;
    if (nowOpen) {
      group.classList.add('open');
      body.classList.remove('hidden');
    }
    // Orienting is implicit: it's on whenever the Orient group is open.
    setOrientMode(nowOpen && toggle.dataset.group === 'orient');
  });
});

// ── Orient model (edit mode) ──────────────────────────────
// Drag or snap-rotate the model so its anatomical anterior faces +Z (the
// camera in the default/Anterior view). Saving downloads <id>_view.json, which
// loadRegion fetches on startup so the orientation applies for everyone.
let orientMode = false;
const _WORLD_X = new THREE.Vector3(1, 0, 0);
const _WORLD_Y = new THREE.Vector3(0, 1, 0);

function populateOrientViewSelect(model) {
  orientViewSel.innerHTML = '';
  const views = model?.views ?? DEFAULT_VIEWS;
  views.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.dir;
    opt.textContent = v.label;
    orientViewSel.appendChild(opt);
  });
}

function setOrientMode(on) {
  orientMode = on;
  container.classList.toggle('orient-mode', on);
  if (on) {
    setLabelPlacementMode(false);
    setLineDrawing(false);
    setPinMode(false);
    // Keep controls on for scroll-to-zoom, but disable camera rotate/pan so
    // dragging rotates the model (via our handler) and the view stays fixed.
    controls.enabled = true;
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = true;
    // Snap camera to the currently-selected view.
    setView(orientViewSel.value);
  } else {
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enabled = (navMode === 'orbit' && !dragging);
  }
}

// Changing the dropdown snaps camera to that view (always, not just in orient mode).
orientViewSel.addEventListener('change', () => setView(orientViewSel.value));

// Left-drag rotates the model; right-drag (or Shift+left-drag) pans it so the
// author can centre it against the guides.
let _orientLast = null;
let _orientPan  = false;
const _camRight = new THREE.Vector3();
const _camUp    = new THREE.Vector3();
renderer.domElement.addEventListener('pointerdown', e => {
  if (!orientMode || !currentModel) return;
  _orientLast = { x: e.clientX, y: e.clientY };
  _orientPan  = (e.button === 2 || e.shiftKey);
  e.preventDefault();
});
renderer.domElement.addEventListener('contextmenu', e => {
  if (orientMode) e.preventDefault(); // allow right-drag panning without a menu
});
window.addEventListener('pointermove', e => {
  if (_orientLast == null || !currentModel) return;
  const dx = e.clientX - _orientLast.x;
  const dy = e.clientY - _orientLast.y;
  _orientLast = { x: e.clientX, y: e.clientY };

  if (_orientPan) {
    // Convert pixel drag to a world-space shift in the camera's screen plane.
    const dist   = camera.position.distanceTo(controls.target);
    const vH     = 2 * dist * Math.tan((camera.fov * Math.PI / 180) / 2);
    const perPx  = vH / renderer.domElement.clientHeight;
    camera.matrixWorld.extractBasis(_camRight, _camUp, new THREE.Vector3());
    _orientOffset
      .addScaledVector(_camRight,  dx * perPx)
      .addScaledVector(_camUp,    -dy * perPx);
    recenterModel();
    return;
  }

  const k = 0.01; // radians per pixel
  currentModel.quaternion
    .premultiply(new THREE.Quaternion().setFromAxisAngle(_WORLD_Y, dx * k))
    .premultiply(new THREE.Quaternion().setFromAxisAngle(_WORLD_X, dy * k));
  recenterModel();
});
window.addEventListener('pointerup', () => { _orientLast = null; _orientPan = false; });

// Save the current model orientation + zoom for the selected view into the
// in-memory savedViews accumulator. Download writes all saved views to file.
let _saveFlashTimer = null;
orientSave.addEventListener('click', () => {
  if (!currentModel) { alert('Load a model first.'); return; }
  const e = currentModel.rotation;
  const round = v => Math.round(v * 100) / 100;
  const name = orientViewSel.value;
  savedViews[name] = {
    rotation: [
      round(THREE.MathUtils.radToDeg(e.x)),
      round(THREE.MathUtils.radToDeg(e.y)),
      round(THREE.MathUtils.radToDeg(e.z)),
    ],
    zoom: round(camera.position.length()),
    offset: [round(_orientOffset.x), round(_orientOffset.y), round(_orientOffset.z)],
    cameraUp: [round(camera.up.x), round(camera.up.y), round(camera.up.z)],
  };
  // Brief "Saved ✓" confirmation on the button.
  const label = orientViewSel.options[orientViewSel.selectedIndex]?.text || name;
  orientSave.textContent = `Saved ${label} ✓`;
  orientSave.classList.add('saved');
  clearTimeout(_saveFlashTimer);
  _saveFlashTimer = setTimeout(() => {
    orientSave.textContent = 'Save this view';
    orientSave.classList.remove('saved');
  }, 1400);
});

orientDownload.addEventListener('click', () => {
  if (!Object.keys(savedViews).length) {
    alert('Save at least one view first.');
    return;
  }
  const blob = new Blob([JSON.stringify(savedViews, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${activeModelId || 'model'}_view.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ── Drawn lines ───────────────────────────────────────────
// Author-placed polylines (e.g. gluteal lines on the pelvis). Stored as local-
// space vertices in <id>_lines.json, rendered as THREE.Line objects that are
// children of the model so they automatically rotate/zoom with it.
// Only authors (?edit) can create or delete lines; students get Show/Hide.
const LINE_COLORS = ['#ff8c00','#00c8ff','#80e040','#e040c8','#ffe040','#e06040'];
let lineLayer     = null;  // THREE.Group child of currentModel
let lineData      = [];    // [{color, points:[[x,y,z],…]}, …]
let linesVisible  = false;
let lineDrawing   = false;
let _wip          = [];    // world-space points accumulating the current line
let _wipLine      = null;  // temporary THREE.Line showing the work-in-progress
let _lineColorIdx = 0;

function setLinesVisible(v) {
  linesVisible = v;
  if (lineLayer) lineLayer.visible = v;
}

function setLineDrawing(on) {
  if (on) { setOrientMode(false); setDrawMode(false); }
  lineDrawing = on;
  lineDrawBtn.classList.toggle('active', on);
  container.classList.toggle('line-draw-mode', on);
  lineFinishBtn.classList.toggle('hidden', !on);
  if (!on && _wipLine) {
    lineLayer.remove(_wipLine);
    _wipLine = null;
    _wip = [];
  }
  updateModeBanner();
}

// Direct geometry from a flat array of [x,y,z] triples (dense / surface-projected).
function _makeLineGeo(pts) {
  return new THREE.BufferGeometry().setFromPoints(
    pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))
  );
}

// CatmullRom spline geometry — used only for the live WIP preview.
function _makeSplineGeo(pts) {
  const v3s = pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  if (v3s.length < 2) return new THREE.BufferGeometry().setFromPoints(v3s);
  const curve = new THREE.CatmullRomCurve3(v3s);
  return new THREE.BufferGeometry().setFromPoints(
    curve.getPoints(Math.max(64, v3s.length * 16))
  );
}

// Reusable helpers for surface projection.
const _projRay = new THREE.Raycaster();
const _projDir = new THREE.Vector3();

// Projects an array of world-space points onto the nearest model surface.
// Returns an array of THREE.Vector3 in the model's local coordinate space,
// lifted slightly along the face normal to prevent z-fighting.
function _projectLineToSurface(worldPts) {
  // Cast from the camera — this always hits the frontmost visible surface,
  // which is correct for non-convex geometry like the concave pelvis bowl.
  const camPos = camera.position.clone();

  return worldPts.map(wp => {
    _projDir.copy(wp).sub(camPos);
    const distToCam = _projDir.length();
    if (distToCam < 1e-6) return currentModel.worldToLocal(wp.clone());
    _projDir.divideScalar(distToCam);

    _projRay.set(camPos, _projDir);
    const hits = modelHits(_projRay);
    if (!hits.length) return currentModel.worldToLocal(wp.clone());

    // Among all intersections pick the one closest to the original sample point.
    // For a convex surface there is one hit; for concave geometry there may be
    // several — the closest one is the correct visible face.
    let best = hits[0];
    for (let i = 1; i < hits.length; i++) {
      if (hits[i].point.distanceTo(wp) < best.point.distanceTo(wp)) best = hits[i];
    }

    // Lift slightly along face normal (or camera back-direction) to prevent z-fighting.
    let normalWorld;
    if (best.face) {
      normalWorld = best.face.normal.clone()
        .transformDirection(currentModel.matrixWorld).normalize();
    } else {
      normalWorld = _projDir.clone().negate();
    }
    const lifted = best.point.clone().addScaledVector(normalWorld, 0.004);
    return currentModel.worldToLocal(lifted);
  });
}

// Returns a tube radius appropriate for the current model's scale (~0.35% of diagonal).
function _tubeRadius() {
  const bbox = new THREE.Box3().setFromObject(currentModel);
  return bbox.getSize(new THREE.Vector3()).length() * 0.0035;
}

function _addLineEntry(entry) {
  // Sparse entries (loaded from old JSON with only a few control points) are
  // re-sampled via CatmullRom and surface-projected so they hug the model.
  let pts = entry.points;
  if (!entry.projected && pts.length >= 2 && pts.length < 20 && currentModel) {
    const v3s = pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(v3s);
    const localSampled = curve.getPoints(Math.max(80, v3s.length * 20));
    const worldSampled = localSampled.map(lp => currentModel.localToWorld(lp.clone()));
    pts = _projectLineToSurface(worldSampled).map(v => [v.x, v.y, v.z]);
  }

  // Use TubeGeometry so lines render as solid thick ribbons regardless of platform.
  // (WebGL ignores LineBasicMaterial.linewidth > 1.)
  const v3s = pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(v3s, false, 'catmullrom', 0.5);
  const geo = new THREE.TubeGeometry(curve, Math.max(pts.length - 1, 40), _tubeRadius(), 5, false);
  const mat = new THREE.MeshBasicMaterial({ color: entry.color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  lineLayer.add(mesh);
  entry._obj = mesh;

  // Midpoint label: same dot + leader + content structure as annotation labels
  // so updateLabelLeaders() handles it automatically and the style is consistent.
  if (entry.name || EDIT_MODE) {
    const mid = pts[Math.floor(pts.length / 2)];
    const el = document.createElement('div'); el.className = 'anno-label';

    const dot = document.createElement('span'); dot.className = 'anno-dot';
    dot.style.background = entry.color;

    const leader  = document.createElement('span'); leader.className  = 'anno-leader';
    const content = document.createElement('span'); content.className = 'anno-content';

    if (entry.name) {
      const txt = document.createElement('span'); txt.className = 'anno-text';
      txt.textContent = entry.name;
      content.appendChild(txt);
    }

    if (EDIT_MODE) {
      const del = document.createElement('span');
      del.className = 'anno-del'; del.textContent = '×'; del.title = 'Delete line';
      del.addEventListener('pointerdown', e => e.stopPropagation());
      del.addEventListener('click', e => {
        e.stopPropagation();
        lineLayer.remove(entry._obj);
        labelLayer.remove(entry._css);
        lineData.splice(lineData.indexOf(entry), 1);
        updateCategoryFilterVisibility();
      });
      content.appendChild(del);
    }

    el.append(dot, leader, content);

    const css = new CSS2DObject(el);
    css.position.set(mid[0], mid[1], mid[2]);
    css.userData.leader  = leader;
    css.userData.content = content;
    labelLayer.add(css);
    entry._css = css;
    if (dotsOnlyMode) css.element.classList.add('dots-only');
  }
}

let _pendingLineEntry = null;

function _finishLine() {
  if (_wip.length < 2) return;
  const color = LINE_COLORS[_lineColorIdx % LINE_COLORS.length];
  _lineColorIdx++;
  const curve = new THREE.CatmullRomCurve3(_wip);
  const worldSampled = curve.getPoints(Math.max(80, _wip.length * 20));
  const localProjected = _projectLineToSurface(worldSampled);
  const pts = localProjected.map(v => [v.x, v.y, v.z]);
  if (_wipLine) { lineLayer.remove(_wipLine); _wipLine = null; }
  _wip = [];
  setLineDrawing(false);
  _pendingLineEntry = { color, points: pts, projected: true, name: '', category: 'other' };
  // Reuse the label modal — show category picker with Other pre-selected.
  labelModalName.value = '';
  const otherRadio = labelModal.querySelector('input[name="lcat"][value="other"]');
  if (otherRadio) otherRadio.checked = true;
  labelModal.querySelector('.modal-title').textContent = 'Name this line (optional)';
  labelModal.classList.remove('line-mode');
  labelModal.classList.remove('hidden');
  setTimeout(() => labelModalName.focus(), 30);
}

function _commitLine(name) {
  _pendingLineEntry.name = name || '';
  _pendingLineEntry.category = document.querySelector('input[name="lcat"]:checked')?.value ?? 'other';
  labelModal.classList.add('hidden');
  labelModal.querySelector('.modal-title').textContent = 'New label';
  // Reset radio to Structure for next label creation.
  const structRadio = labelModal.querySelector('input[name="lcat"][value=""]');
  if (structRadio) structRadio.checked = true;
  lineData.push(_pendingLineEntry);
  _addLineEntry(_pendingLineEntry);
  _pendingLineEntry = null;
  updateCategoryFilterVisibility();
  if (!labelsVisible) setLabelsVisible(true);
}

function clearLines() {
  if (lineLayer) [...lineLayer.children].forEach(o => lineLayer.remove(o));
  lineData.forEach(e => { if (e._css && labelLayer) labelLayer.remove(e._css); });
  lineData = [];
  _lineColorIdx = 0;
  _wip = [];
  _wipLine = null;
}

function initLineLayer() {
  clearLines();
  lineLayer = new THREE.Group();
  if (currentModel) currentModel.add(lineLayer);
}

async function loadLines(model) {
  try {
    const res = await fetch(`models/${model.id}/${model.id}_lines.json`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(d => { lineData.push(d); _addLineEntry(d); });
    _lineColorIdx = lineData.length;
    labelsSection.classList.remove('hidden');
    setLinesVisible(labelsVisible);
  } catch { /* no lines file — fine */ }
}

// ── Line drawing UI ───────────────────────────────────────
lineDrawBtn.addEventListener('click', () => setLineDrawing(!lineDrawing));

lineFinishBtn.addEventListener('click', _finishLine);

// Intercept canvas clicks in line-drawing mode to add vertices.
// stopImmediatePropagation() is needed (not just stopPropagation()) because
// the label-drop handler is on the same element — stopPropagation only prevents
// bubbling to ancestor elements, not same-element listeners.
renderer.domElement.addEventListener('click', e => {
  if (!lineDrawing || !currentModel) return;
  e.stopImmediatePropagation();
  const rect = renderer.domElement.getBoundingClientRect();
  _ndc.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  _ndc.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  _ray.setFromCamera(_ndc, camera);
  const hits = modelHits(_ray);
  if (!hits.length) return;
  _wip.push(hits[0].point.clone());

  // Refresh the in-progress preview line (smooth spline, no projection needed for preview).
  if (_wipLine) lineLayer.remove(_wipLine);
  if (_wip.length >= 2) {
    const localPts = _wip.map(wp => currentModel.worldToLocal(wp.clone()));
    const geo = _makeSplineGeo(localPts.map(v => [v.x, v.y, v.z]));
    _wipLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }));
    lineLayer.add(_wipLine);
    if (!linesVisible) { lineLayer.visible = true; } // show preview even if hidden
    lineFinishBtn.classList.remove('hidden');
  }
}, true);

// Enter key also finishes the current line.
document.addEventListener('keydown', e => {
  if (!lineDrawing) return;
  if (e.code === 'Enter') { e.preventDefault(); _finishLine(); }
});

// ── Dots-only hover peek ──────────────────────────────────
// When dots-only mode is active, moving the mouse near a dot temporarily
// shows its leader + content. We project each label to screen space and
// toggle .label-peek within ~18 px.
const _peekVec = new THREE.Vector3();
container.addEventListener('mousemove', e => {
  if (!dotsOnlyMode || !labelsVisible || !labelLayer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const w = rect.width, h = rect.height;
  const THRESH = 18 * 18; // squared pixel radius

  const peekTargets = [
    ...labelData.map(e => ({ obj: e._obj })),
    ...lineData.map(e => ({ obj: e._css })),
  ];

  peekTargets.forEach(({ obj }) => {
    if (!obj || !obj.visible) return;
    obj.getWorldPosition(_peekVec);
    _peekVec.project(camera);
    const sx = (_peekVec.x * 0.5 + 0.5) * w;
    const sy = (-_peekVec.y * 0.5 + 0.5) * h;
    const dx = sx - mx, dy = sy - my;
    obj.element.classList.toggle('label-peek', dx * dx + dy * dy <= THRESH);
  });
});

container.addEventListener('mouseleave', () => {
  [...labelData.map(e => e._obj), ...lineData.map(e => e._css)].forEach(obj => {
    if (obj) obj.element.classList.remove('label-peek');
  });
});


// ── Student pins ──────────────────────────────────────────
// Temporary markers students drop while studying. Never saved; cleared when
// switching models. A separate layer from author labels so they can't interfere.
// The Pin button arms a single placement: one click on the model drops one pin
// and disarms. Click a placed pin's dot to remove it.
const PIN_COLORS = [
  '#f05a5a', // red
  '#f0a040', // orange
  '#f0e040', // yellow
  '#60d060', // green
  '#40c4f0', // cyan
  '#8060f0', // purple
  '#f060c0', // pink
  '#40f0b0', // teal
];
let pinLayer = null;
let pinMode  = false;
let pinCount = 0;

function setPinMode(on) {
  if (on) { setOrientMode(false); setDrawMode(false); }
  pinMode = on;
  pinBtn.classList.toggle('active', on);
  pinBtn.setAttribute('aria-pressed', String(on));
  container.classList.toggle('pin-mode', on);
  if (on && navMode === 'orbit') controls.enabled = false;
  else if (!on && navMode === 'orbit' && !dragging && !drawMode) controls.enabled = true;
  updateModeBanner();
}

function dropPin(worldPoint) {
  if (!currentModel || !pinLayer) return;
  pinCount++;
  const color = PIN_COLORS[(pinCount - 1) % PIN_COLORS.length];
  const localPos = currentModel.worldToLocal(worldPoint.clone());

  const el = document.createElement('div');
  el.className = 'pin-anchor';
  const dot = document.createElement('span'); dot.className = 'pin-dot';
  dot.title = 'Click to remove this pin';
  dot.style.background = color;
  dot.style.boxShadow = `0 0 6px ${color}aa`;
  const lbl = document.createElement('span'); lbl.className = 'pin-label';
  lbl.textContent = `Pin ${pinCount}`;
  lbl.style.color = color;
  el.append(dot, lbl);

  const obj = new CSS2DObject(el);
  obj.position.copy(localPos);
  pinLayer.add(obj);

  // Click the dot to remove the pin.
  dot.addEventListener('pointerdown', e => e.stopPropagation());
  dot.addEventListener('click', e => {
    e.stopPropagation();
    pinLayer.remove(obj);
  });
}

function clearPins() {
  if (pinLayer) [...pinLayer.children].forEach(o => pinLayer.remove(o));
  pinCount = 0;
}

function initPinLayer() {
  clearPins();
  pinLayer = new THREE.Group();
  if (currentModel) currentModel.add(pinLayer);
}

pinBtn.addEventListener('click', () => setPinMode(!pinMode));

// Intercept clicks in pin mode before OrbitControls sees them. One click places
// one pin, then pin mode disarms — press Pin again to place another.
container.addEventListener('pointerdown', e => {
  if (!pinMode || e.button !== 0) return;
  e.stopPropagation();
  const rect = canvas.getBoundingClientRect();
  _ndc.set(
    ((e.clientX - rect.left) / rect.width)  * 2 - 1,
   -((e.clientY - rect.top)  / rect.height) * 2 + 1
  );
  _ray.setFromCamera(_ndc, camera);
  const hits = modelHits(_ray);
  if (hits.length) dropPin(hits[0].point);
  setPinMode(false); // one-shot: disarm whether or not the click hit the model
}, true); // capture phase so we beat OrbitControls

// ── Navigation mode (orbit vs fly) ────────────────────────
// After the orbit hint is shown, the extra tips fade out (leaving just "Q / E
// to roll") so they don't linger over the model. Re-shown fresh each time.
let _hintFadeTimer = null;
const HINT_FADE_DELAY = 10000; // ms

function scheduleHintFade() {
  clearTimeout(_hintFadeTimer);
  controlsHint.classList.remove('hint-faded'); // start fully visible
  _hintFadeTimer = setTimeout(() => controlsHint.classList.add('hint-faded'), HINT_FADE_DELAY);
}

function updateHint(locked = flyControls.isLocked) {
  if (navMode === 'fly') {
    clearTimeout(_hintFadeTimer);
    controlsHint.classList.remove('hint-faded'); // fly guidance stays fully visible
    controlsHint.innerHTML = '<span class="hint-keep">' + (locked
      ? 'WASD to move <span class="divider">·</span> Space / Shift to rise · descend <span class="divider">·</span> mouse to look <span class="divider">·</span> <strong>Press Esc to leave fly mode</strong>'
      : 'Click the model to start flying <span class="divider">·</span> then press Esc to leave') + '</span>';
  } else {
    // Upper line (scroll / right-drag) fades out; lower line (Q/E to roll, drag
    // to rotate) stays as the essentials.
    controlsHint.innerHTML =
      '<span class="hint-fade">Scroll to zoom <span class="divider">·</span> Right-drag to pan</span>' +
      '<span class="hint-keep">' + (singleKeyShortcuts ? 'Q / E to roll <span class="divider">·</span> ' : '') +
      'Drag to rotate' + (singleKeyShortcuts ? ' <span class="divider">·</span> ? for shortcuts' : '') + '</span>';
    scheduleHintFade();
  }
}

function setNavMode(mode) {
  if (mode === 'fly' && activeModelDef?.noFly) mode = 'orbit';
  const wasFlying = navMode === 'fly';
  navMode = mode;
  navBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  });
  if (mode === 'fly') {
    setPinMode(false); // can't pin while flying
    setDrawMode(false);
    controls.enabled = false;
    camera.up.set(0, 1, 0);
  } else {
    if (flyControls.isLocked) flyControls.unlock();
    // Only straighten the camera when leaving fly mode: a preset view (e.g. a
    // top view with its own "up") must survive the switch on model load.
    if (wasFlying) camera.up.set(0, 1, 0);
    controls.enabled = true;
    controls.target.set(0, 0, 0);
    controls.update();
  }
  updateHint();
}

navBtns.forEach(b => b.addEventListener('click', () => setNavMode(b.dataset.mode)));

// Fly mode needs pointer lock + a keyboard, so it's not usable on touch
// devices — hide the toggle there and stay in orbit mode.
const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;
if (isTouchPrimary) {
  const navModes = document.getElementById('nav-modes');
  if (navModes) navModes.style.display = 'none';
}

// ── Background swatches ───────────────────────────────────
// The renderer is transparent; backgrounds are set via CSS on the container
// so the lab photo or a solid colour shows through the canvas.
const BG_STYLES = {
  dark:  { image: 'none', color: '#0f1117' },
  light: { image: 'none', color: '#e8eaf0' },
  lab:   { image: 'url(assets/lab-background.jpg)', color: '#0f1117' },
};
let currentBg = 'dark';

function setBackground(bg, persist = true) {
  currentBg = bg;
  // Mark every swatch with this value active — the control is mirrored in both
  // the sidebar and the settings modal.
  bgSwatches.forEach(s => {
    s.classList.toggle('active', s.dataset.bg === bg);
    s.setAttribute('aria-pressed', String(s.dataset.bg === bg));
  });
  const s = BG_STYLES[bg] || BG_STYLES.dark;
  container.style.backgroundImage = s.image;
  container.style.backgroundColor = s.color;
  if (persist) localStorage.setItem('background', bg);
}

bgSwatches.forEach(swatch => {
  swatch.addEventListener('click', () => setBackground(swatch.dataset.bg));
});

// ── Screenshot ────────────────────────────────────────────
// Composite the CSS background + the (transparent) WebGL canvas + any visible
// labels into one image and download it. The WebGL canvas alone is transparent,
// so we paint the background first.
let labImg = null;
function getLabImage() {
  if (!labImg) { labImg = new Image(); labImg.src = 'assets/lab-background.jpg'; }
  return labImg;
}

function drawCover(ctx, img, W, H) {
  const ir = img.width / img.height, r = W / H;
  let dw, dh;
  if (ir > r) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function captureScreenshot() {
  const src = renderer.domElement;
  const W = src.width, H = src.height;              // device pixels
  const scale = W / container.clientWidth;          // device px per CSS px
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');

  // Background
  ctx.fillStyle = (BG_STYLES[currentBg] || BG_STYLES.dark).color;
  ctx.fillRect(0, 0, W, H);
  if (currentBg === 'lab') {
    const img = getLabImage();
    if (img.complete && img.naturalWidth) drawCover(ctx, img, W, H);
  }

  // The 3D model
  ctx.drawImage(src, 0, 0, W, H);

  // Visible labels: project each anchor and draw a dot + leader line + text,
  // matching the on-screen leader-line callout style.
  if (labelsVisible && labelLayer && labelLayer.children.length) {
    const v = new THREE.Vector3(), c = new THREE.Vector3();
    const LEN = (LEADER_LEN + 4) * scale; // leader length, matches on-screen
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${13 * scale}px system-ui, sans-serif`;

    // Model centre (origin) in screen space, for the radial-outward direction.
    c.set(0, 0, 0).project(camera);
    const cx = (c.x * 0.5 + 0.5) * W;
    const cy = (-c.y * 0.5 + 0.5) * H;

    labelLayer.children.forEach(o => {
      o.getWorldPosition(v).project(camera);
      if (v.z > 1) return; // behind camera
      const x = (v.x * 0.5 + 0.5) * W;
      const y = (-v.y * 0.5 + 0.5) * H;
      let dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy);
      if (len < 1e-3) { dx = 0.7; dy = -0.7; } else { dx /= len; dy /= len; }
      const ex = x + LEN * dx, ey = y + LEN * dy; // leader end / text anchor
      const name = o.element?.querySelector('.anno-text')?.textContent || '';

      // Leader line
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey);
      ctx.lineWidth = 1.5 * scale; ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.stroke();

      // Text pill, anchored on the side facing the model so it reads outward.
      const padX = 7 * scale;
      const tw = ctx.measureText(name).width;
      const boxW = tw + padX * 2;
      const boxX = dx < -0.15 ? ex - boxW : dx > 0.15 ? ex : ex - boxW / 2;
      ctx.fillStyle = 'rgba(15,17,23,0.78)';
      ctx.fillRect(boxX, ey - 9 * scale, boxW, 18 * scale);
      ctx.fillStyle = '#fff';
      ctx.fillText(name, boxX + padX, ey + scale);

      // Anchor dot
      ctx.beginPath(); ctx.arc(x, y, 3.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#4f7cff'; ctx.fill();
      ctx.lineWidth = 1.5 * scale; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
  }

  // Anything drawn in Draw mode goes on top, so annotated views can be saved.
  if (drawStrokes.length) ctx.drawImage(drawCanvas, 0, 0, W, H);

  out.toBlob(blob => {
    if (!blob) { showToast('Could not save the screenshot', '', false); return; }
    const name = `${activeModelId || 'model'}-${Date.now()}.png`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    // Some browsers (Firefox) only follow a download link that's in the page,
    // and revoking the URL straight away can cancel the download.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('Screenshot saved', name);
  }, 'image/png');
}

screenshotBtn.addEventListener('click', captureScreenshot);

// ── Quiz / Identify mode ──────────────────────────────────
// A self-test built from the current model's labels: highlight a structure and
// ask the student to name it from four options. Each answer is reported to the
// LMS as a SCORM interaction, and the final score sets cmi.core.score.
const quizBtn      = document.getElementById('quiz-btn');
const quizPanel    = document.getElementById('quiz-panel');
const quizClose    = document.getElementById('quiz-close');
const quizProgress = document.getElementById('quiz-progress');
const quizTime      = document.getElementById('quiz-time');
const quizTimerFill = document.getElementById('quiz-timer-fill');
const quizQuestion = document.getElementById('quiz-question');
const quizOptions  = document.getElementById('quiz-options');
const quizFeedback = document.getElementById('quiz-feedback');
const quizNextBtn  = document.getElementById('quiz-next');
const quizResult   = document.getElementById('quiz-result');

const QUIZ_MAX = 10;
const QUIZ_SECONDS = 30; // per-question limit, like a bell-ringer station
let quizList = [];
let quizIdx = 0;
let quizScore = 0;
let quizAnswered = false;
let quizQStart = 0;
let quizMarker = null;
let quizPrevLabels = false;
let quizTimer = null;
let quizTimeLeft = 0;
let quizRun = 0; // bumped per quiz so a stale auto-advance can't fire into a new one

function stopQuizTimer() { if (quizTimer) { clearInterval(quizTimer); quizTimer = null; } }

function renderQuizTime() {
  const s = Math.max(0, quizTimeLeft);
  quizTime.textContent = `0:${String(s).padStart(2, '0')}`;
  quizTimerFill.style.width = (s / QUIZ_SECONDS) * 100 + '%';
  const low = s <= 5;
  quizTimerFill.classList.toggle('low', low);
  quizTime.classList.toggle('low', low);
}

function startQuizTimer() {
  stopQuizTimer();
  quizTimeLeft = QUIZ_SECONDS;
  renderQuizTime();
  quizTimer = setInterval(() => {
    quizTimeLeft--;
    renderQuizTime();
    if (quizTimeLeft <= 0) { stopQuizTimer(); timeoutQuiz(); }
  }, 1000);
}

// Buzzer. A typed answer is graded on whatever has been written so far (like
// putting the pen down at a station); an unanswered multiple-choice question
// counts as a miss. Either way the quiz then auto-advances.
function timeoutQuiz() {
  if (quizAnswered) return;
  const q = quizList[quizIdx];
  if (q.type === 'typed') { answerTyped(true); return; }
  [...quizOptions.children].forEach(b => {
    b.disabled = true;
    if (b.textContent === q.answer) b.classList.add('correct');
  });
  finishQuestion(false, '(no answer)', true);
}

// Shared end-of-question handling for both formats: score, feedback, SCORM
// interaction, then either a Next button or (after a timeout) auto-advance.
function finishQuestion(correct, response, timedOut) {
  quizAnswered = true;
  stopQuizTimer();
  const q = quizList[quizIdx];
  if (correct) quizScore++;
  quizFeedback.className = correct ? 'correct' : 'wrong';
  quizFeedback.textContent = correct
    ? 'Correct!'
    : `${timedOut ? "Time's up — " : ''}Answer: ${q.answer}`;

  scormReportInteraction({
    id: q.answer,
    response,
    answer: q.answer,
    correct,
    latencyMs: timedOut ? QUIZ_SECONDS * 1000 : performance.now() - quizQStart,
  });

  if (timedOut) {
    quizNextBtn.classList.add('hidden');
    const run = quizRun, idx = quizIdx;
    setTimeout(() => {
      if (run === quizRun && idx === quizIdx && !quizPanel.classList.contains('hidden')) nextQuiz();
    }, 1800);
  } else {
    quizNextBtn.textContent = quizIdx + 1 < quizList.length ? 'Next' : 'See results';
    quizNextBtn.classList.remove('hidden');
    quizNextBtn.focus(); // Enter moves on
  }
}

// Typed answers are compared ignoring case, accents, spacing and punctuation —
// only the words themselves have to be right.
function _normAnswer(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function renderTypedAnswer() {
  const form = document.createElement('form');
  form.className = 'quiz-typed';
  form.innerHTML =
    '<input type="text" class="quiz-input" placeholder="Structure name…" aria-label="Your answer"' +
    ' autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />' +
    '<button type="submit" class="quiz-submit">Submit</button>';
  form.addEventListener('submit', e => { e.preventDefault(); answerTyped(false); });
  quizOptions.appendChild(form);
  setTimeout(() => form.querySelector('input').focus(), 30);
}

function answerTyped(timedOut) {
  if (quizAnswered) return;
  const input = quizOptions.querySelector('.quiz-input');
  const text = input ? input.value.trim() : '';
  if (!text && !timedOut) { input?.focus(); return; } // ignore an empty Submit
  const q = quizList[quizIdx];
  const correct = !!text && _normAnswer(text) === _normAnswer(q.answer);
  if (input) {
    input.disabled = true;
    input.classList.add(correct ? 'correct' : 'wrong');
  }
  const submit = quizOptions.querySelector('.quiz-submit');
  if (submit) submit.disabled = true;
  finishQuestion(correct, text || '(no answer)', timedOut);
}

function _shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuiz() {
  const named = labelData.filter(l => l.name && l.name.trim());
  const names = [...new Set(named.map(l => l.name))];
  const picks = _shuffle(named).slice(0, Math.min(QUIZ_MAX, named.length));
  // Half multiple choice, half typed recall, in a shuffled order.
  const types = _shuffle(picks.map((_, i) => (i % 2 ? 'typed' : 'mc')));
  quizList = picks.map((entry, i) => {
    const distractors = _shuffle(names.filter(n => n !== entry.name)).slice(0, 3);
    return {
      entry,
      answer: entry.name,
      type: types[i],
      options: _shuffle([entry.name, ...distractors]),
    };
  });
}

// Frame the camera so the highlighted structure faces the viewer, keeping the
// current zoom. The model stays put; only the camera moves.
function focusLocalPoint(localPos) {
  const world = currentModel.localToWorld(localPos.clone());
  // Use only the structure's horizontal bearing so the camera swings around to
  // face it at a level, upright angle (like a standard anterior/lateral view)
  // instead of tipping into a steep top-down or bottom-up tilt. Points that sit
  // almost directly above/below the centre fall back to the front.
  const dir = new THREE.Vector3(world.x, 0, world.z);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const dist = camera.position.length() || fitRadius * 3;
  camera.up.set(0, 1, 0);
  camera.position.copy(dir.multiplyScalar(dist));
  controls.target.set(0, 0, 0);
  controls.update();
}

function ensureMarker() {
  if (quizMarker) return;
  const el = document.createElement('div');
  el.className = 'quiz-marker';
  el.innerHTML = '<span class="quiz-ring"></span>';
  quizMarker = new CSS2DObject(el);
}

// Shift the rendered image left (via the camera's view offset) so the model
// clears the right-docked quiz panel. On narrow screens the panel is a bottom
// sheet, so no horizontal shift is applied. Re-applied per question and on
// resize; cleared in endQuiz.
const QUIZ_PANEL_W = 300;
function applyQuizViewOffset() {
  if (quizPanel.classList.contains('hidden')) return;
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  if (window.matchMedia('(max-width: 600px)').matches) { camera.clearViewOffset(); return; }
  camera.setViewOffset(w, h, (QUIZ_PANEL_W + 32) / 2, 0, w, h);
}

function startQuiz() {
  setDrawMode(false);
  if (!currentModel) return;
  buildQuiz();
  if (!quizList.length) return;
  quizRun++;
  quizIdx = 0;
  quizScore = 0;
  quizPrevLabels = labelsVisible;
  setLabelsVisible(false); // hide the answers while testing
  quizResult.classList.add('hidden');
  quizPanel.classList.remove('hidden');
  container.classList.add('quiz-active');
  showQuizQuestion();
}

function showQuizQuestion() {
  const q = quizList[quizIdx];
  quizAnswered = false;
  quizQStart = performance.now();
  quizProgress.textContent = `Question ${quizIdx + 1} of ${quizList.length}`;
  quizQuestion.textContent = q.type === 'typed'
    ? 'Type the name of this structure:'
    : 'What is this structure?';
  quizFeedback.className = 'hidden';
  quizFeedback.textContent = '';
  quizNextBtn.classList.add('hidden');
  quizResult.classList.add('hidden');
  quizOptions.innerHTML = '';
  if (q.type === 'typed') {
    renderTypedAnswer();
  } else {
    q.options.forEach(name => {
      const b = document.createElement('button');
      b.className = 'quiz-option';
      b.textContent = name;
      b.addEventListener('click', () => answerQuiz(b, name));
      quizOptions.appendChild(b);
    });
  }

  ensureMarker();
  const pos = new THREE.Vector3(...q.entry.position);
  if (quizMarker.parent !== currentModel) currentModel.add(quizMarker);
  quizMarker.position.copy(pos);
  quizMarker.visible = true;
  focusLocalPoint(pos);
  applyQuizViewOffset();
  startQuizTimer();
}

function answerQuiz(btn, chosen) {
  if (quizAnswered) return;
  const q = quizList[quizIdx];
  const correct = chosen === q.answer;
  [...quizOptions.children].forEach(b => {
    b.disabled = true;
    if (b.textContent === q.answer) b.classList.add('correct');
    else if (b === btn) b.classList.add('wrong');
  });
  finishQuestion(correct, chosen, false);
}

function nextQuiz() {
  if (quizIdx + 1 < quizList.length) { quizIdx++; showQuizQuestion(); }
  else showQuizResult();
}

function showQuizResult() {
  stopQuizTimer();
  if (quizMarker) quizMarker.visible = false;
  const n = quizList.length;
  const pct = Math.round((quizScore / n) * 100);
  quizProgress.textContent = 'Results';
  quizQuestion.textContent = '';
  quizOptions.innerHTML = '';
  quizFeedback.className = 'hidden';
  quizNextBtn.classList.add('hidden');
  quizResult.classList.remove('hidden');
  quizResult.innerHTML =
    `<p class="quiz-score">${quizScore} / ${n} <span>(${pct}%)</span></p>` +
    '<div class="quiz-result-actions">' +
      '<button type="button" class="quiz-primary" id="quiz-retry">Try again</button>' +
      '<button type="button" class="quiz-secondary" id="quiz-done">Done</button>' +
    '</div>';
  document.getElementById('quiz-retry').addEventListener('click', startQuiz);
  document.getElementById('quiz-done').addEventListener('click', endQuiz);
  scormReportScore(pct);
}

function endQuiz() {
  stopQuizTimer();
  quizPanel.classList.add('hidden');
  container.classList.remove('quiz-active');
  camera.clearViewOffset();
  applyPathwayViewOffset();
  if (quizMarker) {
    quizMarker.visible = false;
    if (quizMarker.parent) quizMarker.parent.remove(quizMarker);
  }
  setLabelsVisible(quizPrevLabels);
}

quizBtn.addEventListener('click', startQuiz);
quizClose.addEventListener('click', endQuiz);
quizNextBtn.addEventListener('click', nextQuiz);

// ── Mode banner ───────────────────────────────────────────
// While a click-mode is on (pin, draw, or the edit-mode label / line tools),
// a pill at the top of the viewer says what clicking does and how to leave.
const MODE_TEXT = {
  draw:  'Drag to draw. Done clears the drawing.',
  pin:   'Click the model to drop a pin. Click a pin to remove it.',
  label: 'Click the model to place a label.',
  line:  'Click the model to add points, then Finish line.',
};
function currentClickMode() {
  if (drawMode) return 'draw';
  if (pinMode) return 'pin';
  if (labelPlacementMode) return 'label';
  if (lineDrawing) return 'line';
  return null;
}
function updateModeBanner() {
  const mode = currentClickMode();
  modeBanner.classList.toggle('hidden', !mode);
  if (!mode) return;
  modeBannerText.textContent = MODE_TEXT[mode];
  drawTools.classList.toggle('hidden', mode !== 'draw');
}
modeBannerDone.addEventListener('click', () => {
  if (drawMode) setDrawMode(false);
  if (pinMode) setPinMode(false);
  if (labelPlacementMode) setLabelPlacementMode(false);
  if (lineDrawing) setLineDrawing(false);
});

// ── Toast + screen-reader announcements ──────────────────
let _toastTimer = null;
function showToast(msg, sub = '', ok = true) {
  toastEl.replaceChildren();
  if (ok) {
    const check = document.createElement('span');
    check.className = 'toast-check'; check.textContent = '✓';
    toastEl.appendChild(check);
  }
  const main = document.createElement('span'); main.textContent = msg;
  toastEl.appendChild(main);
  if (sub) {
    const s = document.createElement('span');
    s.className = 'toast-sub'; s.textContent = sub;
    toastEl.appendChild(s);
  }
  toastEl.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
  announce(msg);
}

// Polite live region. Clearing first makes a repeated message re-announce.
function announce(msg) {
  srStatus.textContent = '';
  requestAnimationFrame(() => { srStatus.textContent = msg; });
}

// ── Draw mode (whiteboard) ───────────────────────────────
// Freehand strokes on a transparent canvas over the viewer, in screen space
// like a whiteboard: the model can't be rotated while drawing, and leaving the
// mode clears the drawing. Screenshots taken while drawing include it.
function sizeDrawCanvas(w = container.clientWidth, h = container.clientHeight) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  drawCanvas.width  = Math.max(1, Math.round(w * dpr));
  drawCanvas.height = Math.max(1, Math.round(h * dpr));
  drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawStrokes();
}

function strokePath(st) {
  const p = st.pts;
  if (!p.length) return;
  drawCtx.strokeStyle = st.color;
  drawCtx.lineWidth = st.w;
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';
  drawCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  drawCtx.shadowBlur = 3;
  drawCtx.beginPath();
  drawCtx.moveTo(p[0][0], p[0][1]);
  if (p.length === 1) drawCtx.lineTo(p[0][0] + 0.01, p[0][1]); // a tap draws a dot
  for (let i = 1; i < p.length; i++) drawCtx.lineTo(p[i][0], p[i][1]);
  drawCtx.stroke();
}

function redrawStrokes() {
  drawCtx.save();
  drawCtx.setTransform(1, 0, 0, 1, 0, 0);
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  drawCtx.restore();
  drawStrokes.forEach(strokePath);
  if (_drawing) strokePath(_drawing);
}

function setDrawMode(on) {
  if (on) {
    if (navMode === 'fly') setNavMode('orbit');
    if (!quizPanel.classList.contains('hidden')) return; // not during a quiz
    setPinMode(false);
    if (EDIT_MODE) { setLabelPlacementMode(false); setLineDrawing(false); setOrientMode(false); }
  }
  drawMode = on;
  drawBtn.classList.toggle('active', on);
  drawBtn.setAttribute('aria-pressed', String(on));
  container.classList.toggle('draw-mode', on);
  if (!on) { drawStrokes = []; _drawing = null; redrawStrokes(); }
  if (navMode === 'orbit') controls.enabled = !on && !pinMode;
  updateModeBanner();
}

drawBtn.addEventListener('click', () => setDrawMode(!drawMode));

function _drawPoint(e) {
  const r = drawCanvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
drawCanvas.addEventListener('pointerdown', e => {
  if (!drawMode || e.button > 0) return;
  e.preventDefault();
  drawCanvas.setPointerCapture(e.pointerId);
  _drawing = { color: drawColor, w: 4, pts: [_drawPoint(e)] };
  redrawStrokes();
});
drawCanvas.addEventListener('pointermove', e => {
  if (!_drawing) return;
  const pt = _drawPoint(e), last = _drawing.pts[_drawing.pts.length - 1];
  if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 1.5) return; // skip jitter
  _drawing.pts.push(pt);
  redrawStrokes();
});
function _endStroke() {
  if (!_drawing) return;
  drawStrokes.push(_drawing);
  _drawing = null;
  redrawStrokes();
}
drawCanvas.addEventListener('pointerup', _endStroke);
drawCanvas.addEventListener('pointercancel', _endStroke);

drawTools.querySelectorAll('.draw-color').forEach(b => b.addEventListener('click', () => {
  drawColor = b.dataset.color;
  drawTools.querySelectorAll('.draw-color').forEach(x => {
    x.classList.toggle('active', x === b);
    x.setAttribute('aria-pressed', String(x === b));
  });
}));
document.getElementById('draw-undo').addEventListener('click', () => { drawStrokes.pop(); redrawStrokes(); });
document.getElementById('draw-clear').addEventListener('click', () => { drawStrokes = []; redrawStrokes(); });

// ── Keyboard control of the model ────────────────────────
// With the 3D canvas focused (click it, or Tab to it): arrow keys orbit in
// 15° steps and +/- zoom. A live region names the nearest preset view so
// screen-reader users know where they are.
const KEY_ROT_STEP = THREE.MathUtils.degToRad(15);
const KEY_ZOOM_STEP = 0.85;
const _kOff = new THREE.Vector3(), _kUp = new THREE.Vector3(), _kRight = new THREE.Vector3();
let _keyAnnounceTimer = null;

function keyOrbit(dAzimuth, dPolar) {
  _viewTween = null;
  _kOff.copy(camera.position).sub(controls.target);
  _kUp.copy(camera.up).normalize();
  if (dAzimuth) _kOff.applyAxisAngle(_kUp, dAzimuth);
  if (dPolar) {
    _kRight.crossVectors(_kOff, _kUp).normalize();
    const next = _kOff.clone().applyAxisAngle(_kRight, dPolar);
    const a = next.angleTo(_kUp);
    if (a > 0.05 && a < Math.PI - 0.05) _kOff.copy(next); // don't flip over the poles
  }
  camera.position.copy(controls.target).add(_kOff);
  controls.update();
}

function keyZoom(factor) {
  _viewTween = null;
  _kOff.copy(camera.position).sub(controls.target);
  const d = THREE.MathUtils.clamp(_kOff.length() * factor, controls.minDistance, controls.maxDistance);
  _kOff.setLength(d);
  camera.position.copy(controls.target).add(_kOff);
  controls.update();
}

// Nearest preset view, compared in the model's own frame (views with a saved
// orientation rotate the model, not just the camera).
function nearestViewLabel() {
  const model = MODEL_BY_ID[activeModelId];
  if (!model || !currentModel) return '';
  const camLocal = camera.position.clone().sub(controls.target).normalize()
    .applyQuaternion(currentModel.quaternion.clone().invert());
  let best = null, bestDot = -2;
  (model.views || DEFAULT_VIEWS).forEach(v => {
    const d = VIEW_DIRS[v.dir];
    if (!d) return;
    const saved = savedViews[v.dir];
    const q = (saved && Array.isArray(saved.rotation))
      ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...saved.rotation.map(THREE.MathUtils.degToRad)))
      : currentModel.quaternion;
    const local = new THREE.Vector3(...d).applyQuaternion(q.clone().invert());
    const dot = local.dot(camLocal);
    if (dot > bestDot) { bestDot = dot; best = v; }
  });
  if (!best) return '';
  return bestDot > 0.95 ? `${best.label} view` : `Near the ${best.label} view`;
}

function announceAfterKey(action) {
  clearTimeout(_keyAnnounceTimer);
  _keyAnnounceTimer = setTimeout(() => {
    const where = nearestViewLabel();
    announce(where ? `${action}. ${where}.` : `${action}.`);
  }, 350); // wait for key-repeat to settle
}

// ── Keyboard shortcuts ───────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (settingsOpen() || shortcutsOpen() || !labelModal.classList.contains('hidden')) return;

  // Canvas-focused keys: arrows rotate, +/- zoom (orbit mode only).
  if (document.activeElement === canvas && currentModel && navMode === 'orbit') {
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':  keyOrbit( KEY_ROT_STEP, 0); announceAfterKey('Rotated left');  break;
      case 'ArrowRight': keyOrbit(-KEY_ROT_STEP, 0); announceAfterKey('Rotated right'); break;
      case 'ArrowUp':    keyOrbit(0, -KEY_ROT_STEP); announceAfterKey('Tilted up');     break;
      case 'ArrowDown':  keyOrbit(0,  KEY_ROT_STEP); announceAfterKey('Tilted down');   break;
      case '+': case '=': keyZoom(KEY_ZOOM_STEP);     announceAfterKey('Zoomed in');     break;
      case '-': case '_': keyZoom(1 / KEY_ZOOM_STEP); announceAfterKey('Zoomed out');    break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); return; }
  }

  if (!singleKeyShortcuts) return;
  if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
  if (!currentModel) return;
  const k = e.key.toLowerCase();
  if (k === 'r') {
    resetView();
    announce('View reset.');
  } else if (k === 'l') {
    // Not during a quiz (that would give the answers away).
    if (!labelsSection.classList.contains('hidden') && quizPanel.classList.contains('hidden')) {
      labelsToggle.click();
      announce(labelsVisible ? 'Labels shown.' : 'Labels hidden.');
    }
  }
});

// Fetch the loading posters ahead of time so they're ready on first click.
const _posterCache = [];
(window.requestIdleCallback || (fn => setTimeout(fn, 1500)))(() => {
  MODELS.forEach(m => { const img = new Image(); img.src = posterUrl(m); _posterCache.push(img); });
});


// ── Visual pathway: lesion panel ──────────────────────────
// The pathway model (js/visual-pathway.js) is built in code. This panel picks
// the lesion site and side, and shows the visual field of each eye.
let pathway = null;
const lesionDock   = document.getElementById('lesion-dock');
const lesionList   = document.getElementById('lesion-list');
const lesionSide   = document.getElementById('lesion-side');
const lesionFields = document.getElementById('lesion-fields');
const lesionDefect = document.getElementById('lesion-defect');
const lesionNote   = document.getElementById('lesion-note');

function buildPathwayModel() {
  pathway?.dispose();
  pathway = createVisualPathway({ CSS2DObject });
  return pathway.group;
}

function renderLesionPanel() {
  if (!pathway) return;
  const { id, side } = pathway.lesion;
  const lesion = LESION_BY_ID[id];
  // The chiasm is in the middle: the side still applies to the next pick.
  lesionSide.querySelectorAll('button[data-side]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
  lesionSide.classList.toggle('muted', !!lesion?.midline);
  lesionList.querySelectorAll('button[data-lesion]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lesion === (id || ''))));
  lesionFields.innerHTML = fieldChartSVG(fieldLoss(id, side), !!lesion?.sparing);
  lesionDefect.textContent = lesion ? lesion.defect(side) : 'Normal visual fields';
  lesionNote.textContent = lesion
    ? lesion.note(side)
    : 'Pick a lesion site, or click a numbered marker on the pathway. Blue fibres carry the left visual field, green the right.';
}

function setPathwayLesion(id, side) {
  if (!pathway) return;
  pathway.setLesion(id, side ?? pathway.lesion.side);
  renderLesionPanel();
  const l = LESION_BY_ID[id];
  if (l) announce(`${l.name}: ${l.defect(pathway.lesion.side)}`);
}

// Phones: the lesion panel is a bottom sheet, so shift the picture up (via the
// camera's view offset) to keep the pathway in the space above it.
function applyPathwayViewOffset() {
  if (!pathway || !quizPanel.classList.contains('hidden')) return;
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  if (!window.matchMedia('(max-width: 600px)').matches || !w || !h) { camera.clearViewOffset(); return; }
  camera.setViewOffset(w, h, 0, Math.round(lesionDock.offsetHeight / 2), w, h);
}
const _pathwayDockObs = new ResizeObserver(() => applyPathwayViewOffset());

function openPathway() {
  if (!pathway) return;
  lesionList.innerHTML = '<button type="button" data-lesion="" aria-pressed="true">None</button>'
    + LESIONS.map(l => `<button type="button" data-lesion="${l.id}"><b>${l.num}</b> ${l.name}</button>`).join('');
  lesionDock.classList.remove('hidden');
  container.classList.add('pathway-open');
  renderLesionPanel();
  _pathwayDockObs.observe(lesionDock);
  _pathwayDockObs.observe(container);
  applyPathwayViewOffset();
}

function closePathway() {
  pathway?.dispose();
  pathway = null;
  _pathwayDockObs.disconnect();
  camera.clearViewOffset();
  lesionDock.classList.add('hidden');
  container.classList.remove('pathway-open');
}

lesionList.addEventListener('click', e => {
  const b = e.target.closest('button[data-lesion]');
  if (b) setPathwayLesion(b.dataset.lesion || null);
});
lesionSide.addEventListener('click', e => {
  const b = e.target.closest('button[data-side]');
  if (b && pathway) setPathwayLesion(pathway.lesion.id, b.dataset.side);
});

// Click a numbered marker on the pathway to pick that lesion.
const _lesionRay = new THREE.Raycaster();
const _lesionNdc = new THREE.Vector2();
renderer.domElement.addEventListener('click', e => {
  if (!pathway || navMode !== 'orbit' || currentClickMode() !== null) return;
  const rect = renderer.domElement.getBoundingClientRect();
  _lesionNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  _lesionRay.setFromCamera(_lesionNdc, camera);
  const hit = _lesionRay.intersectObjects(pathway.markers.filter(m => m.visible), false)[0];
  if (!hit) return;
  const { id, side } = hit.object.userData.lesion;
  setPathwayLesion(id, side ?? pathway.lesion.side);
});
