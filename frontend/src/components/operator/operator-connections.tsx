"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Check, Eye, EyeOff, Link2, X } from "lucide-react";
import type { ConnectionRequest, Organization, SharingPreferences } from "@/types";
import { formatDate, formatRelative, organizationById } from "@/lib/data/derived";
import type { FridgeyActions } from "@/lib/data/actions";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNow, useOperatorFridge } from "./use-operator-fridge";
import { NoFridge } from "./no-fridge";

const SHARING_FIELDS: { key: keyof SharingPreferences; label: string; hint: string }[] = [
  { key: "inventory", label: "Inventory", hint: "Item names, counts, and recorded dates." },
  { key: "sensors", label: "Sensor readings", hint: "Temperature, humidity, and air-quality history." },
  { key: "alerts", label: "Alerts", hint: "Open excursions, offline sensors, and anomalies." },
  { key: "preciseLocation", label: "Precise location", hint: "Street address instead of the neighborhood." },
];

export function OperatorConnections() {
  return (
    <DataGate>
      <ConnectionsContent />
    </DataGate>
  );
}

function ConnectionsContent() {
  const { data, actions, fridge } = useOperatorFridge();
  const [approving, setApproving] = useState<ConnectionRequest | null>(null);
  const [rejecting, setRejecting] = useState<ConnectionRequest | null>(null);
  const now = useNow();

  const connections = useMemo(() => (fridge ? data.connections.filter((c) => c.fridgeId === fridge.id) : []), [data, fridge]);
  const pending = connections.filter((c) => c.status === "pending").sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const approved = connections.filter((c) => c.status === "approved").sort((a, b) => (b.respondedAt ?? "").localeCompare(a.respondedAt ?? ""));
  const rejected = connections.filter((c) => c.status === "rejected");

  if (!fridge) return <NoFridge title="Connected food banks" />;

  const setVisibility = (pub: boolean) => {
    try {
      actions.updateFridge(fridge.id, { visibility: pub ? "public" : "private" });
      toast.success(pub ? "Fridge is now publicly listed." : "Fridge is now private. The address is shared only with approved food banks.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Connected food banks" description="Food banks ask to link your fridge so they can list it, send donors, and watch its health. You decide what each one can see." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Incoming requests" description={pending.length ? `${pending.length} waiting for your decision` : "No pending requests"} />
            <PanelBody flush>
              {pending.length === 0 ? (
                <div className="px-5 pb-5"><EmptyState compact icon={<Link2 />} title="No requests right now" description="When a food bank asks to connect, it appears here with the data it wants to see." /></div>
              ) : (
                <ul className="divide-y divide-border">
                  {pending.map((c) => {
                    const org = organizationById(data, c.organizationId);
                    return (
                      <li key={c.id} className="px-5 py-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                              <span className="text-[14px] font-medium text-foreground">{org?.name ?? "Unknown organization"}</span>
                              <span className="text-[12px] text-muted-foreground">{org?.city}</span>
                            </div>
                            <p className="mt-1 text-[13px] leading-relaxed text-foreground">“{c.message}”</p>
                            <div className="mt-1.5 text-[12px] text-muted-foreground">Requested {formatRelative(c.requestedAt, now)} · Asks for: {SHARING_FIELDS.filter((f) => c.sharing[f.key]).map((f) => f.label.toLowerCase()).join(", ") || "nothing yet"}</div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button type="button" size="sm" onClick={() => setApproving(c)}><Check aria-hidden="true" /> Approve</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(c)}><X aria-hidden="true" /> Reject</Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Linked organizations" description="Sharing changes save immediately." />
            <PanelBody flush>
              {approved.length === 0 ? (
                <div className="px-5 pb-5"><EmptyState compact icon={<Building2 />} title="Not linked to a food bank yet" description="Approve a request to let a food bank route donations to this fridge." /></div>
              ) : (
                <ul className="divide-y divide-border">
                  {approved.map((c) => (
                    <LinkedOrganization key={c.id} connection={c} organization={organizationById(data, c.organizationId)} actions={actions} />
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>

          {rejected.length > 0 && (
            <Panel tone="plain">
              <PanelHeader title="Declined" description="Requests you turned down. The organization can ask again later." />
              <PanelBody>
                <ul className="space-y-1.5 text-[13px]">
                  {rejected.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <span className="text-foreground">{organizationById(data, c.organizationId)?.name ?? "Unknown organization"}</span>
                      <span className="text-[12px] text-muted-foreground">{c.respondedAt ? formatDate(c.respondedAt) : ""}</span>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            </Panel>
          )}
        </div>

        <Panel as="aside" className="h-fit">
          <PanelHeader title="Fridge visibility" description="How your fridge appears to donors and food banks." />
          <PanelBody>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="visibility-switch" className="text-[14px]">Public listing</Label>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Public fridges show their street address on the map and in the donor app. Private fridges show only the neighborhood; the precise address is revealed to a food bank only after you approve its request with precise-location sharing on.</p>
              </div>
              <Switch id="visibility-switch" checked={fridge.visibility === "public"} onCheckedChange={setVisibility} aria-label="Public listing" />
            </div>
            <div className="mt-4 rounded-md bg-muted px-3 py-2.5 text-[13px]">
              <StatusDot tone={fridge.visibility === "public" ? "ok" : "neutral"} label={fridge.visibility === "public" ? "Public" : "Private"} />
              <div className="mt-1.5 flex items-start gap-1.5 text-[12px] text-muted-foreground">
                {fridge.visibility === "public" ? <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
                <span>{fridge.visibility === "public" ? fridge.address : `${fridge.neighborhood}, ${fridge.city} (address hidden)`}</span>
              </div>
            </div>
          </PanelBody>
        </Panel>
      </div>

      <ApproveDialog
        request={approving}
        organization={approving ? organizationById(data, approving.organizationId) : undefined}
        onClose={() => setApproving(null)}
        onConfirm={(sharing) => {
          if (!approving) return;
          try {
            actions.respondToConnection(approving.id, "approved", sharing);
            toast.success(`Connected to ${organizationById(data, approving.organizationId)?.name ?? "the organization"}.`);
          } catch (err) {
            toast.error((err as Error).message);
          }
          setApproving(null);
        }}
      />

      <Dialog open={Boolean(rejecting)} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject connection request?</DialogTitle>
            <DialogDescription>{rejecting ? `${organizationById(data, rejecting.organizationId)?.name ?? "The organization"} will not be able to list this fridge or see its data. They can send a new request later.` : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!rejecting) return;
                try {
                  actions.respondToConnection(rejecting.id, "rejected");
                  toast.success("Request rejected.");
                } catch (err) {
                  toast.error((err as Error).message);
                }
                setRejecting(null);
              }}
            >
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinkedOrganization({ connection, organization, actions }: { connection: ConnectionRequest; organization?: Organization; actions: FridgeyActions }) {
  const toggle = (key: keyof SharingPreferences, value: boolean) => {
    const next = { ...connection.sharing, [key]: value };
    try {
      actions.updateSharing(connection.id, next);
      const field = SHARING_FIELDS.find((f) => f.key === key)!;
      toast.success(`${field.label} sharing ${value ? "enabled" : "disabled"} for ${organization?.name ?? "this organization"}.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  return (
    <li className="px-5 py-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2.5 shrink-0 rounded-[2px] bg-primary" aria-hidden="true" />
            <span className="text-[14px] font-medium text-foreground">{organization?.name ?? "Unknown organization"}</span>
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">{organization?.city}{connection.respondedAt ? ` · Connected ${formatDate(connection.respondedAt)}` : ""}</div>
          {organization?.description && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{organization.description}</p>}
        </div>
        <fieldset className="space-y-2.5">
          <legend className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Sharing</legend>
          {SHARING_FIELDS.map((f) => {
            const id = `${connection.id}-${f.key}`;
            return (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <Label htmlFor={id} className="flex flex-col items-start gap-0 font-normal">
                  <span className="text-[13px] text-foreground">{f.label}</span>
                  <span className="text-[11px] text-muted-foreground">{f.hint}</span>
                </Label>
                <Switch id={id} size="sm" checked={connection.sharing[f.key]} onCheckedChange={(v) => toggle(f.key, v)} />
              </div>
            );
          })}
        </fieldset>
      </div>
    </li>
  );
}

function ApproveDialog({ request, organization, onClose, onConfirm }: { request: ConnectionRequest | null; organization?: Organization; onClose: () => void; onConfirm: (sharing: SharingPreferences) => void }) {
  const [sharing, setSharing] = useState<SharingPreferences | null>(null);
  const current = sharing ?? request?.sharing ?? { inventory: true, sensors: false, alerts: false, preciseLocation: false };
  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(o) => {
        if (!o) {
          setSharing(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {organization?.name ?? "connection"}</DialogTitle>
          <DialogDescription>Choose what this food bank can see. Their request is pre-selected; you can change it now or later.</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-3">
          <legend className="sr-only">Sharing preferences</legend>
          {SHARING_FIELDS.map((f) => {
            const id = `approve-${f.key}`;
            return (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <Label htmlFor={id} className="flex flex-col items-start gap-0 font-normal">
                  <span className="text-[13px] text-foreground">{f.label}</span>
                  <span className="text-[11px] text-muted-foreground">{f.hint}</span>
                </Label>
                <Switch id={id} checked={current[f.key]} onCheckedChange={(v) => setSharing({ ...current, [f.key]: v })} />
              </div>
            );
          })}
        </fieldset>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm(current);
              setSharing(null);
            }}
          >
            <Check aria-hidden="true" /> Approve and connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
