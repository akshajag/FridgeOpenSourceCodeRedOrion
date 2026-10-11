import { redirect } from "next/navigation";
import { getSession, hasRole } from "@/lib/auth/session";
import { RoleGuardNotice } from "@/components/dashboard/role-guard-notice";

/** Server-side role gate: the operator dashboard requires a operator membership. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/demo?next=/dashboard/operator");
  if (!hasRole(session, "operator")) {
    return <RoleGuardNotice required="operator" session={{ mode: session.mode, memberships: session.memberships }} />;
  }
  return <>{children}</>;
}
