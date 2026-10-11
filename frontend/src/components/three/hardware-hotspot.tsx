"use client";

import { Html } from "@react-three/drei";
import { HARDWARE_LABELS, TOUR_STAGES, type HardwareKey, type Vec3 } from "@/lib/three/tour-config";
import { useTourState } from "@/lib/three/tour-state";
import { cn } from "@/lib/utils";

/**
 * HardwareHotspot renders a label anchored to a 3D position. It stays attached to the object
 * because drei's <Html> projects the anchor every frame. Only hotspots for the active stage
 * are interactive; others are hidden to keep the composition quiet.
 */
export function HardwareHotspot({ name, position }: { name: HardwareKey; position: Vec3 }) {
  const stage = useTourState((s) => s.stage);
  const active = TOUR_STAGES[stage]?.hotspots.includes(name) ?? false;
  const label = HARDWARE_LABELS[name];
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: active ? "auto" : "none" }}>
      <div className={cn("transition-opacity duration-300", active ? "opacity-100" : "opacity-0")} aria-hidden={!active}>
        <div className="relative -translate-y-1/2">
          <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-sensor shadow-raised" />
          <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-sensor/50 motion-reduce:hidden" />
          <div className={cn("absolute top-1/2 hidden w-max max-w-[220px] -translate-y-1/2 rounded-md md:block border border-border bg-card/95 px-3 py-2 shadow-raised backdrop-blur-[2px]", label.labelSide === "right" ? "left-5" : "right-5")}>
            <div className="font-display text-[13px] font-semibold leading-tight text-foreground">{label.title}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{label.detail}</div>
          </div>
        </div>
      </div>
    </Html>
  );
}
