"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BellOff, HandHeart, Link2, Refrigerator } from "lucide-react";
import type { SharingPreferences } from "@/types";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusDot, fridgeStatusLabel, fridgeStatusTone, severityTone } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { activeInventory, formatDateTime, formatRelative, fridgeById, openAlerts, userById } from "@/lib/data/derived";
import { cn } from "@/lib/utils";
import { useFoodBank, useNow } from "./use-food-bank";
import { StatusPill } from "./shared";

const SHARING_KEYS: { key: keyof SharingPreferences; label: string }[] = [
  { key: "inventory", label: "Inventory" },
  { key: "sensors", label: "Sensors" },
  { key: "alerts", label: "Alerts" },
  { key: "preciseLocation", label: "Address" },
];

export function NetworkPage() {
  return (
    <DataGate>
      <NetworkContent />
    </DataGate>
  );
}

function NetworkContent() {
  const { data, organizationId, connected, connectedIds } = useFoodBank();
  const now = useNow();

  const requests = useMemo(
    () => data.connections.filter((c) => c.organizationId === organizationId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [data.connections, organizationId],
  );
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const alertsShared = useMemo(() => connected.filter((c) => c.sharing.alerts), [connected]);
  const alerts = useMemo(() => {
    const ids = new Set(alertsShared.map((c) => c.fridge.id));
    return openAlerts(data).filter((a) => ids.has(a.fridgeId));
  }, [alertsShared, data]);
  const alertsHidden = connected.length - alertsShared.length;

  const donations = useMemo(
    () =>
      data.donations
        .filter((d) => connectedIds.has(d.fridgeId))
        .sort((a, b) => (b.verifiedAt ?? b.deliveredAt ?? b.proposedAt).localeCompare(a.verifiedAt ?? a.deliveredAt ?? a.proposedAt)),
    [data.donations, connectedIds],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network"
        description="Fridges that approved a connection with your organization, the requests you've sent, and everything their operators chose to share."
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/food-bank/nearby"><Link2 data-icon="inline-start" /> Request a connection</Link>
          </Button>
        }
      />

      <Tabs defaultValue="fridges">
        <TabsList className="flex w-full flex-wrap justify-start sm:w-fit">
          <TabsTrigger value="fridges">Connected fridges <Count n={connected.length} /></TabsTrigger>
          <TabsTrigger value="requests">Requests {pendingCount > 0 && <Count n={pendingCount} tone="warning" />}</TabsTrigger>
          <TabsTrigger value="alerts">Alerts {alerts.length > 0 && <Count n={alerts.length} tone={alerts.some((a) => a.severity === "critical") ? "critical" : "warning"} />}</TabsTrigger>
          <TabsTrigger value="donations">Donation history</TabsTrigger>
        </TabsList>

        <TabsContent value="fridges" className="mt-4">
          <Panel>
            <PanelHeader title="Connected fridges" description="Shared data is decided per fridge by its operator and can change at any time." />
            <PanelBody flush>
              {connected.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState icon={<Refrigerator />} title="No approved connections" description="Find a fridge nearby and ask its operator to connect." action={<Button asChild><Link href="/dashboard/food-bank/nearby">Browse nearby fridges</Link></Button>} />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Fridge</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last seen</TableHead>
                      <TableHead>Shared data</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="pr-5 text-right">Open alerts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connected.map(({ fridge, sharing, connectionId }) => {
                      const operator = userById(data, fridge.operatorUserId);
                      const items = sharing.inventory ? activeInventory(data, fridge.id).reduce((s, i) => s + i.quantity, 0) : null;
                      const alertCount = sharing.alerts ? openAlerts(data, fridge.id).length : null;
                      return (
                        <TableRow key={connectionId}>
                          <TableCell className="pl-5">
                            <div className="font-medium">{fridge.name}</div>
                            <div className="text-[12px] text-muted-foreground">{fridge.neighborhood}{fridge.visibility === "private" ? " · Private" : ""}</div>
                          </TableCell>
                          <TableCell>{operator?.name ?? "Unknown"}</TableCell>
                          <TableCell><StatusDot tone={fridgeStatusTone(fridge.status)} label={fridgeStatusLabel(fridge.status)} className="text-[13px]" /></TableCell>
                          <TableCell className="tnum whitespace-nowrap text-muted-foreground">{formatRelative(fridge.lastSeenAt, now)}</TableCell>
                          <TableCell>
                            <ul className="flex flex-wrap gap-1">
                              {SHARING_KEYS.map((k) => (
                                <li key={k.key} className={cn("rounded-md border px-1.5 py-0.5 text-[11px] font-medium", sharing[k.key] ? "border-sage-deep bg-sage/50 text-evergreen-deep" : "border-border text-ink-faint line-through")}>{k.label}</li>
                              ))}
                            </ul>
                          </TableCell>
                          <TableCell className="tnum text-right">{items === null ? <span className="text-[12px] text-muted-foreground">Not shared</span> : items}</TableCell>
                          <TableCell className={cn("tnum pr-5 text-right", alertCount && alertCount > 0 && "font-medium text-amber")}>{alertCount === null ? <span className="text-[12px] font-normal text-muted-foreground">Not shared</span> : alertCount}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </PanelBody>
          </Panel>
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <Panel>
            <PanelHeader title="Outgoing requests" description="Fridge operators approve or decline requests from their own dashboard and choose what to share. You cannot approve a request on their behalf." />
            <PanelBody flush>
              {requests.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState compact icon={<Link2 />} title="No requests sent" description="Every connection starts with a request to the fridge operator." />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Fridge</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested sharing</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead className="pr-5">Response</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((r) => {
                      const fridge = fridgeById(data, r.fridgeId);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="pl-5 font-medium">{fridge?.name ?? "Unknown fridge"}</TableCell>
                          <TableCell><StatusPill kind="connection" status={r.status} /></TableCell>
                          <TableCell className="text-[12px] text-muted-foreground">{SHARING_KEYS.filter((k) => r.sharing[k.key]).map((k) => k.label).join(", ") || "None"}</TableCell>
                          <TableCell className="max-w-[280px] whitespace-normal text-[13px] text-muted-foreground">{r.message}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{formatRelative(r.requestedAt, now)}</TableCell>
                          <TableCell className="pr-5 whitespace-nowrap text-muted-foreground">{r.respondedAt ? formatDateTime(r.respondedAt) : r.status === "pending" ? "Waiting on operator" : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </PanelBody>
          </Panel>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <Panel>
            <PanelHeader title="Open alerts" description={`Read-only. Operators acknowledge and resolve alerts on their own dashboard.${alertsHidden > 0 ? ` ${alertsHidden} connected ${alertsHidden === 1 ? "fridge does" : "fridges do"} not share alerts.` : ""}`} />
            <PanelBody flush>
              {alerts.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState compact icon={<BellOff />} title="No open alerts" description={alertsShared.length === 0 ? "No connected fridge shares alerts with you." : "Every fridge sharing alerts is within its thresholds."} />
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {alerts.map((a) => {
                    const fridge = fridgeById(data, a.fridgeId);
                    return (
                      <li key={a.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:gap-4">
                        <div className="w-24 shrink-0"><StatusDot tone={severityTone(a.severity)} label={a.severity === "critical" ? "Critical" : a.severity === "warning" ? "Warning" : "Info"} className="text-[13px]" pulse={a.severity === "critical"} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium">{a.title}</div>
                          <p className="text-[13px] text-muted-foreground">{a.detail}</p>
                          <div className="mt-1 text-[12px] text-muted-foreground">{fridge?.name ?? "Unknown fridge"} · {formatRelative(a.createdAt, now)}{a.acknowledgedAt ? " · acknowledged by operator" : ""}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </TabsContent>

        <TabsContent value="donations" className="mt-4">
          <Panel>
            <PanelHeader title="Donation history" description="Every donation proposed to a connected fridge. Only operator-verified donations award points or count toward missions." />
            <PanelBody flush>
              {donations.length === 0 ? (
                <div className="px-5 pb-5">
                  <EmptyState compact icon={<HandHeart />} title="No donations recorded" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Donor</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Fridge</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Verified</TableHead>
                      <TableHead className="pr-5">Mission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {donations.map((d) => {
                      const donor = userById(data, d.donorUserId);
                      const fridge = fridgeById(data, d.fridgeId);
                      const verifier = d.verifiedByUserId ? userById(data, d.verifiedByUserId) : undefined;
                      const mission = d.missionId ? data.missions.find((m) => m.id === d.missionId) : undefined;
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="pl-5 font-medium">{donor?.name ?? "Unknown"}</TableCell>
                          <TableCell>{d.itemName}</TableCell>
                          <TableCell className="tnum whitespace-nowrap text-right">{d.quantity} {d.unit}</TableCell>
                          <TableCell className="text-muted-foreground">{fridge?.name ?? "—"}</TableCell>
                          <TableCell>
                            <StatusPill kind="donation" status={d.status} short />
                            {d.status === "rejected" && d.rejectionReason && <div className="text-[12px] text-muted-foreground">{d.rejectionReason}</div>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{d.verifiedAt ? <>{formatDateTime(d.verifiedAt)}{verifier ? <span className="block text-[12px]">by {verifier.name}</span> : null}</> : "—"}</TableCell>
                          <TableCell className="pr-5 text-muted-foreground">{mission ? mission.title : <span className="text-[12px]">Walk-in</span>}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </PanelBody>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Count({ n, tone = "neutral" }: { n: number; tone?: "neutral" | "warning" | "critical" }) {
  return (
    <span className={cn("tnum ml-1 rounded-sm px-1.5 py-px text-[11px] font-medium", tone === "neutral" && "bg-muted text-muted-foreground", tone === "warning" && "bg-amber-soft text-amber", tone === "critical" && "bg-critical-soft text-critical")}>{n}</span>
  );
}
