import "server-only";
import { cookies } from "next/headers";
import type { Membership, Role } from "@/types";
import { DEMO_COOKIE, isClerkConfigured, isDemoPersona, type DemoPersona } from "./config";
import { DEMO_IDS } from "@/lib/demo/seed";

/**
 * A unified session shape used by server components, server actions, and route handlers.
 * - mode "live": a real Clerk user. Memberships come from Clerk public metadata (mirrored to the DB when configured).
 * - mode "demo": a synthetic persona selected through the demo switcher. Never has access to live data.
 */
export type FridgeySession =
  | {
      mode: "live";
      userId: string;
      name: string;
      email: string;
      memberships: Membership[];
      onboarded: boolean;
    }
  | {
      mode: "demo";
      persona: DemoPersona;
      userId: string;
      name: string;
      memberships: Membership[];
      onboarded: true;
    };

const DEMO_USERS: Record<DemoPersona, { userId: string; name: string; memberships: Membership[] }> = {
  food_bank: { userId: DEMO_IDS.foodBankUser, name: "Maya Okafor", memberships: [{ role: "food_bank", organizationId: DEMO_IDS.organization }] },
  operator: { userId: DEMO_IDS.operatorUser, name: "Daniel Reyes", memberships: [{ role: "operator", fridgeId: DEMO_IDS.operatorFridge }] },
  donor: { userId: DEMO_IDS.donorUser, name: "Priya Natarajan", memberships: [{ role: "donor" }] },
};

export async function getDemoPersona(): Promise<DemoPersona | null> {
  const store = await cookies();
  const value = store.get(DEMO_COOKIE)?.value;
  return isDemoPersona(value) ? value : null;
}

export async function getSession(): Promise<FridgeySession | null> {
  if (isClerkConfigured()) {
    // Dynamic import keeps Clerk out of the bundle when it is not configured.
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (userId) {
      const user = await currentUser();
      const metadata = (user?.publicMetadata ?? {}) as { memberships?: Membership[]; onboarded?: boolean };
      return {
        mode: "live",
        userId,
        name: user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Member",
        email: user?.primaryEmailAddress?.emailAddress ?? "",
        memberships: Array.isArray(metadata.memberships) ? metadata.memberships : [],
        onboarded: Boolean(metadata.onboarded),
      };
    }
  }
  const persona = await getDemoPersona();
  if (persona) {
    const demo = DEMO_USERS[persona];
    return { mode: "demo", persona, onboarded: true, ...demo };
  }
  return null;
}

export function hasRole(session: FridgeySession | null, role: Role): boolean {
  return Boolean(session?.memberships.some((m) => m.role === role));
}

/** Resolve which dashboard a session should land on. */
export function homeForSession(session: FridgeySession): string {
  const first = session.memberships[0]?.role;
  if (first === "food_bank") return "/dashboard/food-bank";
  if (first === "operator") return "/dashboard/operator";
  if (first === "donor") return "/dashboard/donor";
  return "/onboarding";
}
