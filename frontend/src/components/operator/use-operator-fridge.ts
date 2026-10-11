"use client";

import { useEffect, useState } from "react";
import { useFridgeyData } from "@/lib/data/use-fridgey-data";
import { fridgeById, userById } from "@/lib/data/derived";

/**
 * Resolves the fridge the current user operates. Operators are tied to a fridge through
 * their membership; as a fallback we look for a fridge whose operatorUserId matches.
 */
export function useOperatorFridge() {
  const ctx = useFridgeyData();
  const user = userById(ctx.data, ctx.currentUserId);
  const fridgeId = user?.memberships.find((m) => m.role === "operator")?.fridgeId;
  const fridge = fridgeById(ctx.data, fridgeId) ?? ctx.data.fridges.find((f) => f.operatorUserId === ctx.currentUserId);
  return { ...ctx, user, fridge };
}

/**
 * A render-stable "now" that ticks on an interval so relative timestamps ("3 min ago")
 * stay honest without calling Date.now() during render.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
