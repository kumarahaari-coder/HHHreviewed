/**
 * Hostaway Health Check Endpoint
 * 
 * Endpoint: GET /api/hostaway/health
 */

import { NextResponse } from "next/server";
import { checkHostawayHealth } from "@/lib/hostaway/client";
import { getPmsSystemStatus } from "@/lib/config/pms-mode";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // /api/hostaway/* is publicly routable (webhook-style), so this handler must check for itself.
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const health = await checkHostawayHealth();
    const pmsStatus = getPmsSystemStatus();

    return NextResponse.json({
      success: true,
      health,
      pmsStatus: pmsStatus.hostaway,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Health check failed" },
      { status: 500 }
    );
  }
}
