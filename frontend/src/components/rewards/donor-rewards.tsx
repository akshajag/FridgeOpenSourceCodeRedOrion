"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Coins, Copy, ExternalLink } from "lucide-react";
import type { RewardAllocation, RewardStatus, RewardTransaction } from "@/types";
import { useFridgeyData } from "@/lib/data/use-fridgey-data";
import { formatDate, formatDateTime, organizationById, userById } from "@/lib/data/derived";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoNotice, DemoTag } from "@/components/shared/demo-notice";
import { StatusDot, type StatusTone } from "@/components/shared/status-dot";
import { formatSol, truncateMiddle } from "@/components/donor/format";
import { WalletPanel } from "./wallet-panel";

const GROUPS: { status: RewardStatus; title: string; description: string; tone: StatusTone }[] = [
  { status: "eligible", title: "Eligible", description: "The mission reached its goal with your verified donation. Ask the food bank to verify your share.", tone: "ok" },
  { status: "pending_verification", title: "Pending verification", description: "The food bank is reviewing your contribution.", tone: "info" },
  { status: "approved", title: "Approved", description: "Awaiting payout by the food bank.", tone: "info" },
  { status: "paid", title: "Paid", description: "Transferred to your wallet.", tone: "ok" },
  { status: "rejected", title: "Rejected", description: "The food bank declined this allocation.", tone: "critical" },
];

export function DonorRewards() {
  return (
    <DataGate>
      <RewardsContent />
    </DataGate>
  );
}

