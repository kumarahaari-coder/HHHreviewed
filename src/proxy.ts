import { NextRequest, NextResponse } from "next/server";
import { isMockAuthAllowed } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const PUBLIC_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/dev(\/.*)?$/,
  /^\/sign-in(.*)$/,
  /^\/sign-up(.*)$/,
  /^\/forgot-password(\/.*)?$/,
  /^\/reset-password(\/.*)?$/,
  /^\/accept-invitation(\/.*)?$/,
  /^\/pending-access(\/.*)?$/,
  /^\/auth\/resolve(\/.*)?$/,
  /^\/api\/webhooks(\/.*)?$/,
  /^\/api\/hostaway(\/.*)?$/,
  /^\/api\/ownerrez\/oauth\/callback(\/.*)?$/,
  /^\/api\/cron(\/.*)?$/,
  /^\/api\/auth\/(session|login|logout|forgot-password|reset-password|accept-invitation|handoff)$/
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PATTERNS.some(re => re.test(pathname));
}

/**
 * Coarse gate only: requires a session cookie to be present on non-public routes.
 * The cookie is NOT trusted here. Every protected API handler validates it against the
 * database (resolveAuthSession / requireAdminApi), and page layouts re-check via /api/auth/session.
 */
export function proxy(req: NextRequest) {
  if (process.env.NODE_ENV !== "production" || isMockAuthAllowed()) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (isPublicRoute(pathname) || req.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/sign-in", req.url));
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|json|png|jpg|jpeg|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)"
  ]
};
