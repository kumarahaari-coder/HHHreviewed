import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/supabase/data-store";
import { db as mockDb } from "@/lib/db/mockDb";

// Shared secret token configured in both systems
const BRIDGE_TOKEN = process.env.SHOPIFY_HHH_BRIDGE_TOKEN;

export async function GET(req: NextRequest) {
  try {
    // 1. Verify Bridge Token
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ") || !BRIDGE_TOKEN) {
      console.warn("[Shopify Metrics] Unauthorized attempt: Missing bridge token.");
      return NextResponse.json({ error: "Unauthorized: Missing bridge token" }, { status: 401 });
    }

    const token = authHeader.substring(7).trim();
    if (token !== BRIDGE_TOKEN.trim()) {
      console.warn("[Shopify Metrics] Unauthorized attempt: Invalid bridge token.");
      return NextResponse.json({ error: "Unauthorized: Invalid bridge token" }, { status: 403 });
    }

    // 2. Parse Query Params
    const { searchParams } = new URL(req.url);
    const shopDomain = searchParams.get("shop_domain");

    if (!shopDomain) {
      return NextResponse.json({ error: "Bad Request: Missing shop_domain" }, { status: 400 });
    }

    let partnerId: string | null = null;
    let partnerData: any = null;
    let sitesData: any[] = [];
    let metrics = {
      totalEarnings: 0,
      bookingCount: 0,
      activeBookings: 0,
    };
    let payoutsData: any[] = [];

    const cleanDomain = shopDomain.replace(/https?:\/\//, "").split("/")[0].toLowerCase();

    // 3. Resolve Partner Data (Supabase or Mock)
    if (isSupabaseEnabled()) {
      const supabase = createAdminClient();

      // Check shopify_customer_identities mapping first
      const { data: mapping, error: mappingErr } = await supabase
        .from("shopify_customer_identities")
        .select("application_user_id")
        .eq("shop_domain", cleanDomain)
        .maybeSingle();

      if (!mappingErr && mapping) {
        // Resolve user's partner ID
        const { data: user } = await supabase
          .from("users")
          .select("partner_id")
          .eq("id", mapping.application_user_id)
          .maybeSingle();

        if (user && user.partner_id) {
          partnerId = user.partner_id;
        }
      }

      // Fallback: Resolve via sites table matching website_url
      if (!partnerId) {
        const { data: siteRecord } = await supabase
          .from("sites")
          .select("partner_id")
          .ilike("website_url", `%${cleanDomain.split(".")[0]}%`)
          .limit(1)
          .maybeSingle();

        if (siteRecord) {
          partnerId = siteRecord.partner_id;
        }
      }

      // If resolved, fetch metrics from database
      if (partnerId) {
        // Fetch partner details
        const { data: partner } = await supabase
          .from("partners")
          .select("id, business_name, contact_name, contact_email, status, payout_currency, commission_rate, created_at")
          .eq("id", partnerId)
          .maybeSingle();

        if (partner) {
          partnerData = {
            id: partner.id,
            businessName: partner.business_name,
            contactName: partner.contact_name,
            email: partner.contact_email,
            status: partner.status,
            currency: partner.payout_currency || "USD",
            commissionRate: partner.commission_rate || 10,
            createdAt: partner.created_at,
          };
        }

        // Fetch sites
        const { data: sites } = await supabase
          .from("sites")
          .select("id, site_name, website_url, hospitable_widget_id, booking_url, status")
          .eq("partner_id", partnerId);

        sitesData = (sites || []).map((s) => ({
          id: s.id,
          siteName: s.site_name,
          websiteUrl: s.website_url,
          hospitableWidgetId: s.hospitable_widget_id,
          bookingUrl: s.booking_url,
          status: s.status,
        }));

        // Fetch reservations and compute aggregations
        const { data: reservations } = await supabase
          .from("reservations")
          .select("id, partner_payout_amount, reservation_status");

        if (reservations) {
          const cleanReservations = reservations || [];
          metrics.bookingCount = cleanReservations.length;
          metrics.totalEarnings = cleanReservations.reduce((sum, r) => sum + (r.partner_payout_amount || 0), 0);
          metrics.activeBookings = cleanReservations.filter((r) => 
            ["CONFIRMED", "CHECKED_IN"].includes(r.reservation_status)
          ).length;
        }

        // Fetch payouts
        const { data: payouts } = await supabase
          .from("payouts")
          .select("id, calculated_payout, final_payout, status, payment_date, transaction_reference, notes")
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: false })
          .limit(20);

        payoutsData = (payouts || []).map((p) => ({
          id: p.id,
          calculatedPayout: p.calculated_payout,
          finalPayout: p.final_payout,
          status: p.status,
          paymentDate: p.payment_date,
          transactionReference: p.transaction_reference,
          notes: p.notes,
        }));
      }
    } else {
      // Mock Database Mode
      // Match partner in mockDb
      let partner = mockDb.partners.find(
        (p) => p.email.toLowerCase().includes(cleanDomain.split(".")[0])
      );

      // Fallback to partner-hema or partner-001
      if (!partner) {
        partner = mockDb.partners.find((p) => p.id === "partner-hema") || mockDb.partners[0];
      }

      if (partner) {
        partnerId = partner.id;
        partnerData = partner;

        // Fetch sites
        sitesData = mockDb.sites.filter((s) => s.partnerId === partnerId);

        // Fetch reservations and aggregate
        const partnerReservations = mockDb.reservations.filter((r) => r.partnerId === partnerId);
        metrics.bookingCount = partnerReservations.length;
        metrics.totalEarnings = partnerReservations.reduce((sum, r) => sum + (r.partnerPayoutAmount || 0), 0);
        metrics.activeBookings = partnerReservations.filter((r) => 
          ["CONFIRMED", "CHECKED_IN"].includes(r.reservationStatus)
        ).length;

        // Fetch payouts
        payoutsData = mockDb.payouts.filter((p) => p.partnerId === partnerId);
      }
    }

    if (!partnerId) {
      return NextResponse.json({ error: "Partner account not found for this store domain" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      partner: partnerData,
      sites: sitesData,
      metrics,
      payouts: payoutsData,
    });
  } catch (error: any) {
    console.error("[Shopify Metrics Error]:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
