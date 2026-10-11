import type { Metadata } from "next";
import { NearbyFridges } from "@/components/food-bank/nearby-fridges";

export const metadata: Metadata = { title: "Nearby fridges" };

export default function Page() {
  return <NearbyFridges />;
}
