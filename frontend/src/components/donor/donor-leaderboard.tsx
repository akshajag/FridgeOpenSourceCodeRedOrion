"use client";

import { useMemo, useState } from "react";
import { Award, Trophy } from "lucide-react";
import type { CommunityEvent, LeaderboardEvent } from "@/types";
import { SCORING } from "@/types";
import { useFridgeyData } from "@/lib/data/use-fridgey-data";
import { buildLeaderboard, DAY_MS, formatDate, formatRelative, type LeaderboardRow } from "@/lib/data/derived";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoTag } from "@/components/shared/demo-notice";

type Period = "week" | "30d" | "all";

export function DonorLeaderboard() {
  return (
    <DataGate>
      <LeaderboardContent />
    </DataGate>
  );
}

/** Rows limited to donations made at an event's fridges during the event window. */
function buildEventLeaderboard(data: ReturnType<typeof useFridgeyData>["data"], event: CommunityEvent, sinceMs?: number): LeaderboardRow[] {
  const now = Date.now();
  const since = sinceMs ? now - sinceMs : 0;
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  const donationById = new Map(data.donations.map((d) => [d.id, d]));
  const rows = new Map<string, LeaderboardRow>();
  for (const ev of data.leaderboard as LeaderboardEvent[]) {
    const at = new Date(ev.at).getTime();
    if (at < since) continue;
    const d = donationById.get(ev.donationId);
    if (!d || !event.fridgeIds.includes(d.fridgeId)) continue;
    const when = new Date(d.verifiedAt ?? ev.at).getTime();
    if (when < start || when > end) continue;
    const user = data.users.find((u) => u.id === ev.userId);
    if (!user) continue;
    const row = rows.get(ev.userId) ?? { user, points: 0, acceptedDonations: 0, rank: 0 };
    row.points += ev.points;
    if (!ev.reason.startsWith("Completed mission")) row.acceptedDonations += 1;
    if (!row.lastActivity || ev.at > row.lastActivity) row.lastActivity = ev.at;
    rows.set(ev.userId, row);
  }
  return Array.from(rows.values())
    .sort((a, b) => b.points - a.points || a.user.name.localeCompare(b.user.name))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

function LeaderboardContent() {
  const { data, mode, currentUserId } = useFridgeyData();
  const [period, setPeriod] = useState<Period>("all");
  const [scope, setScope] = useState<string>("community");

  const events = useMemo(() => data.events.filter((e) => e.status === "published" || e.status === "closed").sort((a, b) => b.startsAt.localeCompare(a.startsAt)), [data.events]);
  const sinceMs = period === "week" ? 7 * DAY_MS : period === "30d" ? 30 * DAY_MS : undefined;
  const scopedEvent = events.find((e) => e.id === scope);

  const rows = useMemo(() => (scopedEvent ? buildEventLeaderboard(data, scopedEvent, sinceMs) : buildLeaderboard(data, { sinceMs })), [data, scopedEvent, sinceMs]);
  const me = rows.find((r) => r.user.id === currentUserId);
  const completedMissionIds = useMemo(() => new Set(data.missions.filter((m) => m.status === "completed").map((m) => m.id)), [data.missions]);
  const rewardEligible = useMemo(() => new Set(data.rewards.filter((r) => completedMissionIds.has(r.missionId)).map((r) => r.userId)), [data.rewards, completedMissionIds]);

  const periodLabel = period === "week" ? "this week" : period === "30d" ? "the last 30 days" : "all time";

  return (
    <div className="space-y-6">
      <PageHeader title="Leaderboard" description="Recognition for verified donations across the community. Scores only count food that a fridge operator checked in." meta={mode === "demo" ? <DemoTag /> : undefined} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Panel tone="sage">
            <PanelBody className="pt-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-full bg-card text-evergreen-deep shadow-panel" aria-hidden="true">
                    <Trophy className="size-5" />
                  </div>
                  <div>
                    <div className="text-[12px] text-muted-foreground">Your standing · {scopedEvent ? scopedEvent.name : "community-wide"}, {periodLabel}</div>
                    {me ? (
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="readout text-[28px] font-semibold leading-none text-foreground">#{me.rank}</span>
                        <span className="tnum text-[14px] text-foreground">
                          {me.points.toLocaleString()} points · {me.acceptedDonations} accepted {me.acceptedDonations === 1 ? "donation" : "donations"}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[14px] text-foreground">No verified donations in this view yet.</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="lb-period" className="text-[12px]">
                      Period
                    </Label>
                    <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                      <SelectTrigger id="lb-period" size="sm" className="bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">This week</SelectItem>
                        <SelectItem value="30d">30 days</SelectItem>
                        <SelectItem value="all">All time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lb-scope" className="text-[12px]">
                      Scope
                    </Label>
                    <Select value={scope} onValueChange={setScope}>
                      <SelectTrigger id="lb-scope" size="sm" className="max-w-[220px] bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="community">Community-wide</SelectItem>
                        {events.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name} ({e.status === "closed" ? "closed" : "live"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {scopedEvent && (
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Counting verified donations to {scopedEvent.fridgeIds.length} event {scopedEvent.fridgeIds.length === 1 ? "fridge" : "fridges"} between {formatDate(scopedEvent.startsAt)} and {formatDate(scopedEvent.endsAt)}.
                </p>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Top donors" description={`${rows.length} ${rows.length === 1 ? "donor" : "donors"} with verified points`} />
            <PanelBody flush>
              {rows.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState compact icon={<Trophy />} title="No verified donations yet" description="Once operators check in donations for this period, donors appear here." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14 pl-5">Rank</TableHead>
                        <TableHead>Donor</TableHead>
                        <TableHead className="text-right">Verified points</TableHead>
                        <TableHead className="text-right">Accepted</TableHead>
                        <TableHead>Last activity</TableHead>
                        <TableHead className="pr-5">Rewards</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const isMe = r.user.id === currentUserId;
                        return (
                          <TableRow key={r.user.id} className={cn(isMe && "bg-sage/50 hover:bg-sage/60")} aria-current={isMe ? "true" : undefined}>
                            <TableCell className="tnum pl-5 font-medium">{r.rank}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-2.5">
                                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold", isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")} aria-hidden="true">
                                  {r.user.initials}
                                </span>
                                <span className="font-medium text-foreground">
                                  {r.user.name}
                                  {isMe && <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">(you)</span>}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="tnum text-right font-medium">{r.points.toLocaleString()}</TableCell>
                            <TableCell className="tnum text-right">{r.acceptedDonations}</TableCell>
                            <TableCell className="text-muted-foreground">{r.lastActivity ? formatRelative(r.lastActivity) : "–"}</TableCell>
                            <TableCell className="pr-5">
                              {rewardEligible.has(r.user.id) ? (
                                <span className="inline-flex items-center gap-1 text-[12px] text-evergreen-deep">
                                  <Award className="size-3.5" aria-hidden="true" /> Eligible for reward
                                </span>
                              ) : (
                                <span className="text-[12px] text-muted-foreground">–</span>
                              )}
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

        <aside className="min-w-0">
          <Panel className="lg:sticky lg:top-6">
            <PanelHeader title="How scoring works" />
            <PanelBody>
              <ul className="space-y-3 text-[13px] leading-snug text-foreground">
                <li className="flex gap-3">
                  <span className="readout w-10 shrink-0 text-[20px] font-semibold text-evergreen-deep">+{SCORING.pointsPerAcceptedUnit}</span>
                  <span>
                    points per unit of an <strong className="font-medium">accepted</strong> donation (a carton, a pound, a meal).
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="readout w-10 shrink-0 text-[20px] font-semibold text-evergreen-deep">+{SCORING.missionCompletionBonus}</span>
                  <span>bonus for the donation that completes a mission&apos;s goal.</span>
                </li>
                <li className="flex gap-3">
                  <span className="readout w-10 shrink-0 text-[20px] font-semibold text-muted-foreground">0</span>
                  <span>for proposed or delivered donations that haven&apos;t been verified. Rejected donations earn nothing.</span>
                </li>
              </ul>
              <p className="mt-4 border-t border-border pt-3 text-[12px] leading-snug text-muted-foreground">Every acceptance is recorded by the fridge operator who checked the item in. &ldquo;Eligible for reward&rdquo; means the donor holds a reward allocation on a mission that reached its goal; payouts are handled on the Rewards page.</p>
            </PanelBody>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
