import { Suspense } from "react";
import { InventoryManager } from "@/components/inventory/inventory-manager";

export const metadata = { title: "Inventory" };

export default function Page() {
  // InventoryManager reads ?status= and ?tab= through useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <InventoryManager />
    </Suspense>
  );
}
