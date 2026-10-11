import type { Metadata } from "next";
import { MissionsPage } from "@/components/food-bank/missions";

export const metadata: Metadata = { title: "Rescue missions" };

export default function Page() {
  return <MissionsPage />;
}
