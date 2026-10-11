import type { Metadata } from "next";
import { FoodBankOverview } from "@/components/food-bank/overview";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <FoodBankOverview />;
}
