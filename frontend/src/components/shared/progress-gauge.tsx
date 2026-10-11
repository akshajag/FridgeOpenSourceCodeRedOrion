import { cn } from "@/lib/utils";

/** Thin fill gauge used for mission and event progress. Always accompanied by a numeric label. */
export function ProgressGauge({ value, max, unit, className, tone = "ok", label }: { value: number; max: number; unit?: string; className?: string; tone?: "ok" | "sensor" | "amber"; label?: string }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="tnum font-medium text-foreground">
          {value.toLocaleString()} <span className="text-muted-foreground">/ {max.toLocaleString()} {unit}</span>
        </span>
        <span className="tnum text-muted-foreground">{label ?? `${pct}%`}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label ?? `${pct}% of goal`}>
        <div className={cn("h-full rounded-sm transition-[width] duration-500 ease-out", tone === "ok" && "bg-primary", tone === "sensor" && "bg-sensor", tone === "amber" && "bg-amber")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
