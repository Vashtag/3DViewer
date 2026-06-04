# Models & labels

Each region lives in `models/<id>/`:

- `<id>.glb` — the Draco-compressed model (see `../tools/README.md` to make one)
- `<id>_labels.json` — *optional* annotations for that model
  (e.g. `pelvis_labels.json`, `shoulder_labels.json`)

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
