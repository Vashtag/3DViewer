import * as THREE from 'three';
import { OBJLoader } from './OBJLoader.js';
import { MTLLoader } from './MTLLoader.js';
import { OrbitControls } from './OrbitControls.js';

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

// Actual filenames on disk (case-sensitive on web servers)
const REGION_FILES = {
  shoulder: { obj: 'shoulder.obj', mtl: 'shoulder.mtl' },
  pelvis:   { obj: 'Pelvis.obj',   mtl: 'Pelvis.mtl'   },
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

// Cube faces: BoxGeometry material order is +X, -X, +Y, -Y, +Z, -Z
// Camera starts at +Z, so the +Z face is "Front" in our coordinate system.
const GIZMO_FACES = [
  { label: 'R',  view: 'right',  bg: '#b83030' }, // +X
  { label: 'L',  view: 'left',   bg: '#7a1f1f' }, // -X
  { label: 'T',  view: 'top',    bg: '#2e8b2e' }, // +Y
  { label: 'Bo', view: 'bottom', bg: '#1a5c1a' }, // -Y
  { label: 'F',  view: 'front',  bg: '#2255bb' }, // +Z
  { label: 'Bk', view: 'back',   bg: '#163a80' }, // -Z
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

// Click a cube face → snap main camera to that view
const gizmoRaycaster = new THREE.Raycaster();
gizmoCanvas.addEventListener('click', e => {
  const rect = gizmoCanvas.getBoundingClientRect();
  const x =  ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
  const y = -((e.clientY - rect.top)   / rect.height) * 2 + 1;
  gizmoRaycaster.setFromCamera({ x, y }, gizmoCamera);
  const hits = gizmoRaycaster.intersectObject(gizmoCube);
  if (hits.length) {
    const faceIdx = Math.floor(hits[0].faceIndex / 2);
    setView(GIZMO_FACES[faceIdx].view);
  }
});

// ── Render loop ───────────────────────────────────────────
let fitRadius = 0; // bounding-sphere radius of current model

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Dynamically shrink near plane as user zooms in so the model never clips
  // prematurely. Far plane also scales so depth precision stays reasonable.
  if (fitRadius > 0) {
    const dist = camera.position.length();
    camera.near = Math.max(dist * 0.002, 0.001);
    camera.far  = dist * 200 + fitRadius * 4;
    camera.updateProjectionMatrix();
  }

  renderer.render(scene, camera);

  // Sync gizmo: orbit the gizmo camera around the cube in the same direction
  // as the main camera orbits the model, so the cube reflects current orientation.
  gizmoCamera.position.copy(camera.position).normalize().multiplyScalar(5);
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

// ── Model loading ─────────────────────────────────────────
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

  const base = `models/${region}/`;
  const { obj: objFile, mtl: mtlFile } = REGION_FILES[region];

  const mtlLoader = new MTLLoader();
  mtlLoader.setPath(base);

  mtlLoader.load(
    mtlFile,
    (materials) => {
      materials.preload();
      setProgress(30);

      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.setPath(base);

      objLoader.load(
        objFile,
        (object) => {
          setProgress(100);
          softenMaterials(object);
          scene.add(object);
          currentModel = object;
          fitCameraToModel(object);
          showViewerUI();
          setTimeout(hideLoading, 300);
        },
        (xhr) => {
          if (xhr.lengthComputable) setProgress(30 + Math.round((xhr.loaded / xhr.total) * 70));
        },
        (err) => { loadingText.textContent = 'Error loading model.'; console.error(err); }
      );
    },
    undefined,
    (err) => {
      // MTL failed — load OBJ with a plain matte material
      console.warn('MTL load failed, loading OBJ without materials.', err);
      setProgress(30);

      const objLoader = new OBJLoader();
      objLoader.setPath(base);

      objLoader.load(
        objFile,
        (object) => {
          object.traverse(child => {
            if (child.isMesh)
              child.material = new THREE.MeshStandardMaterial({ color: 0xd4b896, roughness: 0.9 });
          });
          setProgress(100);
          scene.add(object);
          currentModel = object;
          fitCameraToModel(object);
          showViewerUI();
          setTimeout(hideLoading, 300);
        },
        (xhr) => {
          if (xhr.lengthComputable) setProgress(30 + Math.round((xhr.loaded / xhr.total) * 70));
        },
        (err2) => { loadingText.textContent = 'Error loading model.'; console.error(err2); }
      );
    }
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
resetBtn.addEventListener('click', () => {
  if (!camera._defaultPos) return;
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
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

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
