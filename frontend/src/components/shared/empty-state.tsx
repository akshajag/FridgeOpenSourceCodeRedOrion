import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, description, action, className, compact = false }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-sage-deep bg-sage/25 text-center", compact ? "px-4 py-6" : "px-6 py-12", className)}>
      {icon && <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-card text-muted-foreground shadow-panel [&_svg]:size-5">{icon}</div>}
      <p className="font-display text-[15px] font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
