import { z } from "zod";
import { eq } from "drizzle-orm";
import { liveHandler, forbidden } from "../_lib/handler";
import { db, schema } from "@/lib/database/client";

const body = z.object({ action: z.literal("wallet"), userId: z.string(), address: z.string().max(64).optional() });

export const POST = (req: Request) =>
  liveHandler(req, body, async (b, session) => {
    if (b.userId !== session.userId) forbidden("you can only change your own wallet");
    await db().update(schema.users).set({ walletAddress: b.address ?? null }).where(eq(schema.users.id, b.userId));
  });
