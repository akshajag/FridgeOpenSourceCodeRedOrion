import type { Metadata } from "next";
import { RewardsPage } from "@/components/food-bank/rewards";

export const metadata: Metadata = { title: "Rewards" };

export default function Page() {
  return <RewardsPage />;
}
