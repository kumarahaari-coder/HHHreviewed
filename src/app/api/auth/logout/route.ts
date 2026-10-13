import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroyCurrentSession } from "@/lib/auth/session";

export async function POST() {
  await destroyCurrentSession();

  // Also clear dev-only persona cookies so the account switcher logs out cleanly.
  const cookieStore = await cookies();
  for (const name of ["demo_role", "demo_email", "demo_partner_id", "demo_user_id"]) {
    if (cookieStore.has(name)) cookieStore.delete(name);
  }
  return NextResponse.json({ success: true });
}
