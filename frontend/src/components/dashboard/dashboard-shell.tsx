"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, FlaskConical } from "lucide-react";
import type { Membership } from "@/types";
import { NAV, roleFromPath } from "@/lib/navigation";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { AccountMenu } from "./account-menu";
import { PersonaSwitcher } from "./persona-switcher";
import { cn } from "@/lib/utils";

export interface ShellSession {
  mode: "demo" | "live";
  name: string;
  memberships: Membership[];
  persona?: "food_bank" | "operator" | "donor";
}

export function DashboardShell({ session, children }: { session: ShellSession; children: ReactNode }) {
  const pathname = usePathname();
  const role = roleFromPath(pathname) ?? session.memberships[0]?.role ?? "donor";
  const nav = NAV[role];
  const [open, setOpen] = useState(false);
  const current = nav.items.find((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)));

  return (
    <div className="flex min-h-screen w-full bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-raised">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Sidebar role={role} nav={nav} session={session} pathname={pathname} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-sm md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Sidebar role={role} nav={nav} session={session} pathname={pathname} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="lg:hidden">
            <Logo size="sm" />
          </div>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground md:flex">
            <Link href={nav.home} className="hover:text-foreground">{nav.title}</Link>
            {current && current.href !== nav.home && (
              <>
                <span aria-hidden="true">/</span>
                <span className="truncate text-foreground">{current.label}</span>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {session.mode === "demo" && (
              <span className="hidden items-center gap-1.5 rounded-md border border-amber/40 bg-amber-soft px-2 py-1 text-[12px] font-medium text-amber sm:inline-flex">
                <FlaskConical className="size-3.5" aria-hidden="true" /> Demo mode
              </span>
            )}
            {session.mode === "demo" && <PersonaSwitcher persona={session.persona ?? role} />}
            <AccountMenu session={session} />
          </div>
        </header>
        <main id="main" className={cn("flex-1 px-4 py-6 md:px-6 lg:px-8", "mx-auto w-full max-w-[1400px]")}>
          {children}
        </main>
      </div>
    </div>
  );
}
