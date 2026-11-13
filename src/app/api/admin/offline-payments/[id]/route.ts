import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/authorization";
import {
  OfflinePaymentError,
  approveOfflinePayment,
  confirmOfflinePayment,
  rejectOfflinePayment,
} from "@/lib/payments/offline-payment-actions";

export const dynamic = "force-dynamic";

/** PATCH { action: "confirm" | "approve" | "reject", reason? } — Super Admin or Finance Admin only. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getCurrentSession();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "FINANCE_ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Super Admin or Finance Admin role required." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { action, reason } = body as { action?: string; reason?: string };

    if (action === "confirm") {
      const payment = await confirmOfflinePayment({ id, adminUserId: session.userId, reason: reason || "" });
      return NextResponse.json({ success: true, payment });
    }
    if (action === "approve") {
      const result = await approveOfflinePayment({ id, adminUserId: session.userId });
      return NextResponse.json({ success: true, ...result });
    }
    if (action === "reject") {
      const payment = await rejectOfflinePayment({ id, adminUserId: session.userId, reason: reason || "" });
      return NextResponse.json({ success: true, payment });
    }
    return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
  } catch (err: any) {
    if (err instanceof OfflinePaymentError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error("[API Error] /api/admin/offline-payments/[id] PATCH:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
