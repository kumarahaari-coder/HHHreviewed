import { NextRequest, NextResponse } from "next/server";
import { getClerkAuthSession } from "@/lib/authorization";
import { db } from "@/lib/db/mockDb";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function GET(req: NextRequest) {
  try {
    const isDevMockMode = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AUTH_MODE === "mock_dev_only";

    if (isDevMockMode) {
      const user = db.currentUser;
      console.log(`[Auth Debug API] Dev Mock Mode - User:`, user?.email, user?.role);
      return NextResponse.json({
        authenticated: !!user,
        status: user ? "APPROVED" : "UNAUTHENTICATED",
        user: user || null
      });
    }

    const clerkAuth = await auth();
    const userId = clerkAuth.userId;

    if (!userId) {
      console.log(`[Auth Debug API] Unauthenticated Clerk Request.`);
      return NextResponse.json({
        authenticated: false,
        status: "UNAUTHENTICATED",
        user: null
      });
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses?.[0]?.emailAddress || "";

    const session = await getClerkAuthSession();

    if (!session) {
      console.log(`[Auth Debug API] Clerk User ${userId} (${email}) has no application DB record. Status: PENDING_ACCESS.`);
      return NextResponse.json({
        authenticated: true,
        status: "PENDING_ACCESS",
        clerkUserId: userId,
        email,
        user: null
      });
    }

    console.log(`[Auth Debug API] Clerk User ${userId} (${session.email}) Authorized. Role: ${session.role}, PartnerID: ${session.partnerId}`);

    return NextResponse.json({
      authenticated: true,
      status: "APPROVED",
      session,
      user: {
        id: session.userId,
        email: session.email,
        role: session.role,
        partnerId: session.partnerId,
        clerkUserId: session.clerkUserId
      }
    });

  } catch (error: any) {
    console.error(`[Auth Debug API Error]`, error);
    return NextResponse.json({
      authenticated: false,
      status: "ERROR",
      error: error?.message || "Auth evaluation failed"
    }, { status: 500 });
  }
}
