import { NextResponse, type NextRequest } from "next/server";

/** Legacy auth callback URL — redirect to app home. */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const next = request.nextUrl.searchParams.get("next") ?? "/new-test";
  return NextResponse.redirect(`${origin}${next}`);
}
