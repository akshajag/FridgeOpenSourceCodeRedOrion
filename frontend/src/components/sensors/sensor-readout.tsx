"use client";

import { Thermometer, Droplets, Wind } from "lucide-react";
import type { SensorMetric, SensorReading } from "@/types";
import { formatRelative } from "@/lib/data/derived";
import { Sparkline } from "./sensor-chart";
import { cn } from "@/lib/utils";

const META: Record<SensorMetric, { label: string; icon: React.ComponentType<{ className?: string }>; decimals: number }> = {
  temperature: { label: "Temperature", icon: Thermometer, decimals: 1 },
  humidity: { label: "Humidity", icon: Droplets, decimals: 0 },
  air_quality: { label: "Air quality (CO₂-eq)", icon: Wind, decimals: 0 },
};

/**
 * Sensor readout: a cool, instrument-like block distinct from mission/content cards.
 * Shows the latest value, its unit, when it was recorded, and a short sparkline.
 */
export function SensorReadout({ metric, latest, history, unit, state, note, className, supported = true }: { metric: SensorMetric; latest?: SensorReading; history: SensorReading[]; unit: string; state: "ok" | "warning" | "critical" | "stale"; note?: string; className?: string; supported?: boolean }) {
  const meta = META[metric];
  const Icon = meta.icon;
  if (!supported) {
    return (
      <div className={cn("rounded-lg border border-dashed border-sage-deep bg-sage/20 p-4", className)}>
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground"><Icon className="size-3.5" /> {meta.label}</div>
        <div className="mt-2 text-[13px] text-muted-foreground">No compatible sensor installed on this fridge.</div>
      </div>
    );
  }
  const tone = state === "critical" ? "text-critical" : state === "warning" ? "text-amber" : state === "stale" ? "text-ink-faint" : "text-sensor";
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4 border-t-2", state === "critical" ? "border-t-critical" : state === "warning" ? "border-t-amber" : state === "stale" ? "border-t-ink-faint" : "border-t-sensor", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground"><Icon className="size-3.5" /> {meta.label}</div>
        <span className={cn("text-[11px] font-medium", state === "ok" ? "text-primary" : state === "stale" ? "text-ink-faint" : tone)}>
          {state === "ok" ? "In range" : state === "warning" ? "Out of range" : state === "critical" ? "Critical" : "Stale"}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("readout text-[34px] font-semibold leading-none", tone)}>{latest ? latest.value.toFixed(meta.decimals) : "—"}</span>
        <span className="text-[13px] font-medium text-muted-foreground">{unit}</span>
      </div>
      <div className="mt-1 text-[12px] text-muted-foreground">{latest ? `Updated ${formatRelative(latest.at)}` : "No readings yet"}{note ? ` · ${note}` : ""}</div>
      <div className="mt-2 -mx-1">
        <Sparkline readings={history} tone={state === "ok" || state === "stale" ? "sensor" : "amber"} />
      </div>
    </div>
  );
}
