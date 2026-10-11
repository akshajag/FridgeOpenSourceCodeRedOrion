"use client";

/**
 * FridgeAssetLoader loads the Blender GLB (Draco-compressed, decoder served from /draco),
 * tunes its PBR materials for real-time rendering, builds a `FridgeRig`, and drives the door
 * hinges, interior lighting and the electronics-bay cover each frame from tour progress.
 * If the GLB cannot be loaded, the procedural blockout takes its place so the tour still works.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { buildRig, DRACO_DECODER_PATH, FRIDGE_MODEL_URL, resolveFridgeAsset, type FridgeAssetSource, type FridgeRig } from "@/lib/three/asset-adapter";
import { DOOR_OPEN_DEG, TOUR_STAGES, TOUR_TIMING, progressToStage } from "@/lib/three/tour-config";
import { requestFrames, tourProgressRef } from "@/lib/three/tour-state";
import { FridgeModelFallback } from "./fridge-model";

const DOOR_OPEN_RAD = THREE.MathUtils.degToRad(DOOR_OPEN_DEG);
const smooth = (t: number) => t * t * (3 - 2 * t);
const COVER_LIFT = 0.22;

/** Lift and fade the electronics-bay cover parts (0 = in place, 1 = removed). */
function applyCover(parts: THREE.Object3D[], value: number) {
  for (const part of parts) {
    part.position.y = value * COVER_LIFT;
    part.visible = value < 0.98;
    const mat = (part as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (mat && mat.isMeshStandardMaterial) {
      mat.transparent = value > 0.01;
      mat.opacity = 1 - value;
    }
  }
}

function applyLedGlow(materials: THREE.MeshStandardMaterial[], open: number) {
  for (const m of materials) m.emissiveIntensity = 0.25 + open * 0.9;
}

useGLTF.setDecoderPath(DRACO_DECODER_PATH);

export function useFridgeAssetSource() {
  const [source, setSource] = useState<FridgeAssetSource | null>(null);
  useEffect(() => {
    let alive = true;
    resolveFridgeAsset().then((s) => alive && setSource(s));
    return () => {
      alive = false;
    };
  }, []);
  return source;
}

/** Real-time material adjustments for materials authored for Cycles. */
function tuneMaterials(scene: THREE.Object3D) {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mat = m as THREE.MeshPhysicalMaterial;
      if (!mat.isMeshStandardMaterial) continue;
      switch (mat.name) {
        case "MAT_Glass_Door":
          mat.transparent = true;
          mat.opacity = 0.22;
          mat.roughness = 0.04;
          mat.metalness = 0;
          mat.envMapIntensity = 1.4;
          mat.depthWrite = false;
          mat.side = THREE.DoubleSide;
          mesh.castShadow = false;
          mesh.renderOrder = 10;
          break;
        case "MAT_Glass_Shelf":
          mat.transparent = true;
          mat.opacity = 0.35;
          mat.depthWrite = false;
          mesh.castShadow = false;
          mesh.renderOrder = 5;
          break;
        case "MAT_Plastic_Translucent":
          mat.transparent = true;
          mat.opacity = 0.55;
          mat.depthWrite = false;
          mesh.castShadow = false;
          mesh.renderOrder = 6;
          break;
        case "MAT_LED_Cool":
          mat.emissive = new THREE.Color("#dbeeff");
          mat.emissiveIntensity = 0.2;
          break;
        case "MAT_Screen":
          mat.emissive = new THREE.Color("#6fa0bd");
          mat.emissiveIntensity = 0.7;
          break;
        case "MAT_LED_Green":
          mat.emissive = new THREE.Color("#3bb37f");
          mat.emissiveIntensity = 2;
          mat.toneMapped = false;
          break;
        case "MAT_Steel_Brushed":
        case "MAT_Metal_Handle":
        case "MAT_Connector":
          mat.envMapIntensity = 1.3;
          break;
        default:
          mat.envMapIntensity = 1.0;
      }
    }
  });
}

function GltfFridge({ url, onRig }: { url: string; onRig: (rig: FridgeRig) => void }) {
  const { scene } = useGLTF(url, DRACO_DECODER_PATH);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useLayoutEffect(() => {
    tuneMaterials(scene);
    onRig(buildRig(scene, "gltf", tmp));
  }, [scene, onRig, tmp]);
  return <primitive object={scene} />;
}

