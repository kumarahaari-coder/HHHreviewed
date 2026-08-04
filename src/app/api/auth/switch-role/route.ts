import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const role = body.role || "SUPER_ADMIN";
    const email = body.email || (role === "SUPER_ADMIN" ? "hiddenhoneyace@gmail.com" : "kumarahaari@gmail.com");
    const partnerId = body.partnerId || "";
    const userId = body.userId || "";

    const cookieStore = await cookies();
    cookieStore.set("demo_role", role, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
    if (email) cookieStore.set("demo_email", email, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
    if (partnerId) cookieStore.set("demo_partner_id", partnerId, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
    if (userId) cookieStore.set("demo_user_id", userId, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });

    const redirectUrl = (role === "SUPER_ADMIN" || role === "ADMIN" || role === "FINANCE_ADMIN") ? "/admin" : "/partner";

    return NextResponse.json({
      success: true,
      role,
      email,
      partnerId,
      redirectUrl
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
