import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Panel is the base surface for dashboard content. Use `tone` sparingly: "sensor" gives a
 * cool top rule for refrigeration data, "sage" is a quiet secondary surface.
 */
export function Panel({ children, className, tone = "default", as: Tag = "section", ...rest }: { children: ReactNode; className?: string; tone?: "default" | "sensor" | "sage" | "plain"; as?: "section" | "div" | "article" | "aside" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "rounded-xl border bg-card",
        tone === "default" && "border-border shadow-panel",
        tone === "sensor" && "border-border shadow-panel border-t-2 border-t-sensor",
        tone === "sage" && "border-sage-deep/60 bg-sage/40 shadow-none",
        tone === "plain" && "border-border shadow-none",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function PanelHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-semibold leading-tight text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PanelBody({ children, className, flush = false }: { children: ReactNode; className?: string; flush?: boolean }) {
  return <div className={cn(flush ? "" : "px-5 pb-5", className)}>{children}</div>;
}
