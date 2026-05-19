import { NextResponse } from "next/server";

import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "@/lib/firebase/config";
import { resolveSessionAccess } from "@/lib/firebase/organization";
import { sessionErrorMessage, type SessionErrorCode } from "@/lib/firebase/session-errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      idToken?: string;
      firmName?: string;
      contactName?: string;
    };
    if (!body.idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(body.idToken);

    const access = await resolveSessionAccess({
      uid: decoded.uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      firmName: body.firmName,
      contactName: body.contactName,
    });

    if (!access.ok) {
      const code = access.code as SessionErrorCode;
      return NextResponse.json(
        { error: sessionErrorMessage(code), code },
        { status: 403 },
      );
    }

    const sessionCookie = await auth.createSessionCookie(body.idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });

    const response = NextResponse.json({ ok: true, isSuperAdmin: access.isSuperAdmin });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_MS / 1000,
      path: "/",
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Session creation failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
