import "server-only";

/**
 * Solana reward payouts.
 * - Devnet mode: requires SOLANA_RPC_URL (or defaults to devnet) and SOLANA_PAYER_SECRET_KEY (base58 or JSON array).
 *   Signing happens here, on the server. The secret never reaches the browser.
 * - Simulated mode: when no payer key is configured, returns a clearly labeled simulated signature
 *   so the reward workflow can be demonstrated end to end.
 *
 * Payouts are only ever invoked for allocations that are already `approved` by an authorized
 * food-bank administrator after verified mission completion.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

export interface PayoutResult {
  network: "devnet" | "simulated";
  signature: string;
  explorerUrl?: string;
  status: "confirmed" | "failed";
  error?: string;
}

export function isSolanaConfigured() {
  return Boolean(process.env.SOLANA_PAYER_SECRET_KEY);
}

function loadPayer(): Keypair {
  const raw = process.env.SOLANA_PAYER_SECRET_KEY!;
  if (raw.trim().startsWith("["))
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
  // base58
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes: number[] = [];
  for (const ch of raw.trim()) {
    let carry = alphabet.indexOf(ch);
    if (carry < 0) throw new Error("Invalid base58 secret key");
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of raw.trim()) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return Keypair.fromSecretKey(Uint8Array.from(bytes.reverse()));
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export async function payReward(
  toAddress: string,
  amountSol: number,
): Promise<PayoutResult> {
  if (!isSolanaConfigured()) {
    // Simulated payout: deterministic-looking but clearly labeled.
    const sig = `SIMULATED${Array.from(
      crypto.getRandomValues(new Uint8Array(28)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;
    return { network: "simulated", signature: sig, status: "confirmed" };
  }
  try {
    const connection = new Connection(
      "https://api.devnet.solana.com",
      "confirmed",
    );
    const payer = loadPayer();
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
      }),
    );
    const signature = await sendAndConfirmTransaction(connection, tx, [payer]);
    return {
      network: "devnet",
      signature,
      status: "confirmed",
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    };
  } catch (err) {
    return {
      network: "devnet",
      signature: "",
      status: "failed",
      error: (err as Error).message,
    };
  }
}

let statusCache:
  | { at: number; value: Awaited<ReturnType<typeof readDevnetStatus>> }
  | undefined;
async function readDevnetStatus() {
  if (!isSolanaConfigured())
    return {
      network: "devnet",
      configured: false,
      connected: false,
      balanceSol: null,
      address: null,
    };
  try {
    const payer = loadPayer();
    const c = new Connection("https://api.devnet.solana.com", "confirmed");
    const balance = await Promise.race([
      c.getBalance(payer.publicKey),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("RPC timeout")), 8000),
      ),
    ]);
    return {
      network: "devnet",
      configured: true,
      connected: true,
      balanceSol: balance / LAMPORTS_PER_SOL,
      address: payer.publicKey.toBase58(),
    };
  } catch {
    return {
      network: "devnet",
      configured: true,
      connected: false,
      balanceSol: null,
      address: null,
    };
  }
}
export async function devnetStatus() {
  if (statusCache && Date.now() - statusCache.at < 30000)
    return statusCache.value;
  const value = await readDevnetStatus();
  statusCache = { at: Date.now(), value };
  return value;
}
