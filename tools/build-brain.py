#!/usr/bin/env python3
"""
Build the human brain model from the BrainGlobe `allen_human_500um` atlas
(Ding et al. 2016, Allen Human Reference Atlas), the same atlas
brainglobe-heatmap uses for its human-brain example.

Writes to models/brain/:
  brain.plain.glb        one mesh per atlas region, coloured with the atlas
                         colours (Draco-compress it with gltf-pipeline, see
                         tools/README.md, to get brain.glb)
  brain_regions.json     region list + section-volume metadata
  brain_sections.bin.gz  region index per voxel (uint8, 1 mm voxels), used by
                         the cross-section slicer to colour the cut face

Coordinates: the atlas is "asr" in micrometres (axis 0 -> posterior,
1 -> inferior, 2 -> left). The viewer wants millimetres with +X = patient's
left, +Y = superior, +Z = anterior, so
    X = r / 1000,  Y = -s / 1000,  Z = -a / 1000.
That mapping is a mirror, so triangle winding is reversed to keep normals
pointing outward.

Usage (Python 3.10+):
    pip install brainglobe-atlasapi trimesh fast-simplification networkx scipy
    python tools/build-brain.py
    cd tools && npx gltf-pipeline -i ../models/brain/brain.plain.glb \
        -o ../models/brain/brain.glb -d --draco.compressionLevel 7
"""
import gzip
import json
import sys
from pathlib import Path

import fast_simplification
import numpy as np
import trimesh
from brainglobe_atlasapi import BrainGlobeAtlas

ATLAS = "allen_human_500um"
REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "models" / "brain"
CACHE = Path(sys.argv[1]) if len(sys.argv) > 1 else None

# Keep the download reasonable: big surface regions keep more detail than
# small deep nuclei (which are only seen when sliced or isolated).
MAX_TRIS_PER_REGION = 12000
MIN_TRIS_PER_REGION = 500
KEEP_FRACTION = 0.4
MIN_FRAGMENT_TRIS = 60   # pieces smaller than this (or 2% of the main piece) are dropped
OUTLINE_TRIS = 30000
VOLUME_STRIDE = 2  # 500 um atlas voxels -> 1 mm section voxels


def drop_fragments(tm):
    """Remove tiny disconnected pieces (stray specks in the atlas meshes)."""
    parts = tm.split(only_watertight=False)
    if len(parts) <= 1:
        return tm
    biggest = max(len(p.faces) for p in parts)
    keep = [p for p in parts if len(p.faces) >= max(MIN_FRAGMENT_TRIS, biggest * 0.02)]
    return trimesh.util.concatenate(keep)


def srgb_to_linear(c255):
    c = c255 / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def to_viewer(points_um):
    a, s, r = points_um[:, 0], points_um[:, 1], points_um[:, 2]
    return np.stack([r, -s, -a], axis=1) / 1000.0


