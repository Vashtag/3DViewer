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
  brain_mri.bin.gz       the atlas's MRI template on the same 1 mm grid
                         (uint8), shown on the cut face in MRI mode (phones)
  brain_mri_hd.bin.gz    the same template at its full 0.5 mm resolution,
                         cropped to the brain (computers; see export_mri)
  brain_sections_hd.bin.gz  the region map at its full 0.5 mm resolution, same
                         crop (computers: sharper cut-face boundaries)

Coordinates: the atlas is "asr" in micrometres (axis 0 -> posterior,
1 -> inferior, 2 -> left). The viewer wants millimetres with +X = patient's
left, +Y = superior, +Z = anterior, so
    X = r / 1000,  Y = -s / 1000,  Z = -a / 1000.
That mapping is a mirror, so triangle winding is reversed to keep normals
pointing outward.

Usage (Python 3.10+):
    pip install brainglobe-atlasapi trimesh fast-simplification networkx scipy
    python tools/build-brain.py [cache-dir]
    python tools/build-brain.py [cache-dir] --mri-only   # just (re)write the MRI
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
from scipy import ndimage

ATLAS = "allen_human_500um"
REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "models" / "brain"
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
CACHE = Path(ARGS[0]) if ARGS else None
MRI_ONLY = "--mri-only" in sys.argv

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


def export_mri(atlas, ann):
    """The atlas's MRI template, averaged into the same 1 mm voxels as the
    section volume (voxel k spans atlas voxels 2k and 2k+1), contrast-stretched
    to uint8, and zeroed a few mm outside the brain (never shown, and it
    compresses far better). Same (A, S, R) C-order layout as the sections."""
    t = np.asarray(atlas.template).astype(np.float32)
    k = VOLUME_STRIDE
    A, S, R = (d // k * k for d in t.shape)
    block = lambda x: x[:A, :S, :R].reshape(A // k, k, S // k, k, R // k, k)
    mean = block(t).mean(axis=(1, 3, 5))
    near_brain = ndimage.binary_dilation(block(ann > 0).any(axis=(1, 3, 5)), iterations=3)
    lo, hi = np.percentile(t[ann > 0], [1, 99.7])
    mri = np.clip((mean - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    mri[~near_brain] = 0
    with gzip.open(OUT / "brain_mri.bin.gz", "wb", compresslevel=9) as f:
        f.write(np.ascontiguousarray(mri).tobytes())
    print(f"MRI template {mri.shape}")

    # Full 0.5 mm version for computers, cropped to the brain (+2 mm). To keep
    # the download small it uses 128 grey levels (invisible once the GPU
    # interpolates) and stores each A-slice as the difference from the one
    # before (mod 256), which gzip packs far better; the viewer undoes it with
    # a running sum over slices.
    near = ndimage.binary_dilation(ann > 0, iterations=4)
    occ = np.argwhere(near)
    c0, c1 = occ.min(axis=0), occ.max(axis=0) + 1
    hd = np.clip((t - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8)
    hd[~near] = 0
    hd = hd[c0[0]:c1[0], c0[1]:c1[1], c0[2]:c1[2]] // 2 * 2
    delta = np.diff(hd.astype(np.int16), axis=0, prepend=0).astype(np.uint8)
    with gzip.open(OUT / "brain_mri_hd.bin.gz", "wb", compresslevel=9) as f:
        f.write(np.ascontiguousarray(delta).tobytes())
    print(f"MRI template HD {hd.shape} from voxel {c0.tolist()}")

    # The region map at full 0.5 mm, same crop: the cut face draws its region
    # boundaries from this on computers (the 1 mm map stays for phones and
    # for naming what's under the pointer).
    present = set(np.unique(ann).tolist()) - {0}
    ids = [sid for sid in atlas.structures.keys() if sid in present]  # same order as the regions
    lut = np.zeros(int(ann.max()) + 1, dtype=np.uint8)
    for i, sid in enumerate(ids, start=1):
        lut[sid] = i
    labels_hd = lut[ann[c0[0]:c1[0], c0[1]:c1[1], c0[2]:c1[2]]]
    with gzip.open(OUT / "brain_sections_hd.bin.gz", "wb", compresslevel=9) as f:
        f.write(np.ascontiguousarray(labels_hd).tobytes())
    a_n, s_n, r_n = hd.shape
    return {
        "file": "brain_mri.bin.gz",
        "description": "Allen Human Reference Atlas MRI template (T2-weighted contrast)",
        "hd": {
            "file": "brain_mri_hd.bin.gz",
            "dims": [r_n, s_n, a_n],                     # texture width, height, depth
            "voxelScale": k,                             # section voxel = k x k x k of these
            "corner": [int(c0[2]), int(c0[1]), int(c0[0])],  # (r, s, a) of the crop, in these voxels
            "encoding": "delta-depth",                   # slice z stores slice z minus slice z-1
            "labels": "brain_sections_hd.bin.gz",        # region map, same grid, plain
        },
    }


def main():
    atlas = BrainGlobeAtlas(ATLAS, brainglobe_dir=CACHE, check_latest=False)
    if MRI_ONLY:
        meta_path = OUT / "brain_regions.json"
        meta = json.loads(meta_path.read_text())
        meta["mri"] = export_mri(atlas, np.asarray(atlas.annotation))
        meta_path.write_text(json.dumps(meta, indent=1))
        return
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
        "mri": export_mri(atlas, ann),
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
