import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAuthToken } from "@/lib/auth/tokens";
import { sendPasswordResetEmail } from "@/lib/auth/email";

const RESEND_COOLDOWN_MS = 60 * 1000;

// Always responds identically so account existence cannot be probed.
const GENERIC = { success: true, message: "If an account exists for that email, a reset link has been sent." };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
    if (!email || email.length > 254) return NextResponse.json(GENERIC);

    const supabase = createAdminClient();
    const { data: user } = await supabase.from("users").select("id, email, status, password_hash").eq("email", email).maybeSingle();

    // Only ACTIVE accounts can reset. Invited users must use their invitation link.
    if (user && user.status === "ACTIVE") {
      const { data: recent } = await supabase
        .from("auth_tokens")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("token_type", "RESET")
        .gt("created_at", new Date(Date.now() - RESEND_COOLDOWN_MS).toISOString())
        .limit(1);

      if (!recent || recent.length === 0) {
        const token = await createAuthToken(user.id, "RESET");
        await sendPasswordResetEmail(user.email, token);
      }
    }
    return NextResponse.json(GENERIC);
  } catch (err) {
    console.error("[Auth Forgot Password Error]", err);
    return NextResponse.json(GENERIC);
  }
}
