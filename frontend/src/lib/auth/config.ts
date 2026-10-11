/**
 * Auth configuration helpers. Safe to import from both server and client code.
 */
export const DEMO_COOKIE = "fridgey-demo-persona";

export function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export type DemoPersona = "food_bank" | "operator" | "donor";

export const DEMO_PERSONAS: DemoPersona[] = ["food_bank", "operator", "donor"];

export function isDemoPersona(value: unknown): value is DemoPersona {
  return typeof value === "string" && (DEMO_PERSONAS as string[]).includes(value);
}

export const ROLE_HOME: Record<DemoPersona, string> = {
  food_bank: "/dashboard/food-bank",
  operator: "/dashboard/operator",
  donor: "/dashboard/donor",
};
