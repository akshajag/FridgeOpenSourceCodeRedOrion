"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Building2, Refrigerator, HandHeart, Check, Loader2 } from "lucide-react";
import type { Membership, Role } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_HOME } from "@/lib/auth/config";
import { setDemoPersonaCookie } from "@/lib/auth/demo-cookie";
import { useDemoStore } from "@/lib/demo/store";
import { completeOnboarding } from "@/app/onboarding/actions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ROLES: { id: Role; title: string; icon: React.ComponentType<{ className?: string }>; blurb: string; bullets: string[] }[] = [
  { id: "food_bank", title: "Food bank", icon: Building2, blurb: "You coordinate a network of community fridges for an organization.", bullets: ["See connected fridges and shared inventory", "Create rescue missions and community events", "Approve rewards for verified donations"] },
  { id: "operator", title: "Personal fridge operator", icon: Refrigerator, blurb: "You host a Nourish-equipped refrigerator and keep it running well.", bullets: ["Live temperature, humidity, and air-quality monitoring", "Confirm camera recognitions and manage inventory", "Approve which food banks can see your data"] },
  { id: "donor", title: "Donor", icon: HandHeart, blurb: "You bring food to nearby fridges and want it to count.", bullets: ["Find fridges and open missions near you", "Record donations and track verification", "Earn verified points and optional rewards"] },
];

export function RolePicker({ mode, existing }: { mode: "demo" | "live"; existing: Membership[] }) {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(existing[0]?.role ?? null);
  const [orgName, setOrgName] = useState("");
  const [fridgeName, setFridgeName] = useState("");
  const [pending, start] = useTransition();
  const setPersona = useDemoStore((s) => s.actions.setPersona);

  const submit = () => {
    if (!role) return;
    if (mode === "demo") {
      setDemoPersonaCookie(role);
      setPersona(role);
      start(() => {
        router.push(ROLE_HOME[role]);
        router.refresh();
      });
      return;
    }
    start(async () => {
      const result = await completeOnboarding({ role, organizationName: orgName.trim() || undefined, fridgeName: fridgeName.trim() || undefined });
      if (!result.ok) {
        toast.error("Couldn’t save your role", { description: result.error });
        return;
      }
      toast.success("Role saved");
      router.push(ROLE_HOME[role]);
      router.refresh();
    });
  };

  return (
    <div className="mt-8">
      <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Primary role">
        {ROLES.map((r) => {
          const Icon = r.icon;
          const selected = role === r.id;
          const has = existing.some((m) => m.role === r.id);
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setRole(r.id)}
              className={cn("flex flex-col rounded-xl border bg-card p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-evergreen/40", selected ? "border-evergreen shadow-raised" : "border-border hover:border-sage-deep")}
            >
              <div className="flex items-center justify-between">
                <span className={cn("flex size-9 items-center justify-center rounded-md", selected ? "bg-primary text-primary-foreground" : "bg-sage text-evergreen-deep")}><Icon className="size-4.5" /></span>
                {selected && <Check className="size-4 text-primary" />}
              </div>
              <div className="mt-4 font-display text-[17px] font-semibold">{r.title}</div>
              <p className="mt-1 text-[13px] text-muted-foreground">{r.blurb}</p>
              <ul className="mt-3 space-y-1 text-[13px] text-foreground/85">
                {r.bullets.map((b) => <li key={b} className="flex gap-2"><span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-faint" />{b}</li>)}
              </ul>
              {has && <div className="mt-3 text-[12px] text-primary">Already on your account</div>}
            </button>
          );
        })}
      </div>

      {mode === "live" && role === "food_bank" && (
        <div className="mt-6 max-w-md space-y-2">
          <Label htmlFor="org">Organization name</Label>
          <Input id="org" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Third Ward Community Pantry" autoComplete="organization" />
          <p className="text-[12px] text-muted-foreground">You become the administrator of this organization.</p>
        </div>
      )}
      {mode === "live" && role === "operator" && (
        <div className="mt-6 max-w-md space-y-2">
          <Label htmlFor="fridge">Fridge name</Label>
          <Input id="fridge" value={fridgeName} onChange={(e) => setFridgeName(e.target.value)} placeholder="e.g. Montrose Corner Fridge" />
          <p className="text-[12px] text-muted-foreground">Registers a fridge tied to your account. You can pair hardware afterwards.</p>
        </div>
      )}

      <div className="mt-8 flex items-center gap-3">
        <Button onClick={submit} disabled={!role || pending} size="lg">
          {pending && <Loader2 className="animate-spin" />} Continue
        </Button>
        {mode === "demo" && <span className="text-[13px] text-muted-foreground">Demo mode: this selects the matching demo persona.</span>}
      </div>
    </div>
  );
}
