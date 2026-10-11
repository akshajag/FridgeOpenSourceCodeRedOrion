import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Divided list rows for feeds and tables that do not need column headers. */
export function Rows({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-border", className)}>{children}</ul>;
}

export function Row({ children, className, leading, trailing, onClick, selected = false }: { children: ReactNode; className?: string; leading?: ReactNode; trailing?: ReactNode; onClick?: () => void; selected?: boolean }) {
  const inner = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">{children}</div>
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
    </>
  );
  if (onClick) {
    return (
      <li>
        <button type="button" onClick={onClick} aria-pressed={selected} className={cn("flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none", selected && "bg-sage/50 hover:bg-sage/60", className)}>
          {inner}
        </button>
      </li>
    );
  }
  return <li className={cn("flex items-center gap-3 px-5 py-3", className)}>{inner}</li>;
}
