"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MapPinned,
  ArrowUpRight,
  HeartHandshake,
  Flag,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelHeader, PanelBody } from "@/components/shared/panel";
import { Button } from "@/components/ui/button";
import {
  missions,
  standings,
  type CommunityWorld,
} from "@/lib/community/model";
import { toast } from "sonner";

async function load() {
  const response = await fetch("/api/community", { cache: "no-store" });
  if (!response.ok) throw new Error("Community data is unavailable.");
  return response.json() as Promise<CommunityWorld>;
}
export function CommunityHub({
  view = "overview",
}: {
  view?: "overview" | "missions";
}) {
  const client = useQueryClient();
  const { data: world, error } = useQuery({
    queryKey: ["community-demo"],
    queryFn: load,
    refetchInterval: 5000,
  });
  const [filter, setFilter] = useState("all");
  const update = useMutation({
    mutationFn: async ({
      fridgeId,
      join,
    }: {
      fridgeId: string;
      join: boolean;
    }) => {
      const response = await fetch("/api/community", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fridgeId, join }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not update mission.");
      return payload as CommunityWorld;
    },
    onSuccess: (next) => {
      client.setQueryData(["community-demo"], next);
      toast.success("Your missions updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (error)
    return (
      <p role="alert">Community data couldn’t load. Refresh to try again.</p>
    );
  if (!world)
    return (
      <p role="status" className="py-16">
        Loading your community…
      </p>
    );
  const joined = world.viewer?.joined ?? [];
  const open = missions(world);
  const completed = world.fridges.filter(
    (f) => f.stock >= 32 && joined.includes(f.id),
  );
  const activity = world.refills.filter((e) => e.actorId === world.viewer?.id);
  const units = activity.reduce((n, e) => n + e.units, 0);
  const ranks = standings(world);
  const shown = open.filter(
    (m) =>
      filter === "all" ||
      (filter === "mine" && joined.includes(m.id)) ||
      (filter === "urgent" && m.fridge.stock < 16),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title={
          view === "missions"
            ? "Refill missions"
            : `Welcome${world.viewer?.name ? `, ${world.viewer.name.split(" ")[0]}` : " to Nourish"}`
        }
        description={
          view === "missions"
            ? "Join a local refill, bring the requested food, and grow your crew’s impact."
            : "Your community at a glance. Find your next act of care."
        }
        meta={
          <span className="rounded-md border border-amber/40 bg-amber-soft px-2 py-1 text-xs text-amber">
            CodeRED: Orion · community demo
          </span>
        }
      />
      <div className="rounded-xl border bg-sage/40 p-5">
        <p className="text-sm font-medium">
          CodeRED: Orion community challenge
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Built for the hackathon with MLH sponsor context. Locations, crew
          activity, and volunteer names are fictional demo data; your signed-in
          participation is saved on this demo server.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Your food supplied", `${units} units`],
          [
            "Your active missions",
            String(open.filter((m) => joined.includes(m.id)).length),
          ],
          [
            "Community needs",
            `${open.filter((m) => m.fridge.stock < 16).length} priority fridges`,
          ],
        ].map(([label, value]) => (
          <Panel key={label}>
            <PanelBody className="pt-5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="readout mt-2 text-3xl font-semibold">{value}</p>
            </PanelBody>
          </Panel>
        ))}
      </div>
      {view === "overview" ? (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Your next refill"
                description="Start with a fridge where food is running low."
              />
              <PanelBody className="space-y-4">
                {open
                  .slice()
                  .sort((a, b) => a.fridge.stock - b.fridge.stock)
                  .slice(0, 3)
                  .map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-4 rounded-lg border p-4"
                    >
                      <div>
                        <p className="font-medium">{m.fridge.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {m.fridge.need} · {m.remaining} units to goal
                        </p>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link href="/dashboard/donor/missions">
                          Join mission <ArrowUpRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  ))}
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader
                title="Explore & make an impact"
                description="A shared city map, connected territories, and friendly crew competition."
              />
              <PanelBody className="space-y-4">
                <div className="rounded-lg bg-sage p-5">
                  <MapPinned className="mb-3 size-7 text-evergreen" />
                  <p className="font-medium">Houston is your game board</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Supply food to earn connected territory around your crew’s
                    home base. Your contribution also fills a real need in the
                    demo inventory.
                  </p>
                  <Button asChild className="mt-4">
                    <Link href="/dashboard/donor/find">
                      Open community map <ArrowUpRight />
                    </Link>
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <Trophy className="text-amber" />
                  <p className="text-sm">
                    <strong>{ranks[0].name}</strong> leads with {ranks[0].units}{" "}
                    food units and {ranks[0].territories} map cells.
                  </p>
                </div>
              </PanelBody>
            </Panel>
          </div>
          <Panel>
            <PanelHeader
              title="Your recent activity"
              description="Only refills made by this signed-in account."
            />
            <PanelBody>
              {activity.length ? (
                activity.slice(0, 5).map((e) => (
                  <p key={e.id} className="py-2 text-sm">
                    You supplied {e.units} units to{" "}
                    {world.fridges.find((f) => f.id === e.fridgeId)?.name}.
                  </p>
                ))
              ) : (
                <div className="flex items-center gap-3 py-3">
                  <HeartHandshake className="text-evergreen" />
                  <p className="text-sm text-muted-foreground">
                    Your first refill starts your impact story. Join a mission
                    to begin.
                  </p>
                </div>
              )}
            </PanelBody>
          </Panel>
        </>
      ) : (
        <>
          <div
            role="group"
            aria-label="Filter missions"
            className="flex flex-wrap gap-2"
          >
            {[
              ["all", "All missions"],
              ["urgent", "Priority"],
              ["mine", "My missions"],
            ].map(([id, label]) => (
              <Button
                key={id}
                variant={filter === id ? "default" : "outline"}
                onClick={() => setFilter(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((m) => (
              <Panel key={m.id}>
                <PanelHeader title={m.title} description={m.fridge.name} />
                <PanelBody className="space-y-4">
                  <div className="flex justify-between text-xs">
                    <span
                      className={
                        m.urgency === "Urgent" ? "text-critical" : "text-amber"
                      }
                    >
                      {m.urgency}
                    </span>
                    <span>
                      {joined.includes(m.id)
                        ? "You’re participating"
                        : "Open to everyone"}
                    </span>
                  </div>
                  <p className="text-sm">
                    Bring <strong>{m.fridge.need.toLowerCase()}</strong>.
                  </p>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{m.fridge.stock} / 32 unit goal</span>
                      <span>{m.remaining} needed</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-evergreen transition-all"
                        style={{ width: `${m.progress}%` }}
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    variant={joined.includes(m.id) ? "outline" : "default"}
                    disabled={update.isPending || !world.viewer}
                    onClick={() =>
                      update.mutate({
                        fridgeId: m.id,
                        join: !joined.includes(m.id),
                      })
                    }
                  >
                    <Flag className="size-4" />
                    {joined.includes(m.id) ? "Leave mission" : "Join mission"}
                  </Button>
                  {joined.includes(m.id) && (
                    <Button asChild variant="outline" className="w-full">
                      <Link href={`/dashboard/donor/find?fridge=${m.id}`}>
                        Record a demo refill <ArrowUpRight />
                      </Link>
                    </Button>
                  )}
                </PanelBody>
              </Panel>
            ))}
          </div>
          {!shown.length && (
            <Panel>
              <PanelBody className="py-8 text-center text-sm text-muted-foreground">
                {filter === "mine"
                  ? completed.length
                    ? "Your joined missions reached their goals. See Completed together below, or join a new refill effort."
                    : "You haven’t joined an active mission yet. Browse All missions and pick a fridge."
                  : "No missions match this filter."}
              </PanelBody>
            </Panel>
          )}
          {completed.length > 0 && (
            <Panel>
              <PanelHeader
                title="Completed together"
                description="Joined missions whose community stock reached the 32-unit goal."
              />
              <PanelBody>
                {completed.map((f) => (
                  <p
                    key={f.id}
                    className="flex items-center gap-2 py-2 text-sm"
                  >
                    <CheckCircle2 className="size-4 text-evergreen" />
                    {f.name} · goal reached
                  </p>
                ))}
              </PanelBody>
            </Panel>
          )}
          <p className="text-xs text-muted-foreground">
            Demo refills update stock, mission progress, territory, and crew
            rankings together. No points or cash rewards are issued.
          </p>
        </>
      )}
    </div>
  );
}
