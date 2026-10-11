import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "info" | "warning" | "critical" | "neutral";

const toneClass: Record<StatusTone, string> = {
  ok: "bg-primary",
  info: "bg-sensor",
  warning: "bg-amber",
  critical: "bg-critical",
  neutral: "bg-ink-faint",
};

/**
 * Square status indicator (reads like a panel LED). Always paired with a text label so
 * state is never communicated by color alone.
 */
export function StatusDot({ tone, label, pulse = false, className }: { tone: StatusTone; label: string; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-foreground", className)}>
      <span className="relative inline-flex size-2.5 shrink-0" aria-hidden="true">
        <span className={cn("absolute inset-0 rounded-[2px]", toneClass[tone])} />
        {pulse && <span className={cn("absolute inset-0 rounded-[2px] animate-ping opacity-60 motion-reduce:hidden", toneClass[tone])} />}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function fridgeStatusTone(status: "online" | "degraded" | "offline"): StatusTone {
  return status === "online" ? "ok" : status === "degraded" ? "warning" : "critical";
}

export function fridgeStatusLabel(status: "online" | "degraded" | "offline"): string {
  return status === "online" ? "Online" : status === "degraded" ? "Degraded" : "Offline";
}

export function severityTone(severity: "info" | "warning" | "critical"): StatusTone {
  return severity === "critical" ? "critical" : severity === "warning" ? "warning" : "info";
}