function RewardsContent() {
  const { data, actions, mode, currentUserId } = useFridgeyData();
  const user = userById(data, currentUserId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const mine = useMemo(() => data.rewards.filter((r) => r.userId === currentUserId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.rewards, currentUserId]);
  const txById = useMemo(() => new Map(data.rewardTransactions.map((t) => [t.id, t])), [data.rewardTransactions]);
  const myTransactions = useMemo(() => {
    const ids = new Set(mine.map((r) => r.id));
    return data.rewardTransactions.filter((t) => ids.has(t.allocationId)).sort((a, b) => b.at.localeCompare(a.at));
  }, [data.rewardTransactions, mine]);
  const totals = useMemo(() => {
    const paid = mine.filter((r) => r.status === "paid").reduce((s, r) => s + r.amountSol, 0);
    const pending = mine.filter((r) => r.status === "eligible" || r.status === "pending_verification" || r.status === "approved").reduce((s, r) => s + r.amountSol, 0);
    return { paid, pending };
  }, [mine]);

  async function requestVerification(r: RewardAllocation) {
    setBusyId(r.id);
    try {
      await Promise.resolve(actions.requestRewardVerification(r.id));
      toast.success("Verification requested", { description: "The food bank will review your contribution." });
    } catch (err) {
      toast.error("Couldn't request verification", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rewards"
        description="Food banks attach small Devnet SOL rewards to some missions. They're paid out only after the mission is verified complete and an administrator approves your share."
        meta={mode === "demo" ? <DemoTag /> : undefined}
        actions={
          <div className="flex items-center gap-5 rounded-xl border border-border bg-card px-4 py-3 shadow-panel">
            <div>
              <div className="text-[12px] text-muted-foreground">Paid out</div>
              <div className="readout text-[22px] font-semibold leading-none text-foreground">{formatSol(totals.paid)}</div>
            </div>
            <div className="h-8 w-px bg-border" aria-hidden="true" />
            <div>
              <div className="text-[12px] text-muted-foreground">In progress</div>
              <div className="readout text-[22px] font-semibold leading-none text-foreground">{formatSol(totals.pending)}</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <WalletPanel userId={currentUserId} walletAddress={user?.walletAddress} actions={actions} />

          <Panel>
            <PanelHeader title="Your reward allocations" description={`${mine.length} ${mine.length === 1 ? "allocation" : "allocations"} across your missions`} />
            <PanelBody>
              {mine.length === 0 ? (
                <EmptyState compact icon={<Coins />} title="No rewards yet" description="Join a mission with a reward attached. When it completes with your verified donation, your share appears here." />
              ) : (
                <div className="space-y-5">
                  {GROUPS.map((g) => {
                    const items = mine.filter((r) => r.status === g.status);
                    if (items.length === 0) return null;
                    return (
                      <section key={g.status} aria-labelledby={`rewards-${g.status}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 id={`rewards-${g.status}`} className="font-display text-[14px] font-semibold">
                            <StatusDot tone={g.tone} label={g.title} className="text-[14px] font-semibold" />
                          </h3>
                          <span className="tnum text-[12px] text-muted-foreground">{items.length}</span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">{g.description}</p>
                        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                          {items.map((r) => (
                            <AllocationRow key={r.id} allocation={r} tx={r.transactionId ? txById.get(r.transactionId) : undefined} busy={busyId === r.id} onRequestVerification={() => requestVerification(r)} />
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Transaction records" description="Every payout attempt recorded for your allocations." />
            <PanelBody flush>
              {myTransactions.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState compact title="No transactions yet" description="Payouts appear here once a food bank sends an approved reward." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-5">When</TableHead>
                        <TableHead>Mission</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Network</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="pr-5">Signature</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myTransactions.map((t) => {
                        const alloc = mine.find((r) => r.id === t.allocationId);
                        const mission = data.missions.find((m) => m.id === alloc?.missionId);
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="pl-5 text-muted-foreground">{formatDateTime(t.at)}</TableCell>
                            <TableCell className="max-w-[220px] truncate">{mission?.title ?? "Mission"}</TableCell>
                            <TableCell className="tnum text-right font-medium">{formatSol(t.amountSol)}</TableCell>
                            <TableCell>{t.network === "simulated" ? <DemoTag label="Simulated payout" /> : <span className="text-[13px]">Solana Devnet</span>}</TableCell>
                            <TableCell>
                              <StatusDot tone={t.status === "confirmed" ? "ok" : t.status === "failed" ? "critical" : "info"} label={t.status === "confirmed" ? "Confirmed" : t.status === "failed" ? "Failed" : "Pending"} className="text-[13px]" />
                            </TableCell>
                            <TableCell className="pr-5">
                              <Signature tx={t} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </PanelBody>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-4">
          <Panel className="lg:sticky lg:top-6">
            <PanelHeader title="How rewards work" />
            <PanelBody>
              <ol className="space-y-3 text-[13px] leading-snug text-foreground">
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sage text-[12px] font-semibold text-evergreen-deep">1</span>
                  <span>Food banks fund missions from their own reward budget and set the conditions up front.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sage text-[12px] font-semibold text-evergreen-deep">2</span>
                  <span>When a mission reaches its goal through operator-verified donations, contributors receive an eligible allocation.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sage text-[12px] font-semibold text-evergreen-deep">3</span>
                  <span>You request verification; a food bank administrator reviews and approves your share.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sage text-[12px] font-semibold text-evergreen-deep">4</span>
                  <span>The food bank pays out to your wallet. Payouts happen only after verified completion and approval.</span>
                </li>
              </ol>
              <p className="mt-4 border-t border-border pt-3 text-[12px] leading-snug text-muted-foreground">Rewards run on Solana Devnet for the hackathon. Devnet SOL is test currency with no monetary value, and some payouts are simulated when no RPC is configured. Both are labeled.</p>
            </PanelBody>
          </Panel>
          {mode === "demo" && <DemoNotice>Demo mode: allocations and the paid transaction below are synthetic. Request verification here, then switch to the food bank persona to approve and pay it out.</DemoNotice>}
        </aside>
      </div>
    </div>
  );
}

function AllocationRow({ allocation, tx, busy, onRequestVerification }: { allocation: RewardAllocation; tx?: RewardTransaction; busy: boolean; onRequestVerification: () => void }) {
  const { data } = useFridgeyData();
  const mission = data.missions.find((m) => m.id === allocation.missionId);
  const org = organizationById(data, allocation.organizationId);
  return (
    <li className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[14px] font-medium text-foreground">{mission?.title ?? "Mission"}</span>
          <span className="tnum text-[14px] font-semibold text-evergreen-deep">{formatSol(allocation.amountSol)}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          {org?.name ?? "Food bank"} · allocated {formatDate(allocation.createdAt)}
          {allocation.approvedAt ? ` · approved ${formatDate(allocation.approvedAt)}` : ""}
        </div>
        {mission && <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{mission.rewardCondition}</p>}
        {allocation.status === "paid" && tx && (
          <div className="mt-2 space-y-1 rounded-md bg-background/70 px-3 py-2 text-[12px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted-foreground">Transaction</span>
              <Signature tx={tx} />
              {tx.network === "devnet" ? <span className="text-foreground">Solana Devnet</span> : <DemoTag label="Simulated payout" />}
            </div>
            {tx.network === "simulated" && <p className="text-muted-foreground">No blockchain transaction occurred.</p>}
            <p className="text-muted-foreground">
              Sent to <code className="font-mono">{truncateMiddle(tx.toAddress, 6, 6)}</code> · {formatDateTime(tx.at)}
            </p>
          </div>
        )}
        {allocation.status === "paid" && !tx && <p className="mt-1 text-[12px] text-muted-foreground">Marked paid; transaction record unavailable.</p>}
      </div>
      {allocation.status === "eligible" && (
        <Button size="sm" onClick={onRequestVerification} disabled={busy} className="shrink-0">
          Request verification
        </Button>
      )}
      {allocation.status === "approved" && <span className="shrink-0 text-[12px] text-muted-foreground">Awaiting payout by the food bank</span>}
    </li>
  );
}

function Signature({ tx }: { tx: RewardTransaction }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(tx.signature);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  }
  const explorer = tx.network === "devnet" ? tx.explorerUrl ?? `https://explorer.solana.com/tx/${tx.signature}?cluster=devnet` : undefined;
  return (
    <span className="inline-flex items-center gap-1">
      <code className="font-mono text-[12px] text-foreground" title={tx.signature}>
        {truncateMiddle(tx.signature, 6, 6)}
      </code>
      <Button variant="ghost" size="icon-xs" onClick={copy} aria-label="Copy transaction signature">
        {copied ? <Check /> : <Copy />}
      </Button>
      {explorer && (
        <Button asChild variant="ghost" size="icon-xs">
          <a href={explorer} target="_blank" rel="noopener noreferrer" aria-label="Open in Solana Explorer">
            <ExternalLink />
          </a>
        </Button>
      )}
    </span>
  );
}
