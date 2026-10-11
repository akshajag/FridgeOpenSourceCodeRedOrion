import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { FlaskConical, KeyRound } from "lucide-react";

export function AuthFrame({ title, subtitle, configured, children }: { title: string; subtitle: string; configured: boolean; children?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="relative hidden overflow-hidden bg-ink lg:block">
        <Image src="/images/render-kitchen-open.webp" alt="" fill priority sizes="60vw" className="object-cover opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-stone">
          <Logo size="lg" className="text-stone" href={null} />
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-stone/80">A smarter fridge for a more connected community. Monitor conditions, verify donations, and keep neighbors fed.</p>
        </div>
      </aside>
      <main className="flex flex-col px-6 py-6 md:px-12">
        <div className="flex items-center justify-between">
          <Logo />
          <Button asChild variant="ghost" size="sm"><Link href="/">Back to tour</Link></Button>
        </div>
        <div className="my-auto w-full max-w-md py-10">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">{subtitle}</p>
          <div className="mt-8">
            {configured ? (
              children
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2 font-display text-[15px] font-semibold"><KeyRound className="size-4 text-muted-foreground" /> Live sign-in is not configured</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    This deployment has no Clerk keys, so real authentication is turned off. Set <code className="rounded bg-muted px-1 py-0.5 text-[12px]">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code className="rounded bg-muted px-1 py-0.5 text-[12px]">CLERK_SECRET_KEY</code> in <code className="rounded bg-muted px-1 py-0.5 text-[12px]">.env.local</code> to enable Google and email sign-in.
                  </p>
                </div>
                <div className="rounded-xl border border-amber/30 bg-amber-soft/60 p-5">
                  <div className="flex items-center gap-2 font-display text-[15px] font-semibold"><FlaskConical className="size-4 text-amber" /> Try the demo instead</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">Explore all three dashboards with a synthetic dataset. No account needed.</p>
                  <Button asChild className="mt-4"><Link href="/demo">Open demo mode</Link></Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
