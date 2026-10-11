import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Inline label applied wherever synthetic data or simulated results appear. */
export function DemoTag({ className, label = "Demo data" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border border-amber/40 bg-amber-soft px-1.5 py-0.5 text-[11px] font-medium leading-none text-amber", className)}>
      <FlaskConical className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function DemoNotice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border border-amber/30 bg-amber-soft/70 px-3.5 py-2.5 text-[13px] leading-snug text-foreground", className)}>
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
