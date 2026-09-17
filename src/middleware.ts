import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isMockAuthAllowed } from "@/lib/config";

const isPublicRoute = createRouteMatcher([
  "/",
  "/dev/(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/accept-invitation(.*)",
  "/pending-access(.*)",
  "/auth/resolve(.*)",
  "/api/webhooks(.*)",
  "/api/ownerrez/oauth/callback(.*)",
  "/api/cron(.*)",
  "/api/auth/session"
]);

export default clerkMiddleware(async (auth, req) => {
  if (process.env.NODE_ENV !== "production" || isMockAuthAllowed()) {
    return;
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|json|png|jpg|jpeg|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
