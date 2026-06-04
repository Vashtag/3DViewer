# Adding a new model

The viewer loads **Draco-compressed GLB** files (small, fast). Your scans come
out of Artec as OBJ + MTL + texture, so there's a one-time conversion step.

## Two ways to do it

### Option A — Let Claude do it (easiest)
Upload the OBJ, its `.mtl`, and the texture image to the repo, then ask Claude
to "convert <name> and add it to the viewer." It will run the conversion and
wire up the model list for you.

### Option B — Run the converter yourself
You need [Node.js](https://nodejs.org) installed (LTS is fine).

```bash
# one-time setup
cd tools
npm install

# convert a model (run from the repo root)
cd ..
node tools/convert-model.mjs path/to/yourscan.obj knee
```

This writes `models/knee/knee.glb`. The `.mtl` and texture referenced by the
OBJ must sit in the same folder as the `.obj`.

## Final step (both options)
Add one line to the `MODELS` array near the top of `js/main.js`:

```js
const MODELS = [
  { id: 'shoulder', label: 'Shoulder', file: 'models/shoulder/shoulder.glb' },
  { id: 'pelvis',   label: 'Pelvis',   file: 'models/pelvis/pelvis.glb'     },
  { id: 'knee',     label: 'Knee',     file: 'models/knee/knee.glb'         }, // ← new
];
```

The region button appears automatically. Commit the new `.glb` and the edit,
and push.

## Notes
- `id` must match the folder and file name (`models/<id>/<id>.glb`).
- `label` is what students see in the sidebar.
- Draco quantization is kept at high precision, so there's no visible loss of
  surface detail — only the file size drops (typically 80–90% smaller).
- The texture is embedded in the GLB, so you don't need to ship the JPG
  separately.
