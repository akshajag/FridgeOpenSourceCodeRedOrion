"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Coins, ExternalLink, ShieldCheck } from "lucide-react";
import type { RewardAllocation } from "@/types";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressGauge } from "@/components/shared/progress-gauge";
import { DemoTag } from "@/components/shared/demo-notice";
import { Rows, Row } from "@/components/shared/inline-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatRelative, userById } from "@/lib/data/derived";
import { cn } from "@/lib/utils";
import { useFoodBank, useNow } from "./use-food-bank";
import { StatusPill, formatSol, truncateMiddle } from "./shared";
import { PayoutDialog } from "./payout-dialog";

const STATUS_ORDER: Record<RewardAllocation["status"], number> = { pending_verification: 0, eligible: 1, approved: 2, paid: 3, rejected: 4 };

export function RewardsPage() {
  return (
    <DataGate>
      <RewardsContent />
    </DataGate>
  );
}

function RewardsContent() {
  const { data, actions, organization, organizationId } = useFoodBank();
  const now = useNow();
  const [rejecting, setRejecting] = useState<RewardAllocation | null>(null);
  const [paying, setPaying] = useState<RewardAllocation | null>(null);

  const allocations = useMemo(
    () => data.rewards.filter((r) => r.organizationId === organizationId).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt)),
    [data.rewards, organizationId],
  );
  const budget = organization?.rewardBudgetSol ?? 0;
  const totals = useMemo(() => {
    let allocated = 0;
    let paid = 0;
    let awaiting = 0;
    for (const r of allocations) {
      if (r.status === "rejected") continue;
      allocated += r.amountSol;
      if (r.status === "paid") paid += r.amountSol;
      if (r.status === "pending_verification" || r.status === "eligible") awaiting += 1;
    }
    return { allocated, paid, remaining: Math.max(0, budget - allocated), awaiting };
  }, [allocations, budget]);

  const transactions = useMemo(() => {
    const ids = new Set(allocations.map((a) => a.id));
    return data.rewardTransactions.filter((t) => ids.has(t.allocationId)).sort((a, b) => b.at.localeCompare(a.at));
  }, [data.rewardTransactions, allocations]);

  const approve = (r: RewardAllocation) => {
    actions.approveReward(r.id);
    const donor = userById(data, r.userId);
    toast.success("Reward approved", { description: `${formatSol(r.amountSol)} for ${donor?.name ?? "donor"} can now be paid out.` });
  };
  const confirmReject = () => {
    if (!rejecting) return;
    actions.rejectReward(rejecting.id);
    toast.success("Reward rejected", { description: "The allocation is kept for the record and the budget is released." });
    setRejecting(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Rewards" description="Approve and pay out SOL rewards earned on completed missions. Every payout is tied to an operator-verified donation." meta={organization?.name} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Panel>
          <PanelHeader title="Reward budget" description="Budget set for the organization, against everything allocated to missions and events." />
          <PanelBody className="space-y-4">
            <ProgressGauge value={totals.allocated} max={budget} unit="SOL" tone="ok" label={`${formatSol(totals.remaining)} unallocated`} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="Budget" value={formatSol(budget)} />
              <Figure label="Allocated" value={formatSol(totals.allocated)} hint="Eligible, approved and paid" />
              <Figure label="Paid out" value={formatSol(totals.paid)} />
              <Figure label="Awaiting review" value={String(totals.awaiting)} hint={totals.awaiting === 1 ? "allocation" : "allocations"} tone={totals.awaiting > 0 ? "warning" : "default"} />
            </div>
          </PanelBody>
        </Panel>

        <Panel tone="sage" as="aside">
          <PanelHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-evergreen" aria-hidden="true" />How payouts work</span>} />
          <PanelBody>
            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-foreground">
              <li>A reward becomes eligible only after the mission is verified complete by fridge operators.</li>
              <li>An administrator from your organization approves each allocation here.</li>
              <li>The payout is signed on the server with the organization&apos;s payer key. Keys never reach the browser.</li>
              <li>Without a Devnet payer configured, payouts are simulated and labeled as such.</li>
            </ol>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Allocations" description="One row per donor per mission." />
        <PanelBody flush>
          {allocations.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState compact icon={<Coins />} title="No reward allocations yet" description="Allocations appear when a mission with a reward is completed." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Donor</TableHead>
                  <TableHead>Mission</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="pr-5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((r) => {
                  const donor = userById(data, r.userId);
                  const mission = data.missions.find((m) => m.id === r.missionId);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-5">
                        <div className="font-medium">{donor?.name ?? "Unknown donor"}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{donor?.walletAddress ? truncateMiddle(donor.walletAddress) : "No wallet connected"}</div>
                      </TableCell>
                      <TableCell className="max-w-[260px] whitespace-normal">{mission?.title ?? "Unknown mission"}</TableCell>
                      <TableCell className="tnum whitespace-nowrap text-right">{formatSol(r.amountSol)}</TableCell>
                      <TableCell>
                        <StatusPill kind="reward" status={r.status} />
                        {r.approvedAt && r.status !== "rejected" && <div className="text-[12px] text-muted-foreground">Approved {formatRelative(r.approvedAt, now)}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell className="pr-5">
                        <div className="flex flex-wrap justify-end gap-2">
                          {(r.status === "pending_verification" || r.status === "eligible") && (
                            <>
                              <Button size="sm" onClick={() => approve(r)}>Approve</Button>
                              <Button size="sm" variant="ghost" onClick={() => setRejecting(r)}>Reject</Button>
                            </>
                          )}
                          {r.status === "approved" && (
                            <>
                              <Button size="sm" onClick={() => setPaying(r)}>Pay out</Button>
                              <Button size="sm" variant="ghost" onClick={() => setRejecting(r)}>Reject</Button>
                            </>
                          )}
                          {(r.status === "paid" || r.status === "rejected") && <span className="text-[12px] text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Transactions" description="Payout records reported by the server." />
        <PanelBody flush>
          {transactions.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState compact icon={<Coins />} title="No payouts recorded" />
            </div>
          ) : (
            <Rows>
              {transactions.map((t) => {
                const alloc = allocations.find((a) => a.id === t.allocationId);
                const donor = alloc ? userById(data, alloc.userId) : undefined;
                return (
                  <Row key={t.id} trailing={<span className="text-[12px] text-muted-foreground">{formatDateTime(t.at)}</span>}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                      <span className="tnum font-medium">{formatSol(t.amountSol)}</span>
                      <span className="text-muted-foreground">to {donor?.name ?? truncateMiddle(t.toAddress)}</span>
                      {t.network === "simulated" ? <DemoTag label="Simulated" /> : <span className="rounded-sm border border-sensor/40 bg-sensor-soft px-1.5 py-0.5 text-[11px] font-medium text-sensor">Devnet</span>}
                      <span className={cn("text-[12px]", t.status === "confirmed" ? "text-muted-foreground" : t.status === "failed" ? "text-critical" : "text-amber")}>{t.status}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-muted-foreground">
                      <span title={t.signature}>{truncateMiddle(t.signature, 10)}</span>
                      {t.network === "devnet" && (
                        <a href={t.explorerUrl ?? `https://explorer.solana.com/tx/${t.signature}?cluster=devnet`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-sans text-[12px] text-primary underline-offset-4 hover:underline">
                          Explorer <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      )}
                      {t.network === "simulated" && <span className="font-sans text-[12px]">Simulated payout, no blockchain transaction occurred</span>}
                    </div>
                  </Row>
                );
              })}
            </Rows>
          )}
        </PanelBody>
      </Panel>

      <Dialog open={Boolean(rejecting)} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this reward?</DialogTitle>
            <DialogDescription>
              {rejecting && `${formatSol(rejecting.amountSol)} for ${userById(data, rejecting.userId)?.name ?? "this donor"} will not be paid. The donor keeps their leaderboard points.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReject}>Reject reward</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {paying && <PayoutDialog key={paying.id} allocation={paying} open onOpenChange={(o) => { if (!o) setPaying(null); }} />}
    </div>
  );
}

function Figure({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "warning" }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">{label}</div>
      <div className={cn("readout mt-1 text-[22px] font-semibold leading-none", tone === "warning" && "text-amber")}>{value}</div>
      {hint && <div className="mt-1 text-[12px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
