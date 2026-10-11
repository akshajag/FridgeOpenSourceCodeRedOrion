import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A compact figure with a label. Intended for inline use inside panels, not as a wall of
 * identical metric cards. Keep to the data's own units.
 */
export function Stat({ label, value, unit, hint, tone = "default", size = "md", className }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: "default" | "sensor" | "warning" | "critical" | "ok"; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">{label}</div>
      <div className={cn("readout mt-1 flex items-baseline gap-1 leading-none", size === "sm" && "text-xl", size === "md" && "text-[28px]", size === "lg" && "text-[40px]", tone === "sensor" && "text-sensor", tone === "warning" && "text-amber", tone === "critical" && "text-critical", tone === "ok" && "text-primary")}>
        <span className="font-semibold">{value}</span>
        {unit && <span className="font-sans text-[13px] font-medium text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[12px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
