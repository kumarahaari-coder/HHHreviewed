import { NextResponse } from "next/server";
import { canPerformAdminReview, getCurrentSession } from "@/lib/authorization";
import { getWiseConfig } from "@/lib/wise/client";
import { isPhase6ExternalPayoutsEnabled, isPhase6SettlementEnabled } from "@/lib/commissions/payout-generator";

export const dynamic = "force-dynamic";

/** Non-secret runtime facts the payouts screen needs to explain itself (environment, flags, who is signed in). */
export async function GET() {
  const session = await getCurrentSession();
  if (!session || !canPerformAdminReview(session)) {
    return NextResponse.json({ success: false, error: "Unauthorized. Admin session required." }, { status: 403 });
  }
  const cfg = getWiseConfig();
  return NextResponse.json({
    success: true,
    wise: {
      environment: cfg.env,
      configured: cfg.isConfigured,
      externalPayoutsEnabled: isPhase6ExternalPayoutsEnabled(),
      settlementEnabled: isPhase6SettlementEnabled(),
      webhookKeyConfigured: Boolean(process.env.WISE_WEBHOOK_PUBLIC_KEY?.trim()),
    },
    me: { userId: session.userId, role: session.role },
  });
}
