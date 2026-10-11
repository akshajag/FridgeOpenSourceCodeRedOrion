import "server-only";

/**
 * ElevenLabs text-to-speech for the voice-assisted donation flow on the fridge itself.
 * The web app uses it for a short preview; the on-device assistant uses the same endpoint.
 */
export function isElevenLabsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  if (!isElevenLabsConfigured()) throw new Error("ELEVENLABS_API_KEY is not configured");
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_turbo_v2_5" }),
  });
  if (!res.ok) throw new Error(`ElevenLabs request failed: ${res.status}`);
  return res.arrayBuffer();
}
