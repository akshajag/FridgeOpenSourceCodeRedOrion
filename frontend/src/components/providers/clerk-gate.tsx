"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

/**
 * Wraps the tree in ClerkProvider only when a publishable key exists.
 * Without a key the app runs in demo mode and never imports Clerk's runtime.
 */
export function ClerkGate({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <>{children}</>;
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/onboarding"
      signUpFallbackRedirectUrl="/onboarding"
      appearance={{
        variables: {
          colorPrimary: "#316b54",
          colorForeground: "#20372f",
          colorBackground: "#ffffff",
          borderRadius: "8px",
          fontFamily: "var(--font-plex), sans-serif",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
