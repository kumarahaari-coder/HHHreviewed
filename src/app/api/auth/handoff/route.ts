import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";
import { getAppBaseUrl } from "@/lib/auth/email";

/** Landing point for the Shopify handoff: exchanges a one-time token for a session cookie. */
export async function GET(req: NextRequest) {
  const base = getAppBaseUrl();
  const fail = () => NextResponse.redirect(new URL("/sign-in", base));

  const token = req.nextUrl.searchParams.get("token") || "";
  const userId = await consumeAuthToken(token, "HANDOFF");
  if (!userId) return fail();

  const { data: user } = await createAdminClient().from("users").select("id, status, role").eq("id", userId).maybeSingle();
  if (!user || user.status !== "ACTIVE" || (user.role !== "CREATOR" && user.role !== "PARTNER_OWNER")) return fail();

  await createSession(user.id, {
    userAgent: req.headers.get("user-agent"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
  });
  return NextResponse.redirect(new URL("/auth/resolve", base));
}
