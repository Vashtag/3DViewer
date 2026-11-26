# Brain (developer-mode preview)

Built by `tools/build-brain.py` from the BrainGlobe atlas `allen_human_500um`,
which packages the Allen Human Reference Atlas (3D, 2020).

- `brain.glb`: one mesh per atlas region (141 regions), in the atlas colours,
  Draco-compressed.
- `brain_regions.json`: region names, acronyms, colours and groups, plus the
  layout of the section volume.
- `brain_sections.bin.gz`: the atlas annotation resampled to 1 mm voxels, one
  byte per voxel holding the region index. The cross-section slicer uses it
  to colour the cut face by region.
- `brain_view.json`: makes the Superior view show anterior at the top.

## Attribution

Ding, S.-L. et al. (2016). Comprehensive cellular-resolution atlas of the
adult human brain. *J Comp Neurol* 524: 3127-3481.
https://doi.org/10.1002/cne.24080

Allen Human Reference Atlas, 3D, 2020. © Allen Institute. Available from
https://atlas.brain-map.org. Use is subject to the Allen Institute's Terms of
Use (https://alleninstitute.org/terms-of-use/).

Packaged by BrainGlobe: Claudi, F., Petrucco, L. et al. (2020). BrainGlobe
Atlas API. *JOSS* 5(54): 2668. https://doi.org/10.21105/joss.02668
