"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { FoodCategory, Mission } from "@/types";
import { FOOD_CATEGORIES } from "@/types";
import type { CreateMissionInput } from "@/lib/data/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fridgeById } from "@/lib/data/derived";
import { useFoodBank } from "./use-food-bank";
import { Field, fromLocalInput, toLocalInput } from "./shared";

interface FormValues {
  title: string;
  foodType: string;
  category: FoodCategory;
  quantityNeeded: string;
  unit: string;
  deadline: string;
  mode: "dropoff" | "pickup";
  fridgeId: string;
  pickupLabel: string;
  rewardSol: string;
  rewardCondition: string;
  eligibility: string;
}
type Errors = Partial<Record<keyof FormValues, string>>;

const DEFAULT_CONDITION = "Reward is shared across donors whose accepted items count toward the goal. Paid only after the mission is verified complete.";
const NO_REWARD_CONDITION = "No reward attached. Recognition on the community leaderboard.";

function initialValues(mission?: Mission, defaultFridgeId?: string): FormValues {
  return {
    title: mission?.title ?? "",
    foodType: mission?.foodType ?? "",
    category: mission?.category ?? "produce",
    quantityNeeded: mission ? String(mission.quantityNeeded) : "",
    unit: mission?.unit ?? "",
    deadline: toLocalInput(mission?.deadline),
    mode: mission?.location.mode ?? "dropoff",
    fridgeId: mission?.location.fridgeId ?? defaultFridgeId ?? "",
    pickupLabel: mission?.location.mode === "pickup" ? mission.location.label : "",
    rewardSol: mission?.rewardSol !== undefined ? String(mission.rewardSol) : "",
    rewardCondition: mission?.rewardCondition ?? "",
    eligibility: mission?.eligibility.join("\n") ?? "",
  };
}

