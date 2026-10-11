import { distanceKm, kmToMiles } from "@/lib/data/derived";
import type { GeoPoint } from "@/types";

/** "1.2 km (0.7 mi)" style distance between two points. */
export function formatDistance(from: GeoPoint, to: GeoPoint): string {
  const km = distanceKm(from, to);
  const mi = kmToMiles(km);
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km · ${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

/** "Jalen B." style anonymized display name. */
export function anonymizeName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function formatSol(amount: number): string {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
}

export function truncateMiddle(value: string, head = 6, tail = 6): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}
