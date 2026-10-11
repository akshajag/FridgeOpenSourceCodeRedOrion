"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Final-stage call to action. Rendered over a clean product composition. */
export function TourCTA({ visible, clerkConfigured }: { visible: boolean; clerkConfigured: boolean }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 flex items-end justify-center pb-[12vh] transition-opacity duration-500 md:items-center md:pb-0", visible ? "opacity-100" : "opacity-0")} aria-hidden={!visible}>
      <div className={cn("pointer-events-auto mx-4 w-full max-w-xl rounded-2xl border border-border bg-card/95 p-6 text-center shadow-overlay backdrop-blur-sm md:p-8", !visible && "pointer-events-none")}>
        <h2 className="font-display text-[28px] font-semibold leading-[1.05] tracking-tight md:text-[36px]">Connect to your community.</h2>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">Run a fridge, coordinate a network, or bring food where it is needed. Start with the demo, or create an account when live sign-in is configured.</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild size="lg" tabIndex={visible ? 0 : -1}>
            <Link href="/demo">Explore the demo</Link>
          </Button>
          <Button asChild size="lg" variant="outline" tabIndex={visible ? 0 : -1}>
            <Link href={clerkConfigured ? "/sign-in" : "/sign-in"}>Sign in</Link>
          </Button>
          <Button asChild size="lg" variant="ghost" tabIndex={visible ? 0 : -1}>
            <Link href="/sign-up">Create an account</Link>
          </Button>
        </div>
        {!clerkConfigured && <p className="mt-3 text-[12px] text-muted-foreground">Live sign-in needs Clerk keys; the demo works without them.</p>}
      </div>
    </div>
  );
}
