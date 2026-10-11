import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { bridge, localRequest } from "@/lib/hardware/bridge";
import { getSession } from "@/lib/auth/session";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(req: Request, ctx: Context) {
  if (!await localRequest(req)) return NextResponse.json({ error: "Local fridge access only" }, { status: 403 });
  const path = (await ctx.params).path.join("/");
  if (!["state", "frame/front", "frame/shelf", "stream/front", "stream/shelf", "conditions"].includes(path)) return new Response(null, { status: 404 });
  try {
    const res = await bridge(path === "conditions" ? `/fridges/${encodeURIComponent(process.env.FRIDGE_ID ?? "orion-fridge-01")}/conditions` : "/" + path, { signal: req.signal }, path !== "conditions");
    return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Camera/voice service is offline. Start the MVP launcher." }, { status: 503 }); }
}
export async function POST(req: Request, ctx: Context) {
  if (!await localRequest(req) || !req.headers.get("origin") || new URL(req.headers.get("origin")!).host !== req.headers.get("host")) return NextResponse.json({ error: "Same-origin local access required" }, { status: 403 });
  const path = (await ctx.params).path.join("/");
  if (!["begin", "finish", "say", "reset-auth"].includes(path)) return new Response(null, { status: 404 });
  try {
    if (path === "reset-auth") {
      const jar = await cookies();jar.delete("fridgey-demo-persona");jar.delete("fridgey-kiosk-session");
      return NextResponse.json({ ok: true });
    }
    const jar = await cookies();
    if (path !== "begin" && !jar.get("fridgey-kiosk-session")) return NextResponse.json({ error: "Start a donor session first" }, { status: 401 });
    if (path !== "begin") {
      const current = await (await bridge("/state", undefined, true)).json();
      if (jar.get("fridgey-kiosk-session")?.value !== current.epoch) { jar.delete("fridgey-kiosk-session");return NextResponse.json({error:"The previous donor session has ended"},{status:401}); }
    }
    const input = await req.json().catch(() => ({}));
    const session = path === "begin" ? await getSession() : null;
    // Never trust a browser-supplied user id. Local operator access is not donor authentication.
    const identity = session?.mode === "live" && session.userId !== "local-hardware-operator" ? { id: session.userId, name: session.name } : null;
    const body = path === "begin" ? { identity } : path === "say" ? { text: input.text } : {};
    const res = await bridge("/" + path, { method: "POST", body: JSON.stringify(body) }, true);
    const result = await res.json();
    if (res.ok && path === "begin") jar.set("fridgey-kiosk-session", result.epoch, { httpOnly: true, sameSite: "strict", path: "/", maxAge: 1800 });
    if (path === "finish") jar.delete("fridgey-kiosk-session");
    return NextResponse.json(result, { status: res.status });
  } catch { return NextResponse.json({ error: "Voice service unavailable" }, { status: 503 }); }
}
