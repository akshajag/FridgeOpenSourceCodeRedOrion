"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { FridgeMapProps } from "./fridge-map";

/** MapLibre is heavy; load it only on pages that render a map. */
export const FridgeMapLazy = dynamic<FridgeMapProps>(() => import("./fridge-map").then((m) => m.FridgeMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-lg" />,
});
