import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { consumeAuthToken, peekAuthToken } from "@/lib/auth/tokens";
import { revokeAllUserSessions } from "@/lib/auth/session";

/** GET ?token=... : lets the page tell the user up-front whether the link is still valid. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const userId = await peekAuthToken(token, "RESET");
  return NextResponse.json({ valid: Boolean(userId) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";

    const problem = validatePasswordStrength(password);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

    const userId = await consumeAuthToken(token, "RESET");
    if (!userId) {
      return NextResponse.json({ success: false, error: "This reset link is invalid or has expired. Please request a new one." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("users")
      .update({
        password_hash: await hashPassword(password),
        password_updated_at: new Date().toISOString(),
        failed_login_attempts: 0,
        locked_until: null
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    await revokeAllUserSessions(userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Auth Reset Password Error]", err);
    return NextResponse.json({ success: false, error: "Could not reset password. Please try again." }, { status: 500 });
  }
}
