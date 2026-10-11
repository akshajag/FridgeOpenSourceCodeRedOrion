"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Wallet, Unlink, Check } from "lucide-react";
import type { FridgeyActions } from "@/lib/data/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { truncateMiddle } from "@/components/donor/format";

interface PhantomProvider {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

const noopSubscribe = () => () => {};

/** Base58 Solana public keys are 32–44 characters from the Bitcoin base58 alphabet. */
export function isValidSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

export function WalletPanel({ userId, walletAddress, actions }: { userId: string; walletAddress?: string; actions: FridgeyActions }) {
  const hasPhantom = useSyncExternalStore(noopSubscribe, () => typeof window !== "undefined" && Boolean(window.solana?.isPhantom), () => false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [copied, setCopied] = useState(false);

  async function save(address: string) {
    setBusy(true);
    try {
      await Promise.resolve(actions.setWalletAddress(userId, address));
      toast.success("Wallet saved", { description: `Devnet rewards will be sent to ${truncateMiddle(address)}.` });
      setManual("");
      setError(undefined);
    } catch (err) {
      toast.error("Couldn't save the wallet", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function connectPhantom() {
    const provider = window.solana;
    if (!provider?.isPhantom) {
      toast.error("Phantom wallet not detected");
      return;
    }
    setBusy(true);
    try {
      const res = await provider.connect();
      const address = res.publicKey.toString();
      if (!isValidSolanaAddress(address)) throw new Error("Phantom returned an unexpected address.");
      await save(address);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection was cancelled.";
      toast.error("Couldn't connect Phantom", { description: message });
    } finally {
      setBusy(false);
    }
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const value = manual.trim();
    if (!value) {
      setError("Paste a Solana wallet address.");
      return;
    }
    if (!isValidSolanaAddress(value)) {
      setError("That doesn't look like a Solana address (32–44 base58 characters).");
      return;
    }
    void save(value);
  }

  async function remove() {
    setBusy(true);
    try {
      await Promise.resolve(actions.setWalletAddress(userId, undefined));
      if (window.solana?.disconnect) await window.solana.disconnect().catch(() => undefined);
      toast.success("Wallet removed");
      setConfirmRemove(false);
    } catch (err) {
      toast.error("Couldn't remove the wallet", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  }

  return (
    <Panel>
      <PanelHeader title="Reward wallet" description="Optional. Used only to receive Devnet rewards from food banks; nothing is ever charged to it." />
      <PanelBody>
        {walletAddress ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sage text-evergreen-deep" aria-hidden="true">
                  <Wallet className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] text-muted-foreground">Connected address</div>
                  <code className="block truncate font-mono text-[13px] text-foreground" title={walletAddress}>
                    {truncateMiddle(walletAddress, 8, 8)}
                  </code>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={copy} aria-label="Copy wallet address">
                  {copied ? <Check data-icon="inline-start" /> : null}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
                  <Unlink data-icon="inline-start" /> Remove
                </Button>
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground">Payouts for approved rewards go to this address on Solana Devnet. Devnet SOL has no monetary value.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hasPhantom && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3.5 py-3">
                <div className="text-[13px] text-foreground">Phantom detected in this browser.</div>
                <Button onClick={connectPhantom} disabled={busy}>
                  <Wallet data-icon="inline-start" /> Connect Phantom
                </Button>
              </div>
            )}
            <form onSubmit={submitManual} className="space-y-2" noValidate>
              <Label htmlFor="wallet-manual">{hasPhantom ? "Or paste a Solana address" : "Paste a Solana address"}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="wallet-manual" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 7xKX…9Qf2" spellCheck={false} autoComplete="off" className="font-mono" aria-invalid={Boolean(error)} aria-describedby={error ? "wallet-manual-error" : undefined} />
                <Button type="submit" variant="outline" disabled={busy}>
                  Save address
                </Button>
              </div>
              {error && (
                <p id="wallet-manual-error" className="text-[12px] text-critical">
                  {error}
                </p>
              )}
            </form>
            {!hasPhantom && <p className="text-[12px] text-muted-foreground">Have Phantom installed? Open this page in that browser to connect with one click.</p>}
          </div>
        )}
      </PanelBody>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove wallet?</DialogTitle>
            <DialogDescription>Food banks won&apos;t be able to pay out approved rewards until you add an address again. Rewards you&apos;ve already earned stay on your account.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Keep wallet
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              Remove wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
