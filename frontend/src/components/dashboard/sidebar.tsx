"use client";

import Link from "next/link";
import type { Role } from "@/types";
import type { NAV } from "@/lib/navigation";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";
import type { ShellSession } from "./dashboard-shell";
import { ArrowUpRight } from "lucide-react";

export function Sidebar({ role, nav, session, pathname, onNavigate }: { role: Role; nav: (typeof NAV)[Role]; session: ShellSession; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-sidebar-border px-5">
        <Logo />
      </div>
      <div className="px-5 pt-5 pb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{nav.title}</div>
        <div className="mt-0.5 truncate text-[13px] text-foreground">{session.name}</div>
      </div>
      <nav className="flex-1 px-3" aria-label={`${nav.title} navigation`}>
        <ul className="space-y-0.5">
          {nav.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors",
                    active ? "bg-card text-foreground shadow-panel" : "text-ink-muted hover:bg-sidebar-accent hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4", active ? "text-primary" : "text-ink-faint")} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-sidebar-border px-5 py-4 text-[12px] text-muted-foreground">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-foreground">
          Product tour <ArrowUpRight className="size-3" aria-hidden="true" />
        </Link>
        <div className="mt-1">{role === "operator" ? "Hardware kit v0.4" : "Houston network"}</div>
      </div>
    </div>
  );
}
