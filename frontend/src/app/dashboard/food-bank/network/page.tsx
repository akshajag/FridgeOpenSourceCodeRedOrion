import type { Metadata } from "next";
import { NetworkPage } from "@/components/food-bank/network";

export const metadata: Metadata = { title: "Network" };

export default function Page() {
  return <NetworkPage />;
}
