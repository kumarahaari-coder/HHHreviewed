import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/accept-invitation(.*)",
  "/pending-access(.*)",
  "/auth/resolve(.*)",
  "/login(.*)",
  "/api/auth/session(.*)",
  "/api/auth/shopify-login(.*)",
  "/api/auth/shopify-metrics(.*)",
  "/api/webhooks(.*)",
  "/api/cron(.*)",
  "/api/hospitable(.*)"
]);

export default clerkMiddleware(async (auth, req) => {
  const isDevMockMode = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AUTH_MODE === "mock_dev_only";
  if (isDevMockMode) {
    return;
  }

  const { userId } = await auth();
  const path = req.nextUrl.pathname;

  console.log(`[Middleware Debug] Path: "${path}" | Clerk userId: ${userId || "UNAUTHENTICATED"}`);

  // Unauthenticated user requesting protected route -> redirect to sign-in ONCE
  if (!isPublicRoute(req)) {
    if (!userId) {
      console.log(`[Middleware Debug] Unauthenticated user requesting "${path}". Redirecting to sign-in.`);
      const signInUrl = new URL("/sign-in", req.url);
      return NextResponse.redirect(signInUrl);
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|json|png|jpg|jpeg|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
