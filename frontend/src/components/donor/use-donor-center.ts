"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { GeoPoint } from "@/types";

/** Fixed demo "home" point in Montrose, Houston, used until the donor shares their device location. */
export const DEMO_HOME: GeoPoint = { lat: 29.745, lng: -95.39 };
export const DEMO_HOME_LABEL = "Your area (approximate)";

export interface DonorCenter {
  center: GeoPoint;
  label: string;
  source: "demo" | "device";
  /** True once we know the browser exposes geolocation (decided after mount to avoid hydration mismatch). */
  supported: boolean;
  locating: boolean;
  error?: string;
  locate: () => void;
  reset: () => void;
}

const noopSubscribe = () => () => {};

/**
 * Where distances are measured from. Starts at the fixed demo point and can be replaced by the
 * device location when the donor asks for it. Denial or failure is reported, never thrown.
 */
export function useDonorCenter(): DonorCenter {
  const [center, setCenter] = useState<GeoPoint>(DEMO_HOME);
  const [source, setSource] = useState<"demo" | "device">("demo");
  const supported = useSyncExternalStore(noopSubscribe, () => typeof navigator !== "undefined" && "geolocation" in navigator, () => false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    setError(undefined);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSource("device");
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Distances still use your approximate area." : "Couldn't read your location. Distances still use your approximate area.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  const reset = useCallback(() => {
    setCenter(DEMO_HOME);
    setSource("demo");
    setError(undefined);
  }, []);

  return { center, label: source === "device" ? "Your location" : DEMO_HOME_LABEL, source, supported, locating, error, locate, reset };
}
