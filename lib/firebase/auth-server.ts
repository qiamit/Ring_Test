import { cookies } from "next/headers";
import type { DecodedIdToken } from "firebase-admin/auth";

import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/firebase/config";
import { isAppOwnerEmail } from "@/lib/firebase/permissions";

export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

export async function getSessionUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!session) return null;

  try {
    const decoded: DecodedIdToken = await getAdminAuth().verifySessionCookie(session, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      displayName: (decoded.name as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireSessionUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function isAppOwner(user?: AuthUser | null): Promise<boolean> {
  const u = user ?? (await getSessionUser());
  if (!u?.email) return false;
  return isAppOwnerEmail(u.email);
}
