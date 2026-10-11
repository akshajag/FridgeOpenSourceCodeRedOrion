import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Logo } from "@/components/shared/logo";
import { RolePicker } from "@/components/dashboard/role-picker";

export const metadata: Metadata = { title: "Choose your role" };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/demo?next=/onboarding");
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 items-center px-6 md:px-10"><Logo /></header>
      <main className="mx-auto max-w-4xl px-6 pb-20 pt-4 md:px-10 md:pt-10">
        <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight md:text-[40px]">How will you use Fridgey?</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Pick a primary role to set up your dashboard. You can add other roles later; one account can run a fridge and donate.
        </p>
        <RolePicker mode={session.mode} existing={session.memberships} />
      </main>
    </div>
  );
}
