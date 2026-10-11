"use client";

import { useState } from "react";

/** A render-stable timestamp captured on mount, so date comparisons stay pure during render. */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
