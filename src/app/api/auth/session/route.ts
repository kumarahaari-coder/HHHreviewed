import { NextRequest, NextResponse } from "next/server";
import { getClerkAuthSession } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const session = await getClerkAuthSession();

    if (!session) {
      return NextResponse.json({
        authenticated: false,
        status: "UNAUTHENTICATED",
        session: null,
        user: null
      });
    }

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
    console.error("[Auth Session API Error]", error);
    return NextResponse.json({
      authenticated: false,
      status: "UNAUTHENTICATED",
      session: null,
      user: null
    });
  }
}
