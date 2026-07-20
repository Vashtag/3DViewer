import * as THREE from 'three';
import { GLTFLoader } from './GLTFLoader.js';
import { DRACOLoader } from './DRACOLoader.js';
import { OrbitControls } from './OrbitControls.js';
import { PointerLockControls } from './PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject } from './CSS2DRenderer.js';
import { scormModelOpened } from './scorm.js';

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

// ── Mobile drawer ─────────────────────────────────────────
function openDrawer()  {
  sidebarEl.classList.add('open');
  sidebarBackdrop.classList.add('visible');
}
function closeDrawer() {
  sidebarEl.classList.remove('open');
  sidebarBackdrop.classList.remove('visible');
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
    category: 'CNS',
    rotation: [0, 0, 0],
    brightness: 2.2,
    views: [
      { label: 'Anterior',  dir: 'front' },
      { label: 'Posterior', dir: 'back'  },
    ],
  },
];
const MODEL_BY_ID = Object.fromEntries(MODELS.map(m => [m.id, m]));

// ── Main renderer ─────────────────────────────────────────
// alpha: true makes the canvas transparent so the CSS background (lab photo
// or solid colour) shows through behind the 3D model.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
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
    if (lineDrawing) { setLineDrawing(false); return; }
    if (labelPlacementMode) { setLabelPlacementMode(false); return; }
    if (pinMode) { setPinMode(false); return; }
  }
  // Q/E roll works in orbit mode.
  if (navMode === 'orbit') {
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
container.appendChild(labelRenderer.domElement);

// ── Resize ────────────────────────────────────────────────
function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
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

function setProgress(pct) { progressFill.style.width = pct + '%'; }

function showLoading(msg = 'Loading model…') {
  loadingText.textContent = msg;
  setProgress(0);
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() { loadingOverlay.classList.add('hidden'); }

function showViewerUI() {
  emptyState.classList.add('hidden');
  bottomBar.classList.remove('hidden');
  viewerToolbar.classList.remove('hidden');
  displayControls.classList.remove('hidden');
  setNavMode('orbit'); // always start a freshly-loaded model in orbit mode
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
  showLoading('Loading ' + model.label + ' model…');
  buildViewButtons(model);
  updateGizmoLabels(model);
  if (EDIT_MODE) populateOrientViewSelect(model);

  // Saved per-view orientation (authored in edit mode) overrides the default.
  savedViews = {};
  _orientOffset.set(0, 0, 0);
  try {
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
    clearLabels();
    clearLines();
    setLineDrawing(false);
    if (EDIT_MODE) { setLabelPlacementMode(false); setOrientMode(false); }
    clearPins();
    setPinMode(false);
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

  gltfLoader.load(
    model.file,
    (gltf) => {
      const object = gltf.scene;
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
      fitCameraToModel(object);
      // If the first view was authored, frame the model with its saved
      // zoom and pan offset.
      if (savedViews[firstDir]) setView(firstDir);
      showViewerUI();
      scormModelOpened(); // count toward SCORM completion (no-op outside an LMS)
      loadLabels(model);
      initLineLayer();
      loadLines(model);
      initPinLayer();
      setTimeout(hideLoading, 300);
    },
    (xhr) => {
      if (xhr.lengthComputable) setProgress(Math.round((xhr.loaded / xhr.total) * 100));
    },
    (err) => { loadingText.textContent = 'Error loading model.'; console.error(err); }
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
  });
}

function makeRegionButton(model) {
  const btn = document.createElement('button');
  btn.className = 'region-btn';
  btn.dataset.region = model.id;
  btn.innerHTML = `<span class="region-label">${model.label}</span>`;
  btn.addEventListener('click', () => {
    regionSelector.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
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
  toggle.innerHTML = `<span>${categoryName}</span><span class="region-group-caret">▸</span>`;

  const body = document.createElement('div');
  body.className = 'region-group-body hidden';
  models.forEach(model => body.appendChild(makeRegionButton(model)));

  toggle.addEventListener('click', () => {
    const wasOpen = group.classList.contains('open');
    closeAllRegionGroups();
    if (!wasOpen) {
      group.classList.add('open');
      body.classList.remove('hidden');
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
resetBtn.addEventListener('click', () => {
  if (!camera._defaultPos) return;
  if (navMode === 'fly') setNavMode('orbit');
  camera.up.set(0, 1, 0);
  camera.position.copy(camera._defaultPos);
  camera.near = camera._defaultNear;
  camera.far  = camera._defaultFar;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
});

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
  labelSizeSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.size === size));
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

// Reset every setting to its default and apply immediately.
settingsReset.addEventListener('click', () => {
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
  categoryFilters.classList.toggle('hidden', !v);
  setLinesVisible(v);
}

async function loadLabels(model) {
  clearLabels();
  activeModelId = model.id;
  labelLayer = new THREE.Group();
  currentModel.add(labelLayer);

  let raw = [];
  try {
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
  if (on) setOrientMode(false);
  labelPlacementMode = on;
  labelPlaceBtn.classList.toggle('active', on);
  container.classList.toggle('label-place-mode', on);
}

labelPlaceBtn.addEventListener('click', () => setLabelPlacementMode(!labelPlacementMode));

let _pendingLabelHit = null;

renderer.domElement.addEventListener('click', e => {
  if (!labelPlacementMode || navMode !== 'orbit' || !currentModel) return;
  const rect = renderer.domElement.getBoundingClientRect();
  _ndc.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  _ndc.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  _ray.setFromCamera(_ndc, camera);
  const hits = _ray.intersectObject(currentModel, true);
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
  const hits = _ray.intersectObject(currentModel, true);
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
  if (on) setOrientMode(false);
  lineDrawing = on;
  lineDrawBtn.classList.toggle('active', on);
  container.classList.toggle('line-draw-mode', on);
  lineFinishBtn.classList.toggle('hidden', !on);
  if (!on && _wipLine) {
    lineLayer.remove(_wipLine);
    _wipLine = null;
    _wip = [];
  }
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
    const hits = _projRay.intersectObject(currentModel, true);
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
  const hits = _ray.intersectObject(currentModel, true);
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
  if (on) setOrientMode(false);
  pinMode = on;
  pinBtn.classList.toggle('active', on);
  container.classList.toggle('pin-mode', on);
  if (on && navMode === 'orbit') controls.enabled = false;
  else if (!on && navMode === 'orbit' && !dragging) controls.enabled = true;
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
  const hits = currentModel ? _ray.intersectObject(currentModel, true) : [];
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
      '<span class="hint-keep">Q / E to roll <span class="divider">·</span> Drag to rotate</span>';
    scheduleHintFade();
  }
}

function setNavMode(mode) {
  navMode = mode;
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  if (mode === 'fly') {
    setPinMode(false); // can't pin while flying
    controls.enabled = false;
    camera.up.set(0, 1, 0);
  } else {
    if (flyControls.isLocked) flyControls.unlock();
    camera.up.set(0, 1, 0);
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
  bgSwatches.forEach(s => s.classList.toggle('active', s.dataset.bg === bg));
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

  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeModelId || 'model'}-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

screenshotBtn.addEventListener('click', captureScreenshot);
