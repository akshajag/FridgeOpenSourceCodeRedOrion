"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HERO_CAMERA, TOUR_STAGES, TOUR_TIMING, progressToStage } from "@/lib/three/tour-config";
import { blenderEulerToThreeQuaternion, verticalFovFor } from "@/lib/three/blender-camera";
import { requestFrames, tourProgressRef } from "@/lib/three/tour-state";

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * CameraController plays the Blender tour camera: per-stage position, orientation (converted from
 * Blender's Z-up Euler) and lens are interpolated by scroll progress, then eased toward each
 * frame so reversing scroll stays smooth. Lens → FOV follows Blender's AUTO sensor fit, and the
 * hero stage additionally matches the 16:9 background render under CSS `object-fit: cover`.
 */
export function CameraController() {
  const keys = useMemo(
    () =>
      TOUR_STAGES.map((s) => ({
        position: new THREE.Vector3(...s.camera.position),
        quaternion: blenderEulerToThreeQuaternion(s.camera.rotationBlenderDeg),
        lensMm: s.camera.lensMm,
        portraitShift: s.portraitShift ?? 0,
      })),
    [],
  );
  const desiredPos = useMemo(() => new THREE.Vector3(), []);
  const desiredQuat = useMemo(() => new THREE.Quaternion(), []);
  const initialized = useRef(false);

  useFrame(({ camera: cam, size }, dt) => {
    const camera = cam as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const portrait = aspect < 0.9;
    const { from, to, t } = progressToStage(tourProgressRef.current);
    const s = smooth(t);
    const a = keys[from];
    const b = keys[to];

    desiredPos.lerpVectors(a.position, b.position, s);
    desiredQuat.slerpQuaternions(a.quaternion, b.quaternion, s);
    const lens = THREE.MathUtils.lerp(a.lensMm, b.lensMm, s);
    // Stage 1 always aligns with the Cycles hero render, which is the visible kitchen at that point.
    const matchBackdrop = true;
    const heroWeight = from === 0 ? 1 - s : 0;
    const fovHero = verticalFovFor(HERO_CAMERA.lensMm, aspect, HERO_CAMERA.imageAspect);
    const fovStage = verticalFovFor(lens, aspect);
    const fovBase = THREE.MathUtils.lerp(fovStage, fovHero, heroWeight);
    const fov = portrait ? fovBase * 1.08 : fovBase;
    if (portrait) desiredPos.setY(desiredPos.y + THREE.MathUtils.lerp(a.portraitShift, b.portraitShift, s) * (matchBackdrop ? 0.35 : 0.9));

    if (!initialized.current) {
      camera.position.copy(desiredPos);
      camera.quaternion.copy(desiredQuat);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      initialized.current = true;
      return;
    }
    const k = 1 - Math.exp(-TOUR_TIMING.cameraLerpRate * Math.min(dt, 0.25));
    if (camera.position.distanceToSquared(desiredPos) > 1e-7 || Math.abs(camera.quaternion.dot(desiredQuat)) < 0.99999 || Math.abs(camera.fov - fov) > 0.02) requestFrames(500);
    camera.position.lerp(desiredPos, k);
    camera.quaternion.slerp(desiredQuat, k);
    if (Math.abs(camera.fov - fov) > 0.02) {
      camera.fov += (fov - camera.fov) * k;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
