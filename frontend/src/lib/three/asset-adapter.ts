"use client";

import type { Object3D, Vector3 } from "three";
import { HARDWARE_LABELS, type HardwareKey, type Vec3 } from "./tour-config";

/**
 * Asset adapter: normalizes the Blender GLB (or, if it fails to load, the temporary blockout)
 * into a `FridgeRig` the tour can drive. This is the only file that knows Blender object names.
 */
export const FRIDGE_MODEL_URL = "/models/fridge.glb";
export const KITCHEN_MODEL_URL = "/models/kitchen.glb";
/** Equirectangular HDR of the kitchen rendered by Cycles (fridge hidden); lights and reflects the fridge. */
export const KITCHEN_ENV_URL = "/images/kitchen-env.hdr";
export const DRACO_DECODER_PATH = "/draco/";

export type FridgeAssetSource = { kind: "gltf"; url: string } | { kind: "fallback"; reason: string };

let cachedSource: Promise<FridgeAssetSource> | null = null;

/** Probe once per session whether the Blender asset exists. */
export function resolveFridgeAsset(): Promise<FridgeAssetSource> {
  if (!cachedSource) {
    cachedSource = fetch(FRIDGE_MODEL_URL, { method: "HEAD", cache: "force-cache" })
      .then((res) => {
        const type = res.headers.get("content-type") ?? "";
        if (res.ok && !type.includes("text/html")) return { kind: "gltf", url: FRIDGE_MODEL_URL } as const;
        return { kind: "fallback", reason: `No model at ${FRIDGE_MODEL_URL} (${res.status})` } as const;
      })
      .catch((err: Error) => ({ kind: "fallback", reason: err.message }) as const);
  }
  return cachedSource;
}

export interface FridgeRig {
  root: Object3D;
  doorLeft: Object3D | null;
  doorRight: Object3D | null;
  /** Electronics bay cover: lifted away during the Arduino stage. */
  coverParts: Object3D[];
  /** World-space anchor positions for labels, keyed by hardware object name. */
  anchors: Record<HardwareKey, Vec3>;
  source: FridgeAssetSource["kind"];
}

const COVER_NAMES = ["Electronics_Top_Panel", "Electronics_Fastener_1", "Electronics_Fastener_2", "Electronics_Fastener_3", "Electronics_Fastener_4"];

const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[fridgey/three] ${message}`);
}

/**
 * Build a rig from any loaded scene graph. Works for the Blender GLB and the fallback blockout
 * because the blockout uses the same object names.
 */
export function buildRig(root: Object3D, source: FridgeAssetSource["kind"], tmp: Vector3): FridgeRig {
  const doorLeft = root.getObjectByName("Door_L_Pivot") ?? null;
  const doorRight = root.getObjectByName("Door_R_Pivot") ?? null;
  if (!doorLeft) warnOnce("Door_L_Pivot", "Door_L_Pivot not found; left door will not animate.");
  if (!doorRight) warnOnce("Door_R_Pivot", "Door_R_Pivot not found; right door will not animate.");
  const coverParts = COVER_NAMES.map((n) => root.getObjectByName(n)).filter((o): o is Object3D => Boolean(o));

  root.updateWorldMatrix(true, true);
  const anchors = {} as Record<HardwareKey, Vec3>;
  for (const key of Object.keys(HARDWARE_LABELS) as HardwareKey[]) {
    const anchor = root.getObjectByName(`Anchor_${key}`) ?? root.getObjectByName(key);
    if (anchor) {
      anchor.getWorldPosition(tmp);
      anchors[key] = [tmp.x, tmp.y, tmp.z];
    } else {
      warnOnce(key, `${key} / Anchor_${key} not found; using documented fallback position.`);
      anchors[key] = HARDWARE_LABELS[key].fallbackAnchor;
    }
  }
  return { root, doorLeft, doorRight, coverParts, anchors, source };
}
