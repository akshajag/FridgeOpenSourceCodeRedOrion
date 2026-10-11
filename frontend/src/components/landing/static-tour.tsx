import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TOUR_STAGES } from "@/lib/three/tour-config";

/**
 * Non-WebGL fallback: the same tour content as a normal scrolling page, using the project's
 * Blender renders. Keeps the site fully navigable when 3D is unavailable.
 */
export function StaticTour({ clerkConfigured }: { clerkConfigured: boolean }) {
  return (
    <div className="relative">
      <section className="relative min-h-[90vh] overflow-hidden">
        <Image src="/images/render-kitchen-closed.webp" alt="Rendered Fridgey refrigerator in a kitchen" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-stone/95 via-stone/70 to-transparent" />
        <div className="relative mx-auto flex min-h-[90vh] max-w-[1400px] flex-col justify-center px-5 pt-20 md:px-8">
          <div className="max-w-xl">
            <h1 className="font-display text-[36px] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-[48px] md:text-[60px]">A smarter fridge for a more connected community.</h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-muted">Fridgey monitors community refrigerators, recognizes what is inside, and connects donors with the food banks that need it.</p>
            <p className="mt-2 text-[12px] text-ink-faint">3D tour unavailable in this browser; showing rendered stills.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild size="lg"><Link href="/demo">Explore the demo</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href={clerkConfigured ? "/sign-in" : "/demo"}>{clerkConfigured ? "Sign in" : "Skip to dashboard"}</Link></Button>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1100px] px-5 py-16 md:px-8">
        <ol className="space-y-10">
          {TOUR_STAGES.slice(1, -1).map((s) => (
            <li key={s.id} className="grid gap-4 md:grid-cols-[80px_1fr]">
              <div className="tnum font-display text-[13px] font-semibold text-primary">{String(s.index).padStart(2, "0")}</div>
              <div>
                <h2 className="font-display text-[22px] font-semibold leading-tight">{s.title}</h2>
                <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex items-center justify-between rounded-xl border border-border bg-card p-6">
          <div>
            <h2 className="font-display text-[22px] font-semibold">Connect to your community.</h2>
            <p className="text-[13px] text-muted-foreground">Open the demo or sign in.</p>
          </div>
          <Button asChild><Link href="/demo">Explore the demo</Link></Button>
        </div>
      </section>
    </div>
  );
}
