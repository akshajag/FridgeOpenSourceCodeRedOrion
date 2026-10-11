"use client";

import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useFridgeyData } from "@/lib/data/use-fridgey-data";
import { AlertTriangle } from "lucide-react";

/** Renders a skeleton until the data layer is ready; shows a recoverable error state in live mode. */
export function DataGate({ children, skeleton }: { children: ReactNode; skeleton?: ReactNode }) {
  const { ready, error, mode } = useFridgeyData();
  if (error) {
    return (
      <div className="rounded-lg border border-critical/30 bg-critical-soft px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-critical"><AlertTriangle className="size-4" /> Couldn’t load live data</div>
        <p className="mt-1 text-muted-foreground">{error}. {mode === "live" ? "Check DATABASE_URL and the API logs, or switch to demo mode." : ""}</p>
      </div>
    );
  }
  if (!ready) {
    return (
      skeleton ?? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
          <Skeleton className="h-72" />
        </div>
      )
    );
  }
  return <>{children}</>;
}
