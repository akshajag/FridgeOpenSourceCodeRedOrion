import "server-only";
import type { FridgeyDataset, User, FoodCategory } from "@/types";
import { bridge } from "./bridge";
type Reading = { event_id: string; captured_at: string; temperature_c: number | string | null; air_quality_raw: number | string | null };
type Event = {id:string;product_id:string;kind:string;quantity_delta:number;verification:string;occurred_at:string;canonical_name:string};
type Product = { product_id: string; canonical_name: string; recorded_quantity: number; last_event_at: string };
type Details = {fridge:{name:string;created_at:string}|null; products:{id:string;match_method:string;metadata:Record<string,unknown>}[]; donations:{id:string;product_id:string;canonical_name:string;quantity:number;status:string;identification_method:string;details:Record<string,unknown>;created_at:string;confirmed_at:string|null}[]};
type Conditions = { monitoring_confidence_percent:number; conditions:{key:string;value:number|null;threshold:number}[]; last_reading_at: string | null; last_reading_age_seconds: number | null; baseline: { temperature_c: number; air_quality_raw: number; thresholds: { temperature_rise_c: number; air_increase_raw: number } }; alerts: { key: string; label: string; state: string }[] };
export async function loadHardwareDataset(userId = "local-hardware-operator", name = "Local fridge operator"): Promise<FridgeyDataset> {
  const id = process.env.FRIDGE_ID ?? "orion-fridge-01";
  async function read<T>(suffix: string): Promise<T> { const r = await bridge(`/fridges/${encodeURIComponent(id)}/${suffix}`); if (!r.ok) throw new Error("Tiger Data is unavailable"); return r.json(); }
  const [c, recent, products, events, history, details] = await Promise.all([read<Conditions>("conditions"), read<Reading[]>("sensors"), read<Product[]>("inventory"), read<Event[]>("events"), read<Reading[]>("history"), read<Details>("details")]);
  const readings = [...recent, ...history.filter(r => !recent.length || r.captured_at < recent[recent.length-1].captured_at)].map((r,i)=>({...r,event_id:r.event_id ?? `history-${i}`,temperature_c:r.temperature_c===null?null:Number(r.temperature_c),air_quality_raw:r.air_quality_raw===null?null:Number(r.air_quality_raw)}));
  const categories:FoodCategory[]=["dairy","produce","protein","bakery","prepared","beverages","pantry"];
  const category=(value:unknown):FoodCategory=>categories.includes(value as FoodCategory)?value as FoodCategory:"pantry";
  const expiry=(value:unknown)=>typeof value==="string"&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():undefined;
  const condition=(key:string)=>c.conditions.find(x=>x.key===key);
  const at = c.last_reading_at ?? new Date(0).toISOString();
  const memberships = [{ role: "operator" as const, fridgeId: id }];
  const user: User = { id: userId, name, email: "", initials: "LF", memberships, isDemo: false, createdAt: at };
  return {
    hardwareConditions:{confidence:c.monitoring_confidence_percent,moisture:condition("moisture")?.value??null,movement:condition("movement")?.value??null,moistureThreshold:condition("moisture")?.threshold??10,movementThreshold:condition("movement")?.threshold??0.2},
    users: [user], organizations: [],
    fridges: [{ id, name: details.fridge?.name ?? "Community fridge", operatorUserId: userId, visibility: "public", location: { lat: 29.7199, lng: -95.3422 }, neighborhood: "CodeRED Orion", city: "Houston", address: "", status: c.last_reading_age_seconds === null || c.last_reading_age_seconds > 20 ? "offline" : c.alerts.length ? "degraded" : "online", lastSeenAt: at, capabilities: { temperature: true, humidity: false, airQuality: true, frontCamera: false, interiorCamera: false, voiceAssistant: false }, thresholds: { tempMinC: c.baseline.temperature_c - 2, tempMaxC: c.baseline.temperature_c + c.baseline.thresholds.temperature_rise_c, airQualityMaxPpm: c.baseline.air_quality_raw + c.baseline.thresholds.air_increase_raw }, hours: "Hackathon demo", description: "Live Arduino readings and recorded Tiger Data inventory. Moisture is contact wetness; air readings are raw sensor response. Monitoring is not proof of food safety.", hardwareVersion: "Arduino UNO R4 + Grove sensors", createdAt: details.fridge?.created_at ?? at }],
    inventory: products.map(p => {
      const meta=details.products.find(x=>x.id===p.product_id);
      const donation=details.donations.find(x=>x.product_id===p.product_id&&x.status==="donor_confirmed");
      const fields={...meta?.metadata,...donation?.details};
      return {id:p.product_id,fridgeId:id,name:p.canonical_name,category:category(fields.category),quantity:Number(p.recorded_quantity),unit:typeof fields.unit==="string"?fields.unit:"item",addedAt:donation?.created_at??p.last_event_at,updatedAt:p.last_event_at,expiresAt:expiry(fields.expires_at??fields.expiration_date??fields.expiresAt),recognitionSource:donation?.identification_method==="gemini"?"gemini" as const:"manual" as const,recognitionConfirmed:meta?.match_method==="manual",status:Number(p.recorded_quantity)>0?"available" as const:"removed" as const};
    }),
    sensorReadings: readings.flatMap(r => [r.temperature_c === null ? [] : [{ id: `${r.event_id}-temp`, fridgeId: id, metric: "temperature" as const, value: r.temperature_c, unit: "°C" as const, source: "hardware" as const, at: r.captured_at }], r.air_quality_raw === null ? [] : [{ id: `${r.event_id}-air`, fridgeId: id, metric: "air_quality" as const, value: r.air_quality_raw, unit: "raw" as const, source: "hardware" as const, at: r.captured_at }]].flat()),
    alerts: c.alerts.map(a => ({ id: `condition-${a.key}`, fridgeId: id, type: a.key === "temperature" ? "temperature_excursion" : a.key === "air" ? "air_quality" : a.key === "moisture" ? "contact_moisture" : a.key === "movement" ? "movement" : "sensor_offline", severity: "warning", title: a.label, detail: `Measured condition: ${a.state}. Check the fridge; this does not diagnose food safety.`, createdAt: at })),
    inventoryEvents: events.map(e=>({id:e.id,fridgeId:id,itemId:e.product_id,itemName:e.canonical_name,type:e.kind==="donation"?"donation_received":e.quantity_delta<0?"removed":"added",quantityDelta:e.quantity_delta,actor:e.verification==="donor_confirmed"?"donor":"operator",at:e.occurred_at})), missions: [], donations: details.donations.filter(d=>d.status!=="cancelled").map(d=>({id:d.id,fridgeId:id,donorUserId:"unattributed-donor",itemName:d.canonical_name,category:category(d.details.category),quantity:d.quantity,unit:typeof d.details.unit==="string"?d.details.unit:"item",expiresAt:expiry(d.details.expires_at??d.details.expiration_date),status:d.status==="donor_confirmed"?"delivered" as const:"proposed" as const,proposedAt:d.created_at,deliveredAt:d.confirmed_at??undefined,pointsAwarded:0,note:"Donor confirmation is not independent camera verification."})), events: [], connections: [], leaderboard: [], rewards: [], rewardTransactions: [],
  };
}
