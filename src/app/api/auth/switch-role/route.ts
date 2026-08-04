import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const role = body.role === "PARTNER_OWNER" || body.role === "MEMBER" ? "PARTNER_OWNER" : "SUPER_ADMIN";

    const cookieStore = await cookies();
    cookieStore.set("demo_role", role, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax"
    });

    return NextResponse.json({
      success: true,
      role,
      redirectUrl: role === "SUPER_ADMIN" ? "/admin" : "/partner"
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
