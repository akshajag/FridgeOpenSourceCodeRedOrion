import Image from "next/image";
import Link from "next/link";
import { Building2, Refrigerator, HandHeart, Check, Minus } from "lucide-react";
import { LandingNav } from "@/components/landing/landing-nav";
import { FridgeTour } from "@/components/landing/fridge-tour";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { isClerkConfigured } from "@/lib/auth/config";
import { integrationStatus } from "@/lib/integrations/status";
import { cn } from "@/lib/utils";

const ROLES = [
  {
    icon: Building2,
    title: "Food banks",
    lead: "Coordinate a network of fridges from one place.",
    items: ["Map of connected fridges with live status", "Shared inventory and expiration lists", "Rescue missions for specific surplus food", "Community events with verified leaderboards"],
    href: "/demo",
    cta: "See the food bank dashboard",
  },
  {
    icon: Refrigerator,
    title: "Fridge operators",
    lead: "Know how your fridge is doing without opening it.",
    items: ["Temperature, moisture, and air-quality history", "Camera recognitions you confirm or correct", "Anomalies flagged for review, never guessed at", "Control exactly what each food bank can see"],
    href: "/demo",
    cta: "See the operator dashboard",
  },
  {
    icon: HandHeart,
    title: "Donors",
    lead: "Bring food where it is needed and watch it count.",
    items: ["Nearby fridges with what they have and need", "Missions with clear eligibility and deadlines", "Neighborhood territories and impact leaderboards", "Weekly Solana reward simulation"],
    href: "/demo",
    cta: "See the donor dashboard",
  },
];

const KIT = [
  { name: "Front camera", role: "Captures presented food for barcode reading and Gemini identification." },
  { name: "Interior camera", role: "Captures shelf frames for Gemini food recognition." },
  { name: "Temperature probe", role: "Cabinet temperature, uploaded every five seconds when connected." },
  { name: "Air-quality sensor", role: "Relative gas-sensor readings flag changes for review; not a food-spoilage test." },
  { name: "Moisture module", role: "Detects moisture by contact; does not measure relative humidity." },
  { name: "Speaker", role: "ElevenLabs voice for hands-free donor check-in." },
  { name: "Arduino-compatible board", role: "Reads sensors over USB; the fridge Mac runs cameras and uploads data." },
];

