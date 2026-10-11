"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Flag, Plus, Users } from "lucide-react";
import type { Mission, MissionStatus } from "@/types";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressGauge } from "@/components/shared/progress-gauge";
import { CategoryBadge } from "@/components/shared/category-icon";
import { Rows, Row } from "@/components/shared/inline-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDateTime, formatRelative, fridgeById, missionProgress, userById } from "@/lib/data/derived";
import { cn } from "@/lib/utils";
import { useFoodBank, useNow } from "./use-food-bank";
import { StatusPill, deadlineLabel, formatSol } from "./shared";
import { MissionFormDialog } from "./mission-form-dialog";

const GROUPS: { status: MissionStatus; title: string; description: string }[] = [
  { status: "open", title: "Open", description: "Visible to donors. Progress moves only when an operator accepts a donation." },
  { status: "draft", title: "Drafts", description: "Only your organization can see these." },
  { status: "completed", title: "Completed", description: "Goal reached. Reward allocations, if any, are handled under Rewards." },
  { status: "closed", title: "Closed", description: "No longer accepting donations." },
];

export function MissionsPage() {
  return (
    <DataGate>
      <MissionsContent />
    </DataGate>
  );
}

function MissionsContent() {
  const { data, actions, organizationId } = useFoodBank();
  const now = useNow();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Mission | null>(null);
  const [closing, setClosing] = useState<Mission | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const missions = useMemo(() => data.missions.filter((m) => m.organizationId === organizationId), [data.missions, organizationId]);
  const grouped = useMemo(() => {
    const byStatus = new Map<MissionStatus, Mission[]>();
    for (const g of GROUPS) byStatus.set(g.status, []);
    for (const m of missions) byStatus.get(m.status)?.push(m);
    for (const [status, list] of byStatus) {
      list.sort((a, b) => (status === "open" || status === "draft" ? a.deadline.localeCompare(b.deadline) : b.deadline.localeCompare(a.deadline)));
    }
    return byStatus;
  }, [missions]);
  const detail = detailId ? data.missions.find((m) => m.id === detailId) : undefined;

  const publish = (m: Mission) => {
    if (new Date(m.deadline).getTime() <= now) {
      toast.error("Deadline has passed", { description: "Edit the mission and set a future deadline before publishing." });
      return;
    }
    if (m.location.mode === "dropoff" && !m.location.fridgeId) {
      toast.error("Choose a drop-off fridge before publishing.");
      return;
    }
    actions.setMissionStatus(m.id, "open");
    toast.success("Mission published", { description: `${m.title} is now in donors' mission feeds.` });
  };
  const confirmClose = () => {
    if (!closing) return;
    actions.setMissionStatus(closing.id, "closed");
    toast.success("Mission closed", { description: `${closing.title} no longer accepts donations.` });
    setClosing(null);
  };

  const counts = GROUPS.map((g) => `${grouped.get(g.status)!.length} ${g.title.toLowerCase()}`).join(" · ");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rescue missions"
        description={missions.length > 0 ? `Targeted requests to donors for food your network is short on. ${counts}.` : "Targeted requests to donors for food your network is short on."}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" /> Create mission
          </Button>
        }
      />

      {missions.length === 0 ? (
        <EmptyState
          icon={<Flag />}
          title="Start your first rescue mission"
          description="Tell donors exactly what a fridge needs: whole milk before the weekend, produce for the park, meals for seniors. Operators verify each drop-off so progress reflects food that actually arrived."
          action={<Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" /> Create mission</Button>}
        />
      ) : (
        GROUPS.map((g) => {
          const list = grouped.get(g.status)!;
          if (list.length === 0) return null;
          return (
            <Panel key={g.status}>
              <PanelHeader title={`${g.title} (${list.length})`} description={g.description} />
              <PanelBody flush>
                <ul className="divide-y divide-border">
                  {list.map((m) => (
                    <MissionRow key={m.id} mission={m} now={now} onDetail={() => setDetailId(m.id)} onEdit={() => setEditing(m)} onPublish={() => publish(m)} onClose={() => setClosing(m)} />
                  ))}
                </ul>
              </PanelBody>
            </Panel>
          );
        })
      )}

      {createOpen && <MissionFormDialog open onOpenChange={(o) => { if (!o) setCreateOpen(false); }} />}
      {editing && <MissionFormDialog key={editing.id} open onOpenChange={(o) => { if (!o) setEditing(null); }} mission={editing} />}

      <Dialog open={Boolean(closing)} onOpenChange={(o) => { if (!o) setClosing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close this mission?</DialogTitle>
            <DialogDescription>
              {closing?.title} will leave donors&apos; feeds and stop accepting donations. Verified donations, points and any eligible rewards are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>Keep open</Button>
            <Button variant="destructive" onClick={confirmClose}>Close mission</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(detail)} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          {detail && <MissionDetail mission={detail} now={now} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MissionRow({ mission: m, now, onDetail, onEdit, onPublish, onClose }: { mission: Mission; now: number; onDetail: () => void; onEdit: () => void; onPublish: () => void; onClose: () => void }) {
  const { data } = useFoodBank();
  const dl = deadlineLabel(m.deadline, now);
  const fridge = fridgeById(data, m.location.fridgeId);
  const progress = missionProgress(m);
  return (
    <li className="px-5 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-display text-[15px] font-semibold">{m.title}</h3>
            <StatusPill kind="mission" status={m.status} className="text-[12px]" />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <CategoryBadge category={m.category} />
            <span>{m.foodType}</span>
            <span>· {fridge ? fridge.name : m.location.label}</span>
          </div>
          <ProgressGauge className="mt-3 max-w-md" value={m.quantityVerified} max={m.quantityNeeded} unit={m.unit} tone={progress >= 1 ? "ok" : m.status === "open" ? "sensor" : "ok"} label={m.status === "draft" ? "Not published" : undefined} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span className={cn("tnum", m.status === "open" && (dl.overdue ? "font-medium text-critical" : dl.urgent ? "font-medium text-amber" : ""))}>
              {m.status === "open" || m.status === "draft" ? dl.text : `Deadline ${formatDateTime(m.deadline)}`}
            </span>
            <span className="inline-flex items-center gap-1"><Users className="size-3" aria-hidden="true" />{m.participantUserIds.length} {m.participantUserIds.length === 1 ? "participant" : "participants"}</span>
            <span>{m.rewardSol ? `${formatSol(m.rewardSol)} reward` : "Recognition only"}</span>
            {m.completedAt && <span>Completed {formatRelative(m.completedAt, now)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onDetail}>Details</Button>
          {(m.status === "draft" || m.status === "open") && <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>}
          {m.status === "draft" && <Button size="sm" onClick={onPublish}>Publish</Button>}
          {(m.status === "open" || m.status === "completed") && <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>}
        </div>
      </div>
    </li>
  );
}

function MissionDetail({ mission: m, now }: { mission: Mission; now: number }) {
  const { data } = useFoodBank();
  const fridge = fridgeById(data, m.location.fridgeId);
  const donations = data.donations.filter((d) => d.missionId === m.id).sort((a, b) => (b.verifiedAt ?? b.deliveredAt ?? b.proposedAt).localeCompare(a.verifiedAt ?? a.deliveredAt ?? a.proposedAt));
  const participants = m.participantUserIds.map((id) => userById(data, id)).filter(Boolean);
  const dl = deadlineLabel(m.deadline, now);
  return (
    <>
      <SheetHeader>
        <SheetTitle>{m.title}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-3">
          <StatusPill kind="mission" status={m.status} />
          <span>{m.status === "open" ? dl.text : `Deadline ${formatDateTime(m.deadline)}`}</span>
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4 pb-6">
        <ProgressGauge value={m.quantityVerified} max={m.quantityNeeded} unit={m.unit} tone={missionProgress(m) >= 1 ? "ok" : "sensor"} />
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-muted-foreground">Food</dt>
          <dd>{m.foodType}</dd>
          <dt className="text-muted-foreground">Category</dt>
          <dd><CategoryBadge category={m.category} /></dd>
          <dt className="text-muted-foreground">Location</dt>
          <dd>{fridge ? `${fridge.name}, ${fridge.neighborhood}` : m.location.label}</dd>
          <dt className="text-muted-foreground">Reward</dt>
          <dd>{m.rewardSol ? formatSol(m.rewardSol) : "None"}<span className="block text-[12px] text-muted-foreground">{m.rewardCondition}</span></dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{formatDateTime(m.createdAt)}</dd>
        </dl>
        {m.eligibility.length > 0 && (
          <div>
            <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Eligibility</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
              {m.eligibility.map((rule) => <li key={rule}>{rule}</li>)}
            </ul>
          </div>
        )}
        <div>
          <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Participants ({participants.length})</div>
          {participants.length === 0 ? <p className="mt-1 text-[13px] text-muted-foreground">No donors have joined yet.</p> : <p className="mt-1 text-[13px]">{participants.map((u) => u!.name).join(", ")}</p>}
        </div>
        <div>
          <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Donations ({donations.length})</div>
          {donations.length === 0 ? (
            <p className="mt-1 text-[13px] text-muted-foreground">Nothing recorded against this mission yet.</p>
          ) : (
            <Rows className="mt-1.5 rounded-lg border border-border">
              {donations.map((d) => {
                const donor = userById(data, d.donorUserId);
                const verifier = d.verifiedByUserId ? userById(data, d.verifiedByUserId) : undefined;
                return (
                  <Row key={d.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                      <span className="text-[13px] font-medium">{donor?.name ?? "Unknown donor"}</span>
                      <StatusPill kind="donation" status={d.status} short className="text-[12px]" />
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {d.quantity} {d.unit} {d.itemName}
                      {d.verifiedAt && ` · ${d.status === "accepted" ? "verified" : "reviewed"} by ${verifier?.name ?? "operator"} ${formatRelative(d.verifiedAt, now)}`}
                      {d.status === "delivered" && d.deliveredAt && ` · delivered ${formatRelative(d.deliveredAt, now)}, awaiting operator check-in`}
                      {d.status === "proposed" && ` · proposed ${formatRelative(d.proposedAt, now)}`}
                    </div>
                    {d.rejectionReason && <div className="text-[12px] text-critical">{d.rejectionReason}</div>}
                  </Row>
                );
              })}
            </Rows>
          )}
        </div>
      </div>
    </>
  );
}
