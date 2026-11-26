# Brain (Planum): developer-mode preview

A real person's brain: subject `sub_013` of the MGH Connectome Diffusion
Microstructure Dataset, reconstructed with FreeSurfer, as published by
[Planum](https://github.com/JoshuaDuq/planumatlas) (commit `49c8bf8`).
Built by `tools/build-planum-brain.py`.

- `brain-planum.glb`: the subject's pial cortex in the 68 Desikan-Killiany
  regions plus 32 FreeSurfer "aseg" deep structures (ventricles, thalamus,
  basal ganglia, hippocampus, amygdala, cerebellum, brainstem, corpus
  callosum), and a hidden whole-brain outline used to mask the cut face.
  Draco-compressed.
- `brain-planum_regions.json`: region names, colours and groups, plus the
  layout of the section volume.
- `brain-planum_sections.bin.gz`: the subject's 1 mm label volume (Desikan
  cortex + aseg + cerebral white matter), one byte per voxel, used by the
  cross-section slicer to colour the cut face and name regions.
- `brain-planum_view.json`: makes the Superior view show anterior at the top.

## Modified from the originals

All or portions of this licensed product (such portions are the "Software")
have been obtained under license from The General Hospital Corporation and are
subject to the terms in `LICENSE-FreeSurfer.txt`.

These files are modified versions of Planum's `cortex-desikan.glb`,
`structures.glb`, `tissue-envelopes.glb`, `tissues-desikan.volume` and
`tissue-labels.json`: meshes simplified and re-oriented to this viewer's
axes, Planum's per-vertex attributes dropped, region names expanded, the
fluid label (CSF) left out of the volume, and labels re-indexed. They are not
the original Software.

Planum's own code (AGPL-3.0) is not used; only the data files above.

## Attribution and licences

- **Subject data (CDMD sub_013), CC0 1.0.** Tian, Q. et al. (2022).
  Comprehensive diffusion MRI dataset for in vivo human brain microstructure
  mapping using 300 mT/m gradients. *Scientific Data* 9: 7.
  https://doi.org/10.1038/s41597-021-01092-6
- **FreeSurfer reconstruction, Desikan-Killiany parcellation and aseg
  segmentation, FreeSurfer Software License** (`LICENSE-FreeSurfer.txt`).
  Fischl, B. (2012). FreeSurfer. *NeuroImage* 62: 774-781.
  Desikan, R. S. et al. (2006). *NeuroImage* 31: 968-980.
  https://doi.org/10.1016/j.neuroimage.2006.01.021
  Fischl, B. et al. (2002). *Neuron* 33: 341-355.
  https://doi.org/10.1016/S0896-6273(02)00569-X
- **Planum**, which prepared these assets: Duquette, J. Planum (version
  0.1.2). https://doi.org/10.5281/zenodo.24538436

For research and education only; not for clinical use.