/** Create or edit a perishable rescue mission. Drafts stay private; publishing opens it to donors. */
export function MissionFormDialog({ open, onOpenChange, mission }: { open: boolean; onOpenChange: (open: boolean) => void; mission?: Mission }) {
  const { data, actions, organizationId, organization, connected } = useFoodBank();
  const [values, setValues] = useState<FormValues>(() => initialValues(mission, connected[0]?.fridge.id));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const budget = organization?.rewardBudgetSol ?? 0;
  const rewardNumber = values.rewardSol.trim() === "" ? undefined : Number(values.rewardSol);

  const validate = (status: "draft" | "open"): Errors => {
    const e: Errors = {};
    if (values.title.trim().length < 4) e.title = "Give the mission a short, specific title.";
    if (!values.foodType.trim()) e.foodType = "Describe the food you're asking for.";
    const qty = Number(values.quantityNeeded);
    if (!Number.isInteger(qty) || qty <= 0) e.quantityNeeded = "Enter a whole number greater than zero.";
    if (!values.unit.trim()) e.unit = "Unit is required (cartons, lbs, meals…).";
    const deadlineIso = fromLocalInput(values.deadline);
    if (!deadlineIso) e.deadline = "Pick a deadline.";
    else if (status === "open" && new Date(deadlineIso).getTime() <= Date.now()) e.deadline = "A published mission needs a deadline in the future.";
    if (values.mode === "dropoff" && !values.fridgeId) e.fridgeId = "Choose a connected fridge for drop-offs.";
    if (values.mode === "pickup" && !values.pickupLabel.trim()) e.pickupLabel = "Describe where pickup happens.";
    if (values.rewardSol.trim() !== "") {
      if (!Number.isFinite(rewardNumber) || rewardNumber! < 0) e.rewardSol = "Enter a non-negative amount in SOL.";
      else if (rewardNumber! > budget) e.rewardSol = `Exceeds your organization's reward budget of ${budget} SOL.`;
    }
    return e;
  };

  const submit = (status: "draft" | "open") => {
    const e = validate(status);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (!organizationId) {
      toast.error("Your account is not linked to an organization.");
      return;
    }
    const fridge = fridgeById(data, values.fridgeId);
    const input: CreateMissionInput = {
      organizationId,
      title: values.title.trim(),
      foodType: values.foodType.trim(),
      category: values.category,
      quantityNeeded: Number(values.quantityNeeded),
      unit: values.unit.trim(),
      deadline: fromLocalInput(values.deadline)!,
      location: values.mode === "dropoff" ? { mode: "dropoff", fridgeId: values.fridgeId, label: `Drop off at ${fridge?.name ?? "connected fridge"}` } : { mode: "pickup", label: values.pickupLabel.trim() },
      rewardSol: rewardNumber !== undefined && rewardNumber > 0 ? rewardNumber : undefined,
      rewardCondition: values.rewardCondition.trim() || ((rewardNumber ?? 0) > 0 ? DEFAULT_CONDITION : NO_REWARD_CONDITION),
      eligibility: values.eligibility.split("\n").map((s) => s.trim()).filter(Boolean),
      status,
    };
    setSubmitting(true);
    try {
      if (mission) {
        actions.updateMission(mission.id, input);
        toast.success(status === "open" && mission.status === "draft" ? "Mission published" : "Mission updated", { description: input.title });
      } else {
        actions.createMission(input);
        toast.success(status === "open" ? "Mission published" : "Draft saved", { description: status === "open" ? "Donors can now find it in their mission feed." : "Only your organization can see drafts." });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not save the mission", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const editingOpen = mission?.status === "open" || mission?.status === "completed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mission ? "Edit mission" : "Create a rescue mission"}</DialogTitle>
          <DialogDescription>Ask donors for specific food before it runs short. Only donations verified by the receiving fridge operator count toward the goal.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="m-title" label="Title" error={errors.title} className="sm:col-span-2">
            <Input id="m-title" value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="Milk for weekend family pickups" aria-invalid={Boolean(errors.title)} />
          </Field>
          <Field id="m-foodType" label="Food requested" error={errors.foodType} className="sm:col-span-2">
            <Input id="m-foodType" value={values.foodType} onChange={(e) => set("foodType", e.target.value)} placeholder="Whole or 2% milk, sealed, within date" aria-invalid={Boolean(errors.foodType)} />
          </Field>
          <Field id="m-category" label="Category">
            <Select value={values.category} onValueChange={(v) => set("category", v as FoodCategory)}>
              <SelectTrigger id="m-category" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FOOD_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="m-qty" label="Quantity" error={errors.quantityNeeded}>
              <Input id="m-qty" type="number" min={1} step={1} inputMode="numeric" value={values.quantityNeeded} onChange={(e) => set("quantityNeeded", e.target.value)} aria-invalid={Boolean(errors.quantityNeeded)} />
            </Field>
            <Field id="m-unit" label="Unit" error={errors.unit}>
              <Input id="m-unit" value={values.unit} onChange={(e) => set("unit", e.target.value)} placeholder="cartons" aria-invalid={Boolean(errors.unit)} />
            </Field>
          </div>
          <Field id="m-deadline" label="Deadline" error={errors.deadline}>
            <Input id="m-deadline" type="datetime-local" value={values.deadline} onChange={(e) => set("deadline", e.target.value)} aria-invalid={Boolean(errors.deadline)} />
          </Field>
          <Field id="m-mode" label="Where food goes">
            <Select value={values.mode} onValueChange={(v) => set("mode", v as FormValues["mode"])}>
              <SelectTrigger id="m-mode" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dropoff">Drop off at a connected fridge</SelectItem>
                <SelectItem value="pickup">We pick up from the donor</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {values.mode === "dropoff" ? (
            <Field id="m-fridge" label="Drop-off fridge" error={errors.fridgeId} hint={connected.length === 0 ? "Connect a fridge first to use it as a drop-off point." : undefined} className="sm:col-span-2">
              <Select value={values.fridgeId} onValueChange={(v) => set("fridgeId", v)}>
                <SelectTrigger id="m-fridge" className="w-full" aria-invalid={Boolean(errors.fridgeId)}><SelectValue placeholder="Choose a connected fridge" /></SelectTrigger>
                <SelectContent>
                  {connected.map(({ fridge }) => <SelectItem key={fridge.id} value={fridge.id}>{fridge.name} · {fridge.neighborhood}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field id="m-pickup" label="Pickup details" error={errors.pickupLabel} className="sm:col-span-2">
              <Input id="m-pickup" value={values.pickupLabel} onChange={(e) => set("pickupLabel", e.target.value)} placeholder="Volunteer pickup within Third Ward, Saturdays 9am–noon" aria-invalid={Boolean(errors.pickupLabel)} />
            </Field>
          )}
          <Field id="m-reward" label="Reward (SOL, optional)" error={errors.rewardSol} hint={`Budget available: ${budget} SOL`}>
            <Input id="m-reward" type="number" min={0} step="0.01" inputMode="decimal" value={values.rewardSol} onChange={(e) => set("rewardSol", e.target.value)} placeholder="0.25" aria-invalid={Boolean(errors.rewardSol)} />
          </Field>
          <Field id="m-condition" label="Reward condition" error={errors.rewardCondition} hint={(rewardNumber ?? 0) > 0 ? undefined : "Leave blank for a recognition-only mission."} className="sm:col-span-2">
            <Textarea id="m-condition" rows={2} value={values.rewardCondition} onChange={(e) => set("rewardCondition", e.target.value)} placeholder={DEFAULT_CONDITION} aria-invalid={Boolean(errors.rewardCondition)} />
          </Field>
          <Field id="m-eligibility" label="Eligibility rules" hint="One rule per line. Operators use these when checking donations in." className="sm:col-span-2">
            <Textarea id="m-eligibility" rows={3} value={values.eligibility} onChange={(e) => set("eligibility", e.target.value)} placeholder={"Sealed cartons only\nBest-by date at least 3 days out"} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          {editingOpen ? (
            <Button onClick={() => submit(mission!.status === "completed" ? "draft" : "open")} disabled={submitting}>{submitting ? "Saving…" : "Save changes"}</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => submit("draft")} disabled={submitting}>{mission ? "Save draft" : "Save as draft"}</Button>
              <Button onClick={() => submit("open")} disabled={submitting}>{submitting ? "Publishing…" : "Publish mission"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
