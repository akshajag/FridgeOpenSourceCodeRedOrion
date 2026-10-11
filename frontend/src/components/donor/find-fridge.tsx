"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, Clock, ExternalLink, List, LocateFixed, Map as MapIcon, Mic, PlusCircle, Search, Shield } from "lucide-react";
import type { FoodCategory, Fridge, InventoryItem } from "@/types";
import { FOOD_CATEGORIES } from "@/types";
import { useFridgeyData } from "@/lib/data/use-fridgey-data";
import { activeInventory, distanceKm, formatRelative } from "@/lib/data/derived";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FridgeMapLazy } from "@/components/maps/fridge-map-lazy";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { Row, Rows } from "@/components/shared/inline-list";
import { StatusDot, fridgeStatusLabel, fridgeStatusTone } from "@/components/shared/status-dot";
import { CategoryIcon, CATEGORY_LABEL } from "@/components/shared/category-icon";
import { DemoTag } from "@/components/shared/demo-notice";
import { DonationDialog } from "@/components/missions/donation-dialog";
import { DonationTracker } from "@/components/missions/donation-status";
import { useDonorCenter } from "./use-donor-center";
import { useMediaQuery } from "./use-media-query";
import { formatDistance } from "./format";

type Availability = "any" | "has_items" | FoodCategory;
type StatusFilter = "any" | Fridge["status"];
type DistanceFilter = "any" | "2" | "5" | "10" | "25";

interface Enriched {
  fridge: Fridge;
  km: number;
  items: InventoryItem[];
  itemCount: number;
  categories: { category: FoodCategory; count: number; items: InventoryItem[] }[];
}

export function FindFridge() {
  return (
    <DataGate>
      <FindContent />
    </DataGate>
  );
}

