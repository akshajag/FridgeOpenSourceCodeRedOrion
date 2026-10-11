import { redirect } from "next/navigation";
import { getSession, hasRole } from "@/lib/auth/session";
import { RoleGuardNotice } from "@/components/dashboard/role-guard-notice";

/** Server-side role gate: the donor dashboard requires a donor membership. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/demo?next=/dashboard/donor");
  if (!hasRole(session, "donor")) {
    return <RoleGuardNotice required="donor" session={{ mode: session.mode, memberships: session.memberships }} />;
  }
  return <>{children}</>;
}
