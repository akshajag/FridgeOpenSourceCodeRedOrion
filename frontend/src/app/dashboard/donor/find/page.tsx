import { Suspense } from "react";
import { FindFridge } from "@/components/donor/find-fridge";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Find a fridge · Donor" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[520px]" />}>
      <FindFridge />
    </Suspense>
  );
}
