"use client";

import dynamic from "next/dynamic";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** Clerk's sign-out control is only loaded when Clerk is configured. */
const ClerkSignOut = dynamic(() => import("./clerk-sign-out").then((m) => m.ClerkSignOut), { ssr: false });

export function LiveSignOut() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <DropdownMenuItem disabled>
        <LogOut /> Sign out
      </DropdownMenuItem>
    );
  }
  return <ClerkSignOut />;
}
