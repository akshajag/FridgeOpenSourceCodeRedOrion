"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, CalendarClock, ShieldQuestion, Thermometer } from "lucide-react";
import type { AlertType } from "@/types";
import { expiringWithin, formatDate, formatRelative, openAlerts } from "@/lib/data/derived";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { CategoryIcon } from "@/components/shared/category-icon";
import { Rows, Row } from "@/components/shared/inline-list";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useNow, useOperatorFridge } from "./use-operator-fridge";
import { ALERT_TYPES, ALERT_TYPE_LABEL } from "./sensor-state";
import { AlertList } from "./alert-list";
import { EventFeed } from "./event-feed";
import { NoFridge } from "./no-fridge";

export function OperatorAlerts() {
  return (
    <DataGate>
      <AlertsContent />
    </DataGate>
  );
}

function AlertsContent() {
  const { data, actions, fridge } = useOperatorFridge();
  const [type, setType] = useState<AlertType | "all">("all");
  const now = useNow();

  const open = useMemo(() => (fridge ? openAlerts(data, fridge.id).filter((a) => type === "all" || a.type === type) : []), [data, fridge, type]);
  const resolved = useMemo(
    () =>
      fridge
        ? data.alerts
            .filter((a) => a.fridgeId === fridge.id && a.resolvedAt && (type === "all" || a.type === type))
            .sort((a, b) => b.resolvedAt!.localeCompare(a.resolvedAt!))
        : [],
    [data, fridge, type],
  );
  const expiring = useMemo(() => (fridge ? expiringWithin(data, 48, fridge.id, now) : []), [data, fridge, now]);
  const removals = useMemo(
    () => (fridge ? data.inventoryEvents.filter((e) => e.fridgeId === fridge.id && e.type === "unconfirmed_removal").sort((a, b) => b.at.localeCompare(a.at)) : []),
    [data, fridge],
  );

  if (!fridge) return <NoFridge title="Alerts and anomalies" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts and anomalies"
        description="Threshold excursions, offline hardware, items nearing their dates, and inventory changes the cameras could not confirm."
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="alert-type" className="text-[13px] text-muted-foreground">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AlertType | "all")}>
              <SelectTrigger id="alert-type" size="sm" className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {ALERT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{ALERT_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Open" description={open.length ? `${open.length} ${open.length === 1 ? "alert needs" : "alerts need"} attention` : "No open alerts"} />
            <PanelBody flush>
              {open.length === 0 ? (
                <div className="px-5 pb-5"><EmptyState compact icon={<BellRing />} title="All clear" description={type === "all" ? "New alerts open automatically when a reading leaves its band or a sensor stops reporting." : `No open ${ALERT_TYPE_LABEL[type].toLowerCase()} alerts.`} /></div>
              ) : (
                <AlertList alerts={open} actions={actions} />
              )}
            </PanelBody>
          </Panel>

          <Panel tone="plain">
            <PanelHeader title="Resolved" description={resolved.length ? `${resolved.length} in the log` : "Nothing resolved yet"} />
            <PanelBody flush>
              {resolved.length === 0 ? (
                <div className="px-5 pb-5 text-[13px] text-muted-foreground">Resolved alerts stay here as a record.</div>
              ) : (
                <AlertList alerts={resolved} actions={actions} />
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Approaching expiration" description="Recorded dates within 48 hours." action={<Button asChild variant="ghost" size="sm"><Link href="/dashboard/operator/inventory">Inventory</Link></Button>} />
            <PanelBody flush>
              {expiring.length === 0 ? (
                <div className="px-5 pb-5"><EmptyState compact icon={<CalendarClock />} title="Nothing expiring soon" /></div>
              ) : (
                <Rows>
                  {expiring.map((i) => {
                    const past = new Date(i.expiresAt!).getTime() < now;
                    return (
                      <Row key={i.id} className="py-2.5" leading={<span className="flex size-7 items-center justify-center rounded-md bg-sage text-evergreen-deep"><CategoryIcon category={i.category} className="size-3.5" /></span>} trailing={<span className={cn("tnum text-[12px] font-medium", past ? "text-critical" : "text-amber")}>{past ? "Expired" : formatRelative(i.expiresAt!, now)}</span>}>
                        <div className="truncate text-[13px] font-medium text-foreground">{i.name}</div>
                        <div className="text-[12px] text-muted-foreground"><span className="tnum">{i.quantity} {i.unit}</span> · {formatDate(i.expiresAt!)}</div>
                      </Row>
                    );
                  })}
                </Rows>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Unconfirmed removals" description="Shelf-count changes with no matching door or camera event." />
            <PanelBody flush>
              <p className="px-5 pb-3 text-[12px] leading-relaxed text-muted-foreground">
                These are anomalies that need a human look: a missed frame, an item moved behind another, or a count error are all common causes. They are not determinations that anything was taken.
              </p>
              {removals.length === 0 ? (
                <div className="px-5 pb-5"><EmptyState compact icon={<ShieldQuestion />} title="No unconfirmed removals" /></div>
              ) : (
                <EventFeed events={removals} showDate />
              )}
            </PanelBody>
          </Panel>

          <Panel tone="sage" as="aside">
            <PanelHeader title={<span className="inline-flex items-center gap-1.5"><Thermometer className="size-4 text-sensor" aria-hidden="true" /> Environmental risk</span>} />
            <PanelBody>
              <p className="text-[13px] leading-relaxed text-foreground">
                Temperature, humidity, and air-quality readings describe the conditions inside the cabinet. They help you spot problems early, but they do not certify that any item is safe to eat. Use the recorded dates, packaging, and your own judgment before leaving food on the shelf.
              </p>
              <p className="mt-2 text-[12px] text-muted-foreground">Thresholds are set on the Live monitoring page. Readings are logged with the time they arrived from the board.</p>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
