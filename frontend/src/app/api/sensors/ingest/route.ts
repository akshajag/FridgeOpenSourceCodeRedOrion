import { NextResponse } from "next/server";
import { z } from "zod";
import { isDatabaseConfigured } from "@/lib/database/client";
import { insertSensorReading } from "@/lib/database/repository";

const body = z.object({
  fridgeId: z.string(),
  readings: z.array(z.object({ metric: z.enum(["temperature", "humidity", "air_quality"]), value: z.number().finite() })).min(1).max(50),
});

/**
 * POST /api/sensors/ingest — hardware endpoint for the Arduino-compatible board.
 * Authenticated with a bearer token (FRIDGE_INGEST_TOKEN). In production this would be a
 * per-device token stored hashed on the fridge row; a single shared token keeps the hackathon setup simple.
 */
export async function POST(req: Request) {
  const token = process.env.FRIDGE_INGEST_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) return NextResponse.json({ error: "Invalid ingest token" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 503 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  for (const r of parsed.data.readings) await insertSensorReading(parsed.data.fridgeId, r.metric, r.value, "hardware");
  return NextResponse.json({ ok: true, stored: parsed.data.readings.length });
}
