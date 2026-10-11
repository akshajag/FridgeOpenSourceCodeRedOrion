import { z } from "zod";
import { eq } from "drizzle-orm";
import { liveHandler, forbidden } from "../_lib/handler";
import { db, schema } from "@/lib/database/client";
import { operatesFridge } from "@/lib/database/authorize";

const body = z.object({ action: z.enum(["acknowledge", "resolve"]), id: z.string() });

export const POST = (req: Request) =>
  liveHandler(req, body, async (b, session) => {
    const d = db();
    const [alert] = await d.select({ fridgeId: schema.sensorAlerts.fridgeId }).from(schema.sensorAlerts).where(eq(schema.sensorAlerts.id, b.id));
    if (!alert) throw new Error("Alert not found");
    if (!(await operatesFridge(session, alert.fridgeId))) forbidden("you do not operate this fridge");
    const now = new Date();
    await d.update(schema.sensorAlerts).set(b.action === "acknowledge" ? { acknowledgedAt: now } : { resolvedAt: now, acknowledgedAt: now }).where(eq(schema.sensorAlerts.id, b.id));
  });
