import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { consumeAuthToken, peekAuthToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const userId = await peekAuthToken(token, "INVITE");
  if (!userId) return NextResponse.json({ valid: false });

  const { data: user } = await createAdminClient().from("users").select("email, name").eq("id", userId).maybeSingle();
  return NextResponse.json({ valid: Boolean(user), email: user?.email, name: user?.name });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";

    const problem = validatePasswordStrength(password);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    const supabase = createAdminClient();

    // Verify eligibility BEFORE consuming the one-time token.
    const peekedUserId = await peekAuthToken(token, "INVITE");
    if (!peekedUserId) {
      return NextResponse.json({ success: false, error: "This invitation link is invalid or has expired. Ask your administrator to resend it." }, { status: 400 });
    }
    const { data: existing } = await supabase.from("users").select("id, status, partner_id").eq("id", peekedUserId).maybeSingle();
    if (!existing || !["INVITED", "ACTIVE"].includes(existing.status)) {
      return NextResponse.json({ success: false, error: "This invitation is no longer active." }, { status: 403 });
    }

    const userId = await consumeAuthToken(token, "INVITE");
    if (!userId) {
      return NextResponse.json({ success: false, error: "This invitation link is invalid or has expired." }, { status: 400 });
    }

    const { error } = await supabase
      .from("users")
      .update({
        password_hash: await hashPassword(password),
        password_updated_at: new Date().toISOString(),
        status: "ACTIVE",
        onboarding_status: "COMPLETED",
        failed_login_attempts: 0,
        locked_until: null,
        last_login: new Date().toISOString()
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    await supabase.from("application_audit_logs").insert({
      action: "INVITATION_ACCEPTED",
      target_user_id: userId,
      partner_id: existing.partner_id,
      source: "AUTH_RESOLVER",
      details: { method: "native_password" }
    });

    await createSession(userId, {
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    });

    return NextResponse.json({ success: true, redirectUrl: "/auth/resolve" });
  } catch (err) {
    console.error("[Auth Accept Invitation Error]", err);
    return NextResponse.json({ success: false, error: "Could not complete setup. Please try again." }, { status: 500 });
  }
}
