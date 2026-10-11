"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Wallet } from "lucide-react";
import type { RewardAllocation, RewardTransaction } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DemoTag } from "@/components/shared/demo-notice";
import { userById } from "@/lib/data/derived";
import { useFoodBank } from "./use-food-bank";
import { formatSol } from "./shared";

interface PayoutResponse {
  network: RewardTransaction["network"];
  signature: string;
  status: RewardTransaction["status"];
  explorerUrl?: string;
}

/**
 * Executes a reward payout through the server. The signing key never reaches the browser:
 * this dialog only posts the approved allocation and records what the server reports back.
 */
export function PayoutDialog({ allocation, open, onOpenChange }: { allocation: RewardAllocation; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, actions } = useFoodBank();
  const donor = userById(data, allocation.userId);
  const mission = data.missions.find((m) => m.id === allocation.missionId);
  const wallet = donor?.walletAddress;
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PayoutResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const pay = async () => {
    if (!wallet) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const res = await fetch("/api/rewards/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocationId: allocation.id, toAddress: wallet, amountSol: allocation.amountSol, organizationId: allocation.organizationId }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<PayoutResponse> & { error?: string };
      if (!res.ok || !json.network || !json.signature || !json.status) throw new Error(json.error ?? `Payout failed (${res.status})`);
      const tx: PayoutResponse = { network: json.network, signature: json.signature, status: json.status, explorerUrl: json.explorerUrl };
      actions.recordRewardPayout(allocation.id, { ...tx, toAddress: wallet, amountSol: allocation.amountSol, at: new Date().toISOString() });
      setResult(tx);
      toast.success(tx.network === "simulated" ? "Simulated payout recorded" : "Payout sent on Devnet", { description: `${formatSol(allocation.amountSol)} to ${donor?.name ?? "donor"}` });
    } catch (err) {
      const message = (err as Error).message;
      setFailure(message);
      toast.error("Payout failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const explorer = result?.network === "devnet" ? result.explorerUrl ?? `https://explorer.solana.com/tx/${result.signature}?cluster=devnet` : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{result ? "Payout recorded" : "Pay out reward"}</DialogTitle>
          <DialogDescription>
            {formatSol(allocation.amountSol)} to {donor?.name ?? "the donor"} for {mission?.title ?? "a completed mission"}.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-[13px]">
            {result.network === "simulated" ? (
              <div className="rounded-lg border border-amber/30 bg-amber-soft/60 px-3 py-2">
                <div className="flex items-center gap-2 font-medium"><DemoTag label="Simulated" /> Simulated payout</div>
                <p className="mt-1 text-muted-foreground">No blockchain transaction occurred. The allocation is marked paid so the demo flow can continue.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-sage-deep bg-sage/40 px-3 py-2">
                <div className="font-medium">Devnet transfer {result.status}</div>
                <p className="mt-1 text-muted-foreground">Sent from the organization&apos;s server-held payer wallet.</p>
              </div>
            )}
            <div>
              <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Signature</div>
              <code className="mt-1 block break-all rounded-md bg-muted px-2 py-1.5 font-mono text-[12px]">{result.signature}</code>
            </div>
            <div>
              <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Recipient</div>
              <code className="mt-1 block break-all rounded-md bg-muted px-2 py-1.5 font-mono text-[12px]">{wallet}</code>
            </div>
            {explorer && (
              <Button asChild variant="outline" size="sm">
                <a href={explorer} target="_blank" rel="noreferrer noopener">View on Solana Explorer <ExternalLink data-icon="inline-end" /></a>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-[13px]">
            <div className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground"><Wallet className="size-3.5" aria-hidden="true" />Recipient wallet</div>
              {wallet ? (
                <code className="mt-1 block break-all font-mono text-[12px]">{wallet}</code>
              ) : (
                <>
                  <div className="mt-1 font-medium text-amber">No wallet connected</div>
                  <p className="mt-0.5 text-muted-foreground">{donor?.name ?? "The donor"} has not linked a Solana address. Ask them to connect one from their Rewards page; the approval stays in place until then.</p>
                </>
              )}
            </div>
            <p className="text-muted-foreground">The transfer is signed on the server with the organization&apos;s payer key. Nothing is signed in your browser.</p>
            {failure && <p role="alert" className="text-critical">{failure}</p>}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={pay} disabled={!wallet || submitting} title={wallet ? undefined : "The donor needs a connected wallet first"}>{submitting ? "Sending…" : `Send ${formatSol(allocation.amountSol)}`}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
