"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CalendarRange, Coins, Compass, Flag, HeartHandshake, LocateFixed, Trophy } from "lucide-react";
import type { Mission } from "@/types";
import { useFridgeyData } from "@/lib/data/use-fridgey-data";
import { activeInventory, buildLeaderboard, distanceKm, formatDate, formatRelative, fridgeById, organizationById, userById } from "@/lib/data/derived";
import { Button } from "@/components/ui/button";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { Row, Rows } from "@/components/shared/inline-list";
import { StatusDot, fridgeStatusLabel, fridgeStatusTone } from "@/components/shared/status-dot";
import { DemoTag } from "@/components/shared/demo-notice";
import { MissionCard } from "@/components/missions/mission-card";
import { MissionDetailSheet } from "@/components/missions/mission-detail-sheet";
import { DonationStatus } from "@/components/missions/donation-status";
import { useNow } from "@/components/missions/use-now";
import { useDonorCenter } from "./use-donor-center";
import { anonymizeName, firstName, formatDistance, formatSol } from "./format";

const REWARD_STATUS_LABEL: Record<string, string> = {
  eligible: "Eligible",
  pending_verification: "Pending verification",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
};

export function DonorOverview() {
  return (
    <DataGate>
      <OverviewContent />
    </DataGate>
  );
}

