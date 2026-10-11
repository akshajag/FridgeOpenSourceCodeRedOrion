import { cn } from "@/lib/utils";

/** Recognition-confidence meter. Shows the number; the bar is a secondary cue. */
export function Confidence({ value, source, className }: { value?: number; source: "gemini" | "demo_recognition" | "manual"; className?: string }) {
  if (source === "manual" || value === undefined) {
    return <span className={cn("text-[13px] text-muted-foreground", className)}>Entered manually</span>;
  }
  const pct = Math.round(value * 100);
  const tone = pct >= 85 ? "bg-primary" : pct >= 70 ? "bg-sensor" : "bg-amber";
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13px]", className)} title={source === "gemini" ? "Gemini recognition confidence" : "Demo recognition confidence"}>
      <span className="h-1.5 w-12 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
        <span className={cn("block h-full rounded-sm", tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="tnum text-foreground">{pct}%</span>
      {source === "demo_recognition" && <span className="text-[11px] text-amber">demo</span>}
    </span>
  );
}