function FallbackFridge({ onRig }: { onRig: (rig: FridgeRig) => void }) {
  const ref = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useLayoutEffect(() => {
    if (ref.current) onRig(buildRig(ref.current, "fallback", tmp));
  }, [onRig, tmp]);
  return (
    <group ref={ref}>
      <FridgeModelFallback />
    </group>
  );
}

export function FridgeAssetLoader({ onRig }: { onRig?: (rig: FridgeRig) => void }) {
  const source = useFridgeAssetSource();
  const rigRef = useRef<FridgeRig | null>(null);
  const lightTop = useRef<THREE.PointLight>(null);
  const lightL = useRef<THREE.PointLight>(null);
  const lightR = useRef<THREE.PointLight>(null);
  const bayLight = useRef<THREE.PointLight>(null);
  const doorValue = useRef(0);
  const coverValue = useRef(0);
  const ledMaterials = useRef<THREE.MeshStandardMaterial[]>([]);

  const handleRig = useMemo(
    () => (rig: FridgeRig) => {
      rigRef.current = rig;
      ledMaterials.current = [];
      rig.root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && m.name === "MAT_LED_Cool") ledMaterials.current.push(m);
      });
      onRig?.(rig);
    },
    [onRig],
  );

  // Doors, interior light and the electronics cover follow tour progress every frame.
  useFrame((_, dt) => {
    const rig = rigRef.current;
    const { from, to, t } = progressToStage(tourProgressRef.current);
    const s = smooth(t);
    const k = 1 - Math.exp(-TOUR_TIMING.doorLerpRate * Math.min(dt, 0.25));

    const doorTarget = THREE.MathUtils.lerp(TOUR_STAGES[from].doors, TOUR_STAGES[to].doors, s);
    if (Math.abs(doorTarget - doorValue.current) > 1e-4) requestFrames(500);
    doorValue.current += (doorTarget - doorValue.current) * k;
    const open = doorValue.current;
    // Blender: Door_L_Pivot rotates to -100° and Door_R_Pivot to +100° about the hinge (Y in glTF).
    if (rig?.doorLeft) rig.doorLeft.rotation.y = -open * DOOR_OPEN_RAD;
    if (rig?.doorRight) rig.doorRight.rotation.y = open * DOOR_OPEN_RAD;

    const coverTarget = THREE.MathUtils.lerp(TOUR_STAGES[from].coverHidden ? 1 : 0, TOUR_STAGES[to].coverHidden ? 1 : 0, s);
    if (Math.abs(coverTarget - coverValue.current) > 1e-4) requestFrames(500);
    coverValue.current += (coverTarget - coverValue.current) * k;
    if (rig) applyCover(rig.coverParts, coverValue.current);

    // Interior LEDs brighten as the doors open (Blender: cool 8 W area lights L/R + 7 W top).
    const glow = 0.25 + open * 0.75;
    if (lightTop.current) lightTop.current.intensity = 0.7 * glow;
    if (lightL.current) lightL.current.intensity = 0.45 * glow;
    if (lightR.current) lightR.current.intensity = 0.45 * glow;
    if (bayLight.current) bayLight.current.intensity = 0.08 + coverValue.current * 0.2;
    applyLedGlow(ledMaterials.current, open);
  });

  if (!source) return null;
  return (
    <group>
      <pointLight ref={lightTop} position={[0, 1.525, -0.02]} intensity={0.3} distance={2.2} decay={2} color="#dbeeff" />
      <pointLight ref={lightL} position={[-0.4, 0.99, 0.29]} intensity={0.2} distance={1.6} decay={2} color="#dbeeff" />
      <pointLight ref={lightR} position={[0.4, 0.99, 0.29]} intensity={0.2} distance={1.6} decay={2} color="#dbeeff" />
      <pointLight ref={bayLight} position={[0, 1.86, 0.24]} intensity={0.4} distance={0.9} decay={2} color="#fff4e6" />
      {source.kind === "gltf" ? (
        <Suspense fallback={null}>
          <GltfFridge url={source.url} onRig={handleRig} />
        </Suspense>
      ) : (
        <FallbackFridge onRig={handleRig} />
      )}
    </group>
  );
}

useGLTF.preload(FRIDGE_MODEL_URL, DRACO_DECODER_PATH);
