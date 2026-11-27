# Anatomy 3D

An interactive anatomy viewer for teaching, built for the School of Anatomy at the University of Waterloo. Students can rotate, label and quiz themselves on 3D scans of real specimens. They can also slice through a brain atlas, scroll through a labelled brain MRI, and explore how lesions in the visual and eye-movement pathways show up at the bedside.

It runs entirely in the browser with no build step and no server code: a single page (`index.html`) using [Three.js](https://threejs.org). It can be hosted on any static web host (for example GitHub Pages), opened locally, or uploaded to an LMS such as D2L/Brightspace as a SCORM 1.2 package.

## What's in it

### 3D models

| Model | What it is |
|---|---|
| **Shoulder, Pelvis, Knee, Brainstem** | 3D surface scans of specimens (Artec scanner), with clickable labels and preset views. |
| **Brain (3D)** | The Allen Human Reference Atlas as 141 coloured regions. It opens already sliced. The dock at the bottom picks the plane (coronal, sagittal, transverse) and moves the cut. The cut face shows the atlas regions or the atlas MRI. Right-click or long-press a region to isolate it. |

Features on every 3D model:
- Orbit and zoom, plus Fly mode on most models.
- Preset views and an orientation cube.
- Labels, and **Test me**, a quiz on the labels.
- Pins, drawing on the screen, and screenshots.
- Keyboard shortcuts (press `?`).
- Settings for motion, colour-blind palettes and more.

### Diagrams

These open over the viewer in place of a 3D model.

| Model | What it is |
|---|---|
| **Brain (MRI)** | 342 slices of a T1 head MRI in all three planes, with 89 hand-outlined structures. **Labels** turns the outlines on and off, and hovering or tapping a region names it. **Sweep** plays through the slices. **All views** shows the three planes side by side with linked crosshairs. Click a structure to see it in all three. |
| **Visual Pathway** | A to-scale, top-down diagram from the eyes to the visual cortex. Click a numbered lesion site (optic nerve, chiasm, tract, Meyer's loop, parietal radiation, cortex) to see what each eye loses, drawn on a picture of a scene. |
| **Eye Movements** | Both eyes with their six muscles, and the brainstem pathways that move them (FEF, PPRF, VI and III nuclei, MLF, riMLF). Pick a gaze, run the H test, tilt the head or look near. Then cut CN III, IV or VI, the MLF, or the VI nucleus, and watch which muscles fail. |

Brain (MRI), Visual Pathway and Eye Movements are still in testing and only appear in developer mode (see below).

## Running it locally

The page loads its scripts as ES modules, so it needs to be served over HTTP; opening `index.html` straight from disk won't work. From the repo root:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

### Page options

- `?edit` turns on the authoring tools: placing and dragging labels, saving view orientations, and drawing lines. You can then download the result as JSON files to commit. See [models/README.md](models/README.md).
- `?dev` adds **Developer mode** to Settings. It is password-protected; ask the maintainer for the password. Once unlocked, it can switch on the features still in testing.

## Repository layout

```
index.html            the page
css/style.css         all styles
js/main.js            the viewer: models list, loading, controls, labels,
                      quiz, slicer, settings, developer mode
js/visual-pathway*.js Visual Pathway (lesion rules + diagram)
js/eye-movements*.js  Eye Movements (lesion rules + diagram)
js/mri-atlas.js       Brain (MRI) slice viewer
js/volume-worker.js   unpacks the brain atlas volumes off the main thread
js/scorm.js           SCORM 1.2 completion and time reporting (does nothing outside an LMS)
js/three*, *Loader.js, ...   Three.js and its add-ons, vendored
models/<id>/          each model: .glb, labels, saved views, poster image
models/brain/         Brain (3D) meshes, region map and MRI volumes
models/brain-mri/     Brain (MRI) slices and outlines
tools/                scripts that build the models and data
imsmanifest.xml       SCORM package manifest
```

## Adding or rebuilding content

- **A new scanned model:** convert the OBJ to a compressed GLB with `tools/convert-model.mjs`, then add one entry to the `MODELS` list at the top of `js/main.js`. See [tools/README.md](tools/README.md).
- **Labels and preset views:** place them in the browser with `?edit`, download the JSON files and commit them. See [models/README.md](models/README.md).
- **Brain (3D):** `tools/build-brain.py` rebuilds the meshes, region map and MRI from the BrainGlobe atlas. See [models/brain/README.md](models/brain/README.md).
- **Brain (MRI):** `tools/extract-brain-mri.py` rebuilds the slices and outlines from the original Flash file (`Brain_MRI.swf`).

## SCORM / LMS

`imsmanifest.xml` describes the course as a single SCORM 1.2 SCO.

To build the package, zip the files the page needs: `index.html`, `imsmanifest.xml`, `css/`, `js/`, `assets/` and `models/`. Leave out `tools/` and anything not used at runtime.

Inside an LMS the viewer reports time on task. It marks the course completed once a model has been opened and about a minute of active time has passed. Outside an LMS this reporting does nothing.

## Credits and licences

- **Specimen scans** (shoulder, pelvis, knee, brainstem): School of Anatomy, University of Waterloo.
- **Brain (3D):** Allen Human Reference Atlas, 3D, 2020 © Allen Institute ([terms of use](https://alleninstitute.org/terms-of-use/)). Ding et al. (2016), *J Comp Neurol* 524: 3127–3481. Packaged by [BrainGlobe](https://brainglobe.info). Full attribution is in [models/brain/README.md](models/brain/README.md).
- **Brain (MRI):** images and outlines bmy © headneckbrainspine.com; scan from [OASIS](https://www.oasis-brains.org). Check you have permission before publishing this model beyond developer mode.
- **Three.js** and its add-ons: MIT licence.
