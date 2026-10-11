"use client";

import { useMemo, useState } from "react";
import { Camera, Clock, Cpu, Link2, Lock, MapPin, Mic, Search, Thermometer, Wind, Droplets } from "lucide-react";
import type { FoodCategory, Fridge, GeoPoint } from "@/types";
import { FOOD_CATEGORIES } from "@/types";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { Rows, Row } from "@/components/shared/inline-list";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusDot, fridgeStatusLabel, fridgeStatusTone } from "@/components/shared/status-dot";
import { CategoryIcon } from "@/components/shared/category-icon";
import { FridgeMapLazy } from "@/components/maps/fridge-map-lazy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { activeInventory, canSeePreciseLocation, distanceKm, formatRelative, formatTemp, kmToMiles, latestReading, userById } from "@/lib/data/derived";
import { cn } from "@/lib/utils";
import { useFoodBank, useMediaQuery, useNow } from "./use-food-bank";
import { StatusPill, ViewToggle, expiryTone } from "./shared";
import { ConnectionRequestDialog } from "./connection-request-dialog";

const RADII = [2, 5, 10, 25] as const;

function validPoint(p?: GeoPoint): p is GeoPoint {
  return Boolean(p) && Number.isFinite(p!.lat) && Number.isFinite(p!.lng) && Math.abs(p!.lat) <= 90 && Math.abs(p!.lng) <= 180 && !(p!.lat === 0 && p!.lng === 0);
}

export function NearbyFridges() {
  return (
    <DataGate>
      <NearbyContent />
    </DataGate>
  );
}

