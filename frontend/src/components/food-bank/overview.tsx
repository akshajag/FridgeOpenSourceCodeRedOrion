"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Boxes, Flag, HandHeart, Refrigerator, Timer } from "lucide-react";
import type { InventoryEvent } from "@/types";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { Rows, Row } from "@/components/shared/inline-list";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressGauge } from "@/components/shared/progress-gauge";
import { StatusDot, fridgeStatusLabel, fridgeStatusTone } from "@/components/shared/status-dot";
import { CategoryIcon } from "@/components/shared/category-icon";
import { DemoNotice } from "@/components/shared/demo-notice";
import { FridgeMapLazy } from "@/components/maps/fridge-map-lazy";
import { Button } from "@/components/ui/button";
import { activeInventory, expiringWithin, formatRelative, fridgeById, itemsNeedingReview, missionProgress, openAlerts, userById } from "@/lib/data/derived";
import { cn } from "@/lib/utils";
import { useFoodBank, useNow } from "./use-food-bank";
import { StatusPill, ViewToggle, deadlineLabel, expiryTone } from "./shared";

const EVENT_LABEL: Record<InventoryEvent["type"], string> = {
  added: "Added",
  removed: "Removed",
  edited: "Edited",
  confirmed: "Confirmed",
  expired: "Expired",
  unconfirmed_removal: "Unconfirmed removal",
  donation_received: "Donation received",
};
const ACTOR_LABEL: Record<InventoryEvent["actor"], string> = { operator: "operator", camera: "camera", donor: "donor", system: "system" };

export function FoodBankOverview() {
  return (
    <DataGate>
      <OverviewContent />
    </DataGate>
  );
}

