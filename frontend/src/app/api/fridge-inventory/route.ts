import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { bridge } from "@/lib/hardware/bridge";
import { cleanCatalog } from "@/lib/hardware/inventory-catalog";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.mode === "demo")
    return NextResponse.json(
      { error: "Sign in to view live inventory." },
      { status: 401 },
    );
  try {
    const listed = await bridge("/fridges");
    if (!listed.ok) throw new Error("Inventory service unavailable");
    const fridges = (await listed.json()) as { id: string; name: string }[];
    const id =
      new URL(request.url).searchParams.get("fridgeId") ??
      process.env.FRIDGE_ID ??
      "orion-fridge-01";
    if (!fridges.some((f) => f.id === id))
      return NextResponse.json({ error: "Fridge not found" }, { status: 404 });
    const response = await bridge(`/fridges/${encodeURIComponent(id)}/catalog`);
    if (!response.ok) throw new Error("Inventory service unavailable");
    const operator = session.memberships.some(
      (m) => m.role === "operator" && m.fridgeId === id,
    );
    return NextResponse.json(
      {
        ...cleanCatalog(await response.json(), operator),
        fridges,
        evaluatedAt: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Tiger Data inventory is unavailable. Retry shortly." },
      { status: 503 },
    );
  }
}
