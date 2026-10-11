"use client";

/**
 * FridgeTour — the scroll-controlled product tour.
 *
 * Structure: a tall scroll track (one viewport per stage) containing a sticky, full-height stage.
 * GSAP ScrollTrigger scrubs a 0..1 progress value as the track scrolls; the Three.js scene reads it
 * each frame (camera + doors), and React overlays respond only when the active stage changes.
 * "Play tour" tweens window scroll with ScrollToPlugin, so autoplay and manual scrolling share one path.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { ChevronDown, Pause, Play, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TOUR_STAGES, TOUR_TIMING, stageToProgress } from "@/lib/three/tour-config";
import { tourProgressRef, useTourState } from "@/lib/three/tour-state";
import { cn } from "@/lib/utils";
import { KitchenBackdrop } from "./kitchen-backdrop";
import { TourProgress } from "./tour-progress";
import { TourCTA } from "./tour-cta";
import { StaticTour } from "./static-tour";
import { TourLoader } from "./tour-loader";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
// Scroll tweens must track wall-clock time even when frames are slow (heavy first paint, low-end GPUs);
// GSAP's default lag smoothing would otherwise stretch a 0.9 s jump into many seconds.
gsap.ticker.lagSmoothing(0);

const FridgeShowcase = dynamic(() => import("@/components/three/fridge-showcase").then((m) => m.FridgeShowcase), {
  ssr: false,
  loading: () => null,
});

let webglSupport: boolean | null = null;
function detectWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    webglSupport = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

const reducedMotionQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const subscribeReducedMotion = (cb: () => void) => {
  const mq = reducedMotionQuery();
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const noopSubscribe = () => () => {};

/** Low-end devices skip the 3D kitchen and keep the rendered backdrop. */
let lowPowerCached: boolean | null = null;
function detectLowPower(): boolean {
  if (lowPowerCached !== null) return lowPowerCached;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  lowPowerCached = Boolean((nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || nav.connection?.saveData || (navigator.hardwareConcurrency ?? 8) <= 2);
  return lowPowerCached;
}

export function FridgeTour({ clerkConfigured }: { clerkConfigured: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // null during SSR; resolved on the client without a post-mount setState.
  const webgl = useSyncExternalStore(noopSubscribe, detectWebGL, () => null);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, () => reducedMotionQuery().matches, () => false);
  const [inView, setInView] = useState(true);
  const [source, setSource] = useState<"gltf" | "fallback" | null>(null);
  const [kitchenReady, setKitchenReady] = useState(false);
  const lowPower = useSyncExternalStore(noopSubscribe, detectLowPower, () => false);
  const stage = useTourState((s) => s.stage);
  const playing = useTourState((s) => s.playing);
  const setProgress = useTourState((s) => s.setProgress);
  const setPlaying = useTourState((s) => s.setPlaying);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  // Scroll → progress.
  useEffect(() => {
    if (!webgl || !trackRef.current) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: trackRef.current,
        start: "top top",
        end: "bottom bottom",
        scrub: reducedMotion ? true : 0.5,
        onUpdate: (self) => {
          tourProgressRef.current = self.progress;
          setProgress(self.progress);
        },
      });
    }, trackRef);
    // Layout can shift after fonts/images load.
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 400);
    return () => {
      window.clearTimeout(t);
      ctx.revert();
    };
  }, [webgl, reducedMotion, setProgress]);

  // Render the scene only while the sticky stage is on screen (IntersectionObserver, not ScrollTrigger,
  // so the final frame at progress 1 keeps rendering).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      setInView(e.isIntersecting);
    }, { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [webgl]);

  const scrollYForStage = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const length = track.offsetHeight - window.innerHeight;
    return top + stageToProgress(index) * length;
  }, []);

  const stop = useCallback(() => {
    tweenRef.current?.kill();
    tweenRef.current = null;
    setPlaying(false);
  }, [setPlaying]);

  const jumpTo = useCallback(
    (index: number) => {
      stop();
      const y = scrollYForStage(index);
      if (reducedMotion) window.scrollTo({ top: y });
      else gsap.to(window, { scrollTo: { y, autoKill: false }, duration: 0.9, ease: "power2.inOut" });
    },
    [reducedMotion, scrollYForStage, stop],
  );

  const play = useCallback(() => {
    const current = useTourState.getState().stage;
    const last = TOUR_STAGES.length - 1;
    if (current >= last) {
      jumpTo(0);
      return;
    }
    if (reducedMotion) {
      // Reduced motion: step one stage at a time instead of continuous travel.
      jumpTo(current + 1);
      return;
    }
    stop();
    setPlaying(true);
    const from = window.scrollY;
    const to = scrollYForStage(last);
    const remainingStages = (to - from) / Math.max(1, (to - scrollYForStage(0)) / last);
    tweenRef.current = gsap.to(window, {
      scrollTo: { y: to, autoKill: true },
      duration: Math.max(2, remainingStages * TOUR_TIMING.autoplaySecondsPerStage),
      ease: "none",
      onComplete: () => setPlaying(false),
      onInterrupt: () => setPlaying(false),
    });
  }, [jumpTo, reducedMotion, scrollYForStage, setPlaying, stop]);

  // Stop autoplay on user input so scrolling is never trapped.
  useEffect(() => {
    if (!playing) return;
    const cancel = () => stop();
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [playing, stop]);

  const isLast = stage === TOUR_STAGES.length - 1;
  const trackStyle = useMemo(() => ({ height: `${TOUR_TIMING.scrollHeightVh}vh` }), []);

  if (webgl === false) return <StaticTour clerkConfigured={clerkConfigured} />;

  return (
    <div ref={trackRef} style={trackStyle} className="relative">
      <div ref={stageRef} className="sticky top-0 h-screen w-full overflow-hidden">
        <KitchenBackdrop kitchenReady={kitchenReady} />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-44 bg-gradient-to-b from-stone/90 via-stone/45 to-transparent md:h-28 md:from-stone/55 md:via-stone/20" aria-hidden="true" />
        {webgl && !lowPower && <TourLoader ready={kitchenReady && source !== null} />}
        <div className="absolute inset-0">{webgl && <FridgeShowcase active={inView} onSource={setSource} onKitchenReady={() => setKitchenReady(true)} kitchen={!lowPower} />}</div>

        {/* Stage overlays */}
        <div className="pointer-events-none absolute inset-0">
          <div className="mx-auto flex h-full max-w-[1400px] flex-col px-5 pt-20 md:px-8">
            {/* Hero copy (stage 1) */}
            <div className={cn("max-w-[400px] transition-all duration-500 xl:max-w-[520px]", stage === 0 ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0")} aria-hidden={stage !== 0}>
              <h1 className="font-display text-[36px] font-semibold leading-[1.02] tracking-[-0.02em] text-foreground sm:text-[40px] xl:text-[52px]">
                A smarter fridge for a more connected community.
              </h1>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-muted md:text-[16px]">
                Nourish monitors community refrigerators, recognizes what is inside, and connects donors with the food banks that need it. Scroll to open it.
              </p>
              <div className="pointer-events-auto mt-6 flex flex-wrap items-center gap-2">
                <Button size="lg" onClick={() => jumpTo(1)} tabIndex={stage === 0 ? 0 : -1}>
                  Explore the fridge
                </Button>
                <Button asChild size="lg" variant="outline" tabIndex={stage === 0 ? 0 : -1}>
                  <Link href="/demo">Skip to dashboard</Link>
                </Button>
              </div>
            </div>

            {/* Stage panels 2–6 */}
            {TOUR_STAGES.slice(1, -1).map((s, i) => {
              const idx = i + 1;
              const visible = stage === idx;
              return (
                <div
                  key={s.id}
                  aria-hidden={!visible}
                  className={cn(
                    "absolute bottom-[12vh] left-5 right-5 max-w-md transition-all duration-500 md:bottom-auto md:top-1/2 md:-translate-y-1/2",
                    s.side === "right" ? "md:left-auto md:right-32" : "md:left-8 md:right-auto",
                    visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                  )}
                >
                  <div className="rounded-xl border border-border bg-card/92 p-5 shadow-raised backdrop-blur-[3px] md:p-6">
                    <div className="tnum font-display text-[12px] font-semibold text-primary">{String(s.index).padStart(2, "0")} / {String(TOUR_STAGES.length).padStart(2, "0")}</div>
                    <h2 className="mt-1.5 font-display text-[22px] font-semibold leading-[1.1] tracking-tight md:text-[26px]">{s.title}</h2>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-muted">{s.body}</p>
                    {s.facts && (
                      <ul className="mt-3 space-y-1 border-t border-border pt-3 text-[13px] text-foreground/85">
                        {s.facts.map((f) => (
                          <li key={f} className="flex gap-2">
                            <span className="mt-[8px] size-1 shrink-0 rounded-full bg-sensor" aria-hidden="true" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}

            <TourCTA visible={isLast} clerkConfigured={clerkConfigured} />

            {/* Stage rail + controls */}
            <div className="pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 md:block">
              <TourProgress onJump={jumpTo} />
            </div>
            <div className="pointer-events-auto absolute inset-x-0 bottom-5 flex flex-col items-center gap-3 md:bottom-6">
              <div className="md:hidden">
                <TourProgress onJump={jumpTo} />
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-border bg-card/95 p-1 shadow-raised backdrop-blur-sm">
                <Button variant="ghost" size="sm" className="h-8 rounded-full px-3" onClick={playing ? stop : play} aria-label={playing ? "Pause tour" : "Play tour"}>
                  {playing ? <Pause /> : <Play />}
                  {playing ? "Pause" : isLast ? "Replay" : "Play tour"}
                </Button>
                {!isLast && (
                  <Button variant="ghost" size="sm" className="h-8 rounded-full px-3" onClick={() => jumpTo(TOUR_STAGES.length - 1)} aria-label="Skip to the end of the tour">
                    <SkipForward /> Skip
                  </Button>
                )}
              </div>
              <div className={cn("flex items-center gap-1.5 text-[12px] text-ink-muted transition-opacity", stage === 0 ? "opacity-100" : "opacity-0")} aria-hidden={stage !== 0}>
                <ChevronDown className="size-3.5 animate-bounce motion-reduce:animate-none" /> Scroll to open the doors
              </div>
            </div>

            {/* Asset status, bottom-left, small and factual */}
            <div className="pointer-events-none absolute bottom-5 left-5 hidden text-[11px] text-ink-faint md:block">
              {source === "fallback" && <span>Model unavailable · showing engineering blockout</span>}
              {source === "gltf" && <span>Blender model rendered in real time{kitchenReady ? "; kitchen render by Cycles, 3D kitchen on scroll" : ""}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
