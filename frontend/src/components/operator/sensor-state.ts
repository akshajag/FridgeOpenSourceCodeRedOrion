import type { AlertType, FridgeCapabilities, FridgeThresholds, InventoryEvent, SensorMetric, SensorReading } from "@/types";
import { HOUR_MS } from "@/lib/data/derived";

export type SensorState = "ok" | "warning" | "critical" | "stale";

export const METRICS: SensorMetric[] = ["temperature", "humidity", "air_quality"];

/** Readings older than this are treated as stale rather than current. */
export const STALE_MS = 2 * HOUR_MS;

export const METRIC_LABEL: Record<SensorMetric, string> = {
  temperature: "Temperature",
  humidity: "Humidity",
  air_quality: "Air quality (CO₂-eq)",
};

export const METRIC_UNIT: Record<SensorMetric, "°C" | "%" | "ppm"> = {
  temperature: "°C",
  humidity: "%",
  air_quality: "ppm",
};

export const METRIC_DECIMALS: Record<SensorMetric, number> = {
  temperature: 1,
  humidity: 0,
  air_quality: 0,
};

export function metricSupported(metric: SensorMetric, caps: FridgeCapabilities): boolean {
  return metric === "temperature" ? caps.temperature : metric === "humidity" ? caps.humidity : caps.airQuality;
}

export function bandFor(metric: SensorMetric, th: FridgeThresholds): { min?: number; max?: number } {
  if (metric === "temperature") return { min: th.tempMinC, max: th.tempMaxC };
  if (metric === "humidity") return th.humidityMaxPct !== undefined ? { max: th.humidityMaxPct } : {};
  return th.airQualityMaxPpm !== undefined ? { max: th.airQualityMaxPpm } : {};
}

/** Whether a single value is inside the configured band for its metric. */
export function withinBand(metric: SensorMetric, value: number, th: FridgeThresholds): boolean {
  const band = bandFor(metric, th);
  if (band.min !== undefined && value < band.min) return false;
  if (band.max !== undefined && value > band.max) return false;
  return true;
}

export function sensorState(metric: SensorMetric, latest: SensorReading | undefined, th: FridgeThresholds, now = Date.now()): SensorState {
  if (!latest) return "stale";
  if (now - new Date(latest.at).getTime() > STALE_MS) return "stale";
  const v = latest.value;
  if (metric === "temperature") {
    if (v > th.tempMaxC + 3 || v < th.tempMinC - 2) return "critical";
    if (v > th.tempMaxC || v < th.tempMinC) return "warning";
    return "ok";
  }
  if (metric === "humidity") {
    if (th.humidityMaxPct !== undefined && v > th.humidityMaxPct) return "warning";
    return "ok";
  }
  if (th.airQualityMaxPpm !== undefined) {
    if (v > th.airQualityMaxPpm * 1.5) return "critical";
    if (v > th.airQualityMaxPpm) return "warning";
  }
  return "ok";
}

export function stateLabel(state: SensorState): string {
  return state === "ok" ? "Within range" : state === "warning" ? "Out of range" : state === "critical" ? "Critical" : "Stale";
}

export function summarize(readings: SensorReading[]): { min: number; max: number; avg: number; count: number } | null {
  if (!readings.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const r of readings) {
    if (r.value < min) min = r.value;
    if (r.value > max) max = r.value;
    sum += r.value;
  }
  return { min, max, avg: sum / readings.length, count: readings.length };
}

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  temperature_excursion: "Temperature excursion",
  sensor_offline: "Sensor offline",
  expiring_soon: "Expiring soon",
  unconfirmed_removal: "Unconfirmed removal",
  air_quality: "Air quality",
  humidity: "Humidity",
};

export const ALERT_TYPES: AlertType[] = ["temperature_excursion", "sensor_offline", "expiring_soon", "unconfirmed_removal", "air_quality", "humidity"];

export const EVENT_TYPE_LABEL: Record<InventoryEvent["type"], string> = {
  added: "Added",
  removed: "Removed",
  edited: "Edited",
  confirmed: "Recognition confirmed",
  expired: "Expired",
  unconfirmed_removal: "Anomaly — needs review",
  donation_received: "Donation received",
};

export const EVENT_TYPES: InventoryEvent["type"][] = ["added", "removed", "edited", "confirmed", "expired", "unconfirmed_removal", "donation_received"];

export const ACTOR_LABEL: Record<InventoryEvent["actor"], string> = {
  operator: "Operator",
  camera: "Interior camera",
  donor: "Donor",
  system: "System",
};

/** Converts an ISO date to the yyyy-mm-dd value a date input expects (local time). */
export function toDateInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Converts a yyyy-mm-dd input value to an ISO string at local end of day, or undefined. */
export function fromDateInput(value: string): string | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 0, 0).toISOString();
}
