import * as THREE from 'three';
import { GLTFLoader } from './GLTFLoader.js';
import { DRACOLoader } from './DRACOLoader.js';
import { OrbitControls } from './OrbitControls.js';
import { PointerLockControls } from './PointerLockControls.js';

// ── DOM refs ──────────────────────────────────────────────
const canvas          = document.getElementById('viewer-canvas');
const container       = document.getElementById('viewer-container');
const loadingOverlay  = document.getElementById('loading-overlay');
const loadingText     = document.getElementById('loading-text');
const progressFill    = document.getElementById('progress-bar-fill');
const viewerToolbar   = document.getElementById('viewer-toolbar');
const resetBtn        = document.getElementById('reset-btn');
const gizmoCanvas     = document.getElementById('gizmo-canvas');
const controlsHint    = document.getElementById('controls-hint');
const emptyState      = document.getElementById('empty-state');
const displayControls = document.getElementById('display-controls');
const regionBtns      = document.querySelectorAll('.region-btn');
const bgSwatches      = document.querySelectorAll('.bg-swatch');
const viewBtns        = document.querySelectorAll('.view-btn');
const lightAzimuth    = document.getElementById('light-azimuth');
const lightElevation  = document.getElementById('light-elevation');
const lightReset      = document.getElementById('light-reset');
const navBtns         = document.querySelectorAll('.nav-btn');

// Draco-compressed GLB per region (texture + materials embedded).
const REGION_FILES = {
  shoulder: 'models/shoulder/shoulder.glb',
  pelvis:   'models/pelvis/pelvis.glb',
};

// ── Main renderer ─────────────────────────────────────────
// alpha: true makes the canvas transparent so the CSS background (lab photo
// or solid colour) shows through behind the 3D model.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
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
const ambient = new THREE.AmbientLight(0xf0f4ff, 0.95); // cool, bright room
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.85); // overhead key
keyLight.position.set(1, 5, 1); // roughly overhead — fine-tuned by sliders
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xddeeff, 0.25); // soft side fill
fillLight.position.set(-3, 1, -1);
scene.add(fillLight);

const backFill = new THREE.DirectionalLight(0xffffff, 0.15); // subtle under fill
backFill.position.set(0, -2, -1);
scene.add(backFill);

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
let prevTime = performance.now();

function flySpeedPerSec() {
  return Math.max(fitRadius * 0.9, 1); // scale movement to model size
}

document.addEventListener('keydown', e => {
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
  }
});

// Click the viewer to lock the pointer when in fly mode.
renderer.domElement.addEventListener('click', () => {
  if (navMode === 'fly' && !flyControls.isLocked) flyControls.lock();
});
flyControls.addEventListener('lock', updateHint);
flyControls.addEventListener('unlock', () => {
  for (const k in keys) keys[k] = false; // stop drifting when released
  updateHint();
});

// ── Resize ────────────────────────────────────────────────
function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);
resize();

// ── Orientation gizmo ─────────────────────────────────────
// A small secondary Three.js scene showing a labelled cube + axis vectors.
// The gizmo camera mirrors the main camera's viewing direction so the cube
// always reflects the current orientation. Click a face to snap the view.

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
// The gizmo is a passive orientation indicator (not clickable).
// Labels use anatomical terms: S = superior (top), I = inferior (bottom).
const GIZMO_FACES = [
  { label: 'R',  bg: '#b83030' }, // +X
  { label: 'L',  bg: '#7a1f1f' }, // -X
  { label: 'S',  bg: '#2e8b2e' }, // +Y  (superior)
  { label: 'I',  bg: '#1a5c1a' }, // -Y  (inferior)
  { label: 'F',  bg: '#2255bb' }, // +Z  (front / anterior)
  { label: 'Bk', bg: '#163a80' }, // -Z  (back / posterior)
];

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
  GIZMO_FACES.map(f => new THREE.MeshBasicMaterial({ map: makeFaceTex(f.label, f.bg) }))
);
gizmoScene.add(gizmoCube);

// Axis arrows: X = red, Y = green, Z = blue
function addAxis(x, y, z, color) {
  const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y, z)];
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color })
  );
  gizmoScene.add(line);

  // Small labelled dot at the tip
  const label = x ? 'X' : y ? 'Y' : 'Z';
  const ts = 64;
  const tc = document.createElement('canvas');
  tc.width = tc.height = ts;
  const ctx = tc.getContext('2d');
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.beginPath();
  ctx.arc(ts / 2, ts / 2, ts / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, ts / 2, ts / 2);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tc) }));
  sprite.scale.set(0.38, 0.38, 0.38);
  sprite.position.set(x * 1.05, y * 1.05, z * 1.05);
  gizmoScene.add(sprite);
}

