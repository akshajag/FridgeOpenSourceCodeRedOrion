"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Boxes, MoreHorizontal, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import type { FoodCategory, InventoryEvent, InventoryItem, InventoryStatus } from "@/types";
import { FOOD_CATEGORIES } from "@/types";
import { HOUR_MS, activeInventory, formatDate, formatRelative, inventoryCount, itemsNeedingReview } from "@/lib/data/derived";
import { DataGate } from "@/components/shared/hydration-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { CategoryIcon, CATEGORY_LABEL } from "@/components/shared/category-icon";
import { Confidence } from "@/components/shared/confidence";
import { StatusDot } from "@/components/shared/status-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNow, useOperatorFridge } from "@/components/operator/use-operator-fridge";
import { NoFridge } from "@/components/operator/no-fridge";
import { EventFeed } from "@/components/operator/event-feed";
import { EVENT_TYPES, EVENT_TYPE_LABEL } from "@/components/operator/sensor-state";
import { ItemDialog, type ItemDialogMode, type ItemFormValues } from "./item-dialog";
import { RemoveItemDialog } from "./remove-item-dialog";

type StatusFilter = "all" | "available" | "needs_review" | "reserved";
type SortKey = "expires_asc" | "expires_desc" | "added_desc" | "name";

const STATUS_LABEL: Record<InventoryStatus, string> = {
  available: "Available",
  needs_review: "Needs review",
  reserved: "Reserved",
  removed: "Removed",
  expired: "Expired",
};

export function InventoryManager() {
  return (
    <DataGate>
      <InventoryContent />
    </DataGate>
  );
}

