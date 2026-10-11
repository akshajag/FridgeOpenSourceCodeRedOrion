"use client";
import { WeeklySolanaRewards } from "./weekly-solana-rewards";
import { MissionPickup } from "./mission-pickup";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPinned,
  Trophy,
  HeartHandshake,
  ArrowUpRight,
  PackagePlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelHeader, PanelBody } from "@/components/shared/panel";
import { Button } from "@/components/ui/button";
import { FridgeMap } from "@/components/maps/fridge-map";
import {
  owner,
  standings,
  territoryGeoJSON,
  type CommunityWorld,
} from "@/lib/community/model";
import type { Fridge } from "@/types";
import { toast } from "sonner";

async function loadWorld(): Promise<CommunityWorld> {
  const response = await fetch("/api/community", { cache: "no-store" });
  if (!response.ok) throw new Error("Community demo is unavailable.");
  return response.json();
}
export function CommunityBoard({
  leaderboardOnly = false,
}: {
  leaderboardOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const {
    data: world,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["community-demo"],
    queryFn: loadWorld,
    refetchInterval: 5000,
  });
  const [selected, setSelected] = useState("");
  const [crew, setCrew] = useState("nourish");
  const [units, setUnits] = useState(8);
  const [needsOnly, setNeedsOnly] = useState(false);
  const [fitAll, setFitAll] = useState(0);
  const [showTerritory, setShowTerritory] = useState(true);
  const pathname = usePathname();
  const base = pathname.startsWith("/dashboard/operator")
    ? "/dashboard/operator"
    : pathname.startsWith("/dashboard/food-bank")
      ? "/dashboard/food-bank"
      : "/dashboard/donor";
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/community", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          fridgeId: selected || params.get("fridge") || "houston-1",
          crewId: crew,
          units,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Refill failed");
      return payload as CommunityWorld;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["community-demo"], next);
      toast.success("Demo refill recorded", {
        description:
          "Stock, mission progress, connected map cells, and the leaderboard updated together.",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const territories = useMemo(
    () => (world ? territoryGeoJSON(world) : undefined),
    [world],
  );
  const params = useSearchParams();
  const initialFridge = params.get("fridge");
  const activeSelected = selected || initialFridge || "houston-1";
  if (isLoading)
    return (
      <p className="py-16 text-muted-foreground" role="status">
        Loading the neighborhood…
      </p>
    );
  if (error || !world)
    return (
      <Panel>
        <PanelBody className="pt-5">
          <p role="alert">
            The community demo couldn’t load. Refresh to retry.
          </p>
        </PanelBody>
      </Panel>
    );
  const ranks = standings(world);
  const fridge =
    world.fridges.find((f) => f.id === activeSelected) ?? world.fridges[0];
  const held = world.crews.find((c) => c.id === owner(fridge));
  const deficit = fridge.capacity - fridge.stock;
  const shown = world.fridges.filter(
    (f) => !needsOnly || f.stock < f.capacity * 0.4,
  );
  const mapped: Fridge[] = shown.map((f) => ({
    id: f.id,
    name: f.name,
    operatorUserId: "demo",
    visibility: "public",
    location: { lat: f.lat, lng: f.lng },
    neighborhood: f.neighborhood,
    city: "Houston",
    address: "Demo location",
    status: f.stock < 16 ? "degraded" : "online",
    lastSeenAt: world.updatedAt,
    capabilities: {
      temperature: false,
      humidity: false,
      airQuality: false,
      frontCamera: false,
      interiorCamera: false,
      voiceAssistant: false,
    },
    thresholds: {
      tempMinC: 0,
      tempMaxC: 5,
      humidityMinPct: 0,
      humidityMaxPct: 100,
      airQualityMaxPpm: 100,
    },
    hours: "Demo only",
    description: f.need,
    hardwareVersion: "mock",
    createdAt: world.updatedAt,
  }));
  return (
    <div className="space-y-6">
      {leaderboardOnly && <MissionPickup leaderboardOnly />}
      <PageHeader
        title={leaderboardOnly ? "Community leaderboard" : "Community map"}
        description={
          leaderboardOnly
            ? "Local impact, measured in food supplied and fridges helped."
            : "Find a fridge that needs food. Refill it. Help your crew grow its neighborhood."
        }
        meta={
          <span className="rounded-md border border-amber/40 bg-amber-soft px-2 py-1 text-xs text-amber">
            CodeRED: Orion · simulated community
          </span>
        }
      />
      {leaderboardOnly && <WeeklySolanaRewards ranks={ranks} />}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sage-deep/60 bg-sage/40 px-5 py-4">
        <p className="max-w-2xl text-sm">
          Paper.io-inspired impact game: each crew starts at a home base. Every
          food unit supplied earns three connected map cells; crews compete for
          open space. These are symbolic support zones. Food stays available to
          everyone.
        </p>
        <Button asChild variant="outline">
          <Link
            href={`${base}/${leaderboardOnly ? "community" : "leaderboard"}`}
          >
            {leaderboardOnly ? <MapPinned /> : <Trophy />}
            {leaderboardOnly ? "Explore the map" : "View leaderboard"}
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          [MapPinned, "Community fridges", world.fridges.length],
          [
            PackagePlus,
            "Need a refill",
            world.fridges.filter((f) => f.stock < 16).length,
          ],
          [
            HeartHandshake,
            "Food units supplied",
            ranks.reduce((n, r) => n + r.units, 0),
          ],
        ].map(([Icon, label, value]) => {
          const Glyph = Icon as typeof MapPinned;
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
                  <p className="readout text-3xl font-semibold">
                    {String(value)}
                  </p>
                </div>
              </PanelBody>
            </Panel>
          );
        })}
      </div>
      {!leaderboardOnly && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Houston · refill the city"
              description="Real streets + connected crew territory. Select a fridge to supply food and expand your crew’s frontier."
              action={
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFitAll((n) => n + 1)}
                  >
                    Show all fridges
                  </Button>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={showTerritory}
                      onChange={(e) => setShowTerritory(e.target.checked)}
                    />
                    Territories
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={needsOnly}
                      onChange={(e) => setNeedsOnly(e.target.checked)}
                    />
                    Needs refilling
                  </label>
                </div>
              }
            />
            <div className="h-[560px] px-3 pb-3">
              <FridgeMap
                fridges={mapped}
                selectedId={activeSelected}
                onSelect={setSelected}
                territories={
                  showTerritory
                    ? territories
                    : { type: "FeatureCollection", features: [] }
                }
                fitAllTrigger={fitAll}
                center={{ lat: 29.75, lng: -95.366 }}
              />
            </div>
            <div className="flex flex-wrap gap-4 border-t px-5 py-3 text-xs">
              {world.crews.map((c) => (
                <span key={c.id} className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ background: c.color }}
                  />
                  {c.name} · {ranks.find((r) => r.id === c.id)?.territories}{" "}
                  cells
                </span>
              ))}
              <span className="text-muted-foreground">
                Amber markers need food · green markers stocked
              </span>
            </div>
            <p className="border-t px-5 py-3 text-xs leading-relaxed text-muted-foreground">
              Home bases: Orion Builders / Midtown; Cougar Collective / Third
              Ward; MLH Community Crew / East End; Team Nourish / University.
              Refill any fridge for your crew to expand from its home base.
              Uncolored cells are open; crews never overlap.
            </p>
          </Panel>
          <Panel>
            <PanelHeader
              title={fridge.name}
              description={fridge.neighborhood}
            />
            <PanelBody className="space-y-5">
              <div>
                <p className="text-xs text-muted-foreground">Food available</p>
                <p className="readout mt-1 text-3xl font-semibold">
                  {fridge.stock}
                  <span className="text-base font-normal text-muted-foreground">
                    {" "}
                    / {fridge.capacity} units
                  </span>
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-evergreen"
                    style={{
                      width: `${(fridge.stock / fridge.capacity) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="rounded-lg bg-sage/50 p-3 text-sm">
                <p className="font-medium">
                  {deficit === 0
                    ? "Fully stocked"
                    : `${deficit} more units can be donated`}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Requested: {fridge.need}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">
                  Leading contributor at this fridge
                </p>
                <p className="mt-1 font-medium" style={{ color: held?.color }}>
                  {held?.name ?? "Unclaimed · be the first to help"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {held
                    ? `${fridge.supplied[held.id]} supplied units to beat or match. Ties use a stable crew order.`
                    : "Your first refill claims this neighborhood."}
                </p>
              </div>
              <label className="block space-y-1 text-xs">
                Your demo crew
                <select
                  value={crew}
                  onChange={(e) => setCrew(e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {world.crews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs">
                Food units to supply
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, deficit)}
                  value={units}
                  onChange={(e) => setUnits(Number(e.target.value))}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                />
              </label>
              <Button
                className="w-full"
                disabled={
                  mutation.isPending ||
                  deficit === 0 ||
                  !Number.isInteger(units) ||
                  units < 1 ||
                  units > deficit
                }
                onClick={() => mutation.mutate()}
              >
                <PackagePlus />
                {mutation.isPending ? "Updating…" : "Simulate confirmed refill"}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                This action changes mock data only. It does not scan food, issue
                points, send SOL, or alter real fridge inventory.
              </p>
            </PanelBody>
          </Panel>
        </div>
      )}
      {!leaderboardOnly && (
        <Panel>
          <PanelHeader
            title="Choose a fridge"
            description="Accessible list of the demo locations shown on the map."
          />
          <PanelBody>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelected(f.id)}
                  className={`rounded-lg border p-3 text-left transition-colors hover:bg-sage/40 ${f.id === activeSelected ? "border-evergreen bg-sage/30" : "border-border"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {f.neighborhood}
                    </span>
                    <span
                      className={`text-xs ${f.stock < 16 ? "text-amber" : "text-evergreen"}`}
                    >
                      {f.stock < 16 ? "Needs refill" : "Stocked"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.name} · {f.stock}/{f.capacity} units
                  </p>
                </button>
              ))}
            </div>
          </PanelBody>
        </Panel>
      )}
      <Panel>
        <PanelHeader
          title="Crews making an impact"
          description="This demo week · ranked by supplied food units, then fridges helped. No scan points."
        />
        <PanelBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-3">Rank / crew</th>
                  <th className="pb-3 text-right">Food supplied</th>
                  <th className="pb-3 text-right">Fridges helped</th>
                  <th className="pb-3 text-right">Map cells</th>
                </tr>
              </thead>
              <tbody>
                {ranks.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`border-b last:border-0 ${r.id === crew ? "bg-sage/30" : ""}`}
                  >
                    <td className="py-4">
                      <span className="mr-4 text-muted-foreground">
                        #{i + 1}
                      </span>
                      <span
                        className="mr-2 inline-block size-2.5 rounded-sm"
                        style={{ background: r.color }}
                      />
                      {r.name}
                    </td>
                    <td className="py-4 text-right font-medium">
                      {r.units} units
                    </td>
                    <td className="py-4 text-right">{r.helped}</td>
                    <td className="py-4 text-right">{r.territories}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelBody>
      </Panel>
      {world.refills.length > 0 && (
        <Panel>
          <PanelHeader
            title="Recent community activity"
            description="Simulated confirmed refills, shared across this demo server."
          />
          <PanelBody className="space-y-3">
            {world.refills.slice(0, 5).map((e) => (
              <p key={e.id} className="text-sm">
                <span className="font-medium">{e.actor}</span> supplied{" "}
                {e.units} units to{" "}
                {world.fridges.find((f) => f.id === e.fridgeId)?.name} for{" "}
                {world.crews.find((c) => c.id === e.crewId)?.name}.
              </p>
            ))}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
