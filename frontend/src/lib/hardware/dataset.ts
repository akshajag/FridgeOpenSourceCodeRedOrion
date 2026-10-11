import "server-only";
import type { FridgeyDataset, User } from "@/types";
import { bridge } from "./bridge";
type Reading = { event_id: string; captured_at: string; temperature_c: number | null; air_quality_raw: number | null };
type Event = {id:string;product_id:string;kind:string;quantity_delta:number;verification:string;occurred_at:string;canonical_name:string};
type Product = { product_id: string; canonical_name: string; recorded_quantity: number; last_event_at: string };
type Conditions = { last_reading_at: string | null; last_reading_age_seconds: number | null; baseline: { temperature_c: number; air_quality_raw: number; thresholds: { temperature_rise_c: number; air_increase_raw: number } }; alerts: { key: string; label: string; state: string }[] };
export async function loadHardwareDataset(userId = "local-hardware-operator", name = "Local fridge operator"): Promise<FridgeyDataset> {
  const id = process.env.FRIDGE_ID ?? "orion-fridge-01";
  async function read<T>(suffix: string): Promise<T> { const r = await bridge(`/fridges/${encodeURIComponent(id)}/${suffix}`); if (!r.ok) throw new Error("Tiger Data is unavailable"); return r.json(); }
  const [c, readings, products, events] = await Promise.all([read<Conditions>("conditions"), read<Reading[]>("sensors"), read<Product[]>("inventory"), read<Event[]>("events")]);
  const at = c.last_reading_at ?? new Date(0).toISOString();
  const memberships = [{ role: "operator" as const, fridgeId: id }];
  const user: User = { id: userId, name, email: "", initials: "LF", memberships, isDemo: false, createdAt: at };
  return {
    users: [user], organizations: [],
    fridges: [{ id, name: "Nourish · Orion fridge", operatorUserId: userId, visibility: "public", location: { lat: 29.7199, lng: -95.3422 }, neighborhood: "CodeRED Orion", city: "Houston", address: "", status: c.last_reading_age_seconds === null || c.last_reading_age_seconds > 20 ? "offline" : c.alerts.length ? "degraded" : "online", lastSeenAt: at, capabilities: { temperature: true, humidity: false, airQuality: true, frontCamera: true, interiorCamera: true, voiceAssistant: true }, thresholds: { tempMinC: c.baseline.temperature_c - 2, tempMaxC: c.baseline.temperature_c + c.baseline.thresholds.temperature_rise_c, airQualityMaxPpm: c.baseline.air_quality_raw + c.baseline.thresholds.air_increase_raw }, hours: "Hackathon demo", description: "Real Arduino readings and camera-confirmed Tiger Data inventory. Moisture is contact wetness; air readings are raw sensor response. Monitoring is not proof of food safety.", hardwareVersion: "Arduino UNO R4 + Grove sensors", createdAt: at }],
    inventory: products.map(p => ({ id: p.product_id, fridgeId: id, name: p.canonical_name, category: "pantry", quantity: Number(p.recorded_quantity), unit: "item", addedAt: p.last_event_at, updatedAt: p.last_event_at, recognitionSource: "gemini", recognitionConfirmed: true, status: Number(p.recorded_quantity) > 0 ? "available" : "removed" })),
    sensorReadings: readings.flatMap(r => [r.temperature_c === null ? [] : [{ id: `${r.event_id}-temp`, fridgeId: id, metric: "temperature" as const, value: r.temperature_c, unit: "°C" as const, source: "hardware" as const, at: r.captured_at }], r.air_quality_raw === null ? [] : [{ id: `${r.event_id}-air`, fridgeId: id, metric: "air_quality" as const, value: r.air_quality_raw, unit: "raw" as const, source: "hardware" as const, at: r.captured_at }]].flat()),
    alerts: c.alerts.map(a => ({ id: `condition-${a.key}`, fridgeId: id, type: a.key === "temperature" ? "temperature_excursion" : a.key === "air" ? "air_quality" : "sensor_offline", severity: "warning", title: a.label, detail: `Measured condition: ${a.state}. Check the fridge; this does not diagnose food safety.`, createdAt: at })),
    inventoryEvents: events.map(e=>({id:e.id,fridgeId:id,itemId:e.product_id,itemName:e.canonical_name,type:e.kind==="donation"?"donation_received":e.quantity_delta<0?"removed":"added",quantityDelta:e.quantity_delta,actor:e.verification==="donor_confirmed"?"donor":"operator",at:e.occurred_at})), missions: [], donations: [], events: [], connections: [], leaderboard: [], rewards: [], rewardTransactions: [],
  };
}
