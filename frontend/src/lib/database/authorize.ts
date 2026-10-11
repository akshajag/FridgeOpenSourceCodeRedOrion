import "server-only";
import { eq } from "drizzle-orm";
import type { FridgeySession } from "@/lib/auth/session";
import { db, schema } from "./client";

/** Authorization checks executed against the database, not the client. */
export function isOrgAdmin(session: FridgeySession, organizationId: string) {
  return session.memberships.some((m) => m.role === "food_bank" && m.organizationId === organizationId);
}

export async function operatesFridge(session: FridgeySession, fridgeId: string) {
  if (session.memberships.some((m) => m.role === "operator" && m.fridgeId === fridgeId)) return true;
  const [row] = await db().select({ operatorUserId: schema.fridges.operatorUserId }).from(schema.fridges).where(eq(schema.fridges.id, fridgeId));
  return row?.operatorUserId === session.userId;
}

export async function missionOrganization(missionId: string) {
  const [row] = await db().select({ organizationId: schema.missions.organizationId }).from(schema.missions).where(eq(schema.missions.id, missionId));
  return row?.organizationId ?? null;
}

export async function donationById(donationId: string) {
  const [row] = await db().select().from(schema.donations).where(eq(schema.donations.id, donationId));
  return row ?? null;
}
