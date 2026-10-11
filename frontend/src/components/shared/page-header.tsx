import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, meta, className }: { title: string; description?: ReactNode; actions?: ReactNode; meta?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-col gap-3 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {meta && <div className="mb-1.5 text-[13px] text-muted-foreground">{meta}</div>}
        <h1 className="font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.015em] text-foreground md:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
