import { NextResponse } from "next/server";
import { z } from "zod";
import { recognizeFood, demoRecognition, isGeminiConfigured } from "@/lib/integrations/gemini";
import { getSession, hasRole } from "@/lib/auth/session";

const bodySchema = z.object({ image: z.string().min(16).max(12_000_000), mimeType: z.string().default("image/jpeg"), mode: z.enum(["live", "demo"]).default("live") });

/** POST /api/recognize — camera frame → recognized items. Operators only. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !hasRole(session, "operator")) return NextResponse.json({ error: "Operator access required" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    // Demo personas never call Gemini: the demo must not consume real API quota or present demo frames as live results.
    if (session.mode === "demo" || parsed.data.mode === "demo" || !isGeminiConfigured()) {
      return NextResponse.json(demoRecognition());
    }
    const result = await recognizeFood(parsed.data.image, parsed.data.mimeType);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
