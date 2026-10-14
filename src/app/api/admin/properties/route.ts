import { NextResponse } from "next/server";
import { getAdminProperties } from "@/lib/supabase/data-store";
import { getCurrentSession, isAdminRole } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthenticated: Login required." }, { status: 401 });
    }
    if (!isAdminRole(session.role)) {
      return NextResponse.json({ success: false, error: "Forbidden: Admin access required." }, { status: 403 });
    }

    const properties = await getAdminProperties();
    return NextResponse.json({ success: true, properties });
  } catch (err: any) {
    console.error("[API Admin Properties Error]:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to fetch properties" }, { status: 500 });
  }
}
