import { z } from "zod";
import { eq } from "drizzle-orm";
import { liveHandler, forbidden } from "../_lib/handler";
import { db, schema } from "@/lib/database/client";
import { operatesFridge } from "@/lib/database/authorize";

const body = z.object({
  action: z.literal("update"),
  id: z.string(),
  patch: z.object({
    name: z.string().min(1).max(120).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    thresholds: z.object({ tempMinC: z.number(), tempMaxC: z.number(), humidityMaxPct: z.number().optional(), airQualityMaxPpm: z.number().optional() }).optional(),
    hours: z.string().max(120).optional(),
    description: z.string().max(500).optional(),
    status: z.enum(["online", "degraded", "offline"]).optional(),
  }),
});

export const POST = (req: Request) =>
  liveHandler(req, body, async (b, session) => {
    if (!(await operatesFridge(session, b.id))) forbidden("you do not operate this fridge");
    await db().update(schema.fridges).set(b.patch).where(eq(schema.fridges.id, b.id));
  });
