#!/usr/bin/env python3
"""
Build the "Brain (Planum)" model from Planum (https://github.com/JoshuaDuq/planumatlas),
an open 3D atlas built on one real person's brain: MGH CDMD subject sub_013
(CC0), reconstructed with FreeSurfer.

Only these Planum layers are used, chosen for their licences:
  cortex-desikan.glb     the subject's pial cortex, Desikan-Killiany parcels (68)
  structures.glb         the subject's FreeSurfer "aseg" deep structures (32)
  tissue-envelopes.glb   pial surfaces (for the cut-face mask)
  tissues-desikan.volume + tissue-labels.json   1 mm label volume (cut faces)
CDMD data is CC0 1.0; the FreeSurfer-derived parcellation and segmentation
follow the FreeSurfer Software License (see models/brain-planum/README.md).
Planum's code (AGPL) is not used.

Writes models/brain-planum/:
  brain-planum.plain.glb    meshes (Draco-compress with gltf-pipeline to get
                            brain-planum.glb, see tools/README.md)
  brain-planum_regions.json region list + section-volume metadata
  brain-planum_sections.bin.gz  region index per voxel (uint8, 1 mm)

Coordinates: Planum meshes are in metres with +x = patient's right,
+y = superior, +z = posterior. The viewer wants millimetres with +X = left,
+Y = superior, +Z = anterior, so X = -1000x, Y = 1000y, Z = -1000z (a 180°
turn about Y, no mirroring).

Usage (Python 3.10+):
    pip install numpy trimesh fast-simplification networkx scipy
    python tools/build-planum-brain.py [download-cache-dir]
    cd tools && npx gltf-pipeline -i ../models/brain-planum/brain-planum.plain.glb \
        -o ../models/brain-planum/brain-planum.glb -d --draco.compressionLevel 7
"""
import gzip
import json
import struct
import sys
import urllib.request
from pathlib import Path

import fast_simplification
import numpy as np
import trimesh

PLANUM_COMMIT = "49c8bf857a617232af561015d1575895a95e8b69"
BASE = f"https://raw.githubusercontent.com/JoshuaDuq/planumatlas/{PLANUM_COMMIT}/public/models/cdmd/"
FILES = ["cortex-desikan.glb", "structures.glb", "tissue-envelopes.glb",
         "tissues-desikan.volume", "tissue-labels.json"]

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "models" / "brain-planum"
CACHE = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "tools" / ".planum-cache"

CORTEX_KEEP = 0.5          # fraction of cortex triangles kept
STRUCT_KEEP = 0.45         # fraction of deep-structure triangles kept
MIN_TRIS = 300
OUTLINE_TRIS = 60000       # whole-brain outline used only as the cut-face mask
MIN_FRAGMENT_TRIS = 40

