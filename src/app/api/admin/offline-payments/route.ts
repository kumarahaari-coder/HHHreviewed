import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const STATUSES = ["PENDING_CONFIRMATION", "CONFIRMED", "APPROVED", "REJECTED", "WITHDRAWN"];

/** Lists offline payments with their booking and partner. Optional ?status=PENDING_CONFIRMATION (comma separated). */
export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Unauthorized. Admin session required." }, { status: 403 });
    }

    const supabase = createAdminClient();
    const wanted = (req.nextUrl.searchParams.get("status") || "").split(",").map((s) => s.trim()).filter((s) => STATUSES.includes(s));

    let q = supabase.from("reservation_offline_payments").select("*").order("detected_at", { ascending: false }).limit(500);
    if (wanted.length > 0) q = q.in("status", wanted);
    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const reservationIds = [...new Set((rows || []).map((r: any) => r.reservation_id))];
    const { data: reservations } = reservationIds.length
      ? await supabase
          .from("reservations")
          .select("id, confirmation_code, guest_name, check_in_date, check_out_date, gross_amount, amount_received, reservation_status, payment_status, partner_id, site_id")
          .in("id", reservationIds)
      : { data: [] as any[] };
    const partnerIds = [...new Set((reservations || []).map((r: any) => r.partner_id).filter(Boolean))];
    const { data: partners } = partnerIds.length
      ? await supabase.from("partners").select("id, business_name").in("id", partnerIds)
      : { data: [] as any[] };

    const resById = new Map((reservations || []).map((r: any) => [r.id, r]));
    const partnerById = new Map((partners || []).map((p: any) => [p.id, p.business_name]));

    const payments = (rows || []).map((r: any) => {
      const res: any = resById.get(r.reservation_id);
      return {
        ...r,
        reservation: res
          ? { ...res, partner_name: res.partner_id ? partnerById.get(res.partner_id) || null : null }
          : null,
      };
    });

    return NextResponse.json({ success: true, payments, currentUserId: session.userId, role: session.role });
  } catch (err: any) {
    console.error("[API Error] /api/admin/offline-payments GET:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
