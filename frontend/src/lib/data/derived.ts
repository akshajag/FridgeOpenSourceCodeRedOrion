/**
 * Pure derived-data helpers shared by every dashboard. No React, no storage.
 */
import type {
  Alert,
  Donation,
  Fridge,
  FridgeyDataset,
  GeoPoint,
  InventoryItem,
  LeaderboardEvent,
  Mission,
  SensorMetric,
  SensorReading,
  User,
} from "@/types";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const kmToMiles = (km: number) => km * 0.621371;

export function activeInventory(data: FridgeyDataset, fridgeId?: string): InventoryItem[] {
  return data.inventory.filter((i) => (fridgeId ? i.fridgeId === fridgeId : true) && i.status !== "removed" && i.status !== "expired");
}

export function inventoryCount(data: FridgeyDataset, fridgeId: string): number {
  return activeInventory(data, fridgeId).reduce((sum, i) => sum + i.quantity, 0);
}

export function itemsNeedingReview(data: FridgeyDataset, fridgeId?: string): InventoryItem[] {
  return activeInventory(data, fridgeId).filter((i) => i.status === "needs_review" || !i.recognitionConfirmed);
}

export function expiringWithin(data: FridgeyDataset, hours: number, fridgeId?: string, now = Date.now()): InventoryItem[] {
  return activeInventory(data, fridgeId)
    .filter((i) => i.expiresAt && new Date(i.expiresAt).getTime() - now < hours * HOUR_MS)
    .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime());
}

export function latestReading(data: FridgeyDataset, fridgeId: string, metric: SensorMetric): SensorReading | undefined {
  let latest: SensorReading | undefined;
  for (const r of data.sensorReadings) {
    if (r.fridgeId !== fridgeId || r.metric !== metric) continue;
    if (!latest || r.at > latest.at) latest = r;
  }
  return latest;
}

export function readingsInRange(data: FridgeyDataset, fridgeId: string, metric: SensorMetric, rangeMs: number, now = Date.now()): SensorReading[] {
  const since = now - rangeMs;
  return data.sensorReadings
    .filter((r) => r.fridgeId === fridgeId && r.metric === metric && new Date(r.at).getTime() >= since)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function openAlerts(data: FridgeyDataset, fridgeId?: string): Alert[] {
  return data.alerts
    .filter((a) => !a.resolvedAt && (fridgeId ? a.fridgeId === fridgeId : true))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.createdAt.localeCompare(a.createdAt));
}

export function severityRank(s: Alert["severity"]): number {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}

export function fridgesForOrganization(data: FridgeyDataset, organizationId: string): { fridge: Fridge; connectionId: string; sharing: FridgeyDataset["connections"][number]["sharing"] }[] {
  return data.connections
    .filter((c) => c.organizationId === organizationId && c.status === "approved")
    .map((c) => ({ fridge: data.fridges.find((f) => f.id === c.fridgeId)!, connectionId: c.id, sharing: c.sharing }))
    .filter((x) => Boolean(x.fridge));
}

export function missionProgress(m: Mission): number {
  return m.quantityNeeded === 0 ? 0 : Math.min(1, m.quantityVerified / m.quantityNeeded);
}

export function missionsForDonor(data: FridgeyDataset): Mission[] {
  return data.missions.filter((m) => m.status === "open" || m.status === "completed").sort((a, b) => a.deadline.localeCompare(b.deadline));
}

export interface LeaderboardRow {
  user: User;
  points: number;
  acceptedDonations: number;
  rank: number;
  lastActivity?: string;
}

export function buildLeaderboard(data: FridgeyDataset, opts: { sinceMs?: number; missionIds?: string[]; now?: number } = {}): LeaderboardRow[] {
  const now = opts.now ?? Date.now();
  const since = opts.sinceMs ? now - opts.sinceMs : 0;
  const donationById = new Map(data.donations.map((d) => [d.id, d]));
  const rows = new Map<string, LeaderboardRow>();
  for (const ev of data.leaderboard as LeaderboardEvent[]) {
    if (new Date(ev.at).getTime() < since) continue;
    if (opts.missionIds) {
      const d = donationById.get(ev.donationId);
      if (!d?.missionId || !opts.missionIds.includes(d.missionId)) continue;
    }
    const user = data.users.find((u) => u.id === ev.userId);
    if (!user) continue;
    const row = rows.get(ev.userId) ?? { user, points: 0, acceptedDonations: 0, rank: 0 };
    row.points += ev.points;
    if (!ev.reason.startsWith("Completed mission")) row.acceptedDonations += 1;
    if (!row.lastActivity || ev.at > row.lastActivity) row.lastActivity = ev.at;
    rows.set(ev.userId, row);
  }
  return Array.from(rows.values())
    .sort((a, b) => b.points - a.points || a.user.name.localeCompare(b.user.name))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

export function donationsForFridge(data: FridgeyDataset, fridgeId: string): Donation[] {
  return data.donations.filter((d) => d.fridgeId === fridgeId).sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
}

export function pendingDonationsForFridge(data: FridgeyDataset, fridgeId: string): Donation[] {
  return donationsForFridge(data, fridgeId).filter((d) => d.status === "proposed" || d.status === "delivered");
}

export function userById(data: FridgeyDataset, id: string): User | undefined {
  return data.users.find((u) => u.id === id);
}

export function fridgeById(data: FridgeyDataset, id?: string): Fridge | undefined {
  return id ? data.fridges.find((f) => f.id === id) : undefined;
}

export function organizationById(data: FridgeyDataset, id?: string) {
  return id ? data.organizations.find((o) => o.id === id) : undefined;
}

/** Whether an organization has an approved connection with precise-location sharing for this fridge. */
export function canSeePreciseLocation(data: FridgeyDataset, organizationId: string | undefined, fridge: Fridge): boolean {
  if (fridge.visibility === "public") return true;
  if (!organizationId) return false;
  return data.connections.some((c) => c.organizationId === organizationId && c.fridgeId === fridge.id && c.status === "approved" && c.sharing.preciseLocation);
}

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const future = diff > 0;
  if (abs < 60_000) {
    const seconds = Math.floor(abs / 1_000);
    if (seconds < 2) return "just now";
    return future ? `in ${seconds}s` : `${seconds}s ago`;
  }
  const unit = abs < HOUR_MS ? [Math.max(1, Math.round(abs / 60_000)), "min"] : abs < DAY_MS ? [Math.round(abs / HOUR_MS), "h"] : [Math.round(abs / DAY_MS), "d"];
  const [n, u] = unit as [number, string];
  const label = u === "min" ? `${n} min` : `${n}${u}`;
  return future ? `in ${label}` : `${label} ago`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

export function formatTemp(value: number) {
  return `${value.toFixed(1)} °C`;
}
