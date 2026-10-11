import { z } from "zod";
import { eq } from "drizzle-orm";
import { liveHandler, forbidden } from "../_lib/handler";
import { db, schema } from "@/lib/database/client";
import { isOrgAdmin } from "@/lib/database/authorize";
import { newId } from "@/lib/database/repository";

const eventInput = z.object({
  organizationId: z.string(),
  name: z.string().min(3).max(140),
  description: z.string().max(600),
  startsAt: z.string(),
  endsAt: z.string(),
  fridgeIds: z.array(z.string()).max(50),
  donationGoal: z.number().int().nonnegative(),
  eligibleItems: z.array(z.string().max(80)).max(20),
  leaderboardRule: z.enum(["verified_points", "verified_quantity"]),
  prizeWinners: z.number().int().nonnegative().max(50),
  prizeBudgetSol: z.number().nonnegative(),
  status: z.enum(["draft", "published"]),
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), input: eventInput }),
  z.object({ action: z.literal("update"), id: z.string(), patch: eventInput.partial() }),
  z.object({ action: z.literal("status"), id: z.string(), status: z.enum(["draft", "published", "closed"]) }),
  z.object({ action: z.literal("delete"), id: z.string() }),
]);

export const POST = (req: Request) =>
  liveHandler(req, body, async (b, session) => {
    const d = db();
    if (b.action === "create") {
      if (!isOrgAdmin(session, b.input.organizationId)) forbidden("you do not administer this organization");
      const id = newId("event");
      await d.insert(schema.communityEvents).values({ id, ...b.input, startsAt: new Date(b.input.startsAt), endsAt: new Date(b.input.endsAt) });
      return { id };
    }
    const [row] = await d.select({ organizationId: schema.communityEvents.organizationId }).from(schema.communityEvents).where(eq(schema.communityEvents.id, b.id));
    if (!row) throw new Error("Event not found");
    if (!isOrgAdmin(session, row.organizationId)) forbidden("you do not administer this organization");
    if (b.action === "update") await d.update(schema.communityEvents).set({ ...b.patch, startsAt: b.patch.startsAt ? new Date(b.patch.startsAt) : undefined, endsAt: b.patch.endsAt ? new Date(b.patch.endsAt) : undefined }).where(eq(schema.communityEvents.id, b.id));
    else if (b.action === "status") await d.update(schema.communityEvents).set({ status: b.status }).where(eq(schema.communityEvents.id, b.id));
    else await d.delete(schema.communityEvents).where(eq(schema.communityEvents.id, b.id));
    return { ok: true };
  });
