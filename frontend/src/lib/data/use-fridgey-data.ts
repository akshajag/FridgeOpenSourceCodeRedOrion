"use client";

/**
 * Single data-access hook for every dashboard.
 * - Demo mode: reads and writes the persistent local demo store.
 * - Live mode: reads a server snapshot through TanStack Query and writes through API routes.
 *
 * Components only ever consume `{ data, actions, mode, ready }` from this hook, which keeps
 * the migration from demo adapters to TigerData/PostgreSQL contained to this file and the API routes.
 */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FridgeyDataset } from "@/types";
import { useDemoStore } from "@/lib/demo/store";
import type { FridgeyActions } from "./actions";
import { useDataMode } from "./data-mode";
import { createRemoteActions, fetchDataset } from "./remote";

export interface FridgeyData {
  mode: "demo" | "live";
  ready: boolean;
  error?: string;
  data: FridgeyDataset;
  actions: FridgeyActions;
  /** The currently acting user id (demo persona or live user). */
  currentUserId: string;
}

const EMPTY: FridgeyDataset = {
  users: [],
  organizations: [],
  fridges: [],
  inventory: [],
  inventoryEvents: [],
  sensorReadings: [],
  alerts: [],
  missions: [],
  donations: [],
  events: [],
  connections: [],
  leaderboard: [],
  rewards: [],
  rewardTransactions: [],
};

export function useFridgeyData(): FridgeyData {
  const { mode, currentUserId } = useDataMode();
  const demoData = useDemoStore((s) => s.data);
  const demoHydrated = useDemoStore((s) => s.hydrated);
  const demoActions = useDemoStore((s) => s.actions);
  const queryClient = useQueryClient();

  const live = useQuery({
    queryKey: ["fridgey-dataset", currentUserId],
    queryFn: fetchDataset,
    refetchInterval: 5000,
    enabled: mode === "live",
  });

  const remoteActions = useMemo(
    () =>
      createRemoteActions(() =>
        queryClient.invalidateQueries({ queryKey: ["fridgey-dataset"] }),
      ),
    [queryClient],
  );

  if (mode === "live") {
    return {
      mode,
      ready: !live.isPending,
      error: live.error ? (live.error as Error).message : undefined,
      data: live.data ?? EMPTY,
      actions: remoteActions,
      currentUserId,
    };
  }
  return {
    mode,
    ready: demoHydrated,
    data: demoData,
    actions: demoActions,
    currentUserId,
  };
}
