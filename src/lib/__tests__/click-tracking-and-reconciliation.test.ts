import assert from "node:assert/strict";
import { reconcileReservation } from "../reconciliation/reconcile";
import { db } from "../db/mockDb";
import { recordRedirectClick, getClickAnalyticsSummary, updateReservationAttributionStatus } from "../supabase/data-store";

export async function runTests() {
  console.log("Running Click Tracking & Reconciliation Tests...");

  // Reset mock data store
  db.redirectClicks = [];
  db.reservationAttributions = [];

  // Test 1: Record server-side redirect click
  const click = await recordRedirectClick({
    siteId: "site-001",
    partnerId: "partner-001",
    propertyId: "55791a54-b1a3-459e-bbd5-9073a418b774", // Beech Mountain
    sitePropertyId: "sp-001",
    trackingCode: "MEG-UPTOWN",
    widgetUrl: "https://booking.hospitable.com/widget/a24f47ee-9870-4876-9d7c-9708ed21b489/1087224",
    anonymousSessionId: "sess-abc-123",
    referrerUrl: "https://megsbrass.com/cabin",
    userAgentSummary: "Chrome on macOS",
    ipHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    clickedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  });

  assert.ok(click.id);
  assert.equal(click.siteId, "site-001");
  assert.equal(click.widgetUrl, "https://booking.hospitable.com/widget/a24f47ee-9870-4876-9d7c-9708ed21b489/1087224");
  assert.equal(db.redirectClicks.length, 1);
  console.log("✓ Test 1 passed: Recorded server-side redirect click with metadata");

  // Test 2: Aggregate click analytics
  await recordRedirectClick({
    siteId: "site-001",
    partnerId: "partner-001",
    propertyId: "55791a54-b1a3-459e-bbd5-9073a418b774",
    trackingCode: "MEG-UPTOWN",
    widgetUrl: "https://booking.hospitable.com/widget/test",
    anonymousSessionId: "sess-1",
    clickedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString()
  });

  await recordRedirectClick({
    siteId: "site-001",
    partnerId: "partner-001",
    propertyId: "55791a54-b1a3-459e-bbd5-9073a418b774",
    trackingCode: "MEG-UPTOWN",
    widgetUrl: "https://booking.hospitable.com/widget/test",
    anonymousSessionId: "sess-2",
    clickedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString()
  });

  const summary = await getClickAnalyticsSummary();
  assert.equal(summary.totalClicks, 3);
  assert.equal(summary.clicksBySite.find(s => s.siteId === "site-001")?.count, 3);
  console.log("✓ Test 2 passed: Aggregated click analytics summary accurately");

  // Test 3: Reconciliation Engine - Single click within 24h
  const now = Date.now();
  const clickTime = new Date(now - 3 * 60 * 60 * 1000).toISOString();
  const bookingTime = new Date(now).toISOString();

  await recordRedirectClick({
    siteId: "site-001",
    partnerId: "partner-001",
    propertyId: "55791a54-b1a3-459e-bbd5-9073a418b774",
    trackingCode: "MEG-BEECH",
    widgetUrl: "https://booking.hospitable.com/widget/test",
    anonymousSessionId: "sess-1",
    clickedAt: clickTime,
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString()
  });

  const resAttr = await reconcileReservation({
    id: "res-test-001",
    propertyId: "55791a54-b1a3-459e-bbd5-9073a418b774",
    bookingDate: bookingTime
  });

  assert.equal(resAttr.status, "REVIEW_REQUIRED");
  assert.equal(resAttr.attributionMethod, "TIME_WINDOW_PROBABILISTIC");
  assert.equal(resAttr.confidenceScore, 90.0);
  assert.equal(resAttr.partnerId, "partner-001");
  assert.equal(resAttr.siteId, "site-001");
  assert.ok(resAttr.matchedSignals.includes("PROPERTY_MATCH"));
  assert.ok(resAttr.matchedSignals.includes("CLICK_WITHIN_24H"));
  assert.ok(resAttr.matchedSignals.includes("SINGLE_PARTNER_SOURCE"));
  console.log("✓ Test 3 passed: Evaluates single partner click within 24h as REVIEW_REQUIRED (90% confidence)");

  // Test 4: Direct reservation with 0 clicks
  const resAttrNone = await reconcileReservation({
    id: "res-test-none",
    propertyId: "55791a54-b1a3-459e-bbd5-9073a418b774",
    bookingDate: new Date().toISOString()
  });

  assert.equal(resAttrNone.status, "UNATTRIBUTED");
  assert.equal(resAttrNone.confidenceScore, 0.0);
  assert.ok(resAttrNone.matchedSignals.includes("NO_MATCHING_CLICKS_IN_72H_WINDOW"));
  console.log("✓ Test 4 passed: Direct reservation with 0 clicks is UNATTRIBUTED");

  console.log("All click tracking and reconciliation unit tests passed successfully!");
}

if (process.argv[1] && process.argv[1].endsWith("click-tracking-and-reconciliation.test.ts")) {
  runTests().catch(console.error);
}
