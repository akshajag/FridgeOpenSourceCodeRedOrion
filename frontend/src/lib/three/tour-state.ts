"use client";

import { create } from "zustand";
import { TOUR_STAGES } from "./tour-config";

const STAGE_COUNT = TOUR_STAGES.length;

/**
 * Minimal store bridging the DOM (GSAP ScrollTrigger) and the Three.js scene.
 * `progress` updates every scroll frame; `stage` only changes when the active stage changes,
 * so React overlays re-render rarely while the scene reads progress at 60 fps.
 */
interface TourState {
  progress: number;
  stage: number; // 0-based active stage
  playing: boolean;
  setProgress(p: number): void;
  setPlaying(v: boolean): void;
}

export const useTourState = create<TourState>((set, get) => ({
  progress: 0,
  stage: 0,
  playing: false,
  setProgress: (progress) => {
    const stage = Math.round(progress * (STAGE_COUNT - 1));
    if (get().stage !== stage) set({ progress, stage });
    else set({ progress });
  },
  setPlaying: (playing) => set({ playing }),
}));

/** Progress is also mirrored in a plain ref-like object for the render loop, avoiding store subscriptions per frame. */
export const tourProgressRef = { current: 0 };

/**
 * On-demand rendering: the scene only changes while tour progress moves or eased values (camera,
 * doors, cover, cross-fade) are still converging. Animated components call `requestFrames()` while
 * they are still moving; the stage renders a frame whenever the counter is non-zero.
 */
let renderUntil = 0;
/** Keep rendering for at least `ms` more milliseconds (time-based so it behaves the same at 10 fps and 120 fps). */
export function requestFrames(ms = 120) {
  renderUntil = Math.max(renderUntil, performance.now() + ms);
}
export function consumeFrame(): boolean {
  return performance.now() < renderUntil;
}
