import { z } from "zod";
import { eq } from "drizzle-orm";
import { liveHandler, forbidden } from "../_lib/handler";
import { db, schema } from "@/lib/database/client";
import { isOrgAdmin } from "@/lib/database/authorize";

const body = z.object({ action: z.enum(["request", "approve", "reject", "payout"]), id: z.string() });

/**
 * Reward state transitions. Donors can only request verification of their own eligible allocation.
 * Approval and rejection require a food-bank administrator of the paying organization.
 * Actual payout goes through /api/rewards/payout which re-checks `approved` before signing.
 */
export const POST = (req: Request) =>
  liveHandler(req, body, async (b, session) => {
    const d = db();
    const [r] = await d.select().from(schema.rewardAllocations).where(eq(schema.rewardAllocations.id, b.id));
    if (!r) throw new Error("Allocation not found");
    if (b.action === "request") {
      if (r.userId !== session.userId) forbidden("you can only request verification for your own reward");
      if (r.status !== "eligible") throw new Error("Only eligible allocations can request verification");
      await d.update(schema.rewardAllocations).set({ status: "pending_verification" }).where(eq(schema.rewardAllocations.id, b.id));
      return { ok: true };
    }
    if (!isOrgAdmin(session, r.organizationId)) forbidden("you do not administer the paying organization");
    if (b.action === "approve") await d.update(schema.rewardAllocations).set({ status: "approved", approvedAt: new Date() }).where(eq(schema.rewardAllocations.id, b.id));
    else if (b.action === "reject") await d.update(schema.rewardAllocations).set({ status: "rejected" }).where(eq(schema.rewardAllocations.id, b.id));
    else throw new Error("Use /api/rewards/payout to execute a payout");
    return { ok: true };
  });
