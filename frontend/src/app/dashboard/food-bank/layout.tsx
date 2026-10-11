import { redirect } from "next/navigation";
import { getSession, hasRole } from "@/lib/auth/session";
import { RoleGuardNotice } from "@/components/dashboard/role-guard-notice";

/** Server-side role gate: the food_bank dashboard requires a food_bank membership. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/demo?next=/dashboard/food-bank");
  if (!hasRole(session, "food_bank")) {
    return <RoleGuardNotice required="food_bank" session={{ mode: session.mode, memberships: session.memberships }} />;
  }
  return <>{children}</>;
}
