"use client";

/**
 * The Blender kitchen (public/models/kitchen.glb) with Cycles lighting baked into its textures
 * (scripts/bake-kitchen.py). It is drawn unlit so it looks like the render from every camera
 * position; only the fridge is shaded in real time. The hero render stays visible until the
 * kitchen has loaded and the user scrolls (see KitchenBackdrop).
 */
import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { DRACO_DECODER_PATH, KITCHEN_MODEL_URL } from "@/lib/three/asset-adapter";
import { TOUR_STAGES, TOUR_TIMING, kitchenBlend, progressToStage } from "@/lib/three/tour-config";
import { requestFrames, tourProgressRef } from "@/lib/three/tour-state";

/** Cabinetry above the fridge niche; it fades out with the electronics cover so the Arduino bay is visible from above. */
const NICHE_TOP_PARTS = ["KIT_Upper_Bridge", "KIT_Bridge_Door", "KIT_Bridge_Handle", "KIT_Filler_Header", "KIT_Niche_Reveal_Top"];
const smooth = (t: number) => t * t * (3 - 2 * t);

const unlitCache = new Map<THREE.Material, THREE.Material>();

/** Cabinet handles: polished metal from the Blender file (KMAT_Handle), shaded in real time off the HDR. */
const handleMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.76, 0.77, 0.782), metalness: 1, roughness: 0.26, envMapIntensity: 1.2, name: "KMAT_Handle" });

/** Baked lightmap materials → MeshBasicMaterial (unlit, not tone-mapped: the bake already went through AgX). */
function toUnlit(m: THREE.Material): THREE.Material {
  const cached = unlitCache.get(m);
  if (cached) return cached;
  const src = m as THREE.MeshStandardMaterial;
  let out: THREE.Material;
  if (src.name === "KMAT_Glass_Win") {
    out = new THREE.MeshBasicMaterial({ color: "#dfe9f3", transparent: true, opacity: 0.12, depthWrite: false, name: src.name });
    out.userData.alwaysTransparent = true;
  } else {
    // The lightmaps are a DIFFUSE bake and omit the oak's specular sheen; a 10 % lift matches the Cycles frames.
    out = new THREE.MeshBasicMaterial({ map: src.map ?? null, color: src.map ? new THREE.Color(1.1, 1.1, 1.1) : src.color, toneMapped: false, name: src.name });
  }
  unlitCache.set(m, out);
  return out;
}

/** Collect the kitchen's materials, cloning the niche-top parts so they can fade independently. */
function prepareScene(scene: THREE.Object3D) {
  const nicheMeshes = NICHE_TOP_PARTS.map((n) => scene.getObjectByName(n) as THREE.Mesh | undefined).filter((m): m is THREE.Mesh => Boolean(m && m.isMesh));
  for (const m of nicheMeshes) m.material = (m.material as THREE.Material).clone();
  const others = new Set<THREE.Material>();
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Lighting is baked; the kitchen neither casts nor receives real-time shadows.
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const converted = /Handle/.test(mesh.name) ? mats.map(() => handleMaterial) : mats.map((m) => toUnlit(m));
    mesh.material = converted.length === 1 ? converted[0] : converted;
    for (const m of converted) if (!nicheMeshes.includes(mesh)) others.add(m);
  });
  scene.visible = false;
  return { nicheTop: nicheMeshes.map((m) => m.material as THREE.Material), others: Array.from(others).filter((m) => m.userData.alwaysTransparent !== true) };
}

/** Per-frame update: cross-fade with the hero render and lift the niche-top cabinetry for the Arduino stage. */
function updateScene(scene: THREE.Object3D, mats: { nicheTop: THREE.Material[]; others: THREE.Material[] }, blend: number, cover: number) {
  scene.visible = blend > 0.005;
  applyOpacity(mats.others, blend);
  applyOpacity(mats.nicheTop, blend * (1 - cover));
}

/** Set opacity on a set of materials, toggling transparency only while fading so sorting stays correct when solid. */
function applyOpacity(materials: THREE.Material[], opacity: number) {
  for (const mat of materials) {
    mat.opacity = opacity;
    mat.transparent = opacity < 0.995 || mat.userData.alwaysTransparent === true;
    mat.depthWrite = mat.userData.alwaysTransparent !== true;
  }
}

export function KitchenModel({ onReady }: { onReady?: () => void }) {
  const { scene } = useGLTF(KITCHEN_MODEL_URL, DRACO_DECODER_PATH);
  const mats = useRef<{ nicheTop: THREE.Material[]; others: THREE.Material[] } | null>(null);
  const fade = useRef(0);
  const blend = useRef(0);
  useLayoutEffect(() => {
    mats.current = prepareScene(scene);
    requestFrames(1500);
    onReady?.();
  }, [scene, onReady]);

  useFrame((_, dt) => {
    const progress = tourProgressRef.current;
    const k = 1 - Math.exp(-TOUR_TIMING.doorLerpRate * Math.min(dt, 0.25));
    if (Math.abs(kitchenBlend(progress) - blend.current) > 1e-4) requestFrames(500);
    blend.current += (kitchenBlend(progress) - blend.current) * k;
    const { from, to, t } = progressToStage(progress);
    const coverTarget = THREE.MathUtils.lerp(TOUR_STAGES[from].coverHidden ? 1 : 0, TOUR_STAGES[to].coverHidden ? 1 : 0, smooth(t));
    fade.current += (coverTarget - fade.current) * k;
    if (mats.current) updateScene(scene, mats.current, blend.current, fade.current);
  });
  return <primitive object={scene} />;
}

export function preloadKitchen() {
  useGLTF.preload(KITCHEN_MODEL_URL, DRACO_DECODER_PATH);
}
