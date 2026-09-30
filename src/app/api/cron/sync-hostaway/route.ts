/**
 * Scheduled Hostaway Reservation Synchronization Cron
 * 
 * Endpoint: POST /api/cron/sync-hostaway
 */

import { NextRequest, NextResponse } from "next/server";
import { syncHostawayReservationsBatch } from "@/lib/hostaway/sync";
import { isHostawayPrimary } from "@/lib/config/pms-mode";

export async function POST(req: NextRequest) {
  // Verify cron authorization secret if configured
  const cronSecret = process.env.CRON_SECRET || process.env.HOSPITABLE_CRON_TOKEN;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (!auth || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized cron request." }, { status: 401 });
    }
  }

  try {
    const isPrimary = isHostawayPrimary();
    const summary = await syncHostawayReservationsBatch({
      maxPages: 10,
      limitPerPage: 50,
    });

    return NextResponse.json({
      success: true,
      role: isPrimary ? "PRIMARY_SYNC" : "SHADOW_SYNC",
      summary,
    });
  } catch (error: any) {
    console.error("[Hostaway Cron Error]:", error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || "Cron execution failed." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
