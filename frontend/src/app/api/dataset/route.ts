import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/database/client";

/** GET /api/dataset — the authorization-scoped snapshot used by live dashboards. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (session.mode === "demo") return NextResponse.json({ error: "Demo personas read the local demo dataset" }, { status: 403 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "DATABASE_URL is not configured. Live mode needs a TigerData/PostgreSQL database." }, { status: 503 });
  const { loadDataset } = await import("@/lib/database/repository");
  try {
    return NextResponse.json(await loadDataset(session), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
