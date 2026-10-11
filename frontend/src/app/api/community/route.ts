import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readWorld, recordRefill } from "@/lib/community/storage";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json(await readWorld(), {
    headers: { "cache-control": "no-store" },
  });
}
const input = z.object({
  id: z.string().uuid(),
  fridgeId: z.string().max(60),
  crewId: z.string().max(60),
  units: z.number().int().min(1).max(40),
});
export async function POST(request: Request) {
  if (
    !request.headers.get("origin") ||
    new URL(request.headers.get("origin")!).host !== request.headers.get("host")
  )
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
      await recordRefill({
        ...parsed.data,
        actor: session.name,
        at: new Date().toISOString(),
      }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
