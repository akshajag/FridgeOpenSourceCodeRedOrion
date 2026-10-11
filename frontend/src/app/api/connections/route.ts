import { z } from "zod";
import { eq } from "drizzle-orm";
import { liveHandler, forbidden } from "../_lib/handler";
import { db, schema } from "@/lib/database/client";
import { isOrgAdmin, operatesFridge } from "@/lib/database/authorize";
import { newId } from "@/lib/database/repository";

const sharing = z.object({ inventory: z.boolean(), sensors: z.boolean(), alerts: z.boolean(), preciseLocation: z.boolean() });
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), organizationId: z.string(), fridgeId: z.string(), message: z.string().max(400), sharing }),
  z.object({ action: z.literal("respond"), id: z.string(), decision: z.enum(["approved", "rejected"]), sharing: sharing.optional() }),
  z.object({ action: z.literal("sharing"), id: z.string(), sharing }),
]);

export const POST = (req: Request) =>
  liveHandler(req, body, async (b, session) => {
    const d = db();
    if (b.action === "request") {
      if (!isOrgAdmin(session, b.organizationId)) forbidden("you do not administer this organization");
      const id = newId("conn");
      await d.insert(schema.connections).values({ id, organizationId: b.organizationId, fridgeId: b.fridgeId, message: b.message, sharing: b.sharing });
      return { id };
    }
    const [row] = await d.select({ fridgeId: schema.connections.fridgeId }).from(schema.connections).where(eq(schema.connections.id, b.id));
    if (!row) throw new Error("Connection not found");
    // Only the fridge owner decides what is shared.
    if (!(await operatesFridge(session, row.fridgeId))) forbidden("only the fridge operator can respond to or change sharing for this connection");
    if (b.action === "respond") await d.update(schema.connections).set({ status: b.decision, respondedAt: new Date(), ...(b.sharing ? { sharing: b.sharing } : {}) }).where(eq(schema.connections.id, b.id));
    else await d.update(schema.connections).set({ sharing: b.sharing }).where(eq(schema.connections.id, b.id));
    return { ok: true };
  });
