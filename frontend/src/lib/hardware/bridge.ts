import "server-only";
import { cookies } from "next/headers";
import { trustedDevice, DEVICE_COOKIE } from "./device";
export const hardwareEnabled = () => process.env.FRIDGE_HARDWARE_MODE === "1";
export async function localRequest(req: Request) {
  const jar = await cookies();
  return trustedDevice(req.headers.get("host"), jar.get(DEVICE_COOKIE)?.value) && req.headers.get("sec-fetch-site") !== "cross-site";
}
export async function bridge(path: string, init?: RequestInit, camera = false) {
  const base = camera ? "http://127.0.0.1:3201" : "http://127.0.0.1:3200";
  if (!process.env.FRIDGE_DATA_TOKEN) throw new Error("Local hardware connection is not configured");
  return fetch(base + path, { ...init, cache: "no-store", signal: path.startsWith("/stream/") ? init?.signal : AbortSignal.timeout(10000), headers: { "Authorization": `Bearer ${process.env.FRIDGE_DATA_TOKEN}`, "Content-Type": "application/json", ...init?.headers } });
}
