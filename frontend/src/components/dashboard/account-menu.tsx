"use client";

import { useRouter } from "next/navigation";
import { LogOut, RotateCcw, UserRound, Home } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { clearDemoPersonaCookie } from "@/lib/auth/demo-cookie";
import { useDemoStore } from "@/lib/demo/store";
import { toast } from "sonner";
import type { ShellSession } from "./dashboard-shell";
import { ROLE_LABELS } from "@/types";
import { LiveSignOut } from "./live-sign-out";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export function AccountMenu({ session }: { session: ShellSession }) {
  const router = useRouter();
  const reset = useDemoStore((s) => s.actions.resetDemo);

  const exitDemo = () => {
    clearDemoPersonaCookie();
    router.push("/");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 rounded-full bg-sage text-[12px] font-semibold text-evergreen-deep hover:bg-sage-deep" aria-label="Account menu">
          {initials(session.name)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="text-[13px] font-medium">{session.name}</div>
          <div className="text-[12px] font-normal text-muted-foreground">
            {session.memberships.map((m) => ROLE_LABELS[m.role]).join(", ") || "No role yet"} · {session.mode === "demo" ? "Demo account" : "Signed in"}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/")}>
          <Home /> Home
        </DropdownMenuItem>
        {session.mode === "live" && (
          <DropdownMenuItem onSelect={() => router.push("/onboarding")}>
            <UserRound /> Manage roles
          </DropdownMenuItem>
        )}
        {session.mode === "demo" && (
          <DropdownMenuItem
            onSelect={() => {
              reset();
              toast.success("Demo data reset", { description: "The seeded dataset was restored." });
            }}
          >
            <RotateCcw /> Reset demo data
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {session.mode === "demo" ? (
          <DropdownMenuItem onSelect={exitDemo}>
            <LogOut /> Exit demo
          </DropdownMenuItem>
        ) : (
          <LiveSignOut />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
