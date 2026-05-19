import { NextResponse, type NextRequest } from "next/server";

import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/firebase/config";
import { isAppOwnerEmail } from "@/lib/firebase/permissions";

async function verifySessionCookie(
  session: string | undefined,
): Promise<{ valid: boolean; email: string | null }> {
  if (!session) return { valid: false, email: null };
  try {
    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    return { valid: true, email: decoded.email ?? null };
  } catch {
    return { valid: false, email: null };
  }
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const { valid: isLoggedIn, email } = await verifySessionCookie(session);

  const path = request.nextUrl.pathname;
  const isAuthRoute =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/registration-submitted");
  const isPublic =
    isAuthRoute || path.startsWith("/auth") || path.startsWith("/api/auth") || path === "/";
  const isAdminRoute = path.startsWith("/admin");

  if (!isLoggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", path);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = isAppOwnerEmail(email) ? "/admin/dashboard" : "/new-test";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isAdminRoute && !isAppOwnerEmail(email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/new-test";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
