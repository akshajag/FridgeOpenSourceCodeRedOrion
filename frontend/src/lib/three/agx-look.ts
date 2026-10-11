import * as THREE from "three";

/**
 * Blender's view transform for this scene is "AgX" with the "Medium High Contrast" look. three.js ships
 * base AgX only, so the kitchen lightmaps (saved through the look) would read punchier than the
 * real-time fridge. This installs a CustomToneMapping that applies AgX and then the look's contrast
 * curve (a sigmoid around mid-grey in the display-encoded domain, slope ≈ 1.3) so both match.
 *
 * Call once before the first Canvas renders; it patches the shared tonemapping shader chunk.
 */
let installed = false;
export function installAgXLook() {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    "vec3 CustomToneMapping( vec3 color ) { return color; }",
    `vec3 CustomToneMapping( vec3 color ) {
      color = AgXToneMapping( color );
      // Medium High Contrast look: contrast 1.3 pivoting on 0.42 (sRGB-encoded mid-grey after AgX).
      const float pivot = 0.42;
      const float slope = 1.3;
      vec3 c = clamp( color, 0.0, 1.0 );
      vec3 t = ( c - pivot );
      vec3 shaped = pivot + t * slope / ( 1.0 + abs( t ) * ( slope - 1.0 ) / ( 1.0 - pivot ) );
      return clamp( shaped, 0.0, 1.0 );
    }`,
  );
}
