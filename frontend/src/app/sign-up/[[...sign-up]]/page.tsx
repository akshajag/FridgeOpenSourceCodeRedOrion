import type { Metadata } from "next";
import { AuthFrame } from "@/components/dashboard/auth-frame";
import { isClerkConfigured } from "@/lib/auth/config";
import { ClerkSignUp } from "@/components/dashboard/clerk-auth";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthFrame title="Create your Nourish account" subtitle="Sign up with Google or email. You will choose your primary role next." configured={isClerkConfigured()}>
      {isClerkConfigured() && <ClerkSignUp />}
    </AuthFrame>
  );
}
