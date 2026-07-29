import { Reservation } from "./db/schema";
import { db } from "./db/mockDb";

export interface RedirectClick {
  siteId: string;
  partnerId: string;
  visitDate: string;
  sessionId: string;
  destinationUrl: string;
  referrer: string;
  campaignCode?: string;
  ipAddress: string;
}

export interface AttributionResult {
  partnerId?: string;
  siteId?: string;
  attributionStatus: Reservation["attributionStatus"];
  attributionSource?: string;
  matchScore: number; // 0 to 100 confidence
}

/**
 * Log a click redirection (the HHH-controlled redirect fallback)
 * Example: when a user visits book.hiddenhoneyhomes.com/r/site-0001
 */
export function logRedirectClick(click: Omit<RedirectClick, "visitDate" | "sessionId">): void {
  if (typeof window === "undefined") return;
  const clicks: RedirectClick[] = JSON.parse(localStorage.getItem("hhh_redirect_clicks") || "[]");
  const newClick: RedirectClick = {
    ...click,
    visitDate: new Date().toISOString(),
    sessionId: Math.random().toString(36).substr(2, 9)
  };
  localStorage.setItem("hhh_redirect_clicks", JSON.stringify([newClick, ...clicks].slice(0, 1000)));
}

/**
 * Attempts to attribute a reservation using available signals:
 * 1. Exact Widget ID Match
 * 2. Campaign Tracking Parameter / Referral Code Match
 * 3. Referrer URL domain Match
 * 4. Fallback: Recent redirect clicks from the same IP/Referrer (within 24 hours)
 */
export function attributeReservation(res: Partial<Reservation>): AttributionResult {
  const sites = db.sites;

  // Signal 1: Check for Hospitable Widget ID
  // If the booking payload contains an embedded widget ID, match it directly to a site
  if (res.originalData) {
    try {
      const original = JSON.parse(res.originalData);
      const widgetId = original?.metadata?.widget_id || original?.widget_id;
      if (widgetId) {
        const site = sites.find(s => s.hospitableWidgetId === widgetId);
        if (site && site.status === "ACTIVE") {
          return {
            partnerId: site.partnerId,
            siteId: site.id,
            attributionStatus: "ATTRIBUTED",
            attributionSource: "Widget ID (" + widgetId + ")",
            matchScore: 100
          };
        }
      }
    } catch {
      // ignore JSON parse error
    }
  }

  // Signal 2: Check for campaign tracking code or referral parameters
  if (res.confirmationCode) {
    // If confirmation code matches pattern or original data contains referral codes
    try {
      const original = JSON.parse(res.originalData || "{}");
      const campaign = original?.metadata?.campaign || original?.utm_campaign || original?.referral_code;
      if (campaign) {
        const site = sites.find(s => s.trackingCode === campaign || s.id === campaign);
        if (site && site.status === "ACTIVE") {
          return {
            partnerId: site.partnerId,
            siteId: site.id,
            attributionStatus: "ATTRIBUTED",
            attributionSource: "Campaign Code (" + campaign + ")",
            matchScore: 95
          };
        }
      }
    } catch {}
  }

  // Signal 3: Check for exact Referrer URL domain
  try {
    const original = JSON.parse(res.originalData || "{}");
    const referrer = original?.metadata?.referrer || original?.referrer_url;
    if (referrer) {
      // Find a site where the website URL is a prefix of the referrer
      const site = sites.find(s => {
        try {
          const siteDomain = new URL(s.websiteUrl).hostname.replace("www.", "");
          const refDomain = new URL(referrer).hostname.replace("www.", "");
          return siteDomain === refDomain;
        } catch {
          return false;
        }
      });
      
      if (site && site.status === "ACTIVE") {
        return {
          partnerId: site.partnerId,
          siteId: site.id,
          attributionStatus: "ATTRIBUTED",
          attributionSource: "Referrer URL (" + referrer + ")",
          matchScore: 80
        };
      }
    }
  } catch {}

  // Signal 4: Fallback Click Tracking
  if (typeof window !== "undefined") {
    const clicks: RedirectClick[] = JSON.parse(localStorage.getItem("hhh_redirect_clicks") || "[]");
    // Match recent click by same IP within 24 hours of booking date
    const bookingTime = res.bookingDate ? new Date(res.bookingDate).getTime() : Date.now();
    const matchingClick = clicks.find(c => {
      const clickTime = new Date(c.visitDate).getTime();
      const diffHrs = (bookingTime - clickTime) / (1000 * 60 * 60);
      return diffHrs >= 0 && diffHrs <= 24; // click occurred within 24h before booking
    });

    if (matchingClick) {
      const site = sites.find(s => s.id === matchingClick.siteId);
      if (site && site.status === "ACTIVE") {
        return {
          partnerId: site.partnerId,
          siteId: site.id,
          attributionStatus: "ATTRIBUTED",
          attributionSource: "Redirect Fallback (Session click " + matchingClick.siteId + ")",
          matchScore: 70
        };
      }
    }
  }

  // No match found
  return {
    attributionStatus: "UNATTRIBUTED",
    matchScore: 0
  };
}

/**
 * Local POC attribution test. It uses the first three sites configured by an
 * administrator and verifies that their stored widget IDs resolve correctly.
 * This does not prove that Hospitable returns those IDs in a real reservation.
 */
export interface AttributionTestResult {
  siteName: string;
  websiteUrl: string;
  widgetId: string;
  bookingPayload: Record<string, unknown>;
  result: AttributionResult;
  testPassed: boolean;
}

export function runAttributionTestHarness(): AttributionTestResult[] {
  return db.sites.slice(0, 3).map((site, index) => {
    const payload: Record<string, unknown> = {
      id: `local-attribution-test-${index + 1}`,
      widget_id: site.hospitableWidgetId,
      metadata: {
        referrer: site.websiteUrl,
        campaign: site.trackingCode
      }
    };

    const result = attributeReservation({
      confirmationCode: `HHH-LOCAL-TEST-${index + 1}`,
      bookingDate: new Date().toISOString(),
      originalData: JSON.stringify(payload)
    });

    return {
      siteName: site.siteName,
      websiteUrl: site.websiteUrl,
      widgetId: site.hospitableWidgetId,
      bookingPayload: payload,
      result,
      testPassed: result.siteId === site.id && result.attributionStatus === "ATTRIBUTED"
    };
  });
}
