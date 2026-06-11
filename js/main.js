import * as THREE from 'three';
import { GLTFLoader } from './GLTFLoader.js';
import { DRACOLoader } from './DRACOLoader.js';
import { OrbitControls } from './OrbitControls.js';
import { PointerLockControls } from './PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject } from './CSS2DRenderer.js';

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
const lightAzimuth    = document.getElementById('light-azimuth');
const lightElevation  = document.getElementById('light-elevation');
const lightReset      = document.getElementById('light-reset');
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
const orientToggle    = document.getElementById('orient-toggle');
const orientSave      = document.getElementById('orient-save');
const orientViewRow   = document.getElementById('orient-view-row');
const orientViewSel   = document.getElementById('orient-view-select');
const mobileMenuBtn   = document.getElementById('mobile-menu-btn');
const sidebarEl       = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

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

// ── Model catalogue ───────────────────────────────────────
// To add a model: convert your OBJ to a Draco GLB (see tools/README.md),
// drop it in models/<id>/<id>.glb, then add one entry here.
//   rotation: (degrees, [x,y,z]) orients the scan so its anatomical anterior
//             faces +Z — i.e. so the default "Anterior" view looks correct.
//   views:    the shortcut buttons under the gizmo — { label, dir } where dir
//             is the camera direction (front/back/left/right/top/bottom).
//             Omit to use DEFAULT_VIEWS.
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
    views: [
      { label: 'Anterior',  dir: 'front' },
      { label: 'Posterior', dir: 'back'  },
      { label: 'Left',      dir: 'right' },
      { label: 'Right',     dir: 'left'  },
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
      { label: 'Left',      dir: 'left'  },
      { label: 'Right',     dir: 'right' },
      { label: 'Superior',  dir: 'top'   },
      { label: 'Inferior',  dir: 'bottom'},
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
// Matched to overhead fluorescent lab lighting: bright cool-white from
// above, high ambient to simulate the bounced light of a white-walled room,
// and a soft low fill so undersides are still visible.
const ambient = new THREE.AmbientLight(0xf0f4ff, 1.1); // cool, bright room
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.2); // overhead key
keyLight.position.set(1, 5, 1); // roughly overhead — fine-tuned by sliders
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xddeeff, 0.35); // soft side fill
fillLight.position.set(-3, 1, -1);
scene.add(fillLight);

const backFill = new THREE.DirectionalLight(0xffffff, 0.2); // subtle under fill
backFill.position.set(0, -2, -1);
scene.add(backFill);

// Fixed backlight: sits behind the model (−Z, slightly raised) to rim-light its
// silhouette so it lifts off the dark background. Added to the scene (not the
// model), so it stays put in world space and never rotates with the model.
const backLight = new THREE.DirectionalLight(0xeaf2ff, 0.55);
backLight.position.set(0, 1.5, -4);
scene.add(backLight);

