# Models & labels

Each region lives in `models/<id>/`:

- `<id>.glb` — the Draco-compressed model (see `../tools/README.md` to make one)
- `labels.json` — *optional* annotations for that model

## Adding labels (annotations)

Labels are placed visually, no coordinates by hand:

1. Open the viewer with `?edit` in the URL, e.g.
   `https://…/index.html?edit` (the edit tools are hidden without it).
2. Load the model, then **click on the surface** to drop a pin and type its name.
   Use the red **×** on a pin to remove it.
3. Click **Download labels.json** in the sidebar.
4. Put the downloaded file at `models/<id>/labels.json` (rename it to exactly
   `labels.json`) and commit it. Or just send it to Claude and ask to add it.

Students (without `?edit`) get a **Show/Hide labels** toggle and can't edit.

### Format
```json
[
  { "name": "Acromion",   "position": [12.3, 45.6, -7.8] },
  { "name": "Glenoid",    "position": [5.1, 30.2, 2.4] }
]
```
`position` is in the model's local space, so labels stay attached through
rotation, re-centring and zoom. You normally never edit this by hand.
