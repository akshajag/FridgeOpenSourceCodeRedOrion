"use client";

import { useState } from "react";
import type { FoodCategory, InventoryItem } from "@/types";
import { FOOD_CATEGORIES } from "@/types";
import { Confidence } from "@/components/shared/confidence";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fromDateInput, toDateInput } from "@/components/operator/sensor-state";

export interface ItemFormValues {
  name: string;
  category: FoodCategory;
  quantity: number;
  unit: string;
  expiresAt?: string;
}

export type ItemDialogMode = "add" | "edit" | "confirm";

const COPY: Record<ItemDialogMode, { title: string; description: string; submit: string }> = {
  add: { title: "Add item", description: "Record an item you placed in the fridge by hand. Manual entries are marked as confirmed.", submit: "Add to inventory" },
  edit: { title: "Edit item", description: "Correct the name, count, or date. The change is logged in history.", submit: "Save changes" },
  confirm: { title: "Confirm recognition", description: "The camera read these details. Correct anything that is wrong, then confirm to make the item available.", submit: "Confirm item" },
};

/**
 * One dialog for adding, editing, and confirming items. The form mounts with the dialog
 * content, so its state is initialized from `item` on every open without effects.
 */
export function ItemDialog({ open, mode, item, onClose, onSubmit }: { open: boolean; mode: ItemDialogMode; item?: InventoryItem | null; onClose: () => void; onSubmit: (values: ItemFormValues) => void }) {
  const copy = COPY[mode];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {mode === "confirm" && item && (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-[12px]">
            <span className="text-muted-foreground">Recognition confidence</span>
            <Confidence value={item.recognitionConfidence} source={item.recognitionSource} />
          </div>
        )}
        <ItemForm key={`${mode}-${item?.id ?? "new"}`} item={item} submitLabel={copy.submit} onClose={onClose} onSubmit={onSubmit} />
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({ item, submitLabel, onClose, onSubmit }: { item?: InventoryItem | null; submitLabel: string; onClose: () => void; onSubmit: (values: ItemFormValues) => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<FoodCategory>(item?.category ?? "produce");
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : "1");
  const [unit, setUnit] = useState(item?.unit ?? "pcs");
  const [expires, setExpires] = useState(() => toDateInput(item?.expiresAt));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Enter an item name.";
    const q = Number(quantity);
    if (quantity.trim() === "" || Number.isNaN(q) || q <= 0) next.quantity = "Enter a quantity above zero.";
    if (unit.trim() === "") next.unit = "Enter a unit (e.g. pcs, cartons).";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      onSubmit({ name: name.trim(), category, quantity: q, unit: unit.trim(), expiresAt: fromDateInput(expires) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="item-name">Name</Label>
        <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Whole milk, 1 gal" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "item-name-error" : undefined} autoFocus />
        {errors.name && <p id="item-name-error" className="text-[12px] text-critical">{errors.name}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="item-category">Category</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as FoodCategory)}>
          <SelectTrigger id="item-category" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FOOD_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="item-quantity">Quantity</Label>
          <Input id="item-quantity" type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="tnum" aria-invalid={Boolean(errors.quantity)} aria-describedby={errors.quantity ? "item-quantity-error" : undefined} />
          {errors.quantity && <p id="item-quantity-error" className="text-[12px] text-critical">{errors.quantity}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="item-unit">Unit</Label>
          <Input id="item-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs" aria-invalid={Boolean(errors.unit)} aria-describedby={errors.unit ? "item-unit-error" : undefined} />
          {errors.unit && <p id="item-unit-error" className="text-[12px] text-critical">{errors.unit}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="item-expires">Expiration or best-by date <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="item-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="tnum" />
      </div>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy}>{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}
