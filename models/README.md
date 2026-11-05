# Models & labels

Each region lives in `models/<id>/`:

- `<id>.glb` — the Draco-compressed model (see `../tools/README.md` to make one)
- `<id>_labels.json` — *optional* annotations for that model
  (e.g. `pelvis_labels.json`, `shoulder_labels.json`)
- `<id>_poster.webp` — *optional* still image shown, faded, while the model
  downloads. It's a square, transparent capture of the model at its default
  view, filling the height (so it lines up with where the model appears).
  Without one the viewer shows a plain dimmed overlay instead.

## Adding labels (annotations)

Labels are placed visually, no coordinates by hand:

1. Open the viewer with `?edit` in the URL, e.g.
   `https://…/index.html?edit` (the edit tools are hidden without it).
2. Load the model, then **click on the surface** to drop a pin and type its name.
   - **Drag** a pin's dot to move it (handy when a spot picked in one view
     doesn't sit right in another).
   - Use the red **×** to delete a pin.
3. Click **Download labels** in the sidebar — you get `<id>_labels.json`.
4. Put that file in `models/<id>/` (it's already named correctly) and commit it.
   Or just send it to Claude and ask to add it.

Students (without `?edit`) get a **Show/Hide labels** toggle and can't edit.

### Format
File name: `models/<id>/<id>_labels.json`
```json
[
  { "name": "Acromion",   "position": [12.3, 45.6, -7.8] },
  { "name": "Glenoid",    "position": [5.1, 30.2, 2.4] }
]
```
`position` is in the model's local space, so labels stay attached through
rotation, re-centring and zoom. You normally never edit this by hand.

## Cross-sections (brainstem for now)

Models with `crossSections: true` in the `MODELS` list (in `js/main.js`) can
show up to 8 histology slides, each tied to a cut through the specimen.
Students open **Cross-sections** in the sidebar: the cut's outline lights up
on the model and the slide image shows next to it. They can step rostral to
caudal, enlarge the slide, and optionally cut away the part above or below.

To add or change cuts:

1. Open the viewer with `?edit`, load the model, and open **Cross-sections**
   in the edit tools.
2. Click **Add cut**, then click the model at the level of the slide. Fine-tune
   with **Level** and the two **Tilt** sliders (most brainstem sections are a
   little oblique).
3. Give it a name, pick the slide image, and add a note if you like.
4. Repeat for each slide, then click **Download cross-sections file**.
5. Put `<id>_sections.json` in `models/<id>/`, and the images in
   `models/<id>/sections/` with the same file names you picked.

### Format
```json
{ "sections": [
  { "name": "Rostral pons", "image": "sections/rostral-pons.jpg",
    "note": "optional", "point": [x, y, z], "normal": [x, y, z], "tilt": [0, 0] }
] }
```
`point` and `normal` are in the model's local space. `tilt` (degrees) is only
used to restore the editor sliders.
