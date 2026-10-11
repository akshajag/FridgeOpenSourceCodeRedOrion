import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Lazily-created Drizzle client. Throws a descriptive error when DATABASE_URL is missing
 * so callers can fall back to demo behavior and surface a clear message.
 */
let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!cached) {
    const client = postgres(process.env.DATABASE_URL, { max: 5, prepare: false });
    cached = drizzle(client, { schema });
  }
  return cached;
}

export { schema };
