"use client";

/**
 * Loading screen for the 3D tour. Covers the stage while the fridge model, the lightmapped kitchen
 * and the HDR environment download, then fades out. Shown for a short minimum so it never flashes.
 */
import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

const MIN_VISIBLE_MS = 900;

export function TourLoader({ ready }: { ready: boolean }) {
  const { progress, active } = useProgress();
  const [mounted] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(false);
  const [gone, setGone] = useState(false);
  const done = ready && !active && progress >= 100;

  useEffect(() => {
    if (!done || dismissed) return;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - mounted));
    const t = window.setTimeout(() => setDismissed(true), wait);
    return () => window.clearTimeout(t);
  }, [done, dismissed, mounted]);

  useEffect(() => {
    if (!dismissed) return;
    const t = window.setTimeout(() => setGone(true), 700);
    return () => window.clearTimeout(t);
  }, [dismissed]);

  if (gone) return null;
  const pct = Math.round(Math.min(100, ready ? progress : Math.min(progress, 96)));
  return (
    <div
      className={cn("absolute inset-0 z-50 flex flex-col items-center justify-center bg-stone transition-opacity duration-700 ease-out", dismissed ? "pointer-events-none opacity-0" : "opacity-100")}
      role="status"
      aria-live="polite"
      aria-label={`Loading the kitchen, ${pct} percent`}
    >
      <Logo size="lg" href={null} />
      <p className="mt-6 text-[14px] text-ink-muted">Preparing the kitchen</p>
      <div className="mt-4 h-1 w-56 overflow-hidden rounded-sm bg-sage" aria-hidden="true">
        <div className="h-full rounded-sm bg-primary transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <p className="tnum mt-2 text-[12px] text-ink-faint" aria-hidden="true">{pct}%</p>
    </div>
  );
}
