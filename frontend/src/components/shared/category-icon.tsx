import { Milk, Carrot, Drumstick, Croissant, Soup, CupSoda, Package } from "lucide-react";
import type { FoodCategory } from "@/types";
import { cn } from "@/lib/utils";

const icons: Record<FoodCategory, React.ComponentType<{ className?: string }>> = {
  dairy: Milk,
  produce: Carrot,
  protein: Drumstick,
  bakery: Croissant,
  prepared: Soup,
  beverages: CupSoda,
  pantry: Package,
};

export const CATEGORY_LABEL: Record<FoodCategory, string> = {
  dairy: "Dairy",
  produce: "Produce",
  protein: "Protein",
  bakery: "Bakery",
  prepared: "Prepared",
  beverages: "Beverages",
  pantry: "Pantry",
};

export function CategoryIcon({ category, className }: { category: FoodCategory; className?: string }) {
  const Icon = icons[category] ?? Package;
  return <Icon className={cn("size-4", className)} aria-hidden="true" />;
}

export function CategoryBadge({ category, className }: { category: FoodCategory; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] text-foreground", className)}>
      <span className="flex size-6 items-center justify-center rounded-md bg-sage text-evergreen-deep">
        <CategoryIcon category={category} className="size-3.5" />
      </span>
      {CATEGORY_LABEL[category]}
    </span>
  );
}
