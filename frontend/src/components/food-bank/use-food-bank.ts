"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useFridgeyData } from "@/lib/data/use-fridgey-data";
import { fridgesForOrganization, organizationById } from "@/lib/data/derived";

/**
 * Food-bank view of the dataset: the acting administrator, their organization, and the
 * fridges connected to it through an approved connection request.
 */
export function useFoodBank() {
  const fd = useFridgeyData();
  const { data, currentUserId } = fd;
  const user = data.users.find((u) => u.id === currentUserId);
  const organizationId = user?.memberships.find((m) => m.role === "food_bank")?.organizationId;
  const organization = organizationById(data, organizationId);
  const connected = useMemo(() => (organizationId ? fridgesForOrganization(data, organizationId) : []), [data, organizationId]);
  const connectedIds = useMemo(() => new Set(connected.map((c) => c.fridge.id)), [connected]);
  return { ...fd, user, organizationId, organization, connected, connectedIds };
}

// ---- Clock: a minute-resolution "now" shared across components, safe for render. ----
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;
function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (!clockTimer) clockTimer = setInterval(() => clockListeners.forEach((l) => l()), 30_000);
  return () => {
    clockListeners.delete(cb);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}
function clockSnapshot() {
  return Math.floor(Date.now() / 60_000) * 60_000;
}
/** Current time rounded to the minute; re-renders roughly once a minute. */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, clockSnapshot, clockSnapshot);
}

/** True when the viewport matches the media query. False during SSR. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
