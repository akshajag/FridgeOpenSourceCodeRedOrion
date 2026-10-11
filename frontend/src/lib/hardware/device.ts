import { createHmac, timingSafeEqual } from "node:crypto";
export const DEVICE_COOKIE = "fridgey-device";
export function trustedHost(host: string | null) {
  const name = (host ?? "").split(":")[0];
  return (process.env.FRIDGE_ALLOWED_HOSTS ?? "localhost,127.0.0.1").split(",").includes(name);
}
export function deviceTicket() {
  const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
  const signature = createHmac("sha256", process.env.FRIDGE_DEVICE_KEY!).update(expiry).digest("hex");
  return expiry + "." + signature;
}
export function trustedDevice(host: string | null, ticket?: string) {
  if (process.env.FRIDGE_HARDWARE_MODE !== "1" || !trustedHost(host)) return false;
  if (!ticket || !process.env.FRIDGE_DEVICE_KEY) return false;
  const [expiry, signature] = ticket.split(".");
  if (!expiry || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now() || !/^[a-f0-9]{64}$/.test(signature ?? "")) return false;
  const expected = createHmac("sha256", process.env.FRIDGE_DEVICE_KEY).update(expiry).digest("hex");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