// ── OrbitControls ─────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
// min/max distance are set per-model in fitCameraToModel.

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
  // Default to a black background on first load
  if (!container.dataset.bgSet) {
    setBackground('dark');
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
function recenterModel() {
  const c = currentModel?.userData?.centerLocal;
  if (!c) return;
  const w = c.clone().applyQuaternion(currentModel.quaternion);
  currentModel.position.copy(w.negate());
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
};

function setView(name) {
  if (!currentModel || !fitRadius) return;
  const d = VIEW_DIRS[name];
  if (!d) return;
  if      (name === 'top')    camera.up.set(0, 0, -1);
  else if (name === 'bottom') camera.up.set(0, 0,  1);
  else                         camera.up.set(0, 1,  0);

  const dist = camera._defaultPos ? camera._defaultPos.length()
                                   : fitRadius / Math.sin((camera.fov * Math.PI / 180) / 2) * 1.15;
  camera.position.set(d[0] * dist, d[1] * dist, d[2] * dist);
  controls.target.set(0, 0, 0);
  controls.update();
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

  // A saved orientation (set in edit mode) overrides the hardcoded default.
  let savedRotation = null;
  try {
    const res = await fetch(`models/${model.id}/${model.id}_view.json`, { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (Array.isArray(cfg.rotation)) savedRotation = cfg.rotation;
    }
  } catch (e) { /* no saved orientation — use the default */ }

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
      showViewerUI();
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
MODELS.forEach(model => {
  const btn = document.createElement('button');
  btn.className = 'region-btn';
  btn.dataset.region = model.id;
  btn.innerHTML = `<span class="region-label">${model.label}</span>`;
  btn.addEventListener('click', () => {
    regionSelector.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadRegion(model.id);
    closeDrawer();
  });
  regionSelector.appendChild(btn);
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
    btn.textContent = v.label;
    btn.addEventListener('click', () => {
      if (navMode === 'fly') setNavMode('orbit');
      setView(v.dir);
    });
    viewButtons.appendChild(btn);
  });
}

// ── Annotations / labels ─────────────────────────────────
// Author tools appear only when the URL contains ?edit (hidden from students).

const CATEGORY_COLORS = {
  ligament: '#70d0ff',
  nerve:    '#f0e040',
  vessel:   '#e04040',
  other:    '#a0a0b8',
  '':       '#4f7cff', // default / structure
};

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
  dot.style.background = CATEGORY_COLORS[category] ?? CATEGORY_COLORS[''];
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
  setLabelsVisible(EDIT_MODE);
}

labelsToggle.addEventListener('click', () => {
  const next = !labelsVisible;
  if (next && isTouchPrimary && !dotsOnlyMode) {
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
    if (!open) {
      group.classList.add('open');
      body.classList.remove('hidden');
    }
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
  orientToggle.classList.toggle('active', on);
  container.classList.toggle('orient-mode', on);
  orientViewRow.classList.toggle('hidden', !on);
  if (on) {
    setLabelPlacementMode(false);
    setLineDrawing(false);
    setPinMode(false);
    controls.enabled = false;
    // Snap camera to the currently-selected view so the user sees
    // which anatomical direction they're looking at.
    setView(orientViewSel.value);
  } else if (navMode === 'orbit' && !dragging) {
    controls.enabled = true;
  }
}
orientToggle.addEventListener('click', () => setOrientMode(!orientMode));

// When the user picks a different view from the dropdown, snap camera to it.
orientViewSel.addEventListener('change', () => {
  if (orientMode) setView(orientViewSel.value);
});

let _orientLast = null;
renderer.domElement.addEventListener('pointerdown', e => {
  if (!orientMode || !currentModel) return;
  _orientLast = { x: e.clientX, y: e.clientY };
  e.preventDefault();
});
window.addEventListener('pointermove', e => {
  if (!_orientLast || !currentModel) return;
  const dx = e.clientX - _orientLast.x;
  const dy = e.clientY - _orientLast.y;
  _orientLast = { x: e.clientX, y: e.clientY };
  const k = 0.01; // radians per pixel
  currentModel.quaternion
    .premultiply(new THREE.Quaternion().setFromAxisAngle(_WORLD_Y, dx * k))
    .premultiply(new THREE.Quaternion().setFromAxisAngle(_WORLD_X, dy * k));
  recenterModel();
});
window.addEventListener('pointerup', () => { _orientLast = null; });

orientSave.addEventListener('click', () => {
  if (!currentModel) { alert('Load a model first.'); return; }
  const e = currentModel.rotation;
  const round = v => Math.round(THREE.MathUtils.radToDeg(v) * 100) / 100;
  const cfg = { rotation: [round(e.x), round(e.y), round(e.z)] };
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
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
function updateHint(locked = flyControls.isLocked) {
  if (navMode === 'fly') {
    controlsHint.innerHTML = locked
      ? 'WASD to move <span class="divider">·</span> Space / Shift to rise · descend <span class="divider">·</span> mouse to look <span class="divider">·</span> <strong>Press Esc to leave fly mode</strong>'
      : 'Click the model to start flying <span class="divider">·</span> then press Esc to leave';
  } else {
    controlsHint.innerHTML = 'Drag to rotate <span class="divider">·</span> Scroll to zoom <span class="divider">·</span> Right-drag to pan <span class="divider">·</span> Q / E to roll';
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

function setBackground(bg) {
  currentBg = bg;
  bgSwatches.forEach(s => s.classList.remove('active'));
  document.querySelector(`.bg-swatch[data-bg="${bg}"]`)?.classList.add('active');
  const s = BG_STYLES[bg] || BG_STYLES.dark;
  container.style.backgroundImage = s.image;
  container.style.backgroundColor = s.color;
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

// ── Lighting direction ────────────────────────────────────
// The two sliders orbit the key light around the model. Azimuth spins it
// horizontally; elevation raises/lowers it. The fill lights stay fixed so
// there's always some ambient shape, but the dominant light follows the user.
const LIGHT_DEFAULT = { azimuth: 0, elevation: 80 };

function updateKeyLight() {
  const az = THREE.MathUtils.degToRad(Number(lightAzimuth.value));
  const el = THREE.MathUtils.degToRad(Number(lightElevation.value));
  const r = 5;
  keyLight.position.set(
    r * Math.cos(el) * Math.sin(az),
    r * Math.sin(el),
    r * Math.cos(el) * Math.cos(az)
  );
}

lightAzimuth.addEventListener('input', updateKeyLight);
lightElevation.addEventListener('input', updateKeyLight);

lightReset.addEventListener('click', () => {
  lightAzimuth.value = LIGHT_DEFAULT.azimuth;
  lightElevation.value = LIGHT_DEFAULT.elevation;
  updateKeyLight();
});

updateKeyLight(); // sync key light to the slider defaults on startup
