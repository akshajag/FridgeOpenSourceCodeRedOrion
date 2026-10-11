import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, hasRole } from "@/lib/auth/session";
import { isSolanaConfigured, isValidSolanaAddress, payReward } from "@/lib/integrations/solana";

const schema = z.object({
  allocationId: z.string().min(1),
  toAddress: z.string().min(1),
  amountSol: z.number().positive().max(10),
  organizationId: z.string().min(1),
});

/**
 * POST /api/rewards/payout
 * Executes a reward payout for an allocation. Requirements enforced server-side:
 * - caller must be a food-bank administrator of the paying organization
 * - amount must be positive and bounded
 * - in demo mode the result is always a labeled simulated transaction
 *
 * In live mode the allocation's `approved` status is re-checked against the database before signing.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !hasRole(session, "food_bank")) return NextResponse.json({ error: "Food bank administrator access required" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payout request" }, { status: 400 });
  const { allocationId, toAddress, amountSol, organizationId } = parsed.data;

  const isAdmin = session.memberships.some((m) => m.role === "food_bank" && m.organizationId === organizationId);
  if (!isAdmin) return NextResponse.json({ error: "You do not administer this organization" }, { status: 403 });

  if (session.mode === "demo") {
    const result = await payRewardSimulated(amountSol);
    return NextResponse.json({ allocationId, ...result });
  }

  if (!isValidSolanaAddress(toAddress)) return NextResponse.json({ error: "Recipient is not a valid Solana address" }, { status: 400 });

  try {
    const { getRewardAllocation, recordRewardTransaction } = await import("@/lib/database/repository");
    const allocation = await getRewardAllocation(allocationId);
    if (!allocation || allocation.organizationId !== organizationId) return NextResponse.json({ error: "Allocation not found" }, { status: 404 });
    if (allocation.status !== "approved") return NextResponse.json({ error: "Only approved allocations can be paid" }, { status: 409 });
    const result = await payReward(toAddress, amountSol);
    await recordRewardTransaction(allocationId, { ...result, toAddress, amountSol });
    return NextResponse.json({ allocationId, ...result, configured: isSolanaConfigured() });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function payRewardSimulated(amountSol: number) {
  const sig = `SIMULATED${Array.from(crypto.getRandomValues(new Uint8Array(28))).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  return { network: "simulated" as const, signature: sig, status: "confirmed" as const, amountSol };
}
