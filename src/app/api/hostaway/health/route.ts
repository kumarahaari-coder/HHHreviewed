/**
 * Hostaway Health Check Endpoint
 * 
 * Endpoint: GET /api/hostaway/health
 */

import { NextResponse } from "next/server";
import { checkHostawayHealth } from "@/lib/hostaway/client";
import { getPmsSystemStatus } from "@/lib/config/pms-mode";

export async function GET() {
  try {
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
