import { z } from "zod";
import { eq } from "drizzle-orm";
import { liveHandler, forbidden } from "../_lib/handler";
import { db, schema } from "@/lib/database/client";
import { operatesFridge } from "@/lib/database/authorize";
import { newId } from "@/lib/database/repository";

const category = z.enum(["dairy", "produce", "protein", "bakery", "prepared", "beverages", "pantry"]);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), actor: z.enum(["operator", "camera", "donor"]).optional(), input: z.object({ fridgeId: z.string(), name: z.string().min(1).max(120), category, quantity: z.number().int().positive(), unit: z.string().min(1).max(24), expiresAt: z.string().optional(), recognitionSource: z.enum(["gemini", "demo_recognition", "manual"]).optional(), recognitionConfidence: z.number().min(0).max(1).optional() }) }),
  z.object({ action: z.literal("update"), id: z.string(), patch: z.object({ name: z.string().min(1).max(120).optional(), category: category.optional(), quantity: z.number().int().positive().optional(), unit: z.string().optional(), expiresAt: z.string().optional(), status: z.enum(["available", "needs_review", "reserved", "removed", "expired"]).optional() }) }),
  z.object({ action: z.literal("remove"), id: z.string(), note: z.string().max(240).optional() }),
  z.object({ action: z.literal("confirm"), id: z.string(), patch: z.object({ name: z.string().optional(), category: category.optional(), expiresAt: z.string().optional(), quantity: z.number().int().positive().optional() }).optional() }),
]);

async function fridgeOfItem(id: string) {
  const [row] = await db().select({ fridgeId: schema.inventoryItems.fridgeId, name: schema.inventoryItems.name, quantity: schema.inventoryItems.quantity }).from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id));
  if (!row) throw new Error("Item not found");
  return row;
}

export const POST = (req: Request) =>
  liveHandler(req, body, async (b, session) => {
    const d = db();
    if (b.action === "add") {
      if (!(await operatesFridge(session, b.input.fridgeId))) forbidden("you do not operate this fridge");
      const id = newId("item");
      const manual = (b.input.recognitionSource ?? "manual") === "manual";
      await d.insert(schema.inventoryItems).values({ id, ...b.input, expiresAt: b.input.expiresAt ? new Date(b.input.expiresAt) : null, recognitionSource: b.input.recognitionSource ?? "manual", recognitionConfirmed: manual, status: manual ? "available" : "needs_review" });
      await d.insert(schema.inventoryEvents).values({ id: newId("ev"), fridgeId: b.input.fridgeId, itemId: id, itemName: b.input.name, type: "added", quantityDelta: b.input.quantity, actor: b.actor ?? "operator" });
      return { id };
    }
    const item = await fridgeOfItem(b.id);
    if (!(await operatesFridge(session, item.fridgeId))) forbidden("you do not operate this fridge");
    if (b.action === "update") {
      await d.update(schema.inventoryItems).set({ ...b.patch, expiresAt: b.patch.expiresAt ? new Date(b.patch.expiresAt) : undefined, updatedAt: new Date() }).where(eq(schema.inventoryItems.id, b.id));
      await d.insert(schema.inventoryEvents).values({ id: newId("ev"), fridgeId: item.fridgeId, itemId: b.id, itemName: b.patch.name ?? item.name, type: "edited", quantityDelta: (b.patch.quantity ?? item.quantity) - item.quantity, actor: "operator" });
    } else if (b.action === "remove") {
      await d.update(schema.inventoryItems).set({ status: "removed", updatedAt: new Date() }).where(eq(schema.inventoryItems.id, b.id));
      await d.insert(schema.inventoryEvents).values({ id: newId("ev"), fridgeId: item.fridgeId, itemId: b.id, itemName: item.name, type: "removed", quantityDelta: -item.quantity, actor: "operator", note: b.note });
    } else if (b.action === "confirm") {
      await d.update(schema.inventoryItems).set({ ...(b.patch ?? {}), expiresAt: b.patch?.expiresAt ? new Date(b.patch.expiresAt) : undefined, recognitionConfirmed: true, status: "available", updatedAt: new Date() }).where(eq(schema.inventoryItems.id, b.id));
      await d.insert(schema.inventoryEvents).values({ id: newId("ev"), fridgeId: item.fridgeId, itemId: b.id, itemName: b.patch?.name ?? item.name, type: "confirmed", quantityDelta: 0, actor: "operator", note: "Recognition confirmed by operator" });
    }
    return { ok: true };
  });
