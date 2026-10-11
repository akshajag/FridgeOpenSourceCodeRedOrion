import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: "Nourish." The period is set in evergreen as the brand's one accent mark. */
export function Logo({ className, href = "/", size = "md" }: { className?: string; href?: string | null; size?: "sm" | "md" | "lg" }) {
  const text = (
    <span className={cn("font-display font-semibold tracking-tight leading-none select-none", size === "sm" && "text-lg", size === "md" && "text-[22px]", size === "lg" && "text-3xl", className)} translate="no">
      Nourish<span className="text-primary">.</span>
    </span>
  );
  if (!href) return text;
  return (
    <Link href={href} className="inline-flex items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4" aria-label="Nourish home">
      {text}
    </Link>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden="true">
      <rect x="6" y="3" width="20" height="26" rx="3" fill="currentColor" opacity="0.12" />
      <rect x="6" y="3" width="20" height="26" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="16" y1="5" x2="16" y2="27" stroke="currentColor" strokeWidth="1.6" />
      <line x1="12.5" y1="12" x2="12.5" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="19.5" y1="12" x2="19.5" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
