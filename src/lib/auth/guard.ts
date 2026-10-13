import { NextResponse } from "next/server";
import { getCurrentSession, isAdminRole } from "../authorization";

/**
 * Route-level guard for admin-only API handlers.
 * Returns a ready-made 401/403 response when access is denied, or null when the caller may proceed.
 */
export async function requireAdminApi(): Promise<NextResponse | null> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
  }
  return null;
}
