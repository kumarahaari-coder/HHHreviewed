import { NextRequest, NextResponse } from "next/server";
import { resolveAuthSession } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const result = await resolveAuthSession();
    return NextResponse.json(result);
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