function OverviewContent() {
  const { data, actions, mode, currentUserId } = useFridgeyData();
  const home = useDonorCenter();
  const now = useNow();
  const [detail, setDetail] = useState<Mission | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const user = userById(data, currentUserId);
  const leaderboard = useMemo(() => buildLeaderboard(data), [data]);
  const myRow = leaderboard.find((r) => r.user.id === currentUserId);

  const openMissions = useMemo(() => data.missions.filter((m) => m.status === "open").sort((a, b) => a.deadline.localeCompare(b.deadline)), [data.missions]);
  const nearbyFridges = useMemo(
    () =>
      data.fridges
        .map((f) => ({ fridge: f, km: distanceKm(home.center, f.location), items: activeInventory(data, f.id).filter((i) => i.status === "available").reduce((s, i) => s + i.quantity, 0) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, 4),
    [data, home.center],
  );
  const myDonations = useMemo(() => data.donations.filter((d) => d.donorUserId === currentUserId).sort((a, b) => b.proposedAt.localeCompare(a.proposedAt)).slice(0, 5), [data.donations, currentUserId]);
  const upcomingEvents = useMemo(() => data.events.filter((e) => e.status === "published" && new Date(e.endsAt).getTime() > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [data.events, now]);
  const myRewards = useMemo(() => data.rewards.filter((r) => r.userId === currentUserId), [data.rewards, currentUserId]);
  const rewardSummary = useMemo(() => {
    const byStatus = new Map<string, { count: number; sol: number }>();
    for (const r of myRewards) {
      const cur = byStatus.get(r.status) ?? { count: 0, sol: 0 };
      cur.count += 1;
      cur.sol += r.amountSol;
      byStatus.set(r.status, cur);
    }
    return ["eligible", "pending_verification", "approved", "paid", "rejected"].filter((s) => byStatus.has(s)).map((s) => ({ status: s, ...byStatus.get(s)! }));
  }, [myRewards]);
  const communityActivity = useMemo(
    () =>
      data.donations
        .filter((d) => d.status === "accepted")
        .sort((a, b) => (b.verifiedAt ?? b.proposedAt).localeCompare(a.verifiedAt ?? a.proposedAt))
        .slice(0, 6),
    [data.donations],
  );

  async function toggleJoin(m: Mission) {
    const joined = m.participantUserIds.includes(currentUserId);
    setBusyId(m.id);
    try {
      if (joined) {
        await Promise.resolve(actions.leaveMission(m.id, currentUserId));
        toast.success("Left the mission");
      } else {
        await Promise.resolve(actions.joinMission(m.id, currentUserId));
        toast.success("You joined the mission", { description: m.title });
      }
    } catch (err) {
      toast.error("Couldn't update the mission", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyId(null);
    }
  }

  const name = user ? firstName(user.name) : "there";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${name}`}
        description="Here's what your neighborhood needs this week. Every drop-off is checked in by a fridge operator, so your points reflect food that really arrived."
        meta={mode === "demo" ? <DemoTag /> : undefined}
        actions={
          <div className="flex items-center gap-5 rounded-xl border border-border bg-card px-4 py-3 shadow-panel">
            <div>
              <div className="text-[12px] text-muted-foreground">Verified points</div>
              <div className="readout text-[26px] font-semibold leading-none text-foreground">{(myRow?.points ?? 0).toLocaleString()}</div>
            </div>
            <div className="h-8 w-px bg-border" aria-hidden="true" />
            <div>
              <div className="text-[12px] text-muted-foreground">Community rank</div>
              <div className="readout text-[26px] font-semibold leading-none text-foreground">{myRow ? `#${myRow.rank}` : "–"}</div>
            </div>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/dashboard/donor/leaderboard">
                <Trophy data-icon="inline-start" /> Leaderboard
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel>
          <PanelHeader
            title="Missions near you"
            description="Open requests from local food banks, soonest deadline first."
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/donor/missions">
                  See all <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            }
          />
          <PanelBody>
            {openMissions.length === 0 ? (
              <EmptyState compact icon={<Flag />} title="No open missions right now" description="Check back soon, or find a fridge nearby and donate directly." />
            ) : (
              <div className="grid gap-3">
                {openMissions.slice(0, 3).map((m) => {
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
                      className="shadow-none"
                    />
                  );
                })}
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Nearby fridges"
            description={
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span>Measured from {home.label.toLowerCase()}.</span>
                {home.supported && home.source === "demo" && (
                  <button type="button" onClick={home.locate} disabled={home.locating} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline disabled:opacity-60">
                    <LocateFixed className="size-3.5" aria-hidden="true" /> {home.locating ? "Locating…" : "Use my location"}
                  </button>
                )}
              </span>
            }
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/donor/find">
                  <Compass data-icon="inline-start" /> Find
                </Link>
              </Button>
            }
          />
          {home.error && <p className="px-5 pb-2 text-[12px] text-amber">{home.error}</p>}
          <PanelBody flush>
            <Rows>
              {nearbyFridges.map(({ fridge, km, items }) => (
                <Row key={fridge.id} trailing={<span className="tnum text-[13px] text-muted-foreground">{km < 10 ? km.toFixed(1) : Math.round(km)} km</span>}>
                  <Link href={`/dashboard/donor/find?fridge=${fridge.id}`} className="block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">
                    <div className="truncate text-[14px] font-medium text-foreground">{fridge.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                      <span>{fridge.neighborhood}</span>
                      <StatusDot tone={fridgeStatusTone(fridge.status)} label={fridgeStatusLabel(fridge.status)} className="text-[12px] text-muted-foreground" />
                      <span className="tnum">
                        {items} {items === 1 ? "item" : "items"} available
                      </span>
                    </div>
                  </Link>
                </Row>
              ))}
            </Rows>
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel>
          <PanelHeader title="Your recent donations" description="Status updates come from the fridge operator." />
          <PanelBody flush>
            {myDonations.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState compact icon={<HeartHandshake />} title="No donations yet" description="Join a mission or pick a fridge to make your first drop-off." action={<Button asChild size="sm"><Link href="/dashboard/donor/find">Find a fridge</Link></Button>} />
              </div>
            ) : (
              <Rows>
                {myDonations.map((d) => {
                  const fridge = fridgeById(data, d.fridgeId);
                  return (
                    <Row key={d.id}>
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium text-foreground">
                            {d.quantity} {d.unit} · {d.itemName}
                          </div>
                          <div className="text-[12px] text-muted-foreground">
                            {fridge?.name ?? "Fridge"} · {formatRelative(d.proposedAt)}
                          </div>
                        </div>
                        <DonationStatus donation={d} />
                      </div>
                    </Row>
                  );
                })}
              </Rows>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Upcoming events" description="Community drives you can take part in." />
          <PanelBody flush>
            {upcomingEvents.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState compact icon={<CalendarRange />} title="Nothing scheduled" description="Food banks publish events here when a drive is coming up." />
              </div>
            ) : (
              <Rows>
                {upcomingEvents.map((e) => (
                  <Row key={e.id}>
                    <div className="text-[14px] font-medium text-foreground">{e.name}</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                      {formatDate(e.startsAt)} – {formatDate(e.endsAt)} · goal {e.donationGoal.toLocaleString()} items · {organizationById(data, e.organizationId)?.name}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] text-foreground/80">{e.description}</p>
                  </Row>
                ))}
              </Rows>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Available rewards"
            description="Rewards come from food banks after a mission is verified complete."
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/donor/rewards">
                  <Coins data-icon="inline-start" /> Rewards
                </Link>
              </Button>
            }
          />
          <PanelBody flush>
            {rewardSummary.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState compact icon={<Coins />} title="No rewards yet" description="Complete a mission with a reward attached to earn one." />
              </div>
            ) : (
              <Rows>
                {rewardSummary.map((r) => (
                  <Row key={r.status} trailing={<span className="tnum text-[13px] font-medium text-foreground">{formatSol(r.sol)}</span>}>
                    <div className="text-[14px] text-foreground">{REWARD_STATUS_LABEL[r.status] ?? r.status}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {r.count} {r.count === 1 ? "allocation" : "allocations"}
                    </div>
                  </Row>
                ))}
              </Rows>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Community activity" description="Recent verified donations across the network." />
          <PanelBody flush>
            {communityActivity.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState compact title="Quiet so far" description="Verified donations from neighbors will show up here." />
              </div>
            ) : (
              <Rows>
                {communityActivity.map((d) => {
                  const donor = userById(data, d.donorUserId);
                  const fridge = fridgeById(data, d.fridgeId);
                  const who = d.donorUserId === currentUserId ? "You" : donor ? anonymizeName(donor.name) : "A neighbor";
                  return (
                    <Row key={d.id} trailing={<span className="text-[12px] text-muted-foreground">{formatRelative(d.verifiedAt ?? d.proposedAt)}</span>}>
                      <p className="text-[13px] leading-snug text-foreground">
                        <span className="font-medium">{who}</span> donated {d.quantity} {d.unit} of {d.itemName.toLowerCase()} to {fridge?.name ?? "a community fridge"}
                      </p>
                    </Row>
                  );
                })}
              </Rows>
            )}
          </PanelBody>
        </Panel>
      </div>

      <MissionDetailSheet mission={detail} open={detail !== null} onOpenChange={(o) => !o && setDetail(null)} distanceLabel={detail?.location.fridgeId ? formatDistance(home.center, fridgeById(data, detail.location.fridgeId)?.location ?? home.center) : undefined} />
    </div>
  );
}
