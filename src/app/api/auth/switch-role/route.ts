import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getClerkAuthSession, isAdminRole } from "@/lib/authorization";
import { isMockAuthAllowed } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const isMock = isMockAuthAllowed();

    if (!isMock) {
      const session = await getClerkAuthSession();
      if (!session) {
        return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
      }

      const body = await req.json().catch(() => ({}));
      const targetRole = body.role;
      const targetPartnerId = body.partnerId;

      // In production, role comes strictly from Clerk -> Supabase. Roles cannot be mutated.
      if (targetRole && targetRole !== session.role) {
        return NextResponse.json({ success: false, error: "Forbidden: Production roles cannot be mutated." }, { status: 403 });
      }

      // Admin partner preview request
      if (isAdminRole(session.role) && targetPartnerId) {
        return NextResponse.json({
          success: true,
          role: session.role,
          partnerId: targetPartnerId,
          redirectUrl: `/partner?previewPartnerId=${encodeURIComponent(targetPartnerId)}`
        });
      }

      const redirectUrl = isAdminRole(session.role) ? "/admin" : "/partner";
      return NextResponse.json({
        success: true,
        role: session.role,
        redirectUrl
      });
    }

    // Mock dev-only mode
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
