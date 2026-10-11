import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { getSession } from "@/lib/auth/session";
import { bridge } from "@/lib/hardware/bridge";
export const runtime = "nodejs";
const attempts = new Map<string, number>();
async function realAccount() {
  const session = await getSession();
  if (
    !session ||
    session.mode !== "live" ||
    session.userId === "local-hardware-operator"
  )
    return null;
  return session;
}
export async function GET() {
  const session = await realAccount();
  if (!session)
    return NextResponse.json(
      { error: "Sign in with your own account to view mission pickup points." },
      { status: 401 },
    );
  try {
    const [account, leaderboard] = await Promise.all([
      bridge(`/pickups/users/${encodeURIComponent(session.userId)}`),
      bridge("/pickups/leaderboard"),
    ]);
    if (!account.ok || !leaderboard.ok) throw new Error("unavailable");
    return NextResponse.json(
      { ...(await account.json()), leaderboard: await leaderboard.json() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Mission pickup data is temporarily unavailable." },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  try {
    if (
      new URL(req.headers.get("origin") ?? "").host !== req.headers.get("host")
    )
      return NextResponse.json(
        { error: "Same-site request required." },
        { status: 403 },
      );
  } catch {
    return NextResponse.json(
      { error: "Same-site request required." },
      { status: 403 },
    );
  }
  const session = await realAccount();
  if (!session)
    return NextResponse.json(
      {
        error:
          "Sign in with Google or your own account first. A demo persona or shared device is not a pickup identity.",
      },
      { status: 401 },
    );
  const now = Date.now(),
    last = attempts.get(session.userId) ?? 0;
  if (now - last < 15000)
    return NextResponse.json(
      { error: "Wait 15 seconds before requesting another code." },
      { status: 429 },
    );
  attempts.set(session.userId, now);
  try {
    const user = await currentUser();
    if (!user || user.id !== session.userId)
      return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    const username =
      user.username ||
      user.fullName ||
      user.firstName ||
      `Volunteer ${user.id.slice(-6)}`;
    const role = session.memberships.some(
      (m) => m.role === "food_bank" && m.organizationId,
    )
      ? "food_bank"
      : "volunteer";
    // A volunteer starts an assigned transfer mission here. The server, not
    // spoken claims or the request body, binds its identity/role/points.
    const r = await bridge("/pickups/authorizations", {
      method: "POST",
      body: JSON.stringify({
        user_id: session.userId,
        username,
        role,
        fridge_id: process.env.FRIDGE_ID ?? "orion-fridge-01",
      }),
    });
    if (!r.ok) throw new Error("unavailable");
    return NextResponse.json(await r.json(), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not create pickup authorization. Check the local data connection.",
      },
      { status: 503 },
    );
  }
}
