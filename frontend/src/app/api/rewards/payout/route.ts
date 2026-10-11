import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { bridge } from "@/lib/hardware/bridge";
import {
  devnetStatus,
  isValidSolanaAddress,
  payReward,
} from "@/lib/integrations/solana";
const input = z.object({
  allocationId: z.string().uuid(),
  organizationId: z.string().min(1).max(200),
});
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.mode === "demo")
    return NextResponse.json(
      { error: "Verified food-bank administrator required." },
      { status: 403 },
    );
  let same = false;
  try {
    same =
      new URL(req.headers.get("origin") ?? "").host === req.headers.get("host");
  } catch {}
  if (!same)
    return NextResponse.json(
      { error: "Same-site request required." },
      { status: 403 },
    );
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid allocation request." },
      { status: 400 },
    );
  const { allocationId, organizationId } = parsed.data;
  if (
    !session.memberships.some(
      (m) => m.role === "food_bank" && m.organizationId === organizationId,
    )
  )
    return NextResponse.json(
      { error: "You do not administer this food bank." },
      { status: 403 },
    );
  const solana = await devnetStatus();
  if (!solana.configured || !solana.connected)
    return NextResponse.json(
      { error: "Solana Devnet payer is unavailable." },
      { status: 503 },
    );
  try {
    // One database update claims an approved, receiver-verified allocation exactly once.
    // Amount and recipient are read from storage, never from client parameters.
    const claim = await bridge("/rewards/claim", {
      method: "POST",
      body: JSON.stringify({
        id: allocationId,
        organization_id: organizationId,
      }),
    });
    if (!claim.ok)
      return NextResponse.json(
        {
          error: "Reward is not approved, verified, or is already being paid.",
        },
        { status: 409 },
      );
    const allocation = await claim.json();
    const amount = Number(allocation.amount_sol),
      address = allocation.recipient_address;
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 10 ||
      !isValidSolanaAddress(address)
    )
      throw new Error("Invalid stored payout");
    const result = await payReward(address, amount);
    const paid =
      result.network === "devnet" &&
      result.status === "confirmed" &&
      !!result.signature;
    const finish = await bridge("/rewards/finish", {
      method: "POST",
      body: JSON.stringify({
        id: allocationId,
        status: paid ? "paid" : "uncertain",
        signature: result.signature || null,
      }),
    });
    if (!finish.ok) throw new Error("Settlement needs review");
    return NextResponse.json({
      allocationId,
      ...result,
      amountSol: amount,
      requiresReview: !paid,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Payout needs administrator review. Do not retry an uncertain transfer.",
      },
      { status: 503 },
    );
  }
}
