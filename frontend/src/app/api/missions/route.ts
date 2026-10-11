import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { liveHandler, forbidden } from "../_lib/handler";
import { db, schema } from "@/lib/database/client";
import { isOrgAdmin, missionOrganization } from "@/lib/database/authorize";
import { newId } from "@/lib/database/repository";

const category = z.enum(["dairy", "produce", "protein", "bakery", "prepared", "beverages", "pantry"]);
const missionInput = z.object({
  organizationId: z.string(),
  title: z.string().min(3).max(140),
  foodType: z.string().min(2).max(140),
  category,
  quantityNeeded: z.number().int().positive(),
  unit: z.string().min(1).max(24),
  deadline: z.string(),
  location: z.object({ mode: z.enum(["dropoff", "pickup"]), fridgeId: z.string().optional(), label: z.string() }),
  rewardSol: z.number().nonnegative().optional(),
  rewardCondition: z.string().max(400),
  eligibility: z.array(z.string().max(140)).max(10),
  status: z.enum(["draft", "open"]),
});

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), input: missionInput }),
  z.object({ action: z.literal("update"), id: z.string(), patch: missionInput.partial() }),
  z.object({ action: z.literal("status"), id: z.string(), status: z.enum(["draft", "open", "completed", "closed"]) }),
  z.object({ action: z.literal("join"), missionId: z.string(), userId: z.string() }),
  z.object({ action: z.literal("leave"), missionId: z.string(), userId: z.string() }),
]);

export const POST = (req: Request) =>
  liveHandler(req, body, async (b, session) => {
    const d = db();
    if (b.action === "create") {
      if (!isOrgAdmin(session, b.input.organizationId)) forbidden("you do not administer this organization");
      const id = newId("mission");
      await d.insert(schema.missions).values({ id, ...b.input, deadline: new Date(b.input.deadline) });
      return { id };
    }
    if (b.action === "join" || b.action === "leave") {
      // Users can only change their own participation.
      if (b.userId !== session.userId) forbidden("you can only change your own participation");
      if (b.action === "join") await d.insert(schema.missionParticipants).values({ missionId: b.missionId, userId: b.userId }).onConflictDoNothing();
      else await d.delete(schema.missionParticipants).where(and(eq(schema.missionParticipants.missionId, b.missionId), eq(schema.missionParticipants.userId, b.userId)));
      return { ok: true };
    }
    const orgId = await missionOrganization(b.id);
    if (!orgId) throw new Error("Mission not found");
    if (!isOrgAdmin(session, orgId)) forbidden("you do not administer this organization");
    if (b.action === "update") await d.update(schema.missions).set({ ...b.patch, deadline: b.patch.deadline ? new Date(b.patch.deadline) : undefined }).where(eq(schema.missions.id, b.id));
    else await d.update(schema.missions).set({ status: b.status, ...(b.status === "completed" ? { completedAt: new Date() } : {}) }).where(eq(schema.missions.id, b.id));
    return { ok: true };
  });
