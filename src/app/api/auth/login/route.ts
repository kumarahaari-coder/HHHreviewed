import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const GENERIC_ERROR = "Invalid email or password.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password || password.length > 128) {
      return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from("users")
      .select("id, role, status, partner_id, password_hash, failed_login_attempts, locked_until")
      .eq("email", email)
      .maybeSingle();

    if (!user || !user.password_hash) {
      await burnPasswordCheck(password);
      return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 401 });
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return NextResponse.json(
        { success: false, error: "Too many failed attempts. Try again in a few minutes." },
        { status: 429 }
      );
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      await supabase
        .from("users")
        .update({
          failed_login_attempts: lock ? 0 : attempts,
          locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null
        })
        .eq("id", user.id);
      return NextResponse.json({ success: false, error: GENERIC_ERROR }, { status: 401 });
    }

    // Password correct: only ACTIVE accounts may sign in.
    if (user.status !== "ACTIVE") {
      return NextResponse.json({ success: false, error: "This account is not active. Contact an administrator." }, { status: 403 });
    }

    await supabase
      .from("users")
      .update({ failed_login_attempts: 0, locked_until: null, last_login: new Date().toISOString() })
      .eq("id", user.id);

    await createSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    });

    return NextResponse.json({ success: true, redirectUrl: "/auth/resolve" });
  } catch (err) {
    console.error("[Auth Login Error]", err);
    return NextResponse.json({ success: false, error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
