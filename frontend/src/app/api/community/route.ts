import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  readWorld,
  recordRefill,
  recordMission,
  recordRescue,
} from "@/lib/community/storage";
import { z } from "zod";
export const runtime = "nodejs";
async function visibleWorld(world: Awaited<ReturnType<typeof readWorld>>) {
  const session = await getSession();
  const { memberships, ...publicWorld } = world;
  return {
    ...publicWorld,
    viewer: session
      ? {
          id: session.userId,
          name: session.name,
          joined: memberships?.[session.userId] ?? [],
        }
      : null,
  };
}
export async function GET() {
  return NextResponse.json(await visibleWorld(await readWorld()), {
    headers: { "cache-control": "no-store" },
  });
}
const input = z.object({
  id: z.string().uuid(),
  fridgeId: z.string().max(60),
  crewId: z.string().max(60),
  units: z.number().int().min(1).max(40),
});
function sameSite(request: Request) {
  try {
    const origin = request.headers.get("origin");
    return !!origin && new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
export async function POST(request: Request) {
  if (!sameSite(request))
    return NextResponse.json(
      { error: "Same-site request required" },
      { status: 403 },
    );
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      { error: "Sign in or choose a demo persona first." },
      { status: 401 },
    );
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid refill details." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await visibleWorld(
        await recordRefill({
          ...parsed.data,
          actor: session.name,
          actorId: session.userId,
          at: new Date().toISOString(),
        }),
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!sameSite(request))
    return NextResponse.json(
      { error: "Same-site request required" },
      { status: 403 },
    );
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = z
    .object({ fridgeId: z.string().max(60), join: z.boolean().optional(), action: z.enum(["pickup","deliver"]).optional() }).refine(v=>typeof v.join === "boolean" || !!v.action)
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid mission." }, { status: 400 });
  try {
    return NextResponse.json(
      await visibleWorld(
        parsed.data.action ? await recordRescue(session.userId, parsed.data.fridgeId, parsed.data.action) : await recordMission(
          session.userId,
          parsed.data.fridgeId,
          parsed.data.join!,
        ),
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
