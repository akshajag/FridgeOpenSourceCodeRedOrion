import "server-only";

/**
 * Gemini food recognition. Given a camera frame, returns recognized items with an
 * expiration date when one is legible. Falls back to a labeled demo recognition when
 * GEMINI_API_KEY is absent so the scanning UI stays demonstrable.
 */
import { z } from "zod";
import type { FoodCategory } from "@/types";

export const recognitionSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      category: z.enum(["dairy", "produce", "protein", "bakery", "prepared", "beverages", "pantry"]),
      quantity: z.number().int().positive().default(1),
      unit: z.string().default("pcs"),
      expiresAt: z.string().nullable().optional(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export type Recognition = z.infer<typeof recognitionSchema> & { source: "gemini" | "demo_recognition"; model?: string };

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const PROMPT = `You are the inventory camera for a community food-sharing refrigerator. Identify each distinct food item visible. For each, return name, category (one of dairy, produce, protein, bakery, prepared, beverages, pantry), estimated quantity and unit, an ISO-8601 expiration date if a printed date is legible (else null), and a confidence from 0 to 1. Respond with JSON only: {"items":[...]}.`;

export async function recognizeFood(imageBase64: string, mimeType = "image/jpeg"): Promise<Recognition> {
  if (!isGeminiConfigured()) return demoRecognition();
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
      generationConfig: { response_mime_type: "application/json", temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  const parsed = recognitionSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("Gemini returned an unexpected shape");
  return { ...parsed.data, source: "gemini", model };
}

const DEMO_POOL: { name: string; category: FoodCategory; unit: string }[] = [
  { name: "Whole milk, 1 gal", category: "dairy", unit: "cartons" },
  { name: "Greek yogurt cups", category: "dairy", unit: "cups" },
  { name: "Roma tomatoes", category: "produce", unit: "pcs" },
  { name: "Eggs, dozen", category: "protein", unit: "cartons" },
  { name: "Sourdough loaf", category: "bakery", unit: "loaves" },
  { name: "Orange juice", category: "beverages", unit: "bottles" },
  { name: "Hummus", category: "prepared", unit: "tubs" },
];

export function demoRecognition(): Recognition {
  const pick = DEMO_POOL[Math.floor(Math.random() * DEMO_POOL.length)];
  const days = 2 + Math.floor(Math.random() * 9);
  return {
    source: "demo_recognition",
    items: [
      { ...pick, quantity: 1 + Math.floor(Math.random() * 3), expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(), confidence: Number((0.62 + Math.random() * 0.33).toFixed(2)) },
    ],
  };
}
