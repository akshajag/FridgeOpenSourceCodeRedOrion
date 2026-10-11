"use client";

import { DEMO_COOKIE, type DemoPersona } from "./config";

/** Client-side helpers for the demo persona cookie. The cookie is not an auth token:
 * it only selects which synthetic persona the demo dashboards render. */
export function setDemoPersonaCookie(persona: DemoPersona) {
  document.cookie = `${DEMO_COOKIE}=${persona}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

export function clearDemoPersonaCookie() {
  document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function readDemoPersonaCookie(): DemoPersona | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${DEMO_COOKIE}=([^;]*)`));
  const value = match?.[1];
  return value === "food_bank" || value === "operator" || value === "donor" ? value : null;
}
