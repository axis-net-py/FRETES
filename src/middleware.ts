import { NextRequest, NextResponse } from "next/server";
import { COOKIE, validSession } from "./lib/session";
export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const publicPath = [
    "/login",
    "/demo",
    "/motorista",
    "/api/auth",
    "/api/tracking",
    "/api/positions",
    "/api/health",
    "/acompanhar",
    "/api/customer-tracking",
  ].some((x) => p === x || p.startsWith(x + "/"));
  if (publicPath) return NextResponse.next();
  if (await validSession(req.cookies.get(COOKIE)?.value)) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.headers.get("origin");
      if (origin && origin !== req.nextUrl.origin)
        return NextResponse.json(
          { error: "Origem não permitida" },
          { status: 403 },
        );
    }
    return NextResponse.next();
  }
  if (p.startsWith("/api/"))
    return NextResponse.json({ error: "Entre na sua conta" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)",
  ],
};