def main():
    atlas = BrainGlobeAtlas(ATLAS, brainglobe_dir=CACHE, check_latest=False)
    structures = atlas.structures
    ann = np.asarray(atlas.annotation)
    res_um = float(atlas.resolution[0])

    present = set(np.unique(ann).tolist()) - {0}
    ids = [sid for sid in structures.keys() if sid in present]  # tree order
    if len(ids) > 255:
        raise SystemExit("Too many regions for a uint8 volume")

    OUT.mkdir(parents=True, exist_ok=True)
    scene = trimesh.Scene()
    regions = []
    total_tris = 0

    for idx, sid in enumerate(ids, start=1):
        st = structures[sid]
        acr = st["acronym"]
        mesh = atlas.mesh_from_structure(acr)
        verts = to_viewer(np.asarray(mesh.points, dtype=np.float64))
        faces = np.asarray(mesh.cells[0].data)[:, ::-1]  # undo the mirror

        target = int(np.clip(len(faces) * KEEP_FRACTION, MIN_TRIS_PER_REGION, MAX_TRIS_PER_REGION))
        if len(faces) > target:
            verts, faces = fast_simplification.simplify(
                verts.astype(np.float32), faces.astype(np.int32),
                target_reduction=1 - target / len(faces))

        tm = drop_fragments(trimesh.Trimesh(vertices=verts, faces=faces, process=True))
        if tm.is_volume and tm.volume < 0:
            tm.invert()
        rgb = st["rgb_triplet"]
        lin = [round(srgb_to_linear(c) * 255) for c in rgb]  # glTF colours are linear
        tm.visual = trimesh.visual.TextureVisuals(
            material=trimesh.visual.material.PBRMaterial(
                name=acr,
                baseColorFactor=[lin[0], lin[1], lin[2], 255],
                metallicFactor=0.0,
                roughnessFactor=0.85,
            )
        )
        scene.add_geometry(tm, node_name=acr, geom_name=acr)
        total_tris += len(tm.faces)

        # Top-level grouping for the UI (lobe / major division).
        path = st["structure_id_path"]
        group = next((structures[p]["name"] for p in path
                      if structures[p]["acronym"] in GROUPS), "")
        regions.append({
            "index": idx,
            "acronym": acr,
            "name": st["name"],
            "color": "#%02x%02x%02x" % tuple(rgb),
            "group": group,
        })
        print(f"{idx:3d} {acr:8s} {len(tm.faces):6d} tris  {st['name']}")

    # Whole-brain outline, used only as a stencil mask so the region-coloured
    # cut face stops exactly at the brain surface (not hidden in the viewer).
    root = atlas.mesh_from_structure("root")
    verts = to_viewer(np.asarray(root.points, dtype=np.float64))
    faces = np.asarray(root.cells[0].data)[:, ::-1]
    verts, faces = fast_simplification.simplify(
        verts.astype(np.float32), faces.astype(np.int32),
        target_reduction=1 - OUTLINE_TRIS / len(faces))
    outline = drop_fragments(trimesh.Trimesh(vertices=verts, faces=faces, process=True))
    outline.visual = trimesh.visual.TextureVisuals(
        material=trimesh.visual.material.PBRMaterial(name="__outline"))
    scene.add_geometry(outline, node_name="__outline", geom_name="__outline")
    print(f"outline {len(outline.faces)} tris, watertight={outline.is_watertight}")

    glb = scene.export(file_type="glb", include_normals=True)
    (OUT / "brain.plain.glb").write_bytes(glb)

    # Section volume: region index per voxel, downsampled by striding through
    # voxel centres. Stored C-order with shape (A, S, R) so it loads straight
    # into a THREE.Data3DTexture(width=R, height=S, depth=A).
    lut = np.zeros(int(ann.max()) + 1, dtype=np.uint8)
    for r in regions:
        lut[ids[r["index"] - 1]] = r["index"]
    off = VOLUME_STRIDE // 2
    vol = lut[ann[off::VOLUME_STRIDE, off::VOLUME_STRIDE, off::VOLUME_STRIDE]]
    vol = np.ascontiguousarray(vol)
    with gzip.open(OUT / "brain_sections.bin.gz", "wb", compresslevel=9) as f:
        f.write(vol.tobytes())

    voxel_mm = res_um * VOLUME_STRIDE / 1000.0
    a_n, s_n, r_n = vol.shape
    meta = {
        "atlas": ATLAS,
        "citation": atlas.metadata.get("citation", ""),
        "source": "BrainGlobe Atlas API (brainglobe-atlasapi)",
        "sections": {
            "file": "brain_sections.bin.gz",
            "dims": [r_n, s_n, a_n],           # texture width, height, depth
            "voxelMm": voxel_mm,
            # Voxel (r, s, a) covers viewer-space
            #   X in [r, r+1]*voxelMm, Y in -[s, s+1]*voxelMm, Z in -[a, a+1]*voxelMm
        },
        "regions": regions,
    }
    (OUT / "brain_regions.json").write_text(json.dumps(meta, indent=1))
    print(f"\n{len(regions)} regions, {total_tris} triangles, volume {vol.shape}")


# Structures used to group regions in the UI, outermost match wins.
GROUPS = {
    "FroL", "ParL", "TemL", "OccL", "InL", "LimL",       # cerebral lobes
    "CN", "Die", "FWM", "FV", "PACx", "ACx",             # deep forebrain
    "M", "CB", "Pn", "Mo", "HWM", "HV",                  # midbrain / hindbrain
}

if __name__ == "__main__":
    main()