function NearbyContent() {
  const { data, organization, organizationId } = useFoodBank();
  const now = useNow();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState<string>("10");
  const [status, setStatus] = useState<string>("any");
  const [inventory, setInventory] = useState<string>("any");
  const [view, setView] = useState<"map" | "list">("map");
  const [mapFailed, setMapFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const center = validPoint(organization?.location) ? organization!.location : undefined;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const radiusKm = Number(radius);
    return data.fridges
      .map((fridge) => {
        const dist = center && validPoint(fridge.location) ? distanceKm(center, fridge.location) : undefined;
        const items = activeInventory(data, fridge.id);
        return { fridge, dist, itemCount: items.length, categories: new Set(items.map((i) => i.category)) };
      })
      .filter((r) => {
        if (q && !(r.fridge.name.toLowerCase().includes(q) || r.fridge.neighborhood.toLowerCase().includes(q))) return false;
        if (center && r.dist !== undefined && r.dist > radiusKm) return false;
        if (status !== "any" && r.fridge.status !== status) return false;
        if (inventory === "has_inventory" && r.itemCount === 0) return false;
        if (inventory !== "any" && inventory !== "has_inventory" && !r.categories.has(inventory as FoodCategory)) return false;
        return true;
      })
      .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity) || a.fridge.name.localeCompare(b.fridge.name));
  }, [data, query, radius, status, inventory, center]);

  const approximateIds = useMemo(() => data.fridges.filter((f) => !canSeePreciseLocation(data, organizationId, f)).map((f) => f.id), [data, organizationId]);
  const selected = results.find((r) => r.fridge.id === selectedId) ?? (selectedId ? { fridge: data.fridges.find((f) => f.id === selectedId)!, dist: undefined, itemCount: 0, categories: new Set<FoodCategory>() } : undefined);
  const showMap = view === "map" && !mapFailed;
  const mappable = results.map((r) => r.fridge).filter((f) => validPoint(f.location));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nearby fridges"
        description={center ? `Community fridges around ${organization?.name}. Private fridges show an approximate pin until their operator approves precise-location sharing.` : "Your organization has no valid location on file, so distances and the radius filter are unavailable."}
      />

      <Panel>
        <PanelBody className="px-5 py-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="nearby-search">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="nearby-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or neighborhood" className="pl-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nearby-radius">Within</Label>
              <Select value={radius} onValueChange={setRadius} disabled={!center}>
                <SelectTrigger id="nearby-radius" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RADII.map((km) => (
                    <SelectItem key={km} value={String(km)}>{km} km ({kmToMiles(km).toFixed(0)} mi)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nearby-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="nearby-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any status</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="degraded">Degraded</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nearby-inventory">Inventory</Label>
              <Select value={inventory} onValueChange={setInventory}>
                <SelectTrigger id="nearby-inventory" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="has_inventory">Has items listed</SelectItem>
                  {FOOD_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>Has {c.label.toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ViewToggle view={view} onChange={setView} mapDisabled={mapFailed} className="md:mb-px" />
          </div>
        </PanelBody>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <Panel>
          <PanelHeader title={`${results.length} ${results.length === 1 ? "fridge" : "fridges"}`} description={center ? `Sorted by distance from ${organization?.name}.` : "Sorted by name."} />
          <PanelBody flush>
            {showMap && (
              <div className="mx-5 mb-3 h-[380px] overflow-hidden rounded-lg border border-border md:h-[460px]">
                <FridgeMapLazy fridges={mappable} selectedId={selectedId} onSelect={setSelectedId} center={center} radiusKm={center ? Number(radius) : undefined} approximateIds={approximateIds} onTileError={() => { setMapFailed(true); setView("list"); }} />
              </div>
            )}
            {mapFailed && <p className="mx-5 mb-2 text-[12px] text-muted-foreground">Map tiles could not be loaded, so the list is shown instead.</p>}
            {results.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState compact icon={<MapPin />} title="No fridges match" description="Widen the radius or clear a filter." action={<Button variant="outline" size="sm" onClick={() => { setQuery(""); setRadius("25"); setStatus("any"); setInventory("any"); }}>Reset filters</Button>} />
              </div>
            ) : (
              <Rows className="border-t border-border">
                {results.map(({ fridge, dist, itemCount }) => {
                  const conn = data.connections.find((c) => c.organizationId === organizationId && c.fridgeId === fridge.id && c.status !== "rejected");
                  return (
                    <Row key={fridge.id} onClick={() => setSelectedId(fridge.id)} selected={selectedId === fridge.id} trailing={dist !== undefined ? <span className="tnum text-[12px] text-muted-foreground">{dist.toFixed(1)} km</span> : undefined}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="truncate text-[14px] font-medium">{fridge.name}</span>
                        {fridge.visibility === "private" && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="size-3" aria-hidden="true" />Private</span>}
                        {conn && <StatusPill kind="connection" status={conn.status} className="text-[12px]" />}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground">
                        <StatusDot tone={fridgeStatusTone(fridge.status)} label={fridgeStatusLabel(fridge.status)} className="text-[12px]" />
                        <span>{fridge.neighborhood}</span>
                        <span className="tnum">{itemCount} {itemCount === 1 ? "item" : "items"} listed</span>
                      </div>
                    </Row>
                  );
                })}
              </Rows>
            )}
          </PanelBody>
        </Panel>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          {selected ? (
            <Panel>
              <FridgeDetail fridge={selected.fridge} dist={selected.dist} now={now} onClose={() => setSelectedId(null)} />
            </Panel>
          ) : (
            <Panel tone="sage">
              <PanelBody className="px-5 py-8">
                <EmptyState compact icon={<MapPin />} title="Select a fridge" description="Pick a marker or a row to see hours, hardware, what the operator shares, and to send a connection request." className="border-0 bg-transparent" />
              </PanelBody>
            </Panel>
          )}
        </aside>
      </div>

      {!isDesktop && (
        <Sheet open={Boolean(selected)} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl pt-6">
            <SheetHeader className="sr-only">
              <SheetTitle>{selected?.fridge.name ?? "Fridge"}</SheetTitle>
              <SheetDescription>Fridge details</SheetDescription>
            </SheetHeader>
            {selected && <FridgeDetail fridge={selected.fridge} dist={selected.dist} now={now} />}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function FridgeDetail({ fridge, dist, now, onClose }: { fridge: Fridge; dist?: number; now: number; onClose?: () => void }) {
  const { data, organizationId } = useFoodBank();
  const [requestOpen, setRequestOpen] = useState(false);
  const operator = userById(data, fridge.operatorUserId);
  const connection = data.connections
    .filter((c) => c.organizationId === organizationId && c.fridgeId === fridge.id)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
  const approved = connection?.status === "approved" ? connection : undefined;
  const precise = canSeePreciseLocation(data, organizationId, fridge);
  const items = activeInventory(data, fridge.id);
  const temp = approved?.sharing.sensors ? latestReading(data, fridge.id, "temperature") : undefined;

  const caps = [
    { on: fridge.capabilities.temperature, label: "Temperature", icon: Thermometer },
    { on: fridge.capabilities.humidity, label: "Humidity", icon: Droplets },
    { on: fridge.capabilities.airQuality, label: "Air quality", icon: Wind },
    { on: fridge.capabilities.frontCamera, label: "Front camera", icon: Camera },
    { on: fridge.capabilities.interiorCamera, label: "Interior camera", icon: Camera },
    { on: fridge.capabilities.voiceAssistant, label: "Voice assistant", icon: Mic },
  ];

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold leading-tight">{fridge.name}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{fridge.neighborhood} · {fridge.city}{operator ? ` · Operated by ${operator.name}` : ""}</p>
        </div>
        {onClose && <Button variant="ghost" size="sm" onClick={onClose} aria-label="Clear selection">Clear</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <StatusDot tone={fridgeStatusTone(fridge.status)} label={`${fridgeStatusLabel(fridge.status)} · seen ${formatRelative(fridge.lastSeenAt, now)}`} pulse={fridge.status === "offline"} />
        {fridge.visibility === "private" && <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="size-3.5" aria-hidden="true" />Private fridge</span>}
      </div>

      {connection?.status === "approved" ? (
        <div className="rounded-lg border border-sage-deep bg-sage/40 px-3 py-2 text-[13px]">
          <StatusPill kind="connection" status="approved" />
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Sharing {[approved!.sharing.inventory && "inventory", approved!.sharing.sensors && "sensors", approved!.sharing.alerts && "alerts", approved!.sharing.preciseLocation && "precise location"].filter(Boolean).join(", ") || "nothing yet"}.
          </p>
        </div>
      ) : connection?.status === "pending" ? (
        <div className="rounded-lg border border-amber/30 bg-amber-soft/60 px-3 py-2 text-[13px]">
          <StatusPill kind="connection" status="pending" />
          <p className="mt-0.5 text-[12px] text-muted-foreground">Sent {formatRelative(connection.requestedAt, now)}. The operator responds from their dashboard.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {connection?.status === "rejected" && <p className="text-[12px] text-muted-foreground">A previous request was declined {connection.respondedAt ? formatRelative(connection.respondedAt, now) : ""}. You can send a new one.</p>}
          <Button className="w-full" onClick={() => setRequestOpen(true)}>
            <Link2 data-icon="inline-start" /> Send connection request
          </Button>
        </div>
      )}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        {dist !== undefined && (
          <>
            <dt className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3.5" aria-hidden="true" />Distance</dt>
            <dd className="tnum">{dist.toFixed(1)} km ({kmToMiles(dist).toFixed(1)} mi) from your organization</dd>
          </>
        )}
        <dt className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3.5" aria-hidden="true" />Location</dt>
        <dd>{precise ? fridge.address : <span className="text-muted-foreground">Approximate pin only. The address is shared once the operator approves a connection with precise location.</span>}</dd>
        <dt className="flex items-center gap-1.5 text-muted-foreground"><Clock className="size-3.5" aria-hidden="true" />Hours</dt>
        <dd>{fridge.hours}</dd>
        <dt className="flex items-center gap-1.5 text-muted-foreground"><Cpu className="size-3.5" aria-hidden="true" />Hardware</dt>
        <dd>{fridge.hardwareVersion}</dd>
      </dl>

      {fridge.description && <p className="text-[13px] leading-relaxed text-muted-foreground">{fridge.description}</p>}

      <div>
        <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Capabilities</div>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {caps.map((c) => (
            <li key={c.label} className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px]", c.on ? "border-sage-deep bg-sage/50 text-evergreen-deep" : "border-border text-ink-faint line-through")}>
              <c.icon className="size-3" aria-hidden="true" />{c.label}
            </li>
          ))}
        </ul>
      </div>

      {temp && (
        <div className="rounded-lg border border-border border-t-2 border-t-sensor px-3 py-2 text-[13px]">
          <span className="text-muted-foreground">Latest temperature </span>
          <span className="readout text-[18px] text-sensor">{formatTemp(temp.value)}</span>
          <span className="text-[12px] text-muted-foreground"> · {formatRelative(temp.at, now)}</span>
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between">
          <div className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground">Inventory</div>
          <span className="tnum text-[12px] text-muted-foreground">{items.length} {items.length === 1 ? "item" : "items"} listed</span>
        </div>
        {approved?.sharing.inventory ? (
          items.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-muted-foreground">Nothing on the shelves right now.</p>
          ) : (
            <Rows className="mt-1.5 rounded-lg border border-border">
              {items.slice(0, 8).map((i) => (
                <Row key={i.id} className="px-3 py-2" leading={<CategoryIcon category={i.category} className="text-evergreen-deep" />} trailing={i.expiresAt ? <StatusDot tone={expiryTone(i.expiresAt, now)} label={formatRelative(i.expiresAt, now)} className="text-[12px]" /> : undefined}>
                  <div className="truncate text-[13px]">{i.name} <span className="tnum text-muted-foreground">· {i.quantity} {i.unit}</span></div>
                </Row>
              ))}
              {items.length > 8 && <li className="px-3 py-2 text-[12px] text-muted-foreground">and {items.length - 8} more</li>}
            </Rows>
          )
        ) : (
          <p className="mt-1.5 text-[13px] text-muted-foreground">Item details appear once the operator approves a connection with inventory sharing.</p>
        )}
      </div>

      <ConnectionRequestDialog fridge={fridge} open={requestOpen} onOpenChange={setRequestOpen} />
    </div>
  );
}
