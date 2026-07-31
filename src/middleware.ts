import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/login(.*)",
  "/api/webhooks(.*)",
  "/api/cron(.*)",
  "/api/hospitable(.*)"
]);

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/api/admin(.*)"
]);

const isPartnerRoute = createRouteMatcher([
  "/partner(.*)"
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow mock dev auth mode only in non-production when explicitly configured
  const isDevMockMode = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AUTH_MODE === "mock_dev_only";
  if (isDevMockMode) {
    return;
  }

  if (!isPublicRoute(req)) {
    const session = await auth();
    if (!session.userId) {
      return session.redirectToSignIn({ returnBackUrl: req.url });
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
