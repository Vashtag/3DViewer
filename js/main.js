import * as THREE from 'three';
import { OBJLoader } from './OBJLoader.js';
import { MTLLoader } from './MTLLoader.js';
import { OrbitControls } from './OrbitControls.js';

const canvas = document.getElementById('viewer-canvas');
const container = document.getElementById('viewer-container');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const progressFill = document.getElementById('progress-bar-fill');
const resetBtn = document.getElementById('reset-btn');
const controlsHint = document.getElementById('controls-hint');
const emptyState = document.getElementById('empty-state');
const regionBtns = document.querySelectorAll('.region-btn');

// Actual filenames on disk (case-sensitive on web servers)
const REGION_FILES = {
  shoulder: { obj: 'shoulder.obj', mtl: 'shoulder.mtl' },
  pelvis:   { obj: 'Pelvis.obj',   mtl: 'Pelvis.mtl'   },
};

// ── Renderer ──────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x0f1117);

// ── Scene & Camera ────────────────────────────────────────
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 0, 3);

// ── Lighting ──────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(2, 3, 2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.4);
fillLight.position.set(-2, 1, -1);
scene.add(fillLight);

// ── Controls ──────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
// min/max distance are set per-model in fitCameraToModel (scans vary in scale).

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

// ── Render loop ───────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ── Model loading ─────────────────────────────────────────
let currentModel = null;

function setProgress(pct) {
  progressFill.style.width = pct + '%';
}

function showLoading(msg = 'Loading model…') {
  loadingText.textContent = msg;
  setProgress(0);
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

// Reveal the viewer UI once a model is on screen.
function showViewerUI() {
  emptyState.classList.add('hidden');
  controlsHint.classList.remove('hidden');
  resetBtn.classList.remove('hidden');
}

function fitCameraToModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius;

  // Centre the model at the origin.
  object.position.sub(center);

  // Distance at which the bounding sphere just fits the vertical FOV.
  // Using the sphere (not max dimension) means the model stays framed
  // no matter how the student rotates it. Scans vary wildly in scale,
  // so everything below is derived from the model's own radius.
  const fov = camera.fov * (Math.PI / 180);
  let distance = radius / Math.sin(fov / 2);

  // Narrow (portrait) viewports have a smaller horizontal FOV — pull back
  // so the model still fits widthwise.
  if (camera.aspect < 1) {
    distance /= camera.aspect;
  }

  distance *= 1.15; // a little breathing room around the edges

  camera.position.set(0, 0, distance);
  camera.near = Math.max(distance - radius * 2, 0.01);
  camera.far = distance + radius * 2;
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  // Clamp zoom relative to model size (the model is ~hundreds of units,
  // so fixed limits would jam the camera inside it).
  controls.minDistance = radius * 0.4;
  controls.maxDistance = radius * 12;
  controls.update();

  // Store default for reset
  camera._defaultPos = camera.position.clone();
  camera._defaultNear = camera.near;
  camera._defaultFar = camera.far;
}

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
          scene.add(object);
          currentModel = object;
          fitCameraToModel(object);
          showViewerUI();
          setTimeout(hideLoading, 300);
        },
        (xhr) => {
          if (xhr.lengthComputable) {
            const pct = 30 + (xhr.loaded / xhr.total) * 70;
            setProgress(Math.round(pct));
          }
        },
        (err) => {
          loadingText.textContent = 'Error loading model.';
          console.error(err);
        }
      );
    },
    undefined,
    (err) => {
      // MTL failed — try loading OBJ without materials
      console.warn('MTL load failed, loading OBJ without materials.', err);
      setProgress(30);

      const objLoader = new OBJLoader();
      objLoader.setPath(base);

      objLoader.load(
        objFile,
        (object) => {
          // Apply a default material so the mesh is visible
          object.traverse(child => {
            if (child.isMesh) {
              child.material = new THREE.MeshStandardMaterial({ color: 0xd4b896, roughness: 0.7 });
            }
          });
          setProgress(100);
          scene.add(object);
          currentModel = object;
          fitCameraToModel(object);
          showViewerUI();
          setTimeout(hideLoading, 300);
        },
        (xhr) => {
          if (xhr.lengthComputable) {
            const pct = 30 + (xhr.loaded / xhr.total) * 70;
            setProgress(Math.round(pct));
          }
        },
        (err2) => {
          loadingText.textContent = 'Error loading model.';
          console.error(err2);
        }
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
  camera.position.copy(camera._defaultPos);
  camera.near = camera._defaultNear;
  camera.far = camera._defaultFar;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
});

// ── Initial state ─────────────────────────────────────────
// Start with no model loaded — the empty state prompts the user to pick one.
