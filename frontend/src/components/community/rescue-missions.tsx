"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Truck, PackageCheck, Flag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelHeader, PanelBody } from "@/components/shared/panel";
import { Button } from "@/components/ui/button";
import { CommunityHub } from "./community-hub";
import type { CommunityWorld } from "@/lib/community/model";
export function RescueMissions() {
  const client = useQueryClient();
  const [filter, setFilter] = useState("all");
  const {
    data: world,
    error,
    dataUpdatedAt: now,
  } = useQuery({
    queryKey: ["community-demo"],
    queryFn: async () => {
      const r = await fetch("/api/community", { cache: "no-store" });
      if (!r.ok) throw new Error("Missions unavailable");
      return r.json() as Promise<CommunityWorld>;
    },
    refetchInterval: 5000,
  });
  const update = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/community", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      client.setQueryData(["community-demo"], data);
      toast.success("Demo mission updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (error)
    return <p role="alert">Could not load missions. Refresh to retry.</p>;
  if (!world) return <p>Loading missions…</p>;
  const joined = world.viewer?.joined ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Food rescue missions"
        description="Get perishable food where it’s needed before the receiving window closes."
        meta={
          <span className="rounded-md border bg-amber-soft px-3 py-1 text-xs text-amber">
            CodeRED: Orion · fictional mission demo
          </span>
        }
      />
      <div className="flex flex-wrap gap-2">
        {["all", "mine", "urgent"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f === "all"
              ? "All rescue missions"
              : f === "mine"
                ? "My missions"
                : "Due within an hour"}
          </Button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {world.rescues
          ?.filter(
            (m) =>
              filter === "all" ||
              (filter === "mine" && joined.includes(m.id)) ||
              (filter === "urgent" && Date.parse(m.deadline) - now < 3600000),
          )
          .map((m) => {
            const minutes = Math.ceil((Date.parse(m.deadline) - now) / 60000),
              expired = minutes <= 0,
              mine = joined.includes(m.id),
              other = !!m.assignedTo && m.assignedTo !== world.viewer?.id;
            return (
              <Panel key={m.id}>
                <PanelHeader
                  title={m.title}
                  description={
                    m.kind === "rescue"
                      ? "Surplus food rescue"
                      : "Time-sensitive delivery"
                  }
                />
                <PanelBody className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span
                      className={
                        minutes <= 60 ? "text-critical" : "text-evergreen"
                      }
                    >
                      <Clock3 className="mr-1 inline size-4" />
                      {expired ? "Window closed" : `${minutes} min remaining`}
                    </span>
                    <span>{m.stage.replace("_", " ")}</span>
                  </div>
                  <p className="font-medium">
                    {m.quantity} × {m.food}
                  </p>
                  <div className="rounded-lg bg-sage/30 p-3 text-sm">
                    <p className="text-xs uppercase text-muted-foreground">
                      Pickup
                    </p>
                    <p>{m.pickup}</p>
                    <p className="mt-3 text-xs uppercase text-muted-foreground">
                      Deliver to
                    </p>
                    <p>{m.destination}</p>
                    <p className="mt-2 text-xs">
                      Receiving deadline:{" "}
                      {new Date(m.deadline).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{m.handling}</p>
                  <p className="text-xs">
                    Example reward: {m.rewardSol} Devnet SOL · requires receiver
                    verification and food-bank approval. Demo actions do not
                    earn tokens.
                  </p>
                  <Button
                    className="w-full"
                    disabled={
                      expired ||
                      other ||
                      m.stage === "delivered" ||
                      update.isPending ||
                      !world.viewer
                    }
                    variant={mine ? "outline" : "default"}
                    onClick={() =>
                      update.mutate({ fridgeId: m.id, join: !mine })
                    }
                  >
                    <Flag />
                    {mine ? "Leave mission" : "Join rescue"}
                  </Button>
                  {mine && !other && m.stage !== "delivered" && (
                    <Button
                      className="w-full"
                      disabled={expired || update.isPending}
                      onClick={() =>
                        update.mutate({
                          fridgeId: m.id,
                          action: m.stage === "open" ? "pickup" : "deliver",
                        })
                      }
                    >
                      {m.stage === "open" ? <Truck /> : <PackageCheck />}
                      {m.stage === "open"
                        ? "Simulate pickup"
                        : "Simulate receiving confirmation"}
                    </Button>
                  )}
                  {m.stage === "delivered" && (
                    <p className="text-sm text-evergreen">
                      Demo delivery complete · no verified reward issued.
                    </p>
                  )}
                </PanelBody>
              </Panel>
            );
          })}
      </div>
      <p className="text-xs text-muted-foreground">
        These sites, deadlines and rewards are examples. A volunteer button
        cannot verify a real donation or authorize a payout.
      </p>
      <details className="rounded-xl border bg-card p-5">
        <summary className="cursor-pointer font-medium">
          Community fridge refills
        </summary>
        <div className="mt-6">
          <CommunityHub view="missions" />
        </div>
      </details>
    </div>
  );
}
