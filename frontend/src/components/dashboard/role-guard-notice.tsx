import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { Membership, Role } from "@/types";
import { ROLE_LABELS } from "@/types";
import { ROLE_HOME } from "@/lib/auth/config";
import { Button } from "@/components/ui/button";

export function RoleGuardNotice({ required, session }: { required: Role; session: { mode: "demo" | "live"; memberships: Membership[] } }) {
  const home = session.memberships[0] ? ROLE_HOME[session.memberships[0].role] : "/onboarding";
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-lg bg-amber-soft text-amber">
        <ShieldAlert className="size-6" />
      </div>
      <h1 className="font-display text-2xl font-semibold">This area is for {ROLE_LABELS[required].toLowerCase()} accounts</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {session.mode === "demo"
          ? "In demo mode, use the persona switcher in the top bar to view this dashboard as the matching demo persona."
          : "Your account does not have this role. Add it from onboarding, or ask your organization administrator for access."}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button asChild><Link href={home}>Go to my dashboard</Link></Button>
        {session.mode === "live" && <Button asChild variant="outline"><Link href="/onboarding">Manage roles</Link></Button>}
      </div>
    </div>
  );
}
