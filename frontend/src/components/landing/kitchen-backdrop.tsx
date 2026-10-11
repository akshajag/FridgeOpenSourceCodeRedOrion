"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { tourProgressRef, useTourState } from "@/lib/three/tour-state";
import { KITCHEN_FADE, kitchenBlend } from "@/lib/three/tour-config";

/**
 * Kitchen visual layer behind the 3D stage.
 *
 * `public/images/kitchen-background.webp` is the Cycles render of the kitchen from the hero camera
 * (Camera_Hero, 35 mm, 16:9) with the fridge niche left empty. The hero stage shows this render with
 * only the real-time fridge composited into the niche, so the opening frame keeps Cycles' lighting.
 * As the user scrolls past the hero, the render cross-fades to the real-time kitchen GLB (see
 * KitchenModel), which by then sits at the edges of the frame. If the kitchen GLB is skipped or not
 * loaded yet, the render stays and blurs as the camera moves in.
 */
export function KitchenBackdrop({ kitchenReady }: { kitchenReady: boolean }) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const apply = (progress: number) => {
      const el = imgRef.current;
      if (!el) return;
      const blend = kitchenReady ? kitchenBlend(progress) : 0;
      const moved = Math.min(1, progress / KITCHEN_FADE.end);
      el.style.opacity = String(1 - blend);
      // Without the 3D kitchen the render blurs and swells slightly as the camera leaves the hero framing.
      const blur = kitchenReady ? 0 : moved * 6;
      const scale = 1 + moved * 0.06;
      el.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : "none";
      el.style.transform = `scale(${scale.toFixed(3)})`;
    };
    apply(tourProgressRef.current);
    return useTourState.subscribe((s) => apply(s.progress));
  }, [kitchenReady]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#e9ebe6]" aria-hidden="true">
      <Image ref={imgRef} src="/images/kitchen-background.webp" alt="" fill priority sizes="100vw" className="object-cover object-center will-change-transform" />
    </div>
  );
}
