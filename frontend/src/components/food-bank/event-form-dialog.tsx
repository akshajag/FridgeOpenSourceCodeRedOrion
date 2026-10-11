"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { CommunityEvent } from "@/types";
import type { CreateEventInput } from "@/lib/data/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFoodBank } from "./use-food-bank";
import { Field, fromLocalInput, toLocalInput } from "./shared";

interface FormValues {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  fridgeIds: string[];
  donationGoal: string;
  eligibleItems: string;
  leaderboardRule: CommunityEvent["leaderboardRule"];
  prizeWinners: string;
  prizeBudgetSol: string;
}
type Errors = Partial<Record<keyof FormValues, string>>;

function initialValues(event?: CommunityEvent): FormValues {
  return {
    name: event?.name ?? "",
    description: event?.description ?? "",
    startsAt: toLocalInput(event?.startsAt),
    endsAt: toLocalInput(event?.endsAt),
    fridgeIds: event?.fridgeIds ?? [],
    donationGoal: event ? String(event.donationGoal) : "",
    eligibleItems: event?.eligibleItems.join(", ") ?? "",
    leaderboardRule: event?.leaderboardRule ?? "verified_quantity",
    prizeWinners: event ? String(event.prizeWinners) : "3",
    prizeBudgetSol: event ? String(event.prizeBudgetSol) : "",
  };
}

