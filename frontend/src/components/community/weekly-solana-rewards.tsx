"use client";

import { useState } from "react";
import { Trophy, CalendarDays, CheckCircle2, Wallet, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { standings } from "@/lib/community/model";

type RankedCrew = ReturnType<typeof standings>[number];
const PRIZES = [0.5, 0.3, 0.2];
const PLACES = ["First place", "Second place", "Third place"];

export function WeeklySolanaRewards({ ranks }: { ranks: RankedCrew[] }) {
  // Freeze recipients at simulated settlement, even if demo refills change rankings.
  const [paid, setPaid] = useState<RankedCrew[] | null>(null);
  const winners = (paid ?? ranks).slice(0, 3);
  return (
    <section aria-label="Weekly Solana rewards" className="overflow-hidden rounded-2xl border border-evergreen/20 bg-card shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-5 bg-evergreen px-6 py-6 text-white">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/75"><CalendarDays className="size-4" /> Weekly community rewards</p>
          <h2 className="font-display text-2xl font-semibold">Good food. Greater impact.</h2>
          <p className="mt-2 max-w-lg text-sm text-white/80">Every week, the top three crews earn SOL for keeping neighborhood fridges stocked.</p>
        </div>
        <div className="rounded-xl border border-white/20 bg-white/10 px-5 py-3">
          <p className="text-xs text-white/75">Illustrative weekly prize pool</p>
          <p className="mt-1 font-display text-3xl font-semibold">1.00 <span className="text-lg text-white/80">SOL</span></p>
          <p className="mt-1 text-xs text-white/75">50% / 30% / 20% split</p>
        </div>
      </div>
      <div className="px-6 py-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="size-4" /> Weekly cycle · closes Sunday, 11:59 PM Central</span>
          <span className="rounded-full border border-amber/30 bg-amber-soft px-3 py-1 font-medium text-amber">Demo · mock recipients & payouts</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {winners.map((crew, index) => (
            <article key={crew.id} className={`rounded-xl border p-5 ${index === 0 ? "border-evergreen/30 bg-sage/40" : "border-border bg-background"}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Trophy className={`size-4 ${index === 0 ? "text-amber" : "text-evergreen"}`} /> {PLACES[index]}</span>
                <span className="size-3 rounded-full" style={{ backgroundColor: crew.color }} />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{crew.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{crew.units} food units · {crew.helped} fridges helped</p>
              <p className="my-5 font-display text-3xl font-semibold text-evergreen">{PRIZES[index].toFixed(2)} <span className="text-base font-medium">SOL</span></p>
              <div className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                {paid ? <CheckCircle2 className="size-4 text-evergreen" /> : <Wallet className="size-4" />}
                {paid ? "Demo payout complete" : "Projected weekly reward"}
              </div>
            </article>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-sage/30 p-4">
          <div className="max-w-xl" aria-live="polite">
            <p className="text-sm font-medium">{paid ? "Three crews rewarded. A stronger community." : "Turn community effort into a weekly incentive."}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{paid ? "Simulated settlement: 1.00 SOL distributed across the podium. No blockchain transaction was sent." : "Rankings follow food supplied, then fridges helped. Preview the payout ceremony with mock data; no wallet or sign-in needed for this simulation."}</p>
          </div>
          <Button type="button" variant={paid ? "outline" : "default"} onClick={() => setPaid(paid ? null : ranks.slice(0, 3))} disabled={winners.length < 3}>
            {paid ? <RotateCcw className="size-4" /> : <Wallet className="size-4" />}
            {paid ? "Reset demo" : "Simulate weekly payout"}
            {!paid && <ArrowRight className="size-4" />}
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">CodeRED: Orion demo · illustrative reward amounts · real scheduled Solana payouts are not enabled.</p>
      </div>
    </section>
  );
}
