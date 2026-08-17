import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordRedirectClick, isSupabaseEnabled } from "@/lib/supabase/data-store";
import { db as mockDb } from "@/lib/db/mockDb";
import crypto from "crypto";

const IP_SALT = process.env.REDIRECT_SALT || "hhh_tracking_salt_2026";

function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  let browser = "Other";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";

  let os = "Other";
  if (ua.includes("Macintosh") || ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Linux")) os = "Linux";

  return `${browser} on ${os}`;
}

function hashIp(ip: string | null): string | undefined {
  if (!ip) return undefined;
  return crypto.createHash("sha256").update(`${ip}:${IP_SALT}`).digest("hex");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; propertyId: string }> }
) {
  const { siteId, propertyId } = await params;

  if (!siteId || !propertyId) {
    return new NextResponse("Invalid referral tracking parameters.", { status: 404 });
  }

  let site: { id: string; partner_id: string; tracking_code: string; status: string } | null = null;
  let partner: { id: string; status: string } | null = null;
  let property: { id: string; status: string } | null = null;
  let siteProperty: { id: string; custom_booking_url: string; hospitable_widget_id: string; status: string } | null = null;

  if (isSupabaseEnabled()) {
    try {
      const supabase = createAdminClient();

      // 1. Verify site exists and is active
      const { data: siteData, error: siteErr } = await supabase
        .from("sites")
        .select("id, partner_id, tracking_code, status")
        .eq("id", siteId)
        .maybeSingle();

      if (siteErr || !siteData || siteData.status?.toLowerCase() !== "active") {
        return new NextResponse("Referral website not found or inactive.", { status: 404 });
      }
      site = siteData;

      // 2. Verify partner is eligible and active
      const { data: partnerData, error: partnerErr } = await supabase
        .from("partners")
        .select("id, status")
        .eq("id", site.partner_id)
        .maybeSingle();

      if (partnerErr || !partnerData || partnerData.status?.toLowerCase() !== "active") {
        return new NextResponse("Partner account is inactive.", { status: 404 });
      }
      partner = partnerData;

      // 3. Verify property is active
      const { data: propData, error: propErr } = await supabase
        .from("properties")
        .select("id, status")
        .eq("id", propertyId)
        .maybeSingle();

      if (propErr || !propData || propData.status?.toLowerCase() !== "active") {
        return new NextResponse("Property is inactive or not found.", { status: 404 });
      }
      property = propData;

      // 4. Verify active site_properties mapping exists
      const { data: spData, error: spErr } = await supabase
        .from("site_properties")
        .select("id, custom_booking_url, hospitable_widget_id, status")
        .eq("site_id", siteId)
        .eq("property_id", propertyId)
        .maybeSingle();

      if (spErr || !spData || spData.status?.toLowerCase() !== "active") {
        return new NextResponse("Property mapping not found for this referral site.", { status: 404 });
      }
      siteProperty = spData;
    } catch (err: any) {
      console.error("[Tracking Route Error] Supabase resolution failed:", err);
      return new NextResponse("Unable to process referral tracking destination.", { status: 500 });
    }
  } else {
    // Development / test fallback when Supabase is disabled
    const mockSite = mockDb.sites.find(s => s.id === siteId && s.status === "ACTIVE");
    if (!mockSite) return new NextResponse("Referral website not found or inactive.", { status: 404 });

    const mockPartner = mockDb.partners.find(p => p.id === mockSite.partnerId && p.status === "ACTIVE");
    if (!mockPartner) return new NextResponse("Partner account is inactive.", { status: 404 });

    const mockProp = mockDb.properties.find(p => p.id === propertyId && p.status === "ACTIVE");
    if (!mockProp) return new NextResponse("Property is inactive or not found.", { status: 404 });

    const mockSp = mockSite.siteProperties?.find(sp => sp.propertyId === propertyId && sp.status === "ACTIVE");

    site = { id: mockSite.id, partner_id: mockSite.partnerId, tracking_code: mockSite.trackingCode, status: "active" };
    partner = { id: mockPartner.id, status: "active" };
    property = { id: mockProp.id, status: "active" };
    siteProperty = {
      id: mockSp?.id || `sp-${mockSite.id}-${mockProp.id}`,
      custom_booking_url: mockSp?.customBookingUrl || mockSite.bookingUrl || `https://booking.hospitable.com/widget/${mockSite.hospitableWidgetId || "test"}`,
      hospitable_widget_id: mockSp?.hospitableWidgetId || mockSite.hospitableWidgetId || "test",
      status: "active"
    };
  }

  // 5. Obtain stored custom_booking_url (canonical destination)
  const destinationUrl = siteProperty?.custom_booking_url || (siteProperty?.hospitable_widget_id ? `https://booking.hospitable.com/widget/${siteProperty.hospitable_widget_id}` : null);
  if (!destinationUrl) {
    return new NextResponse("No destination widget URL configured for this property.", { status: 404 });
  }

  // 6. Capture telemetry & anonymous session
  const referrer = request.headers.get("referer") || undefined;
  const userAgent = request.headers.get("user-agent") || null;
  const userAgentSummary = summarizeUserAgent(userAgent);
  const rawIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const ipHash = hashIp(rawIp);

  let sessionId = request.cookies.get("hhh_session_id")?.value;
  let isNewSession = false;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    isNewSession = true;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days retention

  // 7. Record click in database
  try {
    await recordRedirectClick({
      siteId: site.id,
      partnerId: partner.id,
      propertyId: property.id,
      sitePropertyId: siteProperty.id,
      trackingCode: site.tracking_code,
      widgetUrl: destinationUrl,
      anonymousSessionId: sessionId,
      referrerUrl: referrer,
      userAgentSummary,
      ipHash,
      clickedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    });
  } catch (err: any) {
    console.error("[Tracking Route Error] Click logging error:", err);
    // Proceed with redirect even if logging encountered non-fatal error
  }

  // 8. Return HTTP 302 to the exact stored Hospitable widget URL
  const response = NextResponse.redirect(destinationUrl, 302);
  
  if (isNewSession) {
    response.cookies.set({
      name: "hhh_session_id",
      value: sessionId,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/"
    });
  }

  return response;
}
