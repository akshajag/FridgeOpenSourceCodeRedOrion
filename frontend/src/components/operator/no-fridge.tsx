import { Refrigerator } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

/** Shown when the current account has an operator role but no fridge is registered to it. */
export function NoFridge({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      <EmptyState
        icon={<Refrigerator />}
        title="No fridge registered to this account"
        description="Your operator membership is not linked to a fridge yet. Register your Fridgey hardware kit to start receiving sensor data and inventory updates."
      />
    </div>
  );
}
