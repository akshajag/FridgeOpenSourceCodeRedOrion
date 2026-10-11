# 3D assets

Both files are produced from `blender/smart_fridge_final.blend` and are the models the landing page renders.

| File | Source | Pipeline | Size |
| --- | --- | --- | --- |
| `fridge.glb` | `blender/fridge.glb` (Blender glTF export, SmartFridge collection) | `node scripts/optimize-assets.mjs blender/fridge.glb public/models/fridge.glb` | ~0.5 MB |
| `kitchen.glb` | `KITCHEN`, `potted_plant_02`, `potted_plant_04` collections, baked and exported with `scripts/bake-kitchen.py` | `node scripts/optimize-assets.mjs <baked>.glb public/models/kitchen.glb --join --keep-names "^KIT_(Upper_Bridge\|Bridge_\|Filler_Header\|Niche_Reveal_Top)" --keep-size "^kitchen_"` | ~4 MB |

The pipeline (`scripts/optimize-assets.mjs`, glTF Transform) deduplicates, prunes, re-encodes textures as WebP (capped at 1024 px unless they match `--keep-size`), joins static meshes, and Draco-compresses geometry. The Draco decoder is served from `/public/draco` (copied from three.js).

## Why the kitchen is baked (lighting included)

The kitchen objects in the Blender file have no UV maps. Their oak, tile, wall and quartz materials use object-space BOX (triplanar) projection, a White Noise node keyed on `Object Info → Random` that offsets the grain and varies brightness per door (per plank strip for the floor, per column for the tiles), and HSV / Color Ramp adjustments on base colour. None of that exists in glTF, which samples textures only through UVs, so a plain export shows a single flat oak colour.

Real-time shading also cannot reproduce Cycles' global illumination, so `scripts/bake-kitchen.py` bakes the *lit* result: it Smart-UV-projects every kitchen object, packs each group into one atlas (cabinets, counters, tiles, decor and plants at 4096 px; floor and walls at 2048 px), bakes the full DIFFUSE pass (colour + direct + indirect light, fridge in place with doors closed) on the Metal GPU, denoises it in the compositor and saves it through the scene's AgX view transform so it matches the renders. The materials become lightmap materials (`KBAKE_kitchen_*`) that the browser draws unlit (`MeshBasicMaterial`, no tone mapping). The script also renders `public/images/kitchen-env.hdr`, an equirectangular HDR of the kitchen with the fridge hidden, which lights and reflects the real-time fridge. The `.blend` is not saved. Re-run whenever the kitchen or its lighting changes (about 5 minutes on an M-series GPU):

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b blender/smart_fridge_final.blend --python scripts/bake-kitchen.py -- /tmp/kitchen_lit.glb public/images/kitchen-env.hdr /tmp/bake 256
node scripts/optimize-assets.mjs /tmp/kitchen_lit.glb public/models/kitchen.glb --join --keep-names "^KIT_(Upper_Bridge|Bridge_|Filler_Header|Niche_Reveal_Top)" --keep-size "^kitchen_"
```

## Fridge rig contract

Object names the tour relies on, all present in the export:

- `Door_L_Pivot`, `Door_R_Pivot`: hinge empties at x = ±0.502 m, z = 0.34 m. The left door rotates to −100° and the right to +100° about Y (glTF), matching the Blender animation. Door bins and door-mounted food are children of the pivots and swing with them.
- `Electronics_Top_Panel`, `Electronics_Fastener_1..4`: lifted and faded during the Arduino stage (Blender hides them at frame 315).
- `Anchor_Camera_Front`, `Anchor_Camera_Interior`, `Anchor_Speaker`, `Anchor_Arduino_Board`, `Anchor_Sensor_Temperature`, `Anchor_Sensor_AirQuality`, `Anchor_Sensor_Moisture`: label anchors for the HTML hotspots.
- Hardware meshes: `Camera_Front_Body`, `Camera_Interior_Body`, `Speaker_Body`, `Arduino_PCB`, `Sensor_*_Body`.

Missing objects fall back to the positions in `src/lib/three/tour-config.ts` and log one console warning. If `fridge.glb` cannot be fetched at all, the procedural blockout in `src/components/three/fridge-model.tsx` stands in so the tour still works.

## Camera data

Stage cameras come from `Camera_Tour` keyframes (frames 1, 90, 150, 210, 265, 315, 370, 420; see `blender/camera_reference.json`). Positions are stored in the glTF frame; rotations stay as Blender XYZ Euler degrees and are converted at runtime by `src/lib/three/blender-camera.ts` (Z-up → Y-up, lens → FOV with Blender's AUTO sensor fit).

## Corrections made during conversion

- Kitchen materials are baked to UV atlases (see above) instead of exported directly.
- `Electronics_Fastener_*` and `Electronics_Top_Panel` had hide keyframes rather than transforms; the web app reproduces the reveal by lifting and fading them.
- The hero stage always shows the Cycles render (`public/images/kitchen-background.webp`, from `blender/renders/kitchen_background_hero.png`) with only the real-time fridge composited into the niche, because real-time lighting cannot match Cycles' global illumination. The render cross-fades to `kitchen.glb` between tour progress 0.03 and 0.11 (`KITCHEN_FADE` in `src/lib/three/tour-config.ts`), by which point the camera has moved in and the cabinets are peripheral. On low-memory devices the render stays throughout.
- The voice stage uses a 40 mm lens instead of Blender's 50 mm so the speaker anchor stays in frame at 16:10.
