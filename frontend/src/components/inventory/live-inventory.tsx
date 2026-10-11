"use client";
import { useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Camera,
  Search,
  RefreshCw,
  Package,
  Clock3,
  ScanLine,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelHeader, PanelBody } from "@/components/shared/panel";
import { Button } from "@/components/ui/button";
import type {
  InventoryCatalog,
  CatalogItem,
} from "@/lib/hardware/inventory-catalog";
function when(at: string) {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function ProductImage({ item }: { item: CatalogItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex h-44 items-center justify-center bg-sage/20 p-5">
      {item.imageUrl && !failed ? (
        <Image
          unoptimized
          width={320}
          height={240}
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain mix-blend-multiply"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="text-center text-muted-foreground">
          <Package className="mx-auto mb-2 size-9 text-evergreen/50" />
          <span className="text-xs">Product image pending</span>
        </div>
      )}
      <span className="absolute right-3 top-3 rounded-full border bg-card px-2.5 py-1 text-xs font-medium">
        {item.quantity} {item.quantity === 1 ? "item" : "items"}
      </span>
    </div>
  );
}
export function LiveInventory() {
  const [fridgeId, setFridgeId] = useState("");
  const [search, setSearch] = useState("");
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["live-inventory", fridgeId],
    queryFn: async () => {
      const response = await fetch(
        "/api/fridge-inventory" +
          (fridgeId ? `?fridgeId=${encodeURIComponent(fridgeId)}` : ""),
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      return payload as InventoryCatalog;
    },
    refetchInterval: 5000,
  });
  const latest = data?.checks[0];
  const visible =
    data?.items.filter((i) =>
      `${i.name} ${i.brand ?? ""} ${i.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const discrepancy =
    (data?.items.filter((i) => i.observed !== null && i.observed !== i.quantity)
      .length ?? 0) + (latest?.observed.filter((o) => !data?.items.some((i) => i.name.toLowerCase() === o.name.toLowerCase())).length ?? 0);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inside the fridge"
        description="A live shelf of donated food, backed by Tiger Data."
        meta={
          <span className="rounded-md border border-evergreen/30 bg-sage px-2 py-1 text-xs text-evergreen">
            Live inventory · refreshes every 5 seconds
          </span>
        }
        actions={
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />
      {error && (
        <Panel>
          <PanelBody className="pt-5">
            <p role="alert" className="text-sm text-critical">
              {error.message}
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => refetch()}
            >
              Retry connection
            </Button>
          </PanelBody>
        </Panel>
      )}
      {!data && !error && (
        <p role="status" className="py-16 text-muted-foreground">
          Loading Tiger Data inventory…
        </p>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-sage/30 p-5">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Community fridge
              </p>
              <select
                aria-label="Choose fridge"
                value={data.fridge.id}
                onChange={(e) => setFridgeId(e.target.value)}
                className="max-w-full rounded-md border bg-card px-3 py-2 font-medium"
              >
                {data.fridges.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Confirmed check-ins create stock. Shelf scans record what the
              camera sees.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [
                Boxes,
                "Recorded items",
                String(data.items.reduce((n, i) => n + i.quantity, 0)),
              ],
              [
                Camera,
                "Latest shelf check",
                latest ? when(latest.at) : "Waiting for camera",
              ],
              [ScanLine, "Counts to review", String(discrepancy)],
            ].map(([Icon, label, value]) => {
              const Glyph = Icon as typeof Boxes;
              return (
                <Panel key={String(label)}>
                  <PanelBody className="flex items-center gap-4 pt-5">
                    <span className="rounded-lg bg-sage p-3 text-evergreen">
                      <Glyph className="size-5" />
                    </span>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {String(label)}
                      </p>
                      <p className="readout mt-1 text-xl font-semibold">
                        {String(value)}
                      </p>
                    </div>
                  </PanelBody>
                </Panel>
              );
            })}
          </div>
          {latest && (
            <div
              className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${latest.status === "ok" ? "border-evergreen/20 bg-sage/30" : "border-amber/30 bg-amber-soft/50"}`}
            >
              <Camera className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">{latest.headline}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.analyzedAt
                    ? `Latest analyzed shelf image: ${when(data.analyzedAt)}.`
                    : "No usable Gemini shelf analysis recorded yet."}{" "}
                  Camera counts can miss hidden packages; differences need
                  review.
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              aria-label="Search inventory"
              type="search"
              placeholder="Search food, brands, or categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-lg border bg-card px-4 text-sm"
            />
          </div>
          {visible.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((item) => (
                <Panel as="article" key={item.id} className="overflow-hidden">
                  <ProductImage key={item.imageUrl} item={item} />
                  <PanelBody className="space-y-3 pt-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {item.category}
                      </p>
                      <h2 className="mt-1 font-display text-base font-semibold">
                        {item.name}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[item.brand, item.size].filter(Boolean).join(" · ") ||
                          "Package details not recorded"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between border-t pt-3 text-xs">
                      <span>
                        Recorded: <strong>{item.quantity}</strong>
                      </span>
                      <span
                        className={
                          item.observed !== null &&
                          item.observed !== item.quantity
                            ? "text-amber"
                            : "text-muted-foreground"
                        }
                      >
                        Camera: {item.observed ?? "Not counted"}
                      </span>
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      {item.expiresAt
                        ? `Recorded date: ${item.expiresAt.slice(0, 10)}`
                        : "Expiration date not recorded"}
                    </p>
                    {item.imageUrl && (
                      <p className="text-[11px] text-muted-foreground">
                        {item.imageMatch}
                        {item.imageSource && (
                          <>
                            {" "}
                            ·{" "}
                            <a
                              href={item.imageSource}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              Image source{" "}
                              <ExternalLink className="inline size-3" />
                            </a>
                          </>
                        )}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Last check-in {when(item.updatedAt)}
                    </p>
                  </PanelBody>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel tone="sage">
              <PanelBody className="py-12 text-center">
                <Boxes className="mx-auto mb-3 size-10 text-evergreen/50" />
                <h2 className="font-display text-lg font-semibold">
                  {search
                    ? "No matching items"
                    : "Waiting for the first confirmed donation"}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  {search
                    ? "Try a different food name or brand."
                    : "Show an item to the donation camera, confirm it, and place it inside. Once the camera app records the check-in, its product and image appear here automatically."}
                </p>
              </PanelBody>
            </Panel>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Shelf scan history"
                description="Every scheduled check is stored, including unavailable images. Stock is not overwritten."
              />
              <PanelBody className="space-y-3">
                {data.checks.length ? (
                  data.checks.slice(0, 6).map((c) => (
                    <div key={c.id} className="rounded-lg border p-3">
                      <div className="flex justify-between gap-3 text-xs">
                        <span className="font-medium">{when(c.at)}</span>
                        <span
                          className={
                            c.status === "ok" ? "text-evergreen" : "text-amber"
                          }
                        >
                          {c.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm">{c.headline}</p>
                      {c.observed.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {c.observed
                            .map((i) => `${i.count} × ${i.name}`)
                            .join(" · ")}
                        </p>
                      )}
                      {c.thumbnail && (
                        <Image
          unoptimized
          width={320}
          height={240}
                          src={c.thumbnail}
                          alt="Recorded shelf camera observation"
                          className="mt-3 max-h-36 rounded-md object-contain"
                        />
                      )}
                    </div>
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    The rear camera uploads an audit every five minutes while
                    the camera app is running.
                  </p>
                )}
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader
                title="Recent front-camera identifications"
                description="Identification history. Scanning alone does not add food to stock."
              />
              <PanelBody className="space-y-3">
                {data.scans.length ? (
                  data.scans.slice(0, 8).map((s) => (
                    <div
                      key={s.id}
                      className="flex justify-between gap-3 border-b pb-3 text-sm last:border-0"
                    >
                      <span className="font-medium">{s.name}</span>
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {when(s.at)}
                      </time>
                    </div>
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    New scans appear here when the updated camera app identifies
                    a product.
                  </p>
                )}
                <p className="flex gap-2 pt-3 text-xs text-muted-foreground">
                  <AlertTriangle className="size-4 shrink-0" />
                  This is inventory tracking, not a guarantee of food safety.
                  Unreadable dates remain unknown.
                </p>
              </PanelBody>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
