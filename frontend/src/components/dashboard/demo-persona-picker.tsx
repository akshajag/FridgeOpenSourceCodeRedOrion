"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Refrigerator, HandHeart, ArrowRight, Loader2 } from "lucide-react";
import { ROLE_HOME, type DemoPersona } from "@/lib/auth/config";
import { setDemoPersonaCookie } from "@/lib/auth/demo-cookie";
import { useDemoStore } from "@/lib/demo/store";
import { cn } from "@/lib/utils";

const PERSONAS: { id: DemoPersona; name: string; org: string; summary: string; icon: React.ComponentType<{ className?: string }>; firstTask: string }[] = [
  { id: "food_bank", name: "Maya Okafor", org: "Third Ward Community Pantry", summary: "Coordinates six community fridges. Creates rescue missions, runs events, approves rewards.", icon: Building2, firstTask: "Create a mission requesting milk" },
  { id: "operator", name: "Daniel Reyes", org: "Montrose Corner Fridge", summary: "Hosts a fridge with the full hardware kit. Watches temperature, confirms recognitions, accepts drop-offs.", icon: Refrigerator, firstTask: "Accept a delivered donation" },
  { id: "donor", name: "Priya Natarajan", org: "Neighborhood donor", summary: "Finds nearby fridges, joins missions, records donations, and tracks verified points.", icon: HandHeart, firstTask: "Join a mission and record a donation" },
];

export function DemoPersonaPicker({ next }: { next?: string }) {
  const router = useRouter();
  const setPersona = useDemoStore((s) => s.actions.setPersona);
  const [busy, setBusy] = useState<DemoPersona | null>(null);

  const choose = (persona: DemoPersona) => {
    setBusy(persona);
    setDemoPersonaCookie(persona);
    setPersona(persona);
    const target = next && next.startsWith(ROLE_HOME[persona]) ? next : ROLE_HOME[persona];
    router.push(target);
    router.refresh();
  };

  return (
    <div className="mt-8 grid gap-3 md:grid-cols-3">
      {PERSONAS.map((p) => {
        const Icon = p.icon;
        const isBusy = busy === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => choose(p.id)}
            disabled={busy !== null}
            className={cn(
              "group flex flex-col rounded-xl border border-border bg-card p-5 text-left shadow-panel transition-colors",
              "hover:border-evergreen/50 hover:bg-sage/30 focus-visible:border-evergreen focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-evergreen/40",
              "disabled:opacity-70",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-md bg-sage text-evergreen-deep">
                <Icon className="size-4.5" />
              </span>
              {isBusy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
            </div>
            <div className="mt-4 font-display text-[17px] font-semibold leading-tight">{p.name}</div>
            <div className="text-[13px] text-muted-foreground">{p.org}</div>
            <p className="mt-3 text-[13px] leading-relaxed text-foreground/85">{p.summary}</p>
            <div className="mt-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
              Suggested first task: <span className="text-foreground">{p.firstTask}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
