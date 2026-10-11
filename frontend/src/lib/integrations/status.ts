import "server-only";

/** Which external integrations are configured. Safe to send to the client: booleans only. */
export function integrationStatus() {
  return {
    clerk: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
    database: Boolean(process.env.DATABASE_URL || process.env.FRIDGE_HARDWARE_MODE === "1"),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    solana: Boolean(process.env.SOLANA_PAYER_SECRET_KEY),
    hardware: Boolean(process.env.FRIDGE_INGEST_TOKEN || process.env.FRIDGE_HARDWARE_MODE === "1"),
  };
}