function OverviewContent() {
  const { data, mode, organization, organizationId, connected, connectedIds } = useFoodBank();
  const now = useNow();
  const [view, setView] = useState<"map" | "list">("map");
  const [mapFailed, setMapFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const inventoryShared = useMemo(() => connected.filter((c) => c.sharing.inventory), [connected]);
  const notSharingInventory = connected.length - inventoryShared.length;

  const stats = useMemo(() => {
    const online = connected.filter((c) => c.fridge.status === "online").length;
    const degraded = connected.filter((c) => c.fridge.status === "degraded").length;
    const offline = connected.filter((c) => c.fridge.status === "offline").length;
    let available = 0;
    let review = 0;
    let expiring = 0;
    for (const c of inventoryShared) {
      available += activeInventory(data, c.fridge.id).reduce((s, i) => s + i.quantity, 0);
      review += itemsNeedingReview(data, c.fridge.id).length;
      expiring += expiringWithin(data, 48, c.fridge.id, now).length;
    }
    return { online, degraded, offline, available, review, expiring };
  }, [connected, inventoryShared, data, now]);

  const activeMissions = useMemo(
    () => data.missions.filter((m) => m.organizationId === organizationId && m.status === "open").sort((a, b) => a.deadline.localeCompare(b.deadline)),
    [data.missions, organizationId],
  );

  const orgMissionIds = useMemo(() => new Set(data.missions.filter((m) => m.organizationId === organizationId).map((m) => m.id)), [data.missions, organizationId]);
  const recentDonations = useMemo(
    () =>
      data.donations
        .filter((d) => connectedIds.has(d.fridgeId) || (d.missionId && orgMissionIds.has(d.missionId)))
        .map((d) => ({ d, at: d.verifiedAt ?? d.deliveredAt ?? d.proposedAt }))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 7),
    [data.donations, connectedIds, orgMissionIds],
  );

  const expirations = useMemo(
    () =>
      inventoryShared
        .flatMap((c) => expiringWithin(data, 48, c.fridge.id, now).map((item) => ({ item, fridge: c.fridge })))
        .sort((a, b) => a.item.expiresAt!.localeCompare(b.item.expiresAt!))
        .slice(0, 10),
    [inventoryShared, data, now],
  );

  const activity = useMemo(() => {
    const ids = new Set(inventoryShared.map((c) => c.fridge.id));
    return data.inventoryEvents
      .filter((e) => ids.has(e.fridgeId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 12);
  }, [inventoryShared, data.inventoryEvents]);

  const fridges = connected.map((c) => c.fridge);
  const showMap = view === "map" && !mapFailed;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        meta={organization ? `${organization.name} · ${organization.city}` : undefined}
        description={`${connected.length} connected ${connected.length === 1 ? "fridge" : "fridges"}, ${activeMissions.length} open ${activeMissions.length === 1 ? "mission" : "missions"}. Everything here comes from operators who approved a connection with your organization.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/food-bank/nearby">Find fridges</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/food-bank/missions">New mission</Link>
            </Button>
          </>
        }
      />

      {mode === "demo" && (
        <DemoNotice>
          You&apos;re viewing a synthetic Houston network. Fridges, inventory, donations and sensor readings are generated for the demo; nothing here reflects a real refrigerator.
        </DemoNotice>
      )}

      {/* Network status strip */}
      <Panel>
        <PanelBody className="px-5 py-4">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="min-w-0">
              <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Connected fridges</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="readout text-[28px] font-semibold leading-none">{connected.length}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <StatusDot tone="ok" label={`${stats.online} online`} />
                  <StatusDot tone="warning" label={`${stats.degraded} degraded`} />
                  <StatusDot tone="critical" label={`${stats.offline} offline`} />
                </span>
              </div>
            </div>
            <InlineStat label="Items available" value={stats.available} hint={notSharingInventory > 0 ? `${notSharingInventory} ${notSharingInventory === 1 ? "fridge" : "fridges"} not sharing inventory` : "Across fridges sharing inventory"} />
            <InlineStat label="Flagged for review" value={stats.review} tone={stats.review > 0 ? "warning" : "default"} hint="Camera recognitions awaiting operator confirmation" />
            <InlineStat label="Expiring within 48h" value={stats.expiring} tone={stats.expiring > 0 ? "warning" : "default"} hint="By recorded best-by date" />
          </div>
        </PanelBody>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Map + fridge list */}
        <Panel className="lg:col-span-3">
          <PanelHeader title="Connected fridges" description="Operators control what each fridge shares with you." action={<ViewToggle view={view} onChange={setView} mapDisabled={mapFailed} />} />
          <PanelBody flush>
            {connected.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState icon={<Refrigerator />} title="No fridges connected yet" description="Send a connection request to a nearby fridge. Once its operator approves, it appears here." action={<Button asChild><Link href="/dashboard/food-bank/nearby">Browse nearby fridges</Link></Button>} />
              </div>
            ) : (
              <>
                {showMap && (
                  <div className="mx-5 mb-3 h-[360px] overflow-hidden rounded-lg border border-border md:h-[420px]">
                    <FridgeMapLazy fridges={fridges} selectedId={selectedId} onSelect={setSelectedId} center={organization?.location} onTileError={() => { setMapFailed(true); setView("list"); }} />
                  </div>
                )}
                {mapFailed && <p className="mx-5 mb-2 text-[12px] text-muted-foreground">Map tiles could not be loaded, so the list is shown instead.</p>}
                <Rows className="border-t border-border">
                  {connected.map(({ fridge, sharing }) => {
                    const items = sharing.inventory ? activeInventory(data, fridge.id).reduce((s, i) => s + i.quantity, 0) : null;
                    const alerts = sharing.alerts ? openAlerts(data, fridge.id).length : null;
                    return (
                      <Row key={fridge.id} onClick={() => setSelectedId(fridge.id)} selected={selectedId === fridge.id} trailing={<span className="text-[12px] text-muted-foreground">Seen {formatRelative(fridge.lastSeenAt, now)}</span>}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="truncate text-[14px] font-medium">{fridge.name}</span>
                          <StatusDot tone={fridgeStatusTone(fridge.status)} label={fridgeStatusLabel(fridge.status)} className="text-[12px]" pulse={fridge.status === "offline"} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground">
                          <span>{fridge.neighborhood}</span>
                          <span className="tnum">{items === null ? "Inventory not shared" : `${items} items`}</span>
                          <span className="tnum">{alerts === null ? "Alerts not shared" : alerts === 0 ? "No open alerts" : `${alerts} open ${alerts === 1 ? "alert" : "alerts"}`}</span>
                        </div>
                      </Row>
                    );
                  })}
                </Rows>
              </>
            )}
          </PanelBody>
        </Panel>

        <div className="space-y-6 lg:col-span-2">
          {/* Active missions */}
          <Panel>
            <PanelHeader
              title="Active missions"
              description={activeMissions.length > 0 ? "Only operator-verified donations count toward progress." : undefined}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/dashboard/food-bank/missions">All missions</Link>
                </Button>
              }
            />
            <PanelBody flush>
              {activeMissions.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState compact icon={<Flag />} title="No open missions" description="Publish a mission to ask donors for specific food before it runs short." />
                </div>
              ) : (
                <Rows>
                  {activeMissions.map((m) => {
                    const dl = deadlineLabel(m.deadline, now);
                    const fridge = fridgeById(data, m.location.fridgeId);
                    return (
                      <Row key={m.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-medium">{m.title}</div>
                            <div className="text-[12px] text-muted-foreground">{fridge?.name ?? m.location.label}</div>
                          </div>
                          <span className={cn("tnum shrink-0 text-[12px]", dl.overdue ? "text-critical" : dl.urgent ? "text-amber" : "text-muted-foreground")}>{dl.text}</span>
                        </div>
                        <ProgressGauge className="mt-2" value={m.quantityVerified} max={m.quantityNeeded} unit={m.unit} tone={missionProgress(m) >= 1 ? "ok" : "sensor"} />
                      </Row>
                    );
                  })}
                </Rows>
              )}
            </PanelBody>
          </Panel>

          {/* Recent donations */}
          <Panel>
            <PanelHeader title="Recent donations" description="Across connected fridges and your missions." />
            <PanelBody flush>
              {recentDonations.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState compact icon={<HandHeart />} title="No donations yet" />
                </div>
              ) : (
                <Rows>
                  {recentDonations.map(({ d, at }) => {
                    const donor = userById(data, d.donorUserId);
                    return (
                      <Row key={d.id} leading={<span className="flex size-8 items-center justify-center rounded-md bg-sage text-[12px] font-semibold text-evergreen-deep">{donor?.initials ?? "?"}</span>} trailing={<span className="text-[12px] text-muted-foreground">{formatRelative(at, now)}</span>}>
                        <div className="truncate text-[13px]">
                          <span className="font-medium">{donor?.name ?? "Unknown donor"}</span>
                          <span className="text-muted-foreground"> · {d.quantity} {d.unit} {d.itemName}</span>
                        </div>
                        <StatusPill kind="donation" status={d.status} short className="mt-0.5 text-[12px]" />
                      </Row>
                    );
                  })}
                </Rows>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Upcoming expirations" description="Items reaching their recorded best-by date within 48 hours." />
          <PanelBody flush>
            {expirations.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState compact icon={<Timer />} title="Nothing expiring soon" description={inventoryShared.length === 0 ? "No connected fridge is sharing inventory with you." : "No shared items are within 48 hours of their best-by date."} />
              </div>
            ) : (
              <Rows>
                {expirations.map(({ item, fridge }) => (
                  <Row key={item.id} leading={<span className="flex size-8 items-center justify-center rounded-md bg-sage text-evergreen-deep"><CategoryIcon category={item.category} /></span>} trailing={<StatusDot tone={expiryTone(item.expiresAt!, now)} label={formatRelative(item.expiresAt!, now).replace("ago", "overdue")} className="text-[12px]" />}>
                    <div className="truncate text-[13px] font-medium">{item.name} <span className="tnum font-normal text-muted-foreground">· {item.quantity} {item.unit}</span></div>
                    <div className="truncate text-[12px] text-muted-foreground">{fridge.name}</div>
                  </Row>
                ))}
              </Rows>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Network activity" description="Recent inventory events from fridges sharing inventory." />
          <PanelBody flush>
            {activity.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState compact icon={<Boxes />} title="No activity yet" />
              </div>
            ) : (
              <Rows>
                {activity.map((e) => {
                  const fridge = fridgeById(data, e.fridgeId);
                  const anomaly = e.type === "unconfirmed_removal";
                  return (
                    <Row key={e.id} trailing={<span className="text-[12px] text-muted-foreground">{formatRelative(e.at, now)}</span>}>
                      <div className="truncate text-[13px]">
                        <span className={cn("font-medium", anomaly && "text-amber")}>{EVENT_LABEL[e.type]}</span>
                        <span className="text-muted-foreground"> · {e.itemName}</span>
                        {e.quantityDelta !== 0 && <span className="tnum text-muted-foreground"> ({e.quantityDelta > 0 ? "+" : ""}{e.quantityDelta})</span>}
                      </div>
                      <div className="truncate text-[12px] text-muted-foreground">{fridge?.name ?? "Unknown fridge"} · by {ACTOR_LABEL[e.actor]}{e.note ? ` · ${e.note}` : ""}</div>
                    </Row>
                  );
                })}
              </Rows>
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function InlineStat({ label, value, hint, tone = "default" }: { label: string; value: number; hint?: string; tone?: "default" | "warning" }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">{label}</div>
      <div className={cn("readout mt-1 text-[28px] font-semibold leading-none", tone === "warning" && "text-amber")}>{value.toLocaleString()}</div>
      {hint && <div className="mt-1 text-[12px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
