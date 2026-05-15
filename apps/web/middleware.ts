import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (pathname.startsWith("/api/auth/signin")) return NextResponse.next();

  const hasSession = req.cookies.get("sdr-session")?.value;
  if (hasSession) return NextResponse.next();

  // No session: HTML pages → redirect to /login; API → 401 JSON
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, static files, and favicon
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
