// Copies MapLibre's web worker into /public so it is served from a stable URL.
// Turbopack cannot resolve the worker relative to the bundled module, so the map
// points at this copy via setWorkerUrl() (see src/components/maps/fridge-map.tsx).
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/maplibre", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
console.log("Copied maplibre-gl-worker.mjs to public/maplibre/");
