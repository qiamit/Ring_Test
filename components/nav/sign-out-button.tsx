"use client";

import { signOut } from "firebase/auth";
import { LogOut } from "lucide-react";

import { getFirebaseAuth } from "@/lib/firebase/client";

export function SignOutButton({ className }: { className?: string }) {
  async function handleSignOut() {
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* clear server session best-effort */
    }
    try {
      await signOut(getFirebaseAuth());
    } catch {
      /* already signed out client-side */
    }
    window.location.assign("/login");
  }

  return (
    <button type="button" onClick={() => void handleSignOut()} className={className}>
      <LogOut size={14} />
      Sign out
    </button>
  );
}
