"use client";

/**
 * TEMPORARY FALLBACK — procedural Three.js refrigerator blockout.
 *
 * This is an intentional engineering preview, not the final art. It exists so the tour,
 * door rig, camera moves, and hotspot anchors are fully functional before the Blender asset
 * (/public/models/fridge.glb) arrives. It uses the same object names as the Blender scene so the
 * asset adapter can drive either one without changes.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { FRIDGE_DIMENSIONS as D } from "@/lib/three/tour-config";

const W = D.width;
const H = D.height;
const DEEP = D.depth;
const HEAD = D.headHeight;

function useMaterials() {
  return useMemo(() => {
    const steel = new THREE.MeshStandardMaterial({ color: "#d6d9dc", metalness: 0.75, roughness: 0.32 });
    const steelDark = new THREE.MeshStandardMaterial({ color: "#8e9397", metalness: 0.8, roughness: 0.35 });
    const cabinet = new THREE.MeshStandardMaterial({ color: "#eef0f1", metalness: 0.1, roughness: 0.55 });
    const interior = new THREE.MeshStandardMaterial({ color: "#f7f8f8", metalness: 0, roughness: 0.8, side: THREE.BackSide });
    const plastic = new THREE.MeshStandardMaterial({ color: "#3a3d40", metalness: 0.2, roughness: 0.6 });
    const glass = new THREE.MeshPhysicalMaterial({ color: "#dfe8ee", metalness: 0, roughness: 0.06, transparent: true, opacity: 0.28, envMapIntensity: 1.2, side: THREE.DoubleSide });
    const shelf = new THREE.MeshPhysicalMaterial({ color: "#cfe3ea", metalness: 0, roughness: 0.1, transparent: true, opacity: 0.55 });
    const screen = new THREE.MeshStandardMaterial({ color: "#7fa7bf", emissive: "#4f7f9a", emissiveIntensity: 0.35, roughness: 0.4 });
    const pcb = new THREE.MeshStandardMaterial({ color: "#2f8f80", roughness: 0.6 });
    const sensor = new THREE.MeshStandardMaterial({ color: "#4a4f54", roughness: 0.5 });
    const led = new THREE.MeshStandardMaterial({ color: "#316b54", emissive: "#3bb37f", emissiveIntensity: 1.4 });
    return { steel, steelDark, cabinet, interior, plastic, glass, shelf, screen, pcb, sensor, led };
  }, []);
}

type Mats = ReturnType<typeof useMaterials>;

function Shelf({ y, m }: { y: number; m: Mats }) {
  return (
    <group position={[0, y, 0]}>
      <mesh material={m.shelf} position={[0, 0, -0.02]}>
        <boxGeometry args={[W - 0.12, 0.012, DEEP - 0.16]} />
      </mesh>
      <mesh material={m.steel} position={[0, 0, DEEP / 2 - 0.1]}>
        <boxGeometry args={[W - 0.12, 0.02, 0.02]} />
      </mesh>
    </group>
  );
}

function Food({ m }: { m: Mats }) {
  const milk = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f4f4f2", roughness: 0.7 }), []);
  const juice = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f0b48a", roughness: 0.7 }), []);
  const tub = useMemo(() => new THREE.MeshStandardMaterial({ color: "#9fbfe3", roughness: 0.6 }), []);
  const tomato = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d6554b", roughness: 0.45 }), []);
  const lime = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8fbf6a", roughness: 0.5 }), []);
  const butter = useMemo(() => new THREE.MeshStandardMaterial({ color: "#efd892", roughness: 0.6 }), []);
  void m;
  return (
    <group>
      {/* top shelf: milk cartons, juice, tub */}
      <mesh material={milk} position={[-0.3, 1.38, -0.12]} castShadow><boxGeometry args={[0.09, 0.22, 0.09]} /></mesh>
      <mesh material={milk} position={[-0.19, 1.38, -0.12]} castShadow><boxGeometry args={[0.09, 0.22, 0.09]} /></mesh>
      <mesh material={juice} position={[-0.07, 1.36, -0.1]} castShadow><boxGeometry args={[0.08, 0.18, 0.08]} /></mesh>
      <mesh material={tub} position={[0.22, 1.33, -0.14]} castShadow><boxGeometry args={[0.18, 0.12, 0.14]} /></mesh>
      {/* middle shelf: eggs tray, jar */}
      <mesh material={butter} position={[-0.2, 0.99, -0.1]} castShadow><boxGeometry args={[0.22, 0.05, 0.12]} /></mesh>
      {[-0.27, -0.2, -0.13].map((x) => (
        <mesh key={x} material={milk} position={[x, 1.045, -0.1]} castShadow><sphereGeometry args={[0.028, 16, 12]} /></mesh>
      ))}
      <mesh material={butter} position={[0.25, 1.02, -0.12]} castShadow><cylinderGeometry args={[0.05, 0.05, 0.12, 20]} /></mesh>
      {/* lower shelf: tomatoes, limes, tub */}
      {[-0.3, -0.22, -0.14].map((x) => (
        <mesh key={x} material={tomato} position={[x, 0.68, -0.08]} castShadow><sphereGeometry args={[0.035, 18, 14]} /></mesh>
      ))}
      {[0.0, 0.08].map((x) => (
        <mesh key={x} material={lime} position={[x, 0.675, -0.1]} castShadow><sphereGeometry args={[0.03, 16, 12]} /></mesh>
      ))}
      <mesh material={tub} position={[0.26, 0.68, -0.14]} castShadow><boxGeometry args={[0.16, 0.08, 0.12]} /></mesh>
    </group>
  );
}

