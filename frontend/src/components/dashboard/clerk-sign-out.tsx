"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function ClerkSignOut() {
  const { signOut } = useClerk();
  return (
    <DropdownMenuItem onSelect={() => signOut({ redirectUrl: "/" })}>
      <LogOut /> Sign out
    </DropdownMenuItem>
  );
}
