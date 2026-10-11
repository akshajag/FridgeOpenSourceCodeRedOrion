import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getSession, type FridgeySession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/database/client";

/**
 * Shared scaffolding for live-mode mutation routes:
 * - requires a live (Clerk) session; demo personas use the local store and never hit these routes
 * - requires DATABASE_URL
 * - validates the body with zod
 */
export async function liveHandler<T>(req: Request, schema: ZodType<T>, run: (body: T, session: Extract<FridgeySession, { mode: "live" }>) => Promise<unknown>) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (session.mode === "demo") return NextResponse.json({ error: "Demo personas use the local demo dataset; live API routes are disabled for them." }, { status: 403 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured. Live mode needs a TigerData/PostgreSQL database." }, { status: 503 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  try {
    const result = await run(parsed.data, session);
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    const message = (err as Error).message;
    const status = /forbidden|not allowed|do not/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export function forbidden(message = "You are not allowed to do that"): never {
  throw new Error(`Forbidden: ${message}`);
}
