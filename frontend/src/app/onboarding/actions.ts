"use server";

import { z } from "zod";
import { isClerkConfigured } from "@/lib/auth/config";
import type { Membership } from "@/types";

const schema = z.object({
  role: z.enum(["food_bank", "operator", "donor"]),
  organizationName: z.string().min(2).max(120).optional(),
  fridgeName: z.string().min(2).max(120).optional(),
});

/**
 * Persist the chosen role for a live (Clerk) account. Memberships are stored in Clerk
 * public metadata, which is readable by the server session helper, and mirrored to the
 * database when DATABASE_URL is configured.
 */
export async function completeOnboarding(
  input: z.infer<typeof schema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Please check the form and try again." };
  if (!isClerkConfigured())
    return { ok: false, error: "Live authentication is not configured." };

  const { auth, clerkClient } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  if (process.env.FRIDGE_HARDWARE_MODE === "1" && parsed.data.role !== "donor")
    return {
      ok: false,
      error:
        "Operator access requires a paired fridge device. Use a donor account for the community map.",
    };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const existing = (
    (user.publicMetadata as { memberships?: Membership[] })?.memberships ?? []
  ).filter((m) => m.role !== parsed.data.role);

  let membership: Membership = { role: parsed.data.role };
  try {
    const { ensureUser, createOrganizationForUser, createFridgeForUser } =
      await import("@/lib/database/repository");
    if (process.env.FRIDGE_HARDWARE_MODE !== "1")
      await ensureUser({
        id: userId,
        name: user.fullName ?? "",
        email: user.primaryEmailAddress?.emailAddress ?? "",
      });
    if (parsed.data.role === "food_bank") {
      const org = await createOrganizationForUser(
        userId,
        parsed.data.organizationName ?? "My food bank",
      );
      membership = { role: "food_bank", organizationId: org.id };
    } else if (parsed.data.role === "operator") {
      const fridge = await createFridgeForUser(
        userId,
        parsed.data.fridgeName ?? "My fridge",
      );
      membership = { role: "operator", fridgeId: fridge.id };
    }
  } catch (err) {
    // Database not configured: the role still saves to Clerk so the dashboard unlocks.
    console.warn(
      "[onboarding] database unavailable, saving membership to Clerk only:",
      (err as Error).message,
    );
  }

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...user.publicMetadata,
      memberships: [membership, ...existing],
      onboarded: true,
    },
  });
  return { ok: true };
}
