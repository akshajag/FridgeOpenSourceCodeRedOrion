"use client";
import { HardwareConditions } from "./hardware-conditions";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Activity, BellRing, Boxes, Check, Flag, HandHeart, History, X } from "lucide-react";
import type { Donation } from "@/types";
import { DAY_MS, activeInventory, expiringWithin, formatDate, formatDateTime, formatRelative, inventoryCount, itemsNeedingReview, latestReading, openAlerts, pendingDonationsForFridge, readingsInRange, userById } from "@/lib/data/derived";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { StatusDot, fridgeStatusLabel, fridgeStatusTone } from "@/components/shared/status-dot";
import { DemoNotice, DemoTag } from "@/components/shared/demo-notice";
import { EmptyState } from "@/components/shared/empty-state";
import { CategoryIcon } from "@/components/shared/category-icon";
import { Rows, Row } from "@/components/shared/inline-list";
import { SensorChart } from "@/components/sensors/sensor-chart";
import { SensorReadout } from "@/components/sensors/sensor-readout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useNow, useOperatorFridge } from "./use-operator-fridge";
import { METRIC_UNIT, sensorState, stateLabel, summarize } from "./sensor-state";
import { AlertList } from "./alert-list";
import { EventFeed } from "./event-feed";
import { NoFridge } from "./no-fridge";

export function OperatorOverview() {
  return (
    <DataGate>
      <OverviewContent />
    </DataGate>
  );
}

