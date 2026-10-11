/**
 * Asset pipeline for the Blender exports.
 *
 *   node scripts/optimize-assets.mjs blender/fridge.glb public/models/fridge.glb
 *   node scripts/optimize-assets.mjs <baked kitchen>.glb public/models/kitchen.glb --join --keep-names "^KIT_(Upper_Bridge|Bridge_|Filler_Header|Niche_Reveal_Top)" --keep-size "^kitchen_"
 *
 * - dedup + prune unused data
 * - resize textures to --size (default 1024) and re-encode as WebP; textures matching --keep-size keep their resolution
 * - Draco geometry compression (decoder served from /public/draco)
 * - `--join` flattens and joins static meshes to cut draw calls (never for the fridge: its door pivots,
 *   anchors and hardware nodes must keep their names). Nodes matching --keep-names keep their name and stay
 *   separate meshes so the app can still address them.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, draco, flatten, join, resample, weld } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import sharp from "sharp";

const [input, output, ...flags] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node scripts/optimize-assets.mjs <in.glb> <out.glb> [--join] [--size 1024]");
  process.exit(1);
}
const size = Number(flags[flags.indexOf("--size") + 1]) || 1024;
const flagValue = (name) => (flags.indexOf(name) >= 0 ? flags[flags.indexOf(name) + 1] : null);
const keepNames = flagValue("--keep-names") ? new RegExp(flagValue("--keep-names")) : null;
const keepSize = flagValue("--keep-size") ? new RegExp(flagValue("--keep-size")) : null;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});
const doc = await io.read(input);
if (keepNames) {
  // Strip names from everything except the nodes the app addresses, so `join` can merge the rest.
  for (const node of doc.getRoot().listNodes()) if (!keepNames.test(node.getName())) node.setName("");
  for (const mesh of doc.getRoot().listMeshes()) if (!keepNames.test(mesh.getName())) mesh.setName("");
}
const transforms = [dedup(), prune({ keepLeaves: true, keepAttributes: true })];
if (flags.includes("--join")) transforms.push(flatten(), join({ keepNamed: Boolean(keepNames) }));
transforms.push(weld(), resample(), draco({ method: "edgebreaker", quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await doc.transform(...transforms);
// Textures: WebP everywhere; cap to --size unless the name matches --keep-size (baked atlases keep their resolution).
for (const tex of doc.getRoot().listTextures()) {
  const img = tex.getImage();
  if (!img) continue;
  const name = tex.getName() ?? "";
  const keep = keepSize?.test(name) ?? false;
  const meta = await sharp(Buffer.from(img)).metadata();
  let pipeline = sharp(Buffer.from(img));
  if (!keep && (meta.width ?? 0) > size) pipeline = pipeline.resize(size, size, { fit: "inside" });
  const out = await pipeline.webp({ quality: keep ? 80 : 82 }).toBuffer();
  tex.setImage(new Uint8Array(out)).setMimeType("image/webp");
  console.log(`texture ${name}: ${meta.width}px → ${keep ? meta.width : Math.min(meta.width ?? size, size)}px webp (${(out.length / 1024).toFixed(0)} KB)`);
}
await io.write(output, doc);
const stat = (await import("node:fs")).statSync(output);
console.log(`${input} → ${output} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
