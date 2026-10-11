import { NextResponse } from "next/server";
import { z } from "zod";
import { isElevenLabsConfigured, synthesizeSpeech } from "@/lib/integrations/elevenlabs";
import { getSession } from "@/lib/auth/session";

const schema = z.object({ text: z.string().min(1).max(400) });

/** POST /api/voice — short text-to-speech preview of the fridge's voice assistant. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in or choose a demo persona first" }, { status: 401 });
  if (!isElevenLabsConfigured()) return NextResponse.json({ error: "ElevenLabs is not configured", configured: false }, { status: 501 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    const audio = await synthesizeSpeech(parsed.data.text);
    return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