export function FridgeModelFallback() {
  const m = useMaterials();
  const base = 0.06;
  return (
    <group name="Fridge_Root">
      {/* Plinth with grille */}
      <mesh material={m.plastic} position={[0, base / 2, 0]}>
        <boxGeometry args={[W - 0.04, base, DEEP - 0.06]} />
      </mesh>
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={i} material={m.steelDark} position={[-0.3 + i * 0.075, base / 2, DEEP / 2 - 0.028]}>
          <boxGeometry args={[0.012, base - 0.015, 0.004]} />
        </mesh>
      ))}

      {/* Cabinet shell (open front). Built from five slabs so the interior is a real cavity. */}
      <group position={[0, base, 0]}>
        <mesh material={m.cabinet} position={[-W / 2 + 0.03, H / 2, -0.03]} castShadow receiveShadow>
          <boxGeometry args={[0.06, H, DEEP - 0.06]} />
        </mesh>
        <mesh material={m.cabinet} position={[W / 2 - 0.03, H / 2, -0.03]} castShadow receiveShadow>
          <boxGeometry args={[0.06, H, DEEP - 0.06]} />
        </mesh>
        <mesh material={m.cabinet} position={[0, H - 0.03, -0.03]} castShadow>
          <boxGeometry args={[W, 0.06, DEEP - 0.06]} />
        </mesh>
        <mesh material={m.cabinet} position={[0, 0.03, -0.03]} receiveShadow>
          <boxGeometry args={[W, 0.06, DEEP - 0.06]} />
        </mesh>
        <mesh material={m.cabinet} position={[0, H / 2, -DEEP / 2 + 0.03]}>
          <boxGeometry args={[W, H, 0.06]} />
        </mesh>
        {/* Interior back-wall slats and side walls (light) */}
        <mesh material={m.interior} position={[0, H / 2, -0.03]}>
          <boxGeometry args={[W - 0.12, H - 0.12, DEEP - 0.12]} />
        </mesh>
        {[1.52, 1.44, 1.14, 1.06, 0.82, 0.74].map((y) => (
          <mesh key={y} material={m.steelDark} position={[0, y, -DEEP / 2 + 0.07]}>
            <boxGeometry args={[W - 0.3, 0.012, 0.01]} />
          </mesh>
        ))}
        {/* Shelves */}
        <Shelf y={1.26} m={m} />
        <Shelf y={0.95} m={m} />
        <Shelf y={0.62} m={m} />
        {/* Crisper drawers */}
        <mesh material={m.shelf} position={[-0.2, 0.2, -0.04]}>
          <boxGeometry args={[0.36, 0.26, DEEP - 0.2]} />
        </mesh>
        <mesh material={m.shelf} position={[0.2, 0.2, -0.04]}>
          <boxGeometry args={[0.36, 0.26, DEEP - 0.2]} />
        </mesh>
        {/* Interior LED strips */}
        <mesh material={m.led} position={[-W / 2 + 0.065, H / 2, DEEP / 2 - 0.12]}>
          <boxGeometry args={[0.008, H - 0.3, 0.02]} />
        </mesh>
        <mesh material={m.led} position={[W / 2 - 0.065, H / 2, DEEP / 2 - 0.12]}>
          <boxGeometry args={[0.008, H - 0.3, 0.02]} />
        </mesh>
        {/* Interior camera: top center of the back wall */}
        <group name="Camera_Interior" position={[0, H - 0.16, -DEEP / 2 + 0.1]}>
          <mesh material={m.sensor} castShadow><boxGeometry args={[0.07, 0.04, 0.03]} /></mesh>
          <mesh material={m.plastic} position={[0, 0, 0.02]}><cylinderGeometry args={[0.009, 0.009, 0.01, 16]} /></mesh>
        </group>
        {/* Sensors on the side walls */}
        <group name="Sensor_Temperature" position={[-W / 2 + 0.075, 1.36, -0.2]}>
          <mesh material={m.sensor}><boxGeometry args={[0.03, 0.06, 0.04]} /></mesh>
          <mesh material={m.led} position={[0.016, 0.015, 0]}><sphereGeometry args={[0.005, 8, 8]} /></mesh>
        </group>
        <group name="Sensor_AirQuality" position={[W / 2 - 0.075, 1.36, -0.2]}>
          <mesh material={m.sensor}><boxGeometry args={[0.03, 0.06, 0.05]} /></mesh>
          {[-0.015, 0, 0.015].map((y) => (
            <mesh key={y} material={m.steelDark} position={[-0.016, y, 0]}><boxGeometry args={[0.002, 0.006, 0.035]} /></mesh>
          ))}
        </group>
        <group name="Sensor_Moisture" position={[-W / 2 + 0.075, 0.56, -0.2]}>
          <mesh material={m.sensor}><boxGeometry args={[0.03, 0.045, 0.035]} /></mesh>
        </group>
        <Food m={m} />
      </group>

      {/* Doors (pivots at the outer front edges) */}
      <group position={[0, base, 0]}>
        <DoorRig side="L" m={m} />
        <DoorRig side="R" m={m} />
      </group>

      {/* Electronics head unit on top */}
      <group position={[0, base + H, 0]}>
        <mesh material={m.cabinet} position={[0, HEAD / 2, -0.01]} castShadow>
          <boxGeometry args={[W, HEAD, DEEP - 0.02]} />
        </mesh>
        <mesh material={m.steelDark} position={[0, 0.012, DEEP / 2 - 0.03]}>
          <boxGeometry args={[W - 0.08, 0.016, 0.03]} />
        </mesh>
        {/* Screen */}
        <group position={[0, HEAD / 2 - 0.02, DEEP / 2 - 0.004]}>
          <mesh material={m.plastic}><boxGeometry args={[0.26, 0.13, 0.012]} /></mesh>
          <mesh material={m.screen} position={[0, 0, 0.007]}><boxGeometry args={[0.235, 0.105, 0.002]} /></mesh>
        </group>
        {/* Front camera above the screen */}
        <group name="Camera_Front" position={[0, HEAD - 0.045, DEEP / 2 + 0.02]}>
          <mesh material={m.sensor} castShadow><boxGeometry args={[0.07, 0.035, 0.045]} /></mesh>
          <mesh material={m.plastic} position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.009, 0.009, 0.012, 16]} /></mesh>
        </group>
        {/* Speaker grille */}
        <group name="Speaker" position={[0.3, HEAD / 2 - 0.02, DEEP / 2 - 0.002]}>
          <mesh material={m.steel}><boxGeometry args={[0.12, 0.09, 0.01]} /></mesh>
          {[-0.03, -0.015, 0, 0.015, 0.03].map((y) => (
            <mesh key={y} material={m.plastic} position={[0, y, 0.006]}><boxGeometry args={[0.09, 0.006, 0.002]} /></mesh>
          ))}
        </group>
        {/* Button + status LED */}
        <mesh material={m.plastic} position={[-0.3, HEAD / 2 - 0.02, DEEP / 2 + 0.006]}><boxGeometry args={[0.05, 0.05, 0.016]} /></mesh>
        <mesh material={m.led} position={[0.42, HEAD - 0.05, DEEP / 2 + 0.004]}><sphereGeometry args={[0.005, 8, 8]} /></mesh>
        {/* Arduino-compatible board on top of the head unit */}
        <group name="Arduino_Board" position={[0, HEAD + 0.008, -0.08]}>
          <mesh material={m.pcb} castShadow><boxGeometry args={[0.11, 0.012, 0.08]} /></mesh>
          <mesh material={m.plastic} position={[-0.045, 0.012, -0.02]}><boxGeometry args={[0.018, 0.014, 0.016]} /></mesh>
          <mesh material={m.steel} position={[-0.045, 0.012, 0.018]}><boxGeometry args={[0.018, 0.012, 0.016]} /></mesh>
          {[-0.015, 0.03].map((z) => (
            <mesh key={z} material={m.plastic} position={[0.01, 0.012, z]}><boxGeometry args={[0.06, 0.01, 0.008]} /></mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/** Hinge groups named for the adapter; geometry is child of the pivot so rotation swings the door. */
function DoorRig({ side, m }: { side: "L" | "R"; m: Mats }) {
  const hingeX = side === "L" ? -W / 2 + 0.03 : W / 2 - 0.03;
  const dir = side === "L" ? 1 : -1;
  const doorW = W / 2 - 0.015;
  const doorH = H - 0.06;
  const frame = 0.055;
  return (
    <group name={`Door_${side}_Pivot`} position={[hingeX, 0.03, DEEP / 2 - 0.02]}>
      <group position={[(doorW / 2) * dir, doorH / 2, 0.025]}>
        <mesh material={m.steel} position={[0, doorH / 2 - frame / 2, 0]} castShadow><boxGeometry args={[doorW, frame, 0.045]} /></mesh>
        <mesh material={m.steel} position={[0, -doorH / 2 + frame / 2, 0]} castShadow><boxGeometry args={[doorW, frame, 0.045]} /></mesh>
        <mesh material={m.steel} position={[-doorW / 2 + frame / 2, 0, 0]} castShadow><boxGeometry args={[frame, doorH, 0.045]} /></mesh>
        <mesh material={m.steel} position={[doorW / 2 - frame / 2, 0, 0]} castShadow><boxGeometry args={[frame, doorH, 0.045]} /></mesh>
        <mesh material={m.glass}><boxGeometry args={[doorW - frame * 2, doorH - frame * 2, 0.012]} /></mesh>
        <mesh material={m.steel} position={[(doorW / 2 - 0.075) * dir, 0.12, 0.06]} castShadow><cylinderGeometry args={[0.012, 0.012, 0.62, 16]} /></mesh>
        <mesh material={m.steelDark} position={[(doorW / 2 - 0.075) * dir, 0.4, 0.04]}><boxGeometry args={[0.03, 0.03, 0.045]} /></mesh>
        <mesh material={m.steelDark} position={[(doorW / 2 - 0.075) * dir, -0.16, 0.04]}><boxGeometry args={[0.03, 0.03, 0.045]} /></mesh>
      </group>
    </group>
  );
}

