import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  approvePayoutBatch,
  cancelPayoutBatch,
  isPhase6SettlementEnabled,
  markPayoutBatchSettled,
  submitPayoutBatchForApproval,
} from "@/lib/commissions/payout-generator";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Unauthorized. Admin session required." }, { status: 403 });
    }

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: batch, error: bErr } = await supabase
      .from("payout_batches")
      .select("*, partners(business_name, contact_name, contact_email, payout_currency)")
      .eq("id", id)
      .single();

    if (bErr || !batch) {
      return NextResponse.json({ success: false, error: "Batch not found." }, { status: 404 });
    }

    const { data: items, error: iErr } = await supabase
      .from("payout_items")
      .select("*, reservations(confirmation_code, check_in_date, check_out_date, platform, ownerrez_booking_id)")
      .eq("payout_batch_id", id)
      .order("created_at", { ascending: true });

    if (iErr) {
      return NextResponse.json({ success: false, error: iErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      batch,
      items: items || [],
    });
  } catch (err: any) {
    console.error("[API Error] /api/admin/commissions/payout-batches/[id] GET:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Unauthorized. Admin session required." }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { action, transactionReference, notes, reason } = body;

    if (!action) {
      return NextResponse.json({ success: false, error: "Missing required 'action' field." }, { status: 400 });
    }

    if (action === "submit") {
      const updated = await submitPayoutBatchForApproval({
        batchId: id,
        submittedBy: session.userId,
      });
      return NextResponse.json({ success: true, batch: updated });
    }

    if (action === "approve") {
      if (session.role !== "SUPER_ADMIN") {
        return NextResponse.json(
          { success: false, error: "Unauthorized. Super Admin role required to approve payout batches." },
          { status: 403 }
        );
      }

      // Maker-checker validation is enforced inside approvePayoutBatch
      const updated = await approvePayoutBatch({
        batchId: id,
        approvedBy: session.userId,
      });
      return NextResponse.json({ success: true, batch: updated });
    }

    if (action === "cancel") {
      await cancelPayoutBatch({
        batchId: id,
        adminUserId: session.userId,
        reason,
      });
      return NextResponse.json({ success: true, message: "Batch cancelled and items released." });
    }

    if (action === "settle") {
      if (!isPhase6SettlementEnabled()) {
        return NextResponse.json(
          { success: false, error: "Financial settlement is disabled in this environment." },
          { status: 403 }
        );
      }

      if (session.role !== "SUPER_ADMIN") {
        return NextResponse.json(
          { success: false, error: "Unauthorized. Super Admin role required to settle payout batches." },
          { status: 403 }
        );
      }

      // Settlement atomicity enforced inside markPayoutBatchSettled
      const result = await markPayoutBatchSettled({
        batchId: id,
        adminUserId: session.userId,
        transactionReference,
        notes,
      });
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action '${action}'. Must be one of: submit, approve, cancel, settle.` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[API Error] /api/admin/commissions/payout-batches/[id] PATCH:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