export function EventFormDialog({ open, onOpenChange, event }: { open: boolean; onOpenChange: (open: boolean) => void; event?: CommunityEvent }) {
  const { data, actions, organizationId, organization, connected } = useFoodBank();
  const [values, setValues] = useState<FormValues>(() => initialValues(event));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const budget = organization?.rewardBudgetSol ?? 0;

  // Fridges that were on the event but are no longer connected stay selectable so editing doesn't silently drop them.
  const choices = [...connected.map((c) => c.fridge), ...values.fridgeIds.filter((id) => !connected.some((c) => c.fridge.id === id)).map((id) => data.fridges.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => Boolean(f))];

  const validate = (status: "draft" | "published"): Errors => {
    const e: Errors = {};
    if (values.name.trim().length < 4) e.name = "Give the event a name.";
    if (!values.description.trim()) e.description = "A sentence or two helps donors understand the goal.";
    const start = fromLocalInput(values.startsAt);
    const end = fromLocalInput(values.endsAt);
    if (!start) e.startsAt = "Pick a start date.";
    if (!end) e.endsAt = "Pick an end date.";
    if (start && end && new Date(end).getTime() <= new Date(start).getTime()) e.endsAt = "End must be after the start.";
    if (status === "published" && end && new Date(end).getTime() <= Date.now()) e.endsAt = "A published event needs an end date in the future.";
    if (values.fridgeIds.length === 0) e.fridgeIds = "Pick at least one participating fridge.";
    const goal = Number(values.donationGoal);
    if (!Number.isInteger(goal) || goal <= 0) e.donationGoal = "Enter a whole-number goal greater than zero.";
    if (!values.eligibleItems.split(",").some((s) => s.trim())) e.eligibleItems = "List at least one eligible item.";
    const winners = Number(values.prizeWinners);
    if (!Number.isInteger(winners) || winners < 0) e.prizeWinners = "Enter a whole number (0 for no prizes).";
    const prize = values.prizeBudgetSol.trim() === "" ? 0 : Number(values.prizeBudgetSol);
    if (!Number.isFinite(prize) || prize < 0) e.prizeBudgetSol = "Enter a non-negative amount in SOL.";
    else if (prize > budget) e.prizeBudgetSol = `Exceeds your organization's reward budget of ${budget} SOL.`;
    if (winners > 0 && prize === 0) e.prizeBudgetSol = "Add a prize budget or set winners to 0.";
    return e;
  };

  const submit = (status: "draft" | "published") => {
    const e = validate(status);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (!organizationId) {
      toast.error("Your account is not linked to an organization.");
      return;
    }
    const input: CreateEventInput = {
      organizationId,
      name: values.name.trim(),
      description: values.description.trim(),
      startsAt: fromLocalInput(values.startsAt)!,
      endsAt: fromLocalInput(values.endsAt)!,
      fridgeIds: values.fridgeIds,
      donationGoal: Number(values.donationGoal),
      eligibleItems: values.eligibleItems.split(",").map((s) => s.trim()).filter(Boolean),
      leaderboardRule: values.leaderboardRule,
      prizeWinners: Number(values.prizeWinners),
      prizeBudgetSol: values.prizeBudgetSol.trim() === "" ? 0 : Number(values.prizeBudgetSol),
      status,
    };
    setSubmitting(true);
    try {
      if (event) {
        actions.updateEvent(event.id, input);
        toast.success(status === "published" && event.status === "draft" ? "Event published" : "Event updated", { description: input.name });
      } else {
        actions.createEvent(input);
        toast.success(status === "published" ? "Event published" : "Draft saved", { description: status === "published" ? "Donors can see it now; progress counts from the start date." : "Only your organization can see drafts." });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not save the event", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFridge = (id: string, checked: boolean) => set("fridgeIds", checked ? [...values.fridgeIds, id] : values.fridgeIds.filter((x) => x !== id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "Create a community event"}</DialogTitle>
          <DialogDescription>A time-boxed drive across several fridges. Progress counts operator-verified donations to participating fridges during the window.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="e-name" label="Name" error={errors.name} className="sm:col-span-2">
            <Input id="e-name" value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Fall Harvest Week" aria-invalid={Boolean(errors.name)} />
          </Field>
          <Field id="e-description" label="Description" error={errors.description} className="sm:col-span-2">
            <Textarea id="e-description" rows={2} value={values.description} onChange={(e) => set("description", e.target.value)} placeholder="A week-long push to stock every connected fridge with fresh produce before the holidays." aria-invalid={Boolean(errors.description)} />
          </Field>
          <Field id="e-start" label="Starts" error={errors.startsAt}>
            <Input id="e-start" type="datetime-local" value={values.startsAt} onChange={(e) => set("startsAt", e.target.value)} aria-invalid={Boolean(errors.startsAt)} />
          </Field>
          <Field id="e-end" label="Ends" error={errors.endsAt}>
            <Input id="e-end" type="datetime-local" value={values.endsAt} onChange={(e) => set("endsAt", e.target.value)} aria-invalid={Boolean(errors.endsAt)} />
          </Field>

          <fieldset className="space-y-1.5 sm:col-span-2" aria-describedby={errors.fridgeIds ? "e-fridges-error" : undefined}>
            <legend className="text-[13px] font-medium">Participating fridges</legend>
            {choices.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">Connect at least one fridge before creating an event.</p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {choices.map((f) => {
                  const id = `e-fridge-${f.id}`;
                  const checked = values.fridgeIds.includes(f.id);
                  return (
                    <li key={f.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${checked ? "border-sage-deep bg-sage/40" : "border-border"}`}>
                      <Checkbox id={id} checked={checked} onCheckedChange={(v) => toggleFridge(f.id, v === true)} />
                      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-[13px]">
                        <span className="block truncate font-medium">{f.name}</span>
                        <span className="block text-[12px] text-muted-foreground">{f.neighborhood}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {errors.fridgeIds && <p id="e-fridges-error" role="alert" className="text-[12px] text-critical">{errors.fridgeIds}</p>}
          </fieldset>

          <Field id="e-goal" label="Donation goal (items)" error={errors.donationGoal}>
            <Input id="e-goal" type="number" min={1} step={1} inputMode="numeric" value={values.donationGoal} onChange={(e) => set("donationGoal", e.target.value)} placeholder="300" aria-invalid={Boolean(errors.donationGoal)} />
          </Field>
          <Field id="e-items" label="Eligible items" error={errors.eligibleItems} hint="Comma-separated.">
            <Input id="e-items" value={values.eligibleItems} onChange={(e) => set("eligibleItems", e.target.value)} placeholder="Produce, Dairy, Eggs" aria-invalid={Boolean(errors.eligibleItems)} />
          </Field>
          <Field id="e-rule" label="Leaderboard rule">
            <Select value={values.leaderboardRule} onValueChange={(v) => set("leaderboardRule", v as FormValues["leaderboardRule"])}>
              <SelectTrigger id="e-rule" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="verified_quantity">Rank by verified quantity</SelectItem>
                <SelectItem value="verified_points">Rank by verified points</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="e-winners" label="Prize winners" error={errors.prizeWinners}>
              <Input id="e-winners" type="number" min={0} step={1} inputMode="numeric" value={values.prizeWinners} onChange={(e) => set("prizeWinners", e.target.value)} aria-invalid={Boolean(errors.prizeWinners)} />
            </Field>
            <Field id="e-prize" label="Prize budget (SOL)" error={errors.prizeBudgetSol} hint={`Budget: ${budget} SOL`}>
              <Input id="e-prize" type="number" min={0} step="0.01" inputMode="decimal" value={values.prizeBudgetSol} onChange={(e) => set("prizeBudgetSol", e.target.value)} placeholder="1.5" aria-invalid={Boolean(errors.prizeBudgetSol)} />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          {event?.status === "published" ? (
            <Button onClick={() => submit("published")} disabled={submitting}>{submitting ? "Saving…" : "Save changes"}</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => submit("draft")} disabled={submitting}>{event ? "Save draft" : "Save as draft"}</Button>
              <Button onClick={() => submit("published")} disabled={submitting}>{submitting ? "Publishing…" : "Publish event"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