function InventoryContent() {
  const { data, actions, fridge } = useOperatorFridge();
  const router = useRouter();
  const params = useSearchParams();
  const initialStatus = (params.get("status") as StatusFilter | null) ?? "all";
  const initialTab = params.get("tab") === "history" ? "history" : "items";

  const [tab, setTab] = useState<"items" | "history">(initialTab);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FoodCategory | "all">("all");
  const [status, setStatus] = useState<StatusFilter>(["all", "available", "needs_review", "reserved"].includes(initialStatus) ? initialStatus : "all");
  const [sort, setSort] = useState<SortKey>("expires_asc");
  const [eventType, setEventType] = useState<InventoryEvent["type"] | "all">("all");

  const [dialog, setDialog] = useState<{ mode: ItemDialogMode; item?: InventoryItem } | null>(null);
  const [removing, setRemoving] = useState<InventoryItem | null>(null);
  const now = useNow();

  const items = useMemo(() => (fridge ? activeInventory(data, fridge.id) : []), [data, fridge]);
  const review = useMemo(() => (fridge ? itemsNeedingReview(data, fridge.id) : []), [data, fridge]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (category !== "all" && i.category !== category) return false;
      if (status === "needs_review") return i.status === "needs_review" || !i.recognitionConfirmed;
      if (status !== "all" && i.status !== status) return false;
      return true;
    });
    const expTime = (i: InventoryItem) => (i.expiresAt ? new Date(i.expiresAt).getTime() : Number.POSITIVE_INFINITY);
    return list.sort((a, b) => {
      switch (sort) {
        case "expires_asc":
          return expTime(a) - expTime(b) || a.name.localeCompare(b.name);
        case "expires_desc":
          return (expTime(b) === Infinity ? -1 : expTime(b)) - (expTime(a) === Infinity ? -1 : expTime(a)) || a.name.localeCompare(b.name);
        case "added_desc":
          return b.addedAt.localeCompare(a.addedAt);
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [items, query, category, status, sort]);

  const history = useMemo(
    () => (fridge ? data.inventoryEvents.filter((e) => e.fridgeId === fridge.id && (eventType === "all" || e.type === eventType)).sort((a, b) => b.at.localeCompare(a.at)) : []),
    [data, fridge, eventType],
  );

  if (!fridge) return <NoFridge title="Inventory" />;

  const submitDialog = (values: ItemFormValues) => {
    if (!dialog) return;
    try {
      if (dialog.mode === "add") {
        actions.addInventoryItem({ fridgeId: fridge.id, ...values, recognitionSource: "manual" }, "operator");
        toast.success(`Added ${values.quantity} ${values.unit} of ${values.name}.`);
      } else if (dialog.mode === "edit" && dialog.item) {
        actions.updateInventoryItem(dialog.item.id, values);
        toast.success(`Updated ${values.name}.`);
      } else if (dialog.mode === "confirm" && dialog.item) {
        actions.confirmRecognition(dialog.item.id, values);
        toast.success(`Confirmed ${values.name}. It is now available.`);
      }
      setDialog(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const total = inventoryCount(data, fridge.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description={`${items.length} line items · ${total} units estimated from camera counts and check-ins.`}
        actions={<Button type="button" onClick={() => setDialog({ mode: "add" })}><Plus aria-hidden="true" /> Add item</Button>}
      />

      {review.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber/30 bg-amber-soft/70 px-4 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden="true" />
            <div>
              <span className="font-medium text-foreground">{review.length} {review.length === 1 ? "item needs" : "items need"} review.</span>{" "}
              <span className="text-muted-foreground">The camera recognized them with lower confidence. Confirm or correct them so donors see accurate counts.</span>
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => { setTab("items"); setStatus("needs_review"); }}>
            Show items needing review
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => { setTab(v as "items" | "history"); router.replace(v === "history" ? "/dashboard/operator/inventory?tab=history" : "/dashboard/operator/inventory", { scroll: false }); }}>
        <TabsList aria-label="Inventory views">
          <TabsTrigger value="items" className="px-3">Items <span className="tnum text-muted-foreground">{items.length}</span></TabsTrigger>
          <TabsTrigger value="history" className="px-3">History <span className="tnum text-muted-foreground">{history.length}</span></TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-2">
          <Panel>
            <div className="flex flex-col gap-3 border-b border-border px-5 py-3.5 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="inv-search" className="sr-only">Search by name</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="inv-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items" className="pl-8" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="inv-category" className="text-[12px] text-muted-foreground">Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as FoodCategory | "all")}>
                    <SelectTrigger id="inv-category" className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {FOOD_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-status" className="text-[12px] text-muted-foreground">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                    <SelectTrigger id="inv-status" className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="needs_review">Needs review</SelectItem>
                      <SelectItem value="reserved">Reserved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-sort" className="text-[12px] text-muted-foreground">Sort</Label>
                  <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                    <SelectTrigger id="inv-sort" className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expires_asc">Expires soonest</SelectItem>
                      <SelectItem value="expires_desc">Expires latest</SelectItem>
                      <SelectItem value="added_desc">Recently added</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="p-5">
                <EmptyState compact icon={<Boxes />} title={items.length === 0 ? "The fridge is empty" : "No items match these filters"} description={items.length === 0 ? "Items appear here when the interior camera recognizes them or when you add them by hand." : "Try clearing the search or widening the status filter."} action={items.length === 0 ? <Button type="button" size="sm" onClick={() => setDialog({ mode: "add" })}><Plus aria-hidden="true" /> Add item</Button> : undefined} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[880px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Recognition</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((i) => {
                      const expMs = i.expiresAt ? new Date(i.expiresAt).getTime() - now : undefined;
                      const expired = expMs !== undefined && expMs < 0;
                      const soon = expMs !== undefined && !expired && expMs < 48 * HOUR_MS;
                      const needsReview = i.status === "needs_review" || !i.recognitionConfirmed;
                      return (
                        <TableRow key={i.id} className={cn(expired && "bg-critical-soft/40 hover:bg-critical-soft/60")}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sage text-evergreen-deep"><CategoryIcon category={i.category} className="size-3.5" /></span>
                              <div className="min-w-0">
                                <div className="truncate font-medium text-foreground">{i.name}</div>
                                {expired && <div className="text-[11px] font-medium text-critical">Past recorded date</div>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{CATEGORY_LABEL[i.category]}</TableCell>
                          <TableCell className="tnum text-right"><span className="font-medium text-foreground">{i.quantity}</span> <span className="text-muted-foreground">{i.unit}</span></TableCell>
                          <TableCell className="tnum text-muted-foreground"><time dateTime={i.addedAt}>{formatRelative(i.addedAt, now)}</time></TableCell>
                          <TableCell className="tnum">
                            {i.expiresAt ? (
                              <div className={cn(expired ? "text-critical" : soon ? "text-amber" : "text-foreground")}>
                                <div className="font-medium">{formatDate(i.expiresAt)}</div>
                                <div className="text-[11px]">{expired ? `Expired ${formatRelative(i.expiresAt, now)}` : formatRelative(i.expiresAt, now)}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">No date</span>
                            )}
                          </TableCell>
                          <TableCell><Confidence value={i.recognitionConfidence} source={i.recognitionSource} /></TableCell>
                          <TableCell>
                            <StatusDot tone={needsReview ? "warning" : i.status === "reserved" ? "info" : "ok"} label={needsReview ? STATUS_LABEL.needs_review : STATUS_LABEL[i.status]} className="text-[13px]" />
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${i.name}`}><MoreHorizontal /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                {needsReview && (
                                  <DropdownMenuItem onSelect={() => setDialog({ mode: "confirm", item: i })}><ShieldCheck aria-hidden="true" /> Confirm recognition</DropdownMenuItem>
                                )}
                                <DropdownMenuItem onSelect={() => setDialog({ mode: "edit", item: i })}><Pencil aria-hidden="true" /> Edit</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(i)}><Trash2 aria-hidden="true" /> Remove</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="history" className="mt-2">
          <Panel>
            <PanelHeader
              title="Inventory history"
              description="Every addition, removal, edit, and anomaly logged for this fridge."
              action={
                <div className="flex items-center gap-2">
                  <Label htmlFor="hist-type" className="sr-only">Event type</Label>
                  <Select value={eventType} onValueChange={(v) => setEventType(v as InventoryEvent["type"] | "all")}>
                    <SelectTrigger id="hist-type" size="sm" className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All events</SelectItem>
                      {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{EVENT_TYPE_LABEL[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              }
            />
            <PanelBody flush>
              {history.length === 0 ? (
                <div className="px-5 pb-5"><EmptyState compact title="No events of this type" /></div>
              ) : (
                <EventFeed events={history} showDate />
              )}
            </PanelBody>
          </Panel>
        </TabsContent>
      </Tabs>

      <ItemDialog open={Boolean(dialog)} mode={dialog?.mode ?? "add"} item={dialog?.item ?? null} onClose={() => setDialog(null)} onSubmit={submitDialog} />
      <RemoveItemDialog
        item={removing}
        onClose={() => setRemoving(null)}
        onConfirm={(note) => {
          if (!removing) return;
          try {
            actions.removeInventoryItem(removing.id, note);
            toast.success(`Removed ${removing.name}.`);
          } catch (err) {
            toast.error((err as Error).message);
          }
          setRemoving(null);
        }}
      />
    </div>
  );
}
