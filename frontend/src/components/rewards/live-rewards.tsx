"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Coins, ShieldCheck, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { Button } from "@/components/ui/button";
import { WalletPanel } from "./wallet-panel";
type Account = {
  userId: string;
  walletAddress: string | null;
  rewards: {
    id: string;
    mission_title: string;
    amount_sol: string;
    status: string;
    created_at: string;
    signature: string | null;
  }[];
  solana: {
    configured: boolean;
    connected: boolean;
    balanceSol: number | null;
    address: string | null;
  };
};
export function LiveRewards() {
  const client = useQueryClient();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["reward-account"],
    queryFn: async () => {
      const r = await fetch("/api/rewards/account", { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      return data as Account;
    },
    refetchInterval: 15000,
  });
  const actions = {
    setWalletAddress: async (_id: string, address?: string) => {
      const r = await fetch("/api/rewards/account", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: address ?? null }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      await client.invalidateQueries({ queryKey: ["reward-account"] });
    },
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Community rewards"
        description="Recognize verified food rescue and delivery with Solana Devnet rewards."
        meta={
          <span className="rounded-md border bg-sage px-3 py-1 text-xs text-evergreen">
            Devnet · test tokens, no cash value
          </span>
        }
        actions={
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        }
      />
      {isPending ? (
        <p>Connecting to your reward account…</p>
      ) : error ? (
        <Panel>
          <PanelBody>
            <p role="alert">{error.message}</p>
            <Button onClick={() => refetch()}>Retry</Button>
          </PanelBody>
        </Panel>
      ) : (
        data && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                [
                  "Solana connection",
                  data.solana.connected
                    ? "Connected to Devnet"
                    : data.solana.configured
                      ? "RPC temporarily unavailable"
                      : "Payer setup needed",
                ],
                [
                  "Reward pool",
                  data.solana.balanceSol === null
                    ? "Unavailable"
                    : `${data.solana.balanceSol.toFixed(3)} test SOL`,
                ],
                [
                  "Your paid rewards",
                  `${data.rewards
                    .filter((r) => r.status === "paid")
                    .reduce((n, r) => n + Number(r.amount_sol), 0)
                    .toFixed(3)} test SOL`,
                ],
              ].map(([label, value]) => (
                <Panel key={label}>
                  <PanelBody className="p-5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-2 text-lg font-semibold">{value}</p>
                  </PanelBody>
                </Panel>
              ))}
            </div>
            <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
              <Panel>
                <PanelHeader
                  title="Your reward history"
                  description="Only your authenticated account’s Tiger Data records."
                />
                <PanelBody>
                  {data.rewards.length ? (
                    data.rewards.map((r) => (
                      <div key={r.id} className="border-b py-4">
                        <p className="font-medium">{r.mission_title}</p>
                        <p className="mt-1 text-sm">
                          {Number(r.amount_sol)} test SOL ·{" "}
                          {r.status.replace("_", " ")}
                        </p>
                        {r.signature && r.status === "paid" && (
                          <a
                            className="mt-2 inline-flex items-center gap-1 text-sm text-evergreen underline"
                            href={`https://explorer.solana.com/tx/${encodeURIComponent(r.signature)}?cluster=devnet`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View confirmed transfer{" "}
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="py-10 text-center">
                      <Coins className="mx-auto mb-4 size-9 text-evergreen" />
                      <p className="font-medium">No verified rewards yet</p>
                      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                        A food bank must confirm receipt and approve an
                        allocation before payment. Joining a demo mission does
                        not earn tokens.
                      </p>
                      <Button asChild className="mt-5">
                        <Link href="/dashboard/donor/missions">
                          Explore rescue missions
                        </Link>
                      </Button>
                    </div>
                  )}
                </PanelBody>
              </Panel>
              <WalletPanel
                userId={data.userId}
                walletAddress={data.walletAddress ?? undefined}
                actions={actions}
              />
            </div>
            <Panel>
              <PanelBody className="flex gap-3 p-5">
                <ShieldCheck className="size-6 shrink-0 text-evergreen" />
                <div>
                  <p className="font-medium">
                    Verified delivery, then approval, then payment
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The server uses the approved amount and saved recipient
                    wallet. Duplicate payout requests cannot send a reward
                    twice. Uncertain transfers require review rather than an
                    automatic retry.
                  </p>
                  {data.solana.address && (
                    <a
                      className="mt-3 inline-block text-xs text-evergreen underline"
                      href={`https://explorer.solana.com/address/${data.solana.address}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View demo reward pool on Solana Explorer
                    </a>
                  )}
                </div>
              </PanelBody>
            </Panel>
          </>
        )
      )}
    </div>
  );
}
