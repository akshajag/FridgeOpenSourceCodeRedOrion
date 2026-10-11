import type { Metadata } from "next";
import { AuthFrame } from "@/components/dashboard/auth-frame";
import { isClerkConfigured } from "@/lib/auth/config";
import { ClerkSignIn } from "@/components/dashboard/clerk-auth";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthFrame title="Sign in to Fridgey" subtitle="Food banks, fridge operators, and donors use one account. Roles are added after sign-in." configured={isClerkConfigured()}>
      {isClerkConfigured() && <ClerkSignIn />}
    </AuthFrame>
  );
}
