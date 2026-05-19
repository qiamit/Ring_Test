import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/firebase/config";

function signOutResponse(request: Request) {
  const { origin } = new URL(request.url);
  const response = NextResponse.redirect(`${origin}/login`);
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

export async function GET(request: Request) {
  return signOutResponse(request);
}

export async function POST(request: Request) {
  return signOutResponse(request);
}
