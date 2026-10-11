"use client";

import { TOUR_STAGES } from "@/lib/three/tour-config";
import { useTourState } from "@/lib/three/tour-state";
import { cn } from "@/lib/utils";

const SHORT: Record<string, string> = {
  overview: "Overview",
  doors: "Doors",
  interior: "Interior",
  "interior-camera": "Camera",
  sensors: "Sensors",
  arduino: "Board",
  voice: "Voice",
  cta: "Connect",
};

/** Numbered stage rail. The numbers encode a real sequence: the tour order. */
export function TourProgress({ onJump }: { onJump: (index: number) => void }) {
  const stage = useTourState((s) => s.stage);
  return (
    <nav aria-label="Tour stages" className="pointer-events-auto">
      <ol className="flex items-center gap-1 md:flex-col md:items-stretch md:gap-0.5">
        {TOUR_STAGES.map((s, i) => {
          const active = i === stage;
          const done = i < stage;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-evergreen/40 md:px-2",
                  active ? "text-foreground" : "text-ink-faint hover:text-ink-muted",
                )}
              >
                <span className={cn("tnum font-display text-[11px] font-semibold", active ? "text-primary" : done ? "text-ink-muted" : "text-ink-faint")}>{String(s.index).padStart(2, "0")}</span>
                <span className={cn("hidden h-px w-5 transition-colors md:block", active ? "bg-primary" : done ? "bg-sage-deep" : "bg-hairline")} aria-hidden="true" />
                <span className="hidden md:inline">{SHORT[s.id]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
