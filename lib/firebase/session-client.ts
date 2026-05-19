"use client";

import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  SessionAccessError,
  sessionErrorMessage,
  type SessionErrorCode,
} from "@/lib/firebase/session-errors";

export type EstablishSessionOptions = {
  firmName?: string;
  contactName?: string;
};

export type EstablishSessionResult = {
  isSuperAdmin: boolean;
};

/** Sync Firebase ID token into an HTTP-only session cookie for SSR. */
export async function establishServerSession(
  options?: EstablishSessionOptions,
): Promise<EstablishSessionResult> {
  const user = getFirebaseAuth().currentUser;
  if (!user) {
    throw new Error("Not signed in");
  }
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken,
      firmName: options?.firmName,
      contactName: options?.contactName,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: SessionErrorCode;
    isSuperAdmin?: boolean;
  };
  if (!res.ok) {
    const code = body.code;
    if (code) {
      throw new SessionAccessError(code, body.error ?? sessionErrorMessage(code));
    }
    throw new Error(body.error ?? "Failed to create session");
  }
  return { isSuperAdmin: body.isSuperAdmin === true };
}
