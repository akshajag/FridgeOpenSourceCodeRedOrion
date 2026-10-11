import { z } from "zod";
import { eq } from "drizzle-orm";
import { liveHandler, forbidden } from "../_lib/handler";
import { db, schema } from "@/lib/database/client";
import { donationById, operatesFridge } from "@/lib/database/authorize";
import { acceptDonation, newId } from "@/lib/database/repository";

const category = z.enum(["dairy", "produce", "protein", "bakery", "prepared", "beverages", "pantry"]);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("propose"), input: z.object({ donorUserId: z.string(), fridgeId: z.string(), missionId: z.string().optional(), itemName: z.string().min(1).max(120), category, quantity: z.number().int().positive(), unit: z.string().min(1).max(24), expiresAt: z.string().optional(), note: z.string().max(300).optional() }) }),
  z.object({ action: z.literal("delivered"), id: z.string() }),
  z.object({ action: z.literal("accept"), id: z.string() }),
  z.object({ action: z.literal("reject"), id: z.string(), reason: z.string().min(2).max(300) }),
]);

export const POST = (req: Request) =>
  liveHandler(req, body, async (b, session) => {
    const d = db();
    if (b.action === "propose") {
      if (b.input.donorUserId !== session.userId) forbidden("donations are recorded under your own account");
      const id = newId("don");
      await d.insert(schema.donations).values({ id, ...b.input, expiresAt: b.input.expiresAt ? new Date(b.input.expiresAt) : null });
      if (b.input.missionId) await d.insert(schema.missionParticipants).values({ missionId: b.input.missionId, userId: session.userId }).onConflictDoNothing();
      return { id };
    }
    const donation = await donationById(b.id);
    if (!donation) throw new Error("Donation not found");
    if (b.action === "delivered") {
      if (donation.donorUserId !== session.userId) forbidden("only the donor can mark a donation delivered");
      await d.update(schema.donations).set({ status: "delivered", deliveredAt: new Date() }).where(eq(schema.donations.id, b.id));
      return { ok: true };
    }
    // Verification is the operator's job: only the fridge operator can accept or reject.
    if (!(await operatesFridge(session, donation.fridgeId))) forbidden("only the fridge operator can verify this donation");
    if (b.action === "accept") await acceptDonation(b.id, session.userId);
    else {
      await d.update(schema.donations).set({ status: "rejected" }).where(eq(schema.donations.id, b.id));
      await d.insert(schema.donationVerifications).values({ id: newId("ver"), donationId: b.id, verifiedByUserId: session.userId, decision: "rejected", reason: b.reason });
    }
    return { ok: true };
  });
