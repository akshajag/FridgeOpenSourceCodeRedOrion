"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarRange, Plus, Refrigerator, Trophy } from "lucide-react";
import type { CommunityEvent, EventStatus } from "@/types";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressGauge } from "@/components/shared/progress-gauge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, formatRelative, fridgeById } from "@/lib/data/derived";
import { useFoodBank, useNow } from "./use-food-bank";
import { StatusPill, formatSol } from "./shared";
import { EventFormDialog } from "./event-form-dialog";

const GROUPS: { status: EventStatus; title: string; description: string }[] = [
  { status: "published", title: "Published", description: "Visible to donors. Progress counts verified donations to participating fridges inside the event window." },
  { status: "draft", title: "Drafts", description: "Only your organization can see these." },
  { status: "closed", title: "Closed", description: "Finished events kept for the record." },
];

export function EventsPage() {
  return (
    <DataGate>
      <EventsContent />
    </DataGate>
  );
}

function EventsContent() {
  const { data, actions, organizationId } = useFoodBank();
  const now = useNow();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityEvent | null>(null);
  const [closing, setClosing] = useState<CommunityEvent | null>(null);
  const [deleting, setDeleting] = useState<CommunityEvent | null>(null);

  const events = useMemo(() => data.events.filter((e) => e.organizationId === organizationId), [data.events, organizationId]);
  const grouped = useMemo(() => {
    const map = new Map<EventStatus, CommunityEvent[]>();
    for (const g of GROUPS) map.set(g.status, []);
    for (const e of events) map.get(e.status)?.push(e);
    for (const [status, list] of map) list.sort((a, b) => (status === "closed" ? b.endsAt.localeCompare(a.endsAt) : a.startsAt.localeCompare(b.startsAt)));
    return map;
  }, [events]);

  const publish = (e: CommunityEvent) => {
    if (new Date(e.endsAt).getTime() <= now) {
      toast.error("This event has already ended", { description: "Edit the dates before publishing." });
      return;
    }
    if (e.fridgeIds.length === 0) {
      toast.error("Add at least one participating fridge before publishing.");
      return;
    }
    actions.setEventStatus(e.id, "published");
    toast.success("Event published", { description: `${e.name} is now visible to donors.` });
  };
  const confirmClose = () => {
    if (!closing) return;
    actions.setEventStatus(closing.id, "closed");
    toast.success("Event closed", { description: closing.name });
    setClosing(null);
  };
  const confirmDelete = () => {
    if (!deleting) return;
    actions.deleteEvent(deleting.id);
    toast.success("Draft deleted", { description: deleting.name });
    setDeleting(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Community events"
        description="Time-boxed drives across several fridges, with a shared goal, a leaderboard and optional prizes."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" /> Create event</Button>}
      />

      {events.length === 0 ? (
        <EmptyState icon={<CalendarRange />} title="No events yet" description="Rally donors around a week-long push: pick the fridges, set a goal, and let the leaderboard do the rest." action={<Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" /> Create event</Button>} />
      ) : (
        GROUPS.map((g) => {
          const list = grouped.get(g.status)!;
          if (list.length === 0) return null;
          return (
            <section key={g.status} className="space-y-3">
              <div>
                <h2 className="font-display text-[17px] font-semibold">{g.title} <span className="tnum text-muted-foreground">({list.length})</span></h2>
                <p className="text-[13px] text-muted-foreground">{g.description}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {list.map((e) => (
                  <EventCard key={e.id} event={e} now={now} onEdit={() => setEditing(e)} onPublish={() => publish(e)} onClose={() => setClosing(e)} onDelete={() => setDeleting(e)} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {createOpen && <EventFormDialog open onOpenChange={(o) => { if (!o) setCreateOpen(false); }} />}
      {editing && <EventFormDialog key={editing.id} open onOpenChange={(o) => { if (!o) setEditing(null); }} event={editing} />}

      <Dialog open={Boolean(closing)} onOpenChange={(o) => { if (!o) setClosing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close this event?</DialogTitle>
            <DialogDescription>{closing?.name} will stop counting new donations and leave donors&apos; event lists. The leaderboard and results are kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>Keep it running</Button>
            <Button variant="destructive" onClick={confirmClose}>Close event</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>{deleting?.name} has not been published. Deleting it cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Keep draft</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventCard({ event: e, now, onEdit, onPublish, onClose, onDelete }: { event: CommunityEvent; now: number; onEdit: () => void; onPublish: () => void; onClose: () => void; onDelete: () => void }) {
  const { data } = useFoodBank();
  const start = new Date(e.startsAt).getTime();
  const end = new Date(e.endsAt).getTime();
  const fridges = e.fridgeIds.map((id) => fridgeById(data, id)).filter(Boolean);

  const progress = useMemo(() => {
    const ids = new Set(e.fridgeIds);
    let qty = 0;
    const donors = new Set<string>();
    for (const d of data.donations) {
      if (d.status !== "accepted" || !d.verifiedAt || !ids.has(d.fridgeId)) continue;
      const t = new Date(d.verifiedAt).getTime();
      if (t < start || t > end) continue;
      qty += d.quantity;
      donors.add(d.donorUserId);
    }
    return { qty, donors: donors.size };
  }, [data.donations, e.fridgeIds, start, end]);

  const window = now < start ? `Starts ${formatRelative(e.startsAt, now)}` : now > end ? `Ended ${formatRelative(e.endsAt, now)}` : `Ends ${formatRelative(e.endsAt, now)}`;
  const live = e.status === "published" && now >= start && now <= end;

  return (
    <Panel as="article">
      <PanelHeader
        title={e.name}
        description={`${formatDate(e.startsAt)} to ${formatDate(e.endsAt)} · ${window}`}
        action={<StatusPill kind="event" status={e.status} className="text-[12px]" />}
      />
      <PanelBody className="space-y-4">
        <p className="text-[13px] leading-relaxed text-muted-foreground">{e.description}</p>
        <ProgressGauge value={progress.qty} max={e.donationGoal} unit="items" tone={progress.qty >= e.donationGoal ? "ok" : live ? "sensor" : "ok"} label={now < start ? "Window not open yet" : `${progress.donors} ${progress.donors === 1 ? "donor" : "donors"} · ${Math.min(100, Math.round((progress.qty / e.donationGoal) * 100))}%`} />
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="flex items-center gap-1.5 text-muted-foreground"><Refrigerator className="size-3.5" aria-hidden="true" />Fridges</dt>
          <dd>{fridges.length === 0 ? <span className="text-muted-foreground">None selected</span> : fridges.map((f) => f!.name).join(", ")}</dd>
          <dt className="text-muted-foreground">Eligible</dt>
          <dd className="flex flex-wrap gap-1">{e.eligibleItems.map((item) => <span key={item} className="rounded-md border border-sage-deep bg-sage/50 px-1.5 py-0.5 text-[12px] text-evergreen-deep">{item}</span>)}</dd>
          <dt className="flex items-center gap-1.5 text-muted-foreground"><Trophy className="size-3.5" aria-hidden="true" />Prizes</dt>
          <dd>{e.prizeWinners > 0 ? `${e.prizeWinners} ${e.prizeWinners === 1 ? "winner" : "winners"} share ${formatSol(e.prizeBudgetSol)}` : "No prizes"} · ranked by {e.leaderboardRule === "verified_points" ? "verified points" : "verified quantity"}</dd>
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {e.status !== "closed" && <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>}
          {e.status === "draft" && <Button size="sm" onClick={onPublish}>Publish</Button>}
          {e.status === "draft" && <Button variant="ghost" size="sm" onClick={onDelete}>Delete draft</Button>}
          {e.status === "published" && <Button variant="ghost" size="sm" onClick={onClose}>Close event</Button>}
        </div>
      </PanelBody>
    </Panel>
  );
}
