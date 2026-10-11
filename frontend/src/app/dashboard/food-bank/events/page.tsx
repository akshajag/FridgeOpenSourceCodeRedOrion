import type { Metadata } from "next";
import { EventsPage } from "@/components/food-bank/events";

export const metadata: Metadata = { title: "Community events" };

export default function Page() {
  return <EventsPage />;
}
