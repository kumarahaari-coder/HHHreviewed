import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Active commission rules, so screens can show the real rate (or "Not set") instead of guessing. */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("commission_rules")
      .select("id, name, partner_id, site_id, rule_type, percentage, fixed_amount, status")
      .eq("status", "active");
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true,
      rules: (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        partnerId: r.partner_id,
        siteId: r.site_id,
        ruleType: r.rule_type,
        percentage: r.percentage == null ? null : Number(r.percentage),
        fixedAmount: r.fixed_amount == null ? null : Number(r.fixed_amount),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to load commission rules" }, { status: 500 });
  }
}

/**
 * PUT { partnerId, percentage }: sets the partner's default commission rate (percentage of contracted rent).
 * Creates the rule if the partner has none, otherwise updates it. Applies to bookings accrued from now on; existing
 * accruals keep the rate they were created with.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "FINANCE_ADMIN")) {
      return NextResponse.json({ success: false, error: "Only a Super Admin or Finance Admin can change commission rates." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const partnerId = String(body.partnerId || "");
    const percentage = Number(body.percentage);
    if (!partnerId) return NextResponse.json({ success: false, error: "partnerId is required." }, { status: 400 });
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      return NextResponse.json({ success: false, error: "Commission must be a percentage greater than 0 and at most 100." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: partner } = await supabase.from("partners").select("id, business_name").eq("id", partnerId).maybeSingle();
    if (!partner) return NextResponse.json({ success: false, error: "Partner not found." }, { status: 404 });

    const { data: existing, error: findErr } = await supabase
      .from("commission_rules")
      .select("id, percentage")
      .eq("partner_id", partnerId)
      .is("site_id", null)
      .eq("status", "active")
      .maybeSingle();
    if (findErr) return NextResponse.json({ success: false, error: findErr.message }, { status: 500 });

    const now = new Date().toISOString();
    let ruleId: string;
    if (existing) {
      if (Number(existing.percentage) === percentage) return NextResponse.json({ success: true, ruleId: existing.id, unchanged: true });
      const { error } = await supabase.from("commission_rules").update({ percentage, updated_at: now }).eq("id", existing.id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      ruleId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from("commission_rules")
        .insert({
          name: `${partner.business_name} standard commission`,
          partner_id: partnerId,
          site_id: null,
          rule_type: "percentage",
          percentage,
          payout_base: "contracted_rent",
          status: "active",
        })
        .select("id")
        .single();
      if (error || !created) return NextResponse.json({ success: false, error: error?.message || "Failed to create the rule." }, { status: 500 });
      ruleId = created.id;
    }

    await supabase.from("application_audit_logs").insert({
      action: existing ? "UPDATE_COMMISSION_RULE" : "CREATE_COMMISSION_RULE",
      performed_by_user_id: session.userId,
      partner_id: partnerId,
      source: "admin_portal",
      details: { ruleId, percentage, previousPercentage: existing ? Number(existing.percentage) : null },
    });

    return NextResponse.json({ success: true, ruleId, created: !existing });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Failed to save the commission rule" }, { status: 500 });
  }
}
