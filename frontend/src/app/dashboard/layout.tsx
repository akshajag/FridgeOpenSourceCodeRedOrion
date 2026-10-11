import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataModeProvider } from "@/lib/data/data-mode";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/demo?next=/dashboard");
  if (session.mode === "live" && !session.onboarded) redirect("/onboarding");

  const value = {
    mode: session.mode,
    currentUserId: session.userId,
    userName: session.name,
    memberships: session.memberships,
    persona: session.mode === "demo" ? session.persona : undefined,
  } as const;

  return (
    <DataModeProvider value={value}>
      <DashboardShell session={{ mode: session.mode, name: session.name, memberships: session.memberships, persona: value.persona }}>{children}</DashboardShell>
    </DataModeProvider>
  );
}
