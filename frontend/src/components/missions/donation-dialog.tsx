"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Donation, FoodCategory, Mission } from "@/types";
import { FOOD_CATEGORIES } from "@/types";
import { useFridgeyData } from "@/lib/data/use-fridgey-data";
import { fridgeById } from "@/lib/data/derived";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DemoNotice } from "@/components/shared/demo-notice";
import { CategoryIcon } from "@/components/shared/category-icon";

export interface DonationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselected fridge. When omitted (and the mission has no drop-off fridge) the donor picks one. */
  fridgeId?: string;
  /** Mission the donation counts toward; prefills item, category and unit. */
  mission?: Mission;
  onProposed?: (donation: Donation) => void;
}

interface Errors {
  fridge?: string;
  itemName?: string;
  quantity?: string;
  unit?: string;
  expiresAt?: string;
}

/**
 * Records a proposed donation for the current donor. The proposal is only a promise to bring food;
 * the fridge operator verifies it on arrival, and only verified donations count toward missions and points.
 */
export function DonationDialog({
  open,
  onOpenChange,
  fridgeId,
  mission,
  onProposed,
}: DonationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* The form mounts fresh each time the dialog opens, so prefills always follow the mission/fridge in context. */}
        <DonationForm
          fridgeId={fridgeId}
          mission={mission}
          onProposed={onProposed}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function DonationForm({
  fridgeId,
  mission,
  onProposed,
  onClose,
}: {
  fridgeId?: string;
  mission?: Mission;
  onProposed?: (donation: Donation) => void;
  onClose: () => void;
}) {
  const { data, actions, mode, currentUserId } = useFridgeyData();
  const presetFridgeId = fridgeId ?? mission?.location.fridgeId;
  const presetFridge = fridgeById(data, presetFridgeId);

  const [selectedFridgeId, setSelectedFridgeId] = useState<string>(
    presetFridgeId ?? "",
  );
  const [itemName, setItemName] = useState(mission?.foodType ?? "");
  const [category, setCategory] = useState<FoodCategory>(
    mission?.category ?? "pantry",
  );
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(mission?.unit ?? "");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const selectableFridges = useMemo(
    () =>
      data.fridges.filter(
        (f) => f.visibility === "public" || f.id === presetFridgeId,
      ),
    [data.fridges, presetFridgeId],
  );
  const targetFridge = presetFridge ?? fridgeById(data, selectedFridgeId);

  function validate(): boolean {
    const next: Errors = {};
    if (!targetFridge) next.fridge = "Choose the fridge you'll bring this to.";
    if (!itemName.trim())
      next.itemName = "Tell the operator what you're bringing.";
    const qty = Number(quantity);
    if (!quantity.trim() || !Number.isFinite(qty) || qty <= 0)
      next.quantity = "Enter a quantity greater than zero.";
    if (!unit.trim()) next.unit = "Add a unit, like cartons or lbs.";
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (Number.isNaN(d.getTime())) next.expiresAt = "Enter a valid date.";
      else if (d.getTime() < Date.now() - 24 * 3_600_000)
        next.expiresAt =
          "This date is already past. Operators can only accept food within date.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !targetFridge) return;
    setSubmitting(true);
    try {
      const donation = await Promise.resolve(
        actions.proposeDonation({
          donorUserId: currentUserId,
          fridgeId: targetFridge.id,
          missionId: mission?.id,
          itemName: itemName.trim(),
          category,
          quantity: Number(quantity),
          unit: unit.trim(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          note: note.trim() || undefined,
        }),
      );
      toast.success("Donation proposed", {
        description: `${targetFridge.name} will verify it when you drop it off.`,
      });
      onProposed?.(donation);
      onClose();
    } catch (err) {
      toast.error("Couldn't record the donation", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Record a donation</DialogTitle>
        <DialogDescription>
          {mission ? (
            <>
              For{" "}
              <span className="font-medium text-foreground">
                {mission.title}
              </span>
              . Only donations verified by the fridge operator count toward the
              mission and your points.
            </>
          ) : (
            <>
              Let the operator know what you&apos;re bringing. Points are
              awarded once they check it in.
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="donation-fridge">Drop-off fridge</Label>
          {presetFridge ? (
            <div
              id="donation-fridge"
              className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm"
            >
              <span className="font-medium text-foreground">
                {presetFridge.name}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {presetFridge.neighborhood}
              </span>
            </div>
          ) : (
            <Select
              value={selectedFridgeId}
              onValueChange={setSelectedFridgeId}
            >
              <SelectTrigger
                id="donation-fridge"
                className="w-full"
                aria-invalid={Boolean(errors.fridge)}
              >
                <SelectValue placeholder="Choose a fridge" />
              </SelectTrigger>
              <SelectContent>
                {selectableFridges.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} · {f.neighborhood}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {errors.fridge && (
            <p className="text-[12px] text-critical">{errors.fridge}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="donation-item">Item</Label>
          <Input
            id="donation-item"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="e.g. Whole milk, 1 gal"
            aria-invalid={Boolean(errors.itemName)}
          />
          {errors.itemName && (
            <p className="text-[12px] text-critical">{errors.itemName}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="donation-category">Category</Label>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as FoodCategory)}
          >
            <SelectTrigger id="donation-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOOD_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <CategoryIcon
                    category={c.value}
                    className="size-3.5 text-muted-foreground"
                  />{" "}
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="donation-qty">Quantity</Label>
            <Input
              id="donation-qty"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-invalid={Boolean(errors.quantity)}
            />
            {errors.quantity && (
              <p className="text-[12px] text-critical">{errors.quantity}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="donation-unit">Unit</Label>
            <Input
              id="donation-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="cartons"
              aria-invalid={Boolean(errors.unit)}
            />
            {errors.unit && (
              <p className="text-[12px] text-critical">{errors.unit}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="donation-expires">
            Expiration or best-by date (optional)
          </Label>
          <Input
            id="donation-expires"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            aria-invalid={Boolean(errors.expiresAt)}
          />
          {errors.expiresAt && (
            <p className="text-[12px] text-critical">{errors.expiresAt}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="donation-note">
            Note for the operator (optional)
          </Label>
          <Textarea
            id="donation-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Arriving around 6pm, sealed in the original packaging."
          />
        </div>

        {mode === "demo" && (
          <DemoNotice>
            Demo mode: this proposal is stored locally in your browser. Switch
            to the operator persona to accept it and watch the mission progress
            update.
          </DemoNotice>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Recording…" : "Record proposed donation"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