export default function LandingPage() {
  const clerk = isClerkConfigured();
  const status = integrationStatus();
  const integrations = [
    { name: "Clerk authentication", live: status.clerk, note: "Google and email sign-in, protected dashboards" },
    { name: "TigerData / PostgreSQL", live: status.database, note: "Persistent records and sensor time-series" },
    { name: "Gemini", live: status.gemini || status.fridgeStation, label: status.gemini ? "Configured" : status.fridgeStation ? "Via fridge station" : "Not configured", note: "Food recognition and expiration-date extraction on the fridge Mac" },
    { name: "ElevenLabs", live: status.elevenlabs || status.fridgeStation, label: status.elevenlabs ? "Configured" : status.fridgeStation ? "Via fridge station" : "Not configured", note: "Voice-assisted donations through the connected fridge station" },
    { name: "Solana rewards", live: true, label: "Demo payouts", note: "Weekly top-three leaderboard rewards · simulated SOL payouts" },
    { name: "Fridge hardware ingest", live: status.hardware, note: "Sensor readings from the Arduino board" },
  ];

  return (
    <div className="bg-background">
      <LandingNav />
      <FridgeTour clerkConfigured={clerk} />

      {/* Network */}
      <section id="network" className="scroll-mt-16 border-t border-border">
        <div className="mx-auto max-w-[1400px] px-5 py-20 md:px-8 md:py-28">
          <div className="max-w-2xl">
            <h2 className="font-display text-[30px] font-semibold leading-[1.05] tracking-tight md:text-[40px]">Three roles, one shared picture of the food.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">Everyone in a Nourish network works from the same inventory, the same sensor history, and the same verified donation record. What each person sees depends on what the fridge owner has agreed to share.</p>
          </div>
          <div className="mt-12 grid overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-3">
            {ROLES.map((r, i) => {
              const Icon = r.icon;
              return (
                <div key={r.title} className={cn("flex flex-col p-6 md:p-8", i > 0 && "border-t border-border md:border-l md:border-t-0")}>
                  <div className="flex size-10 items-center justify-center rounded-md bg-sage text-evergreen-deep"><Icon className="size-5" /></div>
                  <h3 className="mt-5 font-display text-[20px] font-semibold">{r.title}</h3>
                  <p className="mt-1 text-[14px] text-ink-muted">{r.lead}</p>
                  <ul className="mt-5 flex-1 space-y-2 text-[13.5px] text-foreground/85">
                    {r.items.map((it) => (
                      <li key={it} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{it}</li>
                    ))}
                  </ul>
                  <Button asChild variant="outline" className="mt-6 w-fit"><Link href={r.href}>{r.cta}</Link></Button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Hardware */}
      <section id="hardware" className="scroll-mt-16 border-t border-border bg-card">
        <div className="mx-auto max-w-[1400px] px-5 py-20 md:px-8 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <h2 className="font-display text-[30px] font-semibold leading-[1.05] tracking-tight md:text-[40px]">What is in the kit.</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">Nourish retrofits an affordable refrigerator with off-the-shelf parts. Every component maps to something you can see in the dashboards.</p>
              <dl className="mt-8 divide-y divide-border border-y border-border">
                {KIT.map((k) => (
                  <div key={k.name} className="grid gap-1 py-3.5 sm:grid-cols-[200px_1fr] sm:gap-4">
                    <dt className="font-display text-[14px] font-semibold">{k.name}</dt>
                    <dd className="text-[13.5px] text-ink-muted">{k.role}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="grid grid-cols-2 gap-3 self-start md:grid-cols-3 lg:grid-cols-2">
              <figure className="col-span-2 overflow-hidden rounded-xl border border-border md:col-span-3 lg:col-span-2">
                <Image src="/images/render-kitchen-open.webp" alt="Rendered Nourish refrigerator with both doors open, showing shelves of food" width={1600} height={900} className="h-auto w-full" sizes="(min-width: 1024px) 50vw, 100vw" />
                <figcaption className="px-4 py-2.5 text-[12px] text-ink-muted">Doors open. Rendered from the project&rsquo;s Blender model.</figcaption>
              </figure>
              <figure className="overflow-hidden rounded-xl border border-border">
                <Image src="/images/render-hardware-head.webp" alt="Close-up of the electronics head unit with camera, screen, and speaker grille" width={1000} height={1000} className="aspect-square h-auto w-full object-cover" sizes="25vw" />
                <figcaption className="px-4 py-2.5 text-[12px] text-ink-muted">Head unit: front camera, display, speaker.</figcaption>
              </figure>
              <figure className="overflow-hidden rounded-xl border border-border">
                <Image src="/images/render-hardware-arduino.webp" alt="Top-down view of the Arduino-compatible board on top of the fridge" width={1000} height={1000} className="aspect-square h-auto w-full object-cover" sizes="25vw" />
                <figcaption className="px-4 py-2.5 text-[12px] text-ink-muted">Arduino-compatible board on the roof.</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* Data honesty */}
      <section id="data" className="scroll-mt-16 border-t border-border">
        <div className="mx-auto max-w-[1400px] px-5 py-20 md:px-8 md:py-28">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <h2 className="font-display text-[30px] font-semibold leading-[1.05] tracking-tight md:text-[40px]">Clear about what is live.</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">Demo mode uses clearly labeled mock community data. Live monitoring and inventory use Tiger Data. Gemini and ElevenLabs run on the fridge Mac, linked through the camera station; that Mac must stay online. Weekly leaderboard SOL payouts are simulated. Integration setup is shown below; these labels do not indicate current device health:</p>
              <div className="mt-6 flex gap-2">
                <Button asChild><Link href="/demo">Open demo mode</Link></Button>
              </div>
              <p className="mt-4 text-[13px] text-ink-muted">Setup instructions for each integration are in the project README and <code className="rounded bg-muted px-1 py-0.5 text-[12px]">.env.example</code>.</p>
            </div>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {integrations.map((it) => (
                <li key={it.name} className="flex items-center gap-4 px-5 py-3.5">
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", it.live ? "bg-sage text-evergreen-deep" : "bg-muted text-ink-faint")} aria-hidden="true">
                    {it.live ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[14px] font-semibold">{it.name}</div>
                    <div className="text-[12.5px] text-ink-muted">{it.note}</div>
                  </div>
                  <span className={cn("text-[12px] font-medium", it.live ? "text-primary" : "text-ink-faint")}>{it.label ?? (it.live ? "Configured" : "Not configured")}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-5 py-8 text-[13px] text-ink-muted md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span>A smarter fridge for a more connected community.</span>
          </div>
          <div className="flex gap-5">
            <Link href="/demo" className="hover:text-foreground">Demo</Link>
            <Link href="/sign-in" className="hover:text-foreground">Sign in</Link>
            <Link href="/sign-up" className="hover:text-foreground">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
