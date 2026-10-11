"use client";

/**
 * FridgeShowcase: the Three.js stage for the Blender scene.
 *
 * The kitchen carries Cycles lighting baked into its textures and is drawn unlit. The fridge is
 * shaded in real time with:
 *   - an equirectangular HDR of the kitchen rendered by Cycles (public/images/kitchen-env.hdr) as
 *     environment light and reflections, so steel and glass reflect the actual room,
 *   - one directional light standing in for the window (KIT_Light_Window) for crisp self-shadowing,
 *   - interior and electronics-bay lights that follow the doors (FridgeAssetLoader).
 * Tone mapping is AgX with exposure 0.82 (2^-0.28) plus a contrast curve approximating Blender's
 * "AgX - Medium High Contrast" look, so the real-time fridge matches the lightmaps that were saved
 * through that look (see agx-look.ts).
 */
import { Suspense, useCallback, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { KITCHEN_ENV_URL, type FridgeRig } from "@/lib/three/asset-adapter";
import { HARDWARE_LABELS, type HardwareKey } from "@/lib/three/tour-config";
import { CameraController } from "./camera-controller";
import { FridgeAssetLoader } from "./fridge-asset-loader";
import { HardwareHotspot } from "./hardware-hotspot";
import { KitchenModel } from "./kitchen-model";
import { installAgXLook } from "@/lib/three/agx-look";

installAgXLook();
import { consumeFrame, requestFrames, useTourState } from "@/lib/three/tour-state";
import { useEffect } from "react";

/**
 * Drives R3F's demand frameloop: renders while tour progress changes or any animated component
 * has asked for more frames (`requestFrames`), and otherwise idles so an untouched page costs ~0 CPU.
 */
function DemandRenderer({ active }: { active: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    requestFrames(1500);
    let raf = 0;
    const tick = () => {
      if (consumeFrame()) invalidate();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const unsub = useTourState.subscribe(() => requestFrames(700));
    const onResize = () => requestFrames(300);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
      window.removeEventListener("resize", onResize);
    };
  }, [active, invalidate]);
  return null;
}

export interface FridgeShowcaseProps {
  active: boolean;
  onSource?: (kind: "gltf" | "fallback") => void;
  onKitchenReady?: () => void;
  /** Skip the 3D kitchen (low-end devices); the hero render stays as the backdrop. */
  kitchen?: boolean;
}

export function FridgeShowcase({ active, onSource, onKitchenReady, kitchen = true }: FridgeShowcaseProps) {
  const [rig, setRig] = useState<FridgeRig | null>(null);
  const [dpr, setDpr] = useState(1.5);
  const handleRig = useCallback(
    (r: FridgeRig) => {
      setRig(r);
      onSource?.(r.source);
    },
    [onSource],
  );

  return (
    <Canvas
      dpr={dpr}
      shadows={{ type: THREE.PCFSoftShadowMap }}
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMapping: THREE.CustomToneMapping, toneMappingExposure: 0.82 }}
      camera={{ fov: 32, near: 0.05, far: 60, position: [0, 1.05, 4.4] }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {/* Adaptive resolution: drop to 1x on devices that cannot hold 60 fps, climb back when they can. */}
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(Math.min(1.75, window.devicePixelRatio))} flipflops={3} />

      {/* Window key light: the HDR carries ambient and reflections; this adds direct self-shadowing on the fridge. */}
      <directionalLight
        position={[-3.3, 2.4, 2.2]}
        intensity={1.6}
        color="#fffbf5"
        castShadow
        shadow-intensity={0.42}
        shadow-radius={5}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00012}
        shadow-normalBias={0.03}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-1}
      />
      <Suspense fallback={null}>
        {/* The HDR was rendered with camera-only emissive proxies for every Cycles area light, so the studio
            softboxes and the window show up in the steel exactly as they do in the renders. */}
        <Environment files={KITCHEN_ENV_URL} environmentIntensity={1.0} />
      </Suspense>

      {kitchen && (
        <Suspense fallback={null}>
          <KitchenModel onReady={onKitchenReady} />
        </Suspense>
      )}
      <ContactShadows position={[0, 0.002, 0.05]} opacity={0.35} scale={3} blur={2.4} far={1.2} resolution={512} color="#3a3128" frames={1} />
      <FridgeAssetLoader onRig={handleRig} />
      <CameraController />
      <DemandRenderer active={active} />
      {rig && (Object.keys(HARDWARE_LABELS) as HardwareKey[]).map((key) => <HardwareHotspot key={key} name={key} position={rig.anchors[key]} />)}
    </Canvas>
  );
}
