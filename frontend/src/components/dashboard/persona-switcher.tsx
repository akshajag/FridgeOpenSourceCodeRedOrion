"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronsUpDown, Check, Building2, Refrigerator, HandHeart } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ROLE_HOME, type DemoPersona } from "@/lib/auth/config";
import { setDemoPersonaCookie } from "@/lib/auth/demo-cookie";
import { useDemoStore } from "@/lib/demo/store";
import { toast } from "sonner";

const PERSONAS: { id: DemoPersona; name: string; title: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "food_bank", name: "Maya Okafor", title: "Third Ward Community Pantry", icon: Building2 },
  { id: "operator", name: "Daniel Reyes", title: "Montrose Corner Fridge", icon: Refrigerator },
  { id: "donor", name: "Priya Natarajan", title: "Community donor", icon: HandHeart },
];

/** Demo-only persona switcher. Switching changes the synthetic persona cookie and routes to that role's dashboard. */
export function PersonaSwitcher({ persona }: { persona: DemoPersona }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const setPersona = useDemoStore((s) => s.actions.setPersona);
  const current = PERSONAS.find((p) => p.id === persona) ?? PERSONAS[0];
  const Icon = current.icon;

  const choose = (next: DemoPersona) => {
    if (next === persona) return;
    setDemoPersonaCookie(next);
    setPersona(next);
    start(() => {
      router.push(ROLE_HOME[next]);
      router.refresh();
    });
    const p = PERSONAS.find((x) => x.id === next)!;
    toast(`Switched to ${p.name}`, { description: p.title });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 pl-2 pr-1.5" aria-label="Switch demo persona" disabled={pending}>
          <Icon className="size-3.5 text-primary" />
          <span className="hidden sm:inline">{current.name}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Demo personas</DropdownMenuLabel>
        {PERSONAS.map((p) => {
          const PIcon = p.icon;
          return (
            <DropdownMenuItem key={p.id} onSelect={() => choose(p.id)} className="items-start gap-2.5 py-2">
              <PIcon className="mt-0.5 size-4 text-primary" />
              <div className="flex-1">
                <div className="text-[13px] font-medium">{p.name}</div>
                <div className="text-[12px] text-muted-foreground">{p.title}</div>
              </div>
              {p.id === persona && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[11.5px] leading-snug text-muted-foreground">Personas share one local demo dataset, so actions in one role show up in the others.</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