function OverviewContent() {
  const { data, actions, mode, currentUserId, fridge } = useOperatorFridge();
  const [rejecting, setRejecting] = useState<Donation | null>(null);
  const now = useNow();

  const temp = useMemo(() => (fridge ? readingsInRange(data, fridge.id, "temperature", DAY_MS, now) : []), [data, fridge, now]);
  const humidity = useMemo(() => (fridge ? readingsInRange(data, fridge.id, "humidity", DAY_MS, now) : []), [data, fridge, now]);
  const air = useMemo(() => (fridge ? readingsInRange(data, fridge.id, "air_quality", DAY_MS, now) : []), [data, fridge, now]);

  if (!fridge) return <NoFridge title="Overview" />;

  const caps = fridge.capabilities;
  const th = fridge.thresholds;
  const latestTemp = latestReading(data, fridge.id, "temperature");
  const latestHumidity = latestReading(data, fridge.id, "humidity");
  const latestAir = latestReading(data, fridge.id, "air_quality");
  const tempState = sensorState("temperature", latestTemp, th, now);
  const tempSummary = summarize(temp);
  const lastSensorAt = [latestTemp, latestHumidity, latestAir].filter(Boolean).map((r) => r!.at).sort().at(-1);

  const items = activeInventory(data, fridge.id);
  const count = inventoryCount(data, fridge.id);
  const review = itemsNeedingReview(data, fridge.id);
  const expiring = expiringWithin(data, 48, fridge.id, now);
  const pending = pendingDonationsForFridge(data, fridge.id);
  const alerts = openAlerts(data, fridge.id);
  const events = data.inventoryEvents
    .filter((e) => e.fridgeId === fridge.id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);

  const accept = (d: Donation) => {
    const mission = d.missionId ? data.missions.find((m) => m.id === d.missionId) : undefined;
    try {
      const result = actions.acceptDonation(d.id, currentUserId);
      if (result.missionCompleted && mission) {
        toast.success(`Accepted ${d.quantity} ${d.unit} of ${d.itemName}. Mission “${mission.title}” is now complete.`);
      } else {
        toast.success(`Accepted ${d.quantity} ${d.unit} of ${d.itemName}. Added to inventory${mission ? ` and counted toward “${mission.title}”` : ""}.`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const tempTone = tempState === "critical" ? "text-critical" : tempState === "warning" ? "text-amber" : tempState === "stale" ? "text-ink-faint" : "text-sensor";

  return (
    <div className="space-y-6">
      <PageHeader
        title={fridge.name}
        meta={`${fridge.neighborhood}, ${fridge.city}`}
        description={fridge.description}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/operator/monitoring"><Activity aria-hidden="true" /> Live monitoring</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/operator/inventory"><Boxes aria-hidden="true" /> Inventory</Link>
            </Button>
          </>
        }
      />

      {mode === "demo" && (
        <DemoNotice>
          Demo mode: sensor readings, inventory, and donations for this fridge are synthetic. Values follow realistic patterns (a door-open excursion, an air-quality spike) but no hardware is connected.
        </DemoNotice>
      )}

      {/* Header strip: connection and hardware facts. */}
      <Panel tone="plain" as="div">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-3.5 text-[13px] md:grid-cols-4 lg:grid-cols-5">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Connection</dt>
            <dd className="mt-0.5"><StatusDot tone={fridgeStatusTone(fridge.status)} label={fridgeStatusLabel(fridge.status)} pulse={fridge.status === "online"} /></dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Last sensor update</dt>
            <dd className="mt-0.5 tnum text-foreground">{lastSensorAt ? formatRelative(lastSensorAt, now) : "No readings"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Last heartbeat</dt>
            <dd className="mt-0.5 tnum text-foreground">{formatDateTime(fridge.lastSeenAt)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Visibility</dt>
            <dd className="mt-0.5 text-foreground">{fridge.visibility === "public" ? "Public listing" : "Private (address on approval)"}</dd>
          </div>
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <dt className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Hardware</dt>
            <dd className="mt-0.5 truncate text-foreground" title={fridge.hardwareVersion}>{fridge.hardwareVersion}</dd>
          </div>
        </dl>
      </Panel>

      {/* Hero: temperature dominates. */}
      {process.env.NEXT_PUBLIC_FRIDGE_HARDWARE_MODE === "1" && <HardwareConditions />}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel tone="sensor" className="lg:col-span-2">
          <PanelHeader
            title="Temperature, last 24 hours"
            description={`Configured band ${th.tempMinC}–${th.tempMaxC} °C. Band is drawn behind the line.`}
            action={<span className={cn("text-[12px] font-medium", tempState === "ok" ? "text-primary" : tempTone)}>{stateLabel(tempState)}</span>}
          />
          <PanelBody>
            {caps.temperature ? (
              <div className="flex flex-col gap-5 md:flex-row">
                <div className="shrink-0 md:w-44">
                  <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Current</div>
                  <div className={cn("readout mt-1 flex items-baseline gap-1.5 leading-none", tempTone)}>
                    <span className="text-[56px] font-semibold">{latestTemp ? latestTemp.value.toFixed(1) : "—"}</span>
                    <span className="font-sans text-[15px] font-medium text-muted-foreground">°C</span>
                  </div>
                  <div className="mt-1.5 text-[12px] text-muted-foreground">{latestTemp ? `Updated ${formatRelative(latestTemp.at, now)}` : "No readings yet"}</div>
                  {tempSummary && (
                    <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-[12px] md:grid-cols-1 md:gap-1.5">
                      <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Min</dt><dd className="tnum text-foreground">{tempSummary.min.toFixed(1)} °C</dd></div>
                      <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Max</dt><dd className="tnum text-foreground">{tempSummary.max.toFixed(1)} °C</dd></div>
                      <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Avg</dt><dd className="tnum text-foreground">{tempSummary.avg.toFixed(1)} °C</dd></div>
                    </dl>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <SensorChart readings={temp} unit="°C" band={{ min: th.tempMinC, max: th.tempMaxC }} rangeMs={DAY_MS} height={260} tone="sensor" ariaLabel="Temperature over the last 24 hours" decimals={1} />
                </div>
              </div>
            ) : (
              <SensorReadout metric="temperature" history={[]} unit="°C" state="stale" supported={false} />
            )}
          </PanelBody>
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <SensorReadout metric="humidity" latest={latestHumidity} history={humidity} unit={METRIC_UNIT.humidity} state={sensorState("humidity", latestHumidity, th, now)} supported={caps.humidity} note={th.humidityMaxPct !== undefined ? `max ${th.humidityMaxPct} %` : undefined} />
          <SensorReadout metric="air_quality" latest={latestAir} history={air} unit={METRIC_UNIT.air_quality} state={sensorState("air_quality", latestAir, th, now)} supported={caps.airQuality} note={th.airQualityMaxPpm !== undefined ? `max ${th.airQualityMaxPpm.toLocaleString()} raw` : undefined} />
        </div>
      </div>

      {/* Operational row. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Inventory" description={`${items.length} line items on the shelves`} action={<Button asChild variant="ghost" size="sm"><Link href="/dashboard/operator/inventory">Manage</Link></Button>} />
          <PanelBody>
            <div className="flex items-baseline gap-1.5">
              <span className="readout text-[40px] font-semibold leading-none text-foreground">{count}</span>
              <span className="text-[13px] font-medium text-muted-foreground">units, estimated</span>
            </div>
            <ul className="mt-4 space-y-2 text-[13px]">
              <li className="flex items-center justify-between gap-3">
                <span className={cn(review.length > 0 ? "text-amber" : "text-muted-foreground")}>Needs review</span>
                <Link href="/dashboard/operator/inventory?status=needs_review" className="tnum font-medium text-foreground underline-offset-4 hover:underline">{review.length} {review.length === 1 ? "item" : "items"}</Link>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className={cn(expiring.length > 0 ? "text-amber" : "text-muted-foreground")}>Expiring within 48 h</span>
                <Link href="/dashboard/operator/alerts" className="tnum font-medium text-foreground underline-offset-4 hover:underline">{expiring.length} {expiring.length === 1 ? "item" : "items"}</Link>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Camera scan</span>
                <Link href="/dashboard/operator/scan" className="font-medium text-foreground underline-offset-4 hover:underline">Open scanner</Link>
              </li>
            </ul>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Incoming donations"
            description={pending.length ? `${pending.length} awaiting check-in` : "Nothing waiting for check-in"}
            action={mode === "demo" && pending.length > 0 ? <DemoTag /> : undefined}
          />
          <PanelBody flush>
            {pending.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState compact icon={<HandHeart />} title="No pending donations" description="Donors who propose or deliver food to this fridge will appear here for verification." /></div>
            ) : (
              <Rows>
                {pending.map((d) => {
                  const donor = userById(data, d.donorUserId);
                  const mission = d.missionId ? data.missions.find((m) => m.id === d.missionId) : undefined;
                  return (
                    <Row key={d.id} className="items-start px-5 py-3">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sage text-evergreen-deep"><CategoryIcon category={d.category} className="size-3.5" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium text-foreground">
                            <span className="tnum">{d.quantity} {d.unit}</span> · {d.itemName}
                          </div>
                          <div className="mt-0.5 text-[12px] text-muted-foreground">
                            {donor?.name ?? "Donor"} · {d.status === "delivered" ? `Delivered ${formatRelative(d.deliveredAt ?? d.proposedAt, now)}` : `Proposed ${formatRelative(d.proposedAt, now)}`}
                            {d.expiresAt ? ` · Best by ${formatDate(d.expiresAt)}` : ""}
                          </div>
                          {mission && (
                            <div className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-muted px-1.5 py-0.5 text-[12px] text-foreground">
                              <Flag className="size-3 text-muted-foreground" aria-hidden="true" /> {mission.title}
                            </div>
                          )}
                          {d.note && <div className="mt-1 text-[12px] italic text-muted-foreground">“{d.note}”</div>}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button type="button" size="sm" onClick={() => accept(d)}><Check aria-hidden="true" /> Accept</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(d)}><X aria-hidden="true" /> Reject</Button>
                          </div>
                        </div>
                      </div>
                    </Row>
                  );
                })}
              </Rows>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Active alerts" description={alerts.length ? `${alerts.length} open` : "No open alerts"} action={<Button asChild variant="ghost" size="sm"><Link href="/dashboard/operator/alerts">All alerts</Link></Button>} />
          <PanelBody flush>
            {alerts.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState compact icon={<BellRing />} title="All clear" description="Threshold excursions, offline sensors, and anomalies will appear here." /></div>
            ) : (
              <AlertList alerts={alerts} actions={actions} compact />
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Recent additions and removals" description="Last 10 inventory events from cameras, donors, and manual edits." action={<Button asChild variant="ghost" size="sm"><Link href="/dashboard/operator/inventory?tab=history"><History aria-hidden="true" /> Full history</Link></Button>} />
        <PanelBody flush>
          {events.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState compact title="No inventory events yet" /></div>
          ) : (
            <EventFeed events={events} />
          )}
        </PanelBody>
      </Panel>

      <RejectDonationDialog
        donation={rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => {
          if (!rejecting) return;
          try {
            actions.rejectDonation(rejecting.id, currentUserId, reason);
            toast.success(`Rejected ${rejecting.itemName}. The donor will see your reason.`);
          } catch (err) {
            toast.error((err as Error).message);
          }
          setRejecting(null);
        }}
      />
    </div>
  );
}

export function RejectDonationDialog({ donation, onClose, onConfirm }: { donation: Donation | null; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const open = Boolean(donation);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this donation?</DialogTitle>
          <DialogDescription>
            {donation ? `${donation.quantity} ${donation.unit} of ${donation.itemName} will not be added to inventory. Give the donor a short reason.` : ""}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 3) {
              setError("Enter a reason (at least 3 characters).");
              return;
            }
            onConfirm(reason.trim());
            setReason("");
            setError(null);
          }}
        >
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Package was open, past its date, or not eligible for the mission" aria-invalid={Boolean(error)} aria-describedby={error ? "reject-reason-error" : undefined} />
          {error && <p id="reject-reason-error" className="text-[12px] text-critical">{error}</p>}
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="destructive">Reject donation</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