# Full names for the Desikan-Killiany labels (FreeSurfer's are abbreviations).
DESIKAN = {
    "bankssts": "Banks of the superior temporal sulcus",
    "caudalanteriorcingulate": "Caudal anterior cingulate",
    "caudalmiddlefrontal": "Caudal middle frontal gyrus",
    "cuneus": "Cuneus",
    "entorhinal": "Entorhinal cortex",
    "fusiform": "Fusiform gyrus",
    "inferiorparietal": "Inferior parietal lobule",
    "inferiortemporal": "Inferior temporal gyrus",
    "isthmuscingulate": "Isthmus of the cingulate",
    "lateraloccipital": "Lateral occipital cortex",
    "lateralorbitofrontal": "Lateral orbitofrontal cortex",
    "lingual": "Lingual gyrus",
    "medialorbitofrontal": "Medial orbitofrontal cortex",
    "middletemporal": "Middle temporal gyrus",
    "parahippocampal": "Parahippocampal gyrus",
    "paracentral": "Paracentral lobule",
    "parsopercularis": "Pars opercularis",
    "parsorbitalis": "Pars orbitalis",
    "parstriangularis": "Pars triangularis",
    "pericalcarine": "Pericalcarine cortex",
    "postcentral": "Postcentral gyrus",
    "posteriorcingulate": "Posterior cingulate",
    "precentral": "Precentral gyrus",
    "precuneus": "Precuneus",
    "rostralanteriorcingulate": "Rostral anterior cingulate",
    "rostralmiddlefrontal": "Rostral middle frontal gyrus",
    "superiorfrontal": "Superior frontal gyrus",
    "superiorparietal": "Superior parietal lobule",
    "superiortemporal": "Superior temporal gyrus",
    "supramarginal": "Supramarginal gyrus",
    "frontalpole": "Frontal pole",
    "temporalpole": "Temporal pole",
    "transversetemporal": "Transverse temporal gyrus",
    "insula": "Insula",
    "unknown": "Medial wall (unlabelled)",
}
# Friendlier names for FreeSurfer aseg labels.
ASEG = {
    "Lateral-Ventricle": "Lateral ventricle", "Inf-Lat-Vent": "Inferior horn of lateral ventricle",
    "Cerebellum-White-Matter": "Cerebellar white matter", "Cerebellum-Cortex": "Cerebellar cortex",
    "Thalamus-Proper": "Thalamus", "Thalamus": "Thalamus", "Caudate": "Caudate nucleus",
    "Putamen": "Putamen", "Pallidum": "Globus pallidus", "3rd-Ventricle": "Third ventricle",
    "4th-Ventricle": "Fourth ventricle", "Brain-Stem": "Brainstem", "Hippocampus": "Hippocampus",
    "Amygdala": "Amygdala", "Accumbens-area": "Nucleus accumbens", "VentralDC": "Ventral diencephalon",
    "CC_Posterior": "Corpus callosum (splenium)", "CC_Mid_Posterior": "Corpus callosum (mid-posterior)",
    "CC_Central": "Corpus callosum (central)", "CC_Mid_Anterior": "Corpus callosum (mid-anterior)",
    "CC_Anterior": "Corpus callosum (genu)", "Cerebral-White-Matter": "Cerebral white matter",
    "CSF": "Cerebrospinal fluid", "vessel": "Vessel", "choroid-plexus": "Choroid plexus",
    "WM-hypointensities": "White-matter hypointensities", "Optic-Chiasm": "Optic chiasm",
    "non-WM-hypointensities": "Non-white-matter hypointensities", "5th-Ventricle": "Fifth ventricle",
}


def fetch(name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print("downloading", name)
        urllib.request.urlretrieve(BASE + name, path)
    return path


def read_glb(path):
    """Minimal GLB reader: [(node, extras, material, verts, faces)], float/uint only."""
    data = path.read_bytes()
    jlen = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + jlen])
    bin_off = 20 + jlen + 8
    types = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
    comps = {"SCALAR": 1, "VEC3": 3}

    def accessor(i):
        a = gltf["accessors"][i]
        bv = gltf["bufferViews"][a["bufferView"]]
        dt = types[a["componentType"]]
        n = a["count"] * comps[a["type"]]
        start = bin_off + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride")
        if stride and stride != np.dtype(dt).itemsize * comps[a["type"]]:
            raise ValueError("interleaved buffers are not supported")
        arr = np.frombuffer(data, dt, n, start)
        return arr.reshape(-1, comps[a["type"]]) if comps[a["type"]] > 1 else arr

    out = []
    for node in gltf["nodes"]:
        if "mesh" not in node:
            continue
        if any(k in node for k in ("matrix", "translation", "rotation", "scale")):
            raise ValueError("node transforms are not supported")
        prim = gltf["meshes"][node["mesh"]]["primitives"][0]
        verts = accessor(prim["attributes"]["POSITION"]).astype(np.float64)
        faces = accessor(prim["indices"]).astype(np.int64).reshape(-1, 3)
        mat = gltf["materials"][prim["material"]] if "material" in prim else {}
        out.append((node.get("name", ""), node.get("extras", {}), mat, verts, faces))
    return out


def to_viewer(v_m):
    return np.stack([-v_m[:, 0], v_m[:, 1], -v_m[:, 2]], axis=1) * 1000.0


def drop_fragments(tm):
    parts = tm.split(only_watertight=False)
    if len(parts) <= 1:
        return tm
    biggest = max(len(p.faces) for p in parts)
    keep = [p for p in parts if len(p.faces) >= max(MIN_FRAGMENT_TRIS, biggest * 0.02)]
    return trimesh.util.concatenate(keep)


def simplify(verts, faces, keep, min_tris=MIN_TRIS, agg=7):
    target = max(min_tris, int(len(faces) * keep))
    if len(faces) <= target:
        return verts, faces
    v, f = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int32),
                                        target_reduction=1 - target / len(faces), agg=agg)
    return v.astype(np.float64), f


def linear_to_srgb255(c):
    c = max(0.0, min(1.0, c))
    s = c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return round(s * 255)


