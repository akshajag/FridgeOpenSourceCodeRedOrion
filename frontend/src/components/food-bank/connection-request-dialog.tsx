"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Fridge, SharingPreferences } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFoodBank } from "./use-food-bank";
import { Field } from "./shared";

const SHARING_OPTIONS: { key: keyof SharingPreferences; label: string; hint: string }[] = [
  { key: "inventory", label: "Inventory", hint: "Item names, quantities and best-by dates." },
  { key: "sensors", label: "Sensor readings", hint: "Temperature, humidity and air-quality history." },
  { key: "alerts", label: "Alerts", hint: "Open monitoring alerts, read-only on your side." },
  { key: "preciseLocation", label: "Precise location", hint: "Street address instead of an approximate pin." },
];

/** Dialog for asking a fridge operator to connect with the organization. */
export function ConnectionRequestDialog({ fridge, open, onOpenChange }: { fridge: Fridge; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { actions, organization, organizationId } = useFoodBank();
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState<SharingPreferences>({ inventory: true, sensors: false, alerts: true, preciseLocation: fridge.visibility === "private" });
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = () => {
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError("Tell the operator why you want to connect (at least 10 characters).");
      return;
    }
    if (!organizationId) {
      toast.error("Your account is not linked to an organization.");
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      actions.requestConnection(organizationId, fridge.id, trimmed, sharing);
      toast.success(`Request sent to ${fridge.name}`, { description: "The operator decides what to share. You'll see the status under Network." });
      onOpenChange(false);
      setMessage("");
    } catch (e) {
      toast.error("Could not send the request", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect with {fridge.name}</DialogTitle>
          <DialogDescription>
            {organization?.name ?? "Your organization"} is asking the operator to share data with you. They can approve with fewer permissions than you request.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="conn-message" label="Message to the operator" error={error}>
            <Textarea id="conn-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="We run weekend family pickups in Third Ward and would like to list your fridge as a drop-off point." aria-invalid={Boolean(error)} aria-describedby={error ? "conn-message-error" : undefined} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium">Requested sharing</legend>
            {SHARING_OPTIONS.map((opt) => (
              <div key={opt.key} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div>
                  <label htmlFor={`sharing-${opt.key}`} className="text-[13px] font-medium">{opt.label}</label>
                  <p className="text-[12px] text-muted-foreground">{opt.hint}</p>
                </div>
                <Switch id={`sharing-${opt.key}`} checked={sharing[opt.key]} onCheckedChange={(v) => setSharing((s) => ({ ...s, [opt.key]: Boolean(v) }))} />
              </div>
            ))}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Sending…" : "Send request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
