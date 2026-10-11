"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Flag, ShieldCheck } from "lucide-react";
import type { Mission } from "@/types";
import { useFridgeyData } from "@/lib/data/use-fridgey-data";
import { fridgeById, organizationById } from "@/lib/data/derived";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoTag } from "@/components/shared/demo-notice";
import { MissionCard } from "@/components/missions/mission-card";
import { MissionDetailSheet } from "@/components/missions/mission-detail-sheet";
import { useDonorCenter } from "./use-donor-center";
import { formatDistance } from "./format";

type Tab = "open" | "joined" | "completed";

export function DonorMissions() {
  return (
    <DataGate>
      <MissionsContent />
    </DataGate>
  );
}

function MissionsContent() {
  const { data, actions, mode, currentUserId } = useFridgeyData();
  const home = useDonorCenter();
  const [tab, setTab] = useState<Tab>("open");
  const [detail, setDetail] = useState<Mission | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const lists = useMemo(() => {
    const byDeadline = (a: Mission, b: Mission) => a.deadline.localeCompare(b.deadline);
    const open = data.missions.filter((m) => m.status === "open").sort(byDeadline);
    const joined = data.missions.filter((m) => m.participantUserIds.includes(currentUserId) && (m.status === "open" || m.status === "completed")).sort(byDeadline);
    const completed = data.missions.filter((m) => m.status === "completed").sort((a, b) => (b.completedAt ?? b.deadline).localeCompare(a.completedAt ?? a.deadline));
    return { open, joined, completed };
  }, [data.missions, currentUserId]);

  async function toggleJoin(m: Mission) {
    const joined = m.participantUserIds.includes(currentUserId);
    setBusyId(m.id);
    try {
      if (joined) {
        await Promise.resolve(actions.leaveMission(m.id, currentUserId));
        toast.success("Left the mission");
      } else {
        await Promise.resolve(actions.joinMission(m.id, currentUserId));
        toast.success("You joined the mission", { description: "Record a proposed donation when you're ready to drop off." });
      }
    } catch (err) {
      toast.error("Couldn't update the mission", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyId(null);
    }
  }

  const renderGrid = (missions: Mission[], empty: { title: string; description: string }) =>
    missions.length === 0 ? (
      <EmptyState icon={<Flag />} title={empty.title} description={empty.description} />
    ) : (
      <div className="grid gap-4 md:grid-cols-2">
        {missions.map((m) => {
          const fridge = fridgeById(data, m.location.fridgeId);
          return (
            <MissionCard
              key={m.id}
              mission={m}
              mode={mode}
              organizationName={organizationById(data, m.organizationId)?.name}
              dropoff={fridge ? { name: fridge.name, neighborhood: fridge.neighborhood } : undefined}
              distanceLabel={fridge ? formatDistance(home.center, fridge.location) : undefined}
              joined={m.participantUserIds.includes(currentUserId)}
              busy={busyId === m.id}
              onJoinToggle={() => toggleJoin(m)}
              onViewDetails={() => setDetail(m)}
            />
          );
        })}
      </div>
    );

  const detailFridge = fridgeById(data, detail?.location.fridgeId);

  return (
    <div className="space-y-6">
      <PageHeader title="Missions" description="Food banks post what their neighbors need most. Join one, drop off at the fridge, and the operator verifies it." meta={mode === "demo" ? <DemoTag /> : undefined} />

      <div className="flex items-start gap-2.5 rounded-lg border border-sage-deep/60 bg-sage/40 px-3.5 py-2.5 text-[13px] leading-snug text-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-evergreen-deep" aria-hidden="true" />
        <p>Only donations verified by the fridge operator count toward missions and points. Propose first, mark it delivered when you drop off, and the operator checks it in.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList aria-label="Mission filter">
          <TabsTrigger value="open" className="px-3">
            All open <span className="tnum text-muted-foreground">{lists.open.length}</span>
          </TabsTrigger>
          <TabsTrigger value="joined" className="px-3">
            Joined <span className="tnum text-muted-foreground">{lists.joined.length}</span>
          </TabsTrigger>
          <TabsTrigger value="completed" className="px-3">
            Completed <span className="tnum text-muted-foreground">{lists.completed.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="mt-2">
          {renderGrid(lists.open, { title: "No open missions", description: "Food banks will post new requests here. In the meantime, any fridge welcomes direct donations." })}
        </TabsContent>
        <TabsContent value="joined" className="mt-2">
          {renderGrid(lists.joined, { title: "You haven't joined a mission yet", description: "Browse the open missions and join one that fits what you can bring." })}
        </TabsContent>
        <TabsContent value="completed" className="mt-2">
          {renderGrid(lists.completed, { title: "No completed missions yet", description: "Finished missions appear here with their final tallies." })}
        </TabsContent>
      </Tabs>

      <MissionDetailSheet mission={detail} open={detail !== null} onOpenChange={(o) => !o && setDetail(null)} distanceLabel={detailFridge ? formatDistance(home.center, detailFridge.location) : undefined} />
    </div>
  );
}