def nice_name(extras):
    hemi = extras.get("hemisphere", "")
    side = f" · {hemi}" if hemi in ("left", "right") else ""
    if extras.get("atlas") == "desikan":
        src = extras.get("source_name", "")
        return DESIKAN.get(src.lower(), src) + side
    src = extras.get("source_name", extras.get("label", ""))
    for prefix in ("Left-", "Right-"):
        if src.startswith(prefix):
            src = src[len(prefix):]
    return ASEG.get(src, src.replace("-", " ").replace("_", " ")) + side


def main():
    paths = {name: fetch(name) for name in FILES}
    OUT.mkdir(parents=True, exist_ok=True)
    scene = trimesh.Scene()
    regions, by_region_id = [], {}
    total = 0

    def add_region(key, name, rgb, group, hemi):
        idx = len(regions) + 1
        if idx > 255:
            raise SystemExit("Too many regions for a uint8 volume")
        regions.append({"index": idx, "acronym": key, "name": name,
                        "color": "#%02x%02x%02x" % tuple(rgb), "group": group, "hemisphere": hemi})
        return idx

    for fname, keep, group in (("cortex-desikan.glb", CORTEX_KEEP, "Cerebral cortex"),
                               ("structures.glb", STRUCT_KEEP, "Deep structures")):
        for node, extras, mat, verts, faces in read_glb(paths[fname]):
            v, f = simplify(to_viewer(verts), faces, keep)
            tm = drop_fragments(trimesh.Trimesh(vertices=v, faces=f, process=True))
            lin = mat.get("pbrMetallicRoughness", {}).get("baseColorFactor", [0.5, 0.5, 0.5, 1])
            rgb = [linear_to_srgb255(c) for c in lin[:3]]
            if extras.get("kind") == "non-region":
                rgb = [150, 150, 158]  # medial wall: neutral grey
                lin = [((c / 255 + 0.055) / 1.055) ** 2.4 for c in rgb] + [1]
            tm.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
                name=node, baseColorFactor=[round(c * 255) for c in lin[:3]] + [255],
                metallicFactor=0.0, roughnessFactor=0.8, doubleSided=False))
            scene.add_geometry(tm, node_name=node, geom_name=node)
            total += len(tm.faces)
            idx = add_region(node, nice_name(extras), rgb, group, extras.get("hemisphere", ""))
            by_region_id[node] = idx
            if extras.get("region_id"):
                by_region_id[extras["region_id"]] = idx
            print(f"{idx:3d} {len(tm.faces):6d} tris  {regions[-1]['name']}")

    # Whole-brain outline for the cut-face stencil mask: both pial surfaces
    # plus the solid structures that lie outside them.
    outside = {"aseg:left:7", "aseg:left:8", "aseg:right:46", "aseg:right:47", "aseg:midline:16",
               "aseg:left:28", "aseg:right:60"}
    parts = []
    for node, extras, mat, verts, faces in read_glb(paths["tissue-envelopes.glb"]):
        if node.endswith(":pial"):  # left:pial, right:pial (their tags are on the mesh, not the node)
            parts.append(trimesh.Trimesh(to_viewer(verts), faces, process=True))
    for node, extras, mat, verts, faces in read_glb(paths["structures.glb"]):
        if extras.get("region_id") in outside or node in outside:
            parts.append(trimesh.Trimesh(to_viewer(verts), faces, process=True))
    pieces = []
    for p in parts:
        share = OUTLINE_TRIS * len(p.faces) / sum(len(q.faces) for q in parts)
        # The stencil mask needs closed surfaces (no open edges). A moderate
        # setting keeps them closed, leaving only a handful of pinched edges.
        # (Simplified in metres: the simplifier's stopping thresholds are
        # scale-dependent and stall on millimetre coordinates.)
        v, f = simplify(p.vertices / 1000.0, p.faces, share / len(p.faces), 200, agg=3)
        v = v * 1000.0
        q = drop_fragments(trimesh.Trimesh(v, f, process=True))
        q.fill_holes()
        # Every piece must face outward: where pieces overlap (brainstem inside
        # the pial medial wall, ...), opposite windings would cancel in the mask.
        if q.volume < 0:
            q.invert()
        print(f"  outline piece {len(q.faces):6d} tris, volume {q.volume / 1000:8.1f} cm3")
        pieces.append(q)
    outline = trimesh.util.concatenate(pieces)
    outline.visual = trimesh.visual.TextureVisuals(
        material=trimesh.visual.material.PBRMaterial(name="__outline"))
    scene.add_geometry(outline, node_name="__outline", geom_name="__outline")
    print(f"outline {len(outline.faces)} tris from {len(pieces)} closed surfaces, "
          f"watertight: {[p.is_watertight for p in pieces]}")

    (OUT / "brain-planum.plain.glb").write_bytes(scene.export(file_type="glb", include_normals=True))

    # Section volume: Planum's Desikan label volume, re-indexed to our regions
    # and reordered to (A, S, R) = (posterior-going, inferior-going, left-going).
    meta = json.loads(paths["tissue-labels.json"].read_text())["atlases"]["desikan"]
    raw = gzip.decompress(paths["tissues-desikan.volume"].read_bytes())
    vol = np.frombuffer(raw, meta["dtype"]).reshape(meta["shape"], order="F")
    lut = np.zeros(len(meta["labels"]), np.uint8)
    for code in np.unique(vol).tolist():  # only labels that occur
        lab = meta["labels"][code]
        if lab["source_label_id"] == 0 and lab["kind"] == "tissue":
            continue  # Unknown / background
        if lab["name"] == "CSF":
            continue  # the fluid around the brain and in the sulci: not part of the model
        rid = lab.get("region_id")
        hemi = lab.get("hemisphere", "")
        if not rid and lab["name"].lower() == "unknown" and f"desikan:{hemi}:-1" in by_region_id:
            lut[code] = by_region_id[f"desikan:{hemi}:-1"]  # unlabelled cortex = medial wall
        elif rid in by_region_id:
            lut[code] = by_region_id[rid]
        else:  # tissue without a mesh (white matter, CSF, ...): its own region
            key = f"tissue:{lab['name']}"
            idx = next((r["index"] for r in regions if r["acronym"] == key), None)
            if idx is None:
                idx = add_region(key, nice_name({"source_name": lab["name"], "hemisphere": lab.get("hemisphere")}),
                                 lab["color"], "Tissue", lab.get("hemisphere", ""))
            lut[code] = idx
    labels = lut[vol]

    # Voxel axes -> viewer axes. voxel_to_surface_ras gives RAS mm of voxel
    # centres; viewer (X, Y, Z) = (-R, S, A).
    A = np.array(meta["voxel_to_surface_ras_mm"])
    to_view = np.diag([-1.0, 1.0, 1.0])[[0, 2, 1]]  # rows: X=-R, Y=S, Z=A
    M = to_view @ A[:3, :3]                          # voxel step -> viewer mm
    T = to_view @ A[:3, 3]
    # Each viewer axis is driven by exactly one voxel axis (axis-aligned grid).
    axis_of = [int(np.argmax(np.abs(M[r]))) for r in range(3)]
    sign = [float(np.sign(M[r, axis_of[r]])) for r in range(3)]
    want = [+1.0, -1.0, -1.0]  # texture x along +X, y along -Y, z along -Z
    arr = labels.transpose(axis_of)  # now indexed [X-axis, Y-axis, Z-axis]
    for r in range(3):
        if sign[r] != want[r]:
            arr = np.flip(arr, axis=r)
    out = np.ascontiguousarray(arr.transpose(2, 1, 0))  # C-order (Z, Y, X)
    w, h, d = arr.shape
    v = float(meta["voxel_spacing_mm"][0])
    # Viewer coordinate of the outer corner of texture voxel (0, 0, 0).
    centres = [T[r] + M[r, axis_of[r]] * (0 if sign[r] == want[r] else arr.shape[r] - 1) for r in range(3)]
    origin = [centres[0] - v / 2, centres[1] + v / 2, centres[2] + v / 2]
    with gzip.open(OUT / "brain-planum_sections.bin.gz", "wb", compresslevel=9) as f:
        f.write(out.tobytes())

    (OUT / "brain-planum_regions.json").write_text(json.dumps({
        "atlas": "Planum CDMD sub_013 (Desikan-Killiany + FreeSurfer aseg)",
        "source": f"https://github.com/JoshuaDuq/planumatlas/tree/{PLANUM_COMMIT}",
        "sections": {
            "file": "brain-planum_sections.bin.gz",
            "dims": [w, h, d],
            "voxelMm": v,
            "originMm": [round(x, 4) for x in origin],
        },
        "regions": regions,
    }, indent=1))
    print(f"\n{len(regions)} regions, {total} triangles, volume {out.shape}, origin {origin}")


if __name__ == "__main__":
    main()
