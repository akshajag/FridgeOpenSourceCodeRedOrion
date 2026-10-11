import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { bridge } from "@/lib/hardware/bridge";
import { devnetStatus, isValidSolanaAddress } from "@/lib/integrations/solana";
export const runtime = "nodejs";
export async function GET() {
  const session = await getSession();
  if (!session || session.mode === "demo")
    return NextResponse.json(
      { error: "Sign in with Google to view your rewards." },
      { status: 401 },
    );
  try {
    const [r, solana] = await Promise.all([
      bridge("/rewards/users/" + encodeURIComponent(session.userId)),
      devnetStatus(),
    ]);
    if (!r.ok) throw new Error("unavailable");
    const account = await r.json();
    return NextResponse.json(
      { ...account, userId: session.userId, solana },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Reward storage is temporarily unavailable. Retry shortly." },
      { status: 503 },
    );
  }
}
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.mode === "demo")
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let same = false;
  try {
    same =
      new URL(req.headers.get("origin") ?? "").host === req.headers.get("host");
  } catch {}
  if (!same)
    return NextResponse.json(
      { error: "Same-site request required" },
      { status: 403 },
    );
  const b = await req.json().catch(() => null);
  if (
    !b ||
    !(
      b.address === null ||
      (typeof b.address === "string" && isValidSolanaAddress(b.address))
    )
  )
    return NextResponse.json(
      { error: "Use a valid public Solana wallet address." },
      { status: 400 },
    );
  try {
    const r = await bridge(
      "/rewards/users/" + encodeURIComponent(session.userId) + "/wallet",
      { method: "PUT", body: JSON.stringify({ address: b.address }) },
    );
    if (!r.ok) throw new Error("save failed");
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json(
      { error: "Could not save wallet. Retry shortly." },
      { status: 503 },
    );
  }
}
