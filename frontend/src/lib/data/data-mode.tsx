"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Membership } from "@/types";

export interface DataModeValue {
  mode: "demo" | "live";
  currentUserId: string;
  userName: string;
  memberships: Membership[];
  persona?: "food_bank" | "operator" | "donor";
}

const DataModeContext = createContext<DataModeValue | null>(null);

export function DataModeProvider({ value, children }: { value: DataModeValue; children: ReactNode }) {
  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
}

export function useDataMode(): DataModeValue {
  const ctx = useContext(DataModeContext);
  if (!ctx) throw new Error("useDataMode must be used inside a DataModeProvider (dashboard layout)");
  return ctx;
}