function FindContent() {
  const { data, actions, mode, currentUserId } = useFridgeyData();
  const home = useDonorCenter();
  const params = useSearchParams();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [query, setQuery] = useState("");
  const [distance, setDistance] = useState<DistanceFilter>("any");
  const [availability, setAvailability] = useState<Availability>("any");
  const [status, setStatus] = useState<StatusFilter>("any");
  const [view, setView] = useState<"map" | "list">("map");
  const [tilesFailed, setTilesFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("fridge"));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const enriched = useMemo<Enriched[]>(
    () =>
      data.fridges
        .map((fridge) => {
          const items = activeInventory(data, fridge.id).filter((i) => i.status === "available");
          const grouped = new Map<FoodCategory, InventoryItem[]>();
          for (const i of items) grouped.set(i.category, [...(grouped.get(i.category) ?? []), i]);
          const categories = Array.from(grouped.entries())
            .map(([category, list]) => ({ category, items: list, count: list.reduce((s, i) => s + i.quantity, 0) }))
            .sort((a, b) => b.count - a.count);
          return { fridge, km: distanceKm(home.center, fridge.location), items, itemCount: items.reduce((s, i) => s + i.quantity, 0), categories };
        })
        .sort((a, b) => a.km - b.km),
    [data, home.center],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const maxKm = distance === "any" ? Infinity : Number(distance);
    return enriched.filter((e) => {
      if (q && !e.fridge.name.toLowerCase().includes(q) && !e.fridge.neighborhood.toLowerCase().includes(q)) return false;
      if (e.km > maxKm) return false;
      if (status !== "any" && e.fridge.status !== status) return false;
      if (availability === "has_items" && e.itemCount === 0) return false;
      if (availability !== "any" && availability !== "has_items" && !e.categories.some((c) => c.category === availability)) return false;
      return true;
    });
  }, [enriched, query, distance, status, availability]);

  const selected = enriched.find((e) => e.fridge.id === selectedId) ?? null;
  const showList = view === "list" || tilesFailed;
  const approximateIds = useMemo(() => data.fridges.filter((f) => f.visibility === "private").map((f) => f.id), [data.fridges]);
  const myDonationsHere = useMemo(() => (selected ? data.donations.filter((d) => d.fridgeId === selected.fridge.id && d.donorUserId === currentUserId).sort((a, b) => b.proposedAt.localeCompare(a.proposedAt)).slice(0, 3) : []), [data.donations, selected, currentUserId]);

  const onTileError = useCallback(() => setTilesFailed(true), []);

  async function markDelivered(id: string) {
    setBusyId(id);
    try {
      await Promise.resolve(actions.markDonationDelivered(id));
      toast.success("Marked as delivered", { description: "The fridge operator will verify it shortly." });
    } catch (err) {
      toast.error("Couldn't update the donation", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyId(null);
    }
  }

  const detail = selected ? (
    <FridgeDetail entry={selected} centerLabel={home.label} distanceLabel={formatDistance(home.center, selected.fridge.location)} mode={mode} onRecord={() => setDialogOpen(true)}>
      {myDonationsHere.length > 0 && (
        <section>
          <h3 className="font-display text-[14px] font-semibold">Your recent donations here</h3>
          <div className="mt-2 space-y-2">
            {myDonationsHere.map((d) => (
              <DonationTracker key={d.id} donation={d} onMarkDelivered={markDelivered} busy={busyId === d.id} />
            ))}
          </div>
        </section>
      )}
    </FridgeDetail>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find a fridge"
        description="Community fridges near you, what they have on hand, and how to get there."
        meta={mode === "demo" ? <DemoTag /> : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <span>Distances from {home.label.toLowerCase()}</span>
            {home.supported && home.source === "demo" && (
              <Button variant="outline" size="sm" onClick={home.locate} disabled={home.locating}>
                <LocateFixed data-icon="inline-start" /> {home.locating ? "Locating…" : "Use my location"}
              </Button>
            )}
            {home.source === "device" && (
              <Button variant="ghost" size="sm" onClick={home.reset}>
                Use approximate area
              </Button>
            )}
          </div>
        }
      />
      {home.error && <p className="-mt-3 text-[13px] text-amber">{home.error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <PanelBody className="pt-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
                <div className="space-y-1.5 sm:col-span-2 xl:col-span-1">
                  <Label htmlFor="find-search">Search</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="find-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or neighborhood" className="pl-8" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="find-distance">Distance</Label>
                  <Select value={distance} onValueChange={(v) => setDistance(v as DistanceFilter)}>
                    <SelectTrigger id="find-distance" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any distance</SelectItem>
                      <SelectItem value="2">Within 2 km</SelectItem>
                      <SelectItem value="5">Within 5 km</SelectItem>
                      <SelectItem value="10">Within 10 km</SelectItem>
                      <SelectItem value="25">Within 25 km</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="find-availability">Availability</Label>
                  <Select value={availability} onValueChange={(v) => setAvailability(v as Availability)}>
                    <SelectTrigger id="find-availability" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="has_items">Has items</SelectItem>
                      {FOOD_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          Has {c.label.toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="find-status">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                    <SelectTrigger id="find-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any status</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="degraded">Degraded</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-muted-foreground">
                  {filtered.length} of {enriched.length} fridges
                </p>
                <div className="inline-flex rounded-lg border border-border bg-muted p-[3px]" role="group" aria-label="View">
                  <button type="button" onClick={() => setView("map")} aria-pressed={!showList} disabled={tilesFailed} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors disabled:opacity-50", !showList ? "bg-card text-foreground shadow-panel" : "text-muted-foreground hover:text-foreground")}>
                    <MapIcon className="size-3.5" aria-hidden="true" /> Map
                  </button>
                  <button type="button" onClick={() => setView("list")} aria-pressed={showList} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors", showList ? "bg-card text-foreground shadow-panel" : "text-muted-foreground hover:text-foreground")}>
                    <List className="size-3.5" aria-hidden="true" /> List
                  </button>
                </div>
              </div>
              {tilesFailed && <p className="mt-2 rounded-md bg-amber-soft px-3 py-2 text-[13px] text-amber">Map tiles unavailable; showing list.</p>}
            </PanelBody>
          </Panel>

          {showList ? (
            <Panel>
              <PanelHeader title="Fridges" description="Closest first. Select one to see details." />
              <PanelBody flush>
                {filtered.length === 0 ? (
                  <div className="px-5 pb-5">
                    <EmptyState compact title="No fridges match" description="Try a wider distance or clear a filter." />
                  </div>
                ) : (
                  <Rows>
                    {filtered.map((e) => (
                      <Row key={e.fridge.id} onClick={() => setSelectedId(e.fridge.id)} selected={e.fridge.id === selectedId} trailing={<span className="tnum text-[13px] text-muted-foreground">{formatDistance(home.center, e.fridge.location)}</span>}>
                        <div className="truncate text-[14px] font-medium text-foreground">{e.fridge.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                          <span>{e.fridge.neighborhood}</span>
                          <StatusDot tone={fridgeStatusTone(e.fridge.status)} label={fridgeStatusLabel(e.fridge.status)} className="text-[12px] text-muted-foreground" />
                          <span className="tnum">{e.itemCount} items available</span>
                          {e.fridge.visibility === "private" && <span>Approximate location</span>}
                        </div>
                      </Row>
                    ))}
                  </Rows>
                )}
              </PanelBody>
            </Panel>
          ) : (
            <Panel className="overflow-hidden">
              <div className="h-[420px] md:h-[520px]">
                <FridgeMapLazy fridges={filtered.map((e) => e.fridge)} selectedId={selectedId} onSelect={setSelectedId} center={home.center} radiusKm={distance === "any" ? undefined : Number(distance)} approximateIds={approximateIds} onTileError={onTileError} className="rounded-xl" />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-5 py-2.5 text-[12px] text-muted-foreground">
                <StatusDot tone="ok" label="Online" className="text-[12px] text-muted-foreground" />
                <StatusDot tone="warning" label="Degraded" className="text-[12px] text-muted-foreground" />
                <StatusDot tone="critical" label="Offline" className="text-[12px] text-muted-foreground" />
                <span>Dashed ring: approximate location (private fridge)</span>
              </div>
            </Panel>
          )}
        </div>

        {isDesktop && (
          <aside className="min-w-0">
            {selected ? (
              <Panel className="lg:sticky lg:top-6">{detail}</Panel>
            ) : (
              <EmptyState icon={<MapIcon />} title="Select a fridge" description="Pick a marker on the map or a row in the list to see hours, what's inside, and directions." className="h-full min-h-[320px]" />
            )}
          </aside>
        )}
      </div>

      {!isDesktop && (
        <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
          <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-xl">
            {selected && (
              <>
                <SheetHeader className="sr-only">
                  <SheetTitle>{selected.fridge.name}</SheetTitle>
                  <SheetDescription>Fridge details</SheetDescription>
                </SheetHeader>
                {detail}
              </>
            )}
          </SheetContent>
        </Sheet>
      )}

      {selected && <DonationDialog open={dialogOpen} onOpenChange={setDialogOpen} fridgeId={selected.fridge.id} />}
    </div>
  );
}

function FridgeDetail({ entry, centerLabel, distanceLabel, mode, onRecord, children }: { entry: Enriched; centerLabel: string; distanceLabel: string; mode: "demo" | "live"; onRecord: () => void; children?: React.ReactNode }) {
  const { fridge, categories, itemCount } = entry;
  const isPrivate = fridge.visibility === "private";
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${fridge.location.lat},${fridge.location.lng}`;
  const caps = fridge.capabilities;
  const cameraCount = Number(caps.frontCamera) + Number(caps.interiorCamera);
  return (
    <div className="space-y-5 px-5 py-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot tone={fridgeStatusTone(fridge.status)} label={fridgeStatusLabel(fridge.status)} pulse={fridge.status === "online"} className="text-[13px]" />
          <span className="text-[12px] text-muted-foreground">Last seen {formatRelative(fridge.lastSeenAt)}</span>
          {mode === "demo" && <DemoTag />}
        </div>
        <h2 className="mt-2 font-display text-[20px] font-semibold leading-tight">{fridge.name}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {fridge.neighborhood}, {fridge.city} · <span className="tnum">{distanceLabel}</span> from {centerLabel.toLowerCase()}
        </p>
        {isPrivate ? (
          <p className="mt-2 flex items-start gap-2 rounded-md bg-sensor-soft px-3 py-2 text-[12px] text-foreground">
            <Shield className="mt-0.5 size-3.5 shrink-0 text-sensor" aria-hidden="true" />
            <span>Private fridge. The map shows an approximate location; the operator shares the exact address directly.</span>
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-foreground">{fridge.address}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onRecord} disabled={fridge.status === "offline"}>
          <PlusCircle data-icon="inline-start" /> Record a donation here
        </Button>
        <Button asChild variant="outline">
          <a href={directions} target="_blank" rel="noopener noreferrer">
            <ExternalLink data-icon="inline-start" /> Directions{isPrivate ? " (approximate)" : ""}
          </a>
        </Button>
      </div>
      {fridge.status === "offline" && <p className="text-[12px] text-muted-foreground">This fridge is offline, so the operator can&apos;t verify drop-offs right now. Try another nearby fridge.</p>}

      <dl className="grid gap-3 text-[13px]">
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <dt className="sr-only">Hours</dt>
            <dd className="text-foreground">{fridge.hours}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Camera className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <dt className="sr-only">Hardware</dt>
            <dd className="text-foreground">
              {cameraCount === 0 ? "No cameras" : `${cameraCount} ${cameraCount === 1 ? "camera" : "cameras"}`}
              {caps.frontCamera && caps.interiorCamera ? " (front and interior)" : caps.frontCamera ? " (front)" : caps.interiorCamera ? " (interior)" : ""}
              <span className="text-muted-foreground"> · {fridge.hardwareVersion}</span>
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Mic className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <dt className="sr-only">Voice assistant</dt>
            <dd className="text-foreground">{caps.voiceAssistant ? "Voice assistant available. Ask it what's inside or how to donate." : "No voice assistant at this fridge."}</dd>
          </div>
        </div>
      </dl>

      <p className="text-[13px] leading-relaxed text-muted-foreground">{fridge.description}</p>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-[14px] font-semibold">What&apos;s inside</h3>
          <span className="tnum text-[12px] text-muted-foreground">{itemCount} items available</span>
        </div>
        {categories.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">Nothing listed right now. Your donation would be the first on the shelf.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {categories.map((c) => (
              <li key={c.category} className="px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
                    <span className="flex size-6 items-center justify-center rounded-md bg-sage text-evergreen-deep">
                      <CategoryIcon category={c.category} className="size-3.5" />
                    </span>
                    {CATEGORY_LABEL[c.category]}
                  </span>
                  <span className="tnum text-[13px] text-muted-foreground">{c.count}</span>
                </div>
                <p className="mt-1 pl-8 text-[12px] leading-snug text-muted-foreground">{c.items.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(", ")}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">Inventory is recognized by the fridge cameras and confirmed by the operator. Counts may lag a little.</p>
      </section>

      {children}
    </div>
  );
}