addAxis(1.4, 0, 0, 0xff4444); // X – red
addAxis(0, 1.4, 0, 0x44cc44); // Y – green
addAxis(0, 0, 1.4, 0x4488ff); // Z – blue

// ── Render loop ───────────────────────────────────────────
let fitRadius = 0; // bounding-sphere radius of current model

const _gizmoDir = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.1);
  prevTime = now;

  if (navMode === 'fly') {
    if (flyControls.isLocked) {
      const step = flySpeedPerSec() * dt;
      if (keys.w) flyControls.moveForward(step);
      if (keys.s) flyControls.moveForward(-step);
      if (keys.d) flyControls.moveRight(step);
      if (keys.a) flyControls.moveRight(-step);
      if (keys.up)   camera.position.y += step;
      if (keys.down) camera.position.y -= step;
    }
  } else {
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
  controlsHint.classList.remove('hidden');
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
function softenMaterials(object) {
  object.traverse(child => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(m => {
      if ('shininess' in m) m.shininess = 6;
      if (m.specular)       m.specular.setScalar(0.03);
      if ('roughness' in m) m.roughness = 0.9;
      if ('metalness' in m) m.metalness = 0.0;
      m.needsUpdate = true;
    });
  });
}

// ── Camera fit ────────────────────────────────────────────
function fitCameraToModel(object) {
  const box    = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius;
  fitRadius    = radius;

  // Centre model at origin
  object.position.sub(center);

  // Distance that fits the bounding sphere in the vertical FOV
  const fov = camera.fov * (Math.PI / 180);
  let distance = radius / Math.sin(fov / 2);
  if (camera.aspect < 1) distance /= camera.aspect; // portrait viewports
  distance *= 1.15; // small breathing room

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

function loadRegion(region) {
  showLoading('Loading ' + region + ' model…');

  if (currentModel) {
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
    REGION_FILES[region],
    (gltf) => {
      const object = gltf.scene;
      setProgress(100);
      softenMaterials(object);
      scene.add(object);
      currentModel = object;
      fitCameraToModel(object);
      showViewerUI();
      setTimeout(hideLoading, 300);
    },
    (xhr) => {
      if (xhr.lengthComputable) setProgress(Math.round((xhr.loaded / xhr.total) * 100));
    },
    (err) => { loadingText.textContent = 'Error loading model.'; console.error(err); }
  );
}

// ── Region buttons ────────────────────────────────────────
regionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    regionBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadRegion(btn.dataset.region);
  });
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

// ── View shortcut buttons (Anterior / Posterior / Left / Right) ──
viewBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (navMode === 'fly') setNavMode('orbit');
    setView(btn.dataset.view);
  });
});

// ── Navigation mode (orbit vs fly) ────────────────────────
function updateHint() {
  if (navMode === 'fly') {
    controlsHint.innerHTML = flyControls.isLocked
      ? 'WASD move <span class="divider">·</span> Space / Shift up·down <span class="divider">·</span> mouse to look <span class="divider">·</span> Esc to release'
      : 'Click the model to start flying';
  } else {
    controlsHint.innerHTML = 'Drag to rotate <span class="divider">·</span> Scroll to zoom <span class="divider">·</span> Right-drag to pan';
  }
}

function setNavMode(mode) {
  navMode = mode;
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  if (mode === 'fly') {
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

// ── Background swatches ───────────────────────────────────
// The renderer is transparent; backgrounds are set via CSS on the container
// so the lab photo or a solid colour shows through the canvas.
const BG_STYLES = {
  dark:  { image: 'none', color: '#0f1117' },
  light: { image: 'none', color: '#e8eaf0' },
  lab:   { image: 'url(assets/lab-background.jpg)', color: '#0f1117' },
};

function setBackground(bg) {
  bgSwatches.forEach(s => s.classList.remove('active'));
  document.querySelector(`.bg-swatch[data-bg="${bg}"]`)?.classList.add('active');
  const s = BG_STYLES[bg] || BG_STYLES.dark;
  container.style.backgroundImage = s.image;
  container.style.backgroundColor = s.color;
}

bgSwatches.forEach(swatch => {
  swatch.addEventListener('click', () => setBackground(swatch.dataset.bg));
});

// ── Lighting direction ────────────────────────────────────
// The two sliders orbit the key light around the model. Azimuth spins it
// horizontally; elevation raises/lowers it. The fill lights stay fixed so
// there's always some ambient shape, but the dominant light follows the user.
const LIGHT_DEFAULT = { azimuth: 20, elevation: 72 };

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
