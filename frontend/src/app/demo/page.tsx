import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { DemoPersonaPicker } from "@/components/dashboard/demo-persona-picker";
import { isClerkConfigured } from "@/lib/auth/config";
import { Button } from "@/components/ui/button";
import { FlaskConical, ArrowLeft } from "lucide-react";

export const metadata: Metadata = { title: "Demo mode" };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const clerk = isClerkConfigured();
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 items-center justify-between px-6 md:px-10">
        <Logo />
        <Button asChild variant="ghost" size="sm">
          <Link href="/"><ArrowLeft /> Back to tour</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-20 pt-6 md:px-10 md:pt-12">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-amber/40 bg-amber-soft px-2 py-1 text-[12px] font-medium text-amber">
            <FlaskConical className="size-3.5" aria-hidden="true" /> Demonstration mode
          </div>
          <h1 className="mt-4 font-display text-[34px] font-semibold leading-[1.05] tracking-tight md:text-[44px]">Walk through Nourish as three people in one Houston neighborhood.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Demo mode uses a synthetic dataset stored in your browser. Nothing here is a real account, a real fridge, or a real transaction. Actions you take as one persona show up for the others, so you can follow a donation from mission to fridge shelf to leaderboard.
          </p>
        </div>
        <DemoPersonaPicker next={next} />
        <div className="mt-10 flex flex-col gap-3 rounded-xl border border-border bg-card p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-display text-[15px] font-semibold">Have a real account?</div>
            <p className="text-[13px] text-muted-foreground">
              {clerk ? "Sign in with Google or email to reach your organization's live data." : "Live sign-in is not configured in this deployment. Add Clerk keys to .env.local to enable it."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" disabled={!clerk}><Link href="/sign-in">Sign in</Link></Button>
            <Button asChild variant="outline" disabled={!clerk}><Link href="/sign-up">Create account</Link></Button>
          </div>
        </div>
      </main>
    </div>
  );
}
