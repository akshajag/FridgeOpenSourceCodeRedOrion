import * as THREE from "three";

/**
 * Conversions between Blender's Z-up world and glTF / three.js Y-up.
 *
 * Blender (x, y, z) → glTF (x, z, -y). Cameras in both tools look down their local -Z axis, so
 * converting the object's rotation is enough; no extra "look-at" fix is needed.
 * Blender's default Euler mode is extrinsic XYZ, which equals three.js order "ZYX".
 */
const BLENDER_TO_GLTF = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export function blenderLocationToThree([x, y, z]: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y);
}

export function blenderEulerToThreeQuaternion([rx, ry, rz]: [number, number, number]): THREE.Quaternion {
  const d = THREE.MathUtils.degToRad;
  const qBlender = new THREE.Quaternion().setFromEuler(new THREE.Euler(d(rx), d(ry), d(rz), "ZYX"));
  // World-frame change only. Both tools define the camera's forward as local -Z and up as local +Y,
  // so the object's local axes need no extra correction (verified: Blender [90,0,0] → looks down -Z, up +Y).
  return BLENDER_TO_GLTF.clone().multiply(qBlender);
}

/** Horizontal field of view (degrees) for a Blender camera with a 36 mm sensor (sensor fit AUTO, landscape). */
export function lensToHorizontalFov(lensMm: number, sensorWidthMm = 36): number {
  return THREE.MathUtils.radToDeg(2 * Math.atan(sensorWidthMm / (2 * lensMm)));
}

/**
 * Vertical FOV for three.js given the Blender lens and the viewport aspect.
 * Blender's AUTO sensor fit keeps the horizontal FOV on landscape frames and the vertical FOV on
 * portrait frames; we mirror that so framing matches the Blender renders at every aspect ratio.
 * `imageAspect` lets the hero stage match a 16:9 background that is CSS `object-fit: cover`-ed.
 */
export function verticalFovFor(lensMm: number, aspect: number, imageAspect?: number): number {
  const hfov = THREE.MathUtils.degToRad(lensToHorizontalFov(lensMm));
  if (imageAspect) {
    // Cover fit: wider viewports keep the image's horizontal FOV; taller ones keep its vertical FOV.
    const imageVfov = 2 * Math.atan(Math.tan(hfov / 2) / imageAspect);
    if (aspect >= imageAspect) return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
    return THREE.MathUtils.radToDeg(imageVfov);
  }
  if (aspect >= 1) return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
  return THREE.MathUtils.radToDeg(hfov); // portrait: sensor fit flips to vertical
}
