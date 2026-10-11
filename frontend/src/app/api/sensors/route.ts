import { z } from "zod";
import { liveHandler, forbidden } from "../_lib/handler";
import { operatesFridge } from "@/lib/database/authorize";
import { insertSensorReading } from "@/lib/database/repository";

const body = z.object({ fridgeId: z.string(), metric: z.enum(["temperature", "humidity", "air_quality"]), value: z.number().finite(), source: z.enum(["hardware", "demo"]).optional() });

/** POST /api/sensors — operator-submitted reading (manual entry or simulation from the dashboard). */
export const POST = (req: Request) =>
  liveHandler(req, body, async (b, session) => {
    if (!(await operatesFridge(session, b.fridgeId))) forbidden("you do not operate this fridge");
    await insertSensorReading(b.fridgeId, b.metric, b.value, b.source ?? "demo");
  });
