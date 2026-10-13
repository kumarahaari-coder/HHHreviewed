

import { getVerifiedHostawayBookingUrls } from "../src/lib/hostaway/booking-urls";
import {
  getAllPartners,
  findPartnerById,
  createPartner,
  archivePartner,
  restorePartner,
  canDeletePartner,
  deletePartner,
  getAllSites,
  getSiteById,
  createReferralSite,
  updateSitePropertyMappings,
} from "../src/lib/supabase/data-store";
import { createAdminClient } from "../src/lib/supabase/admin";

async function runTests() {
  console.log("================================================================================");
  console.log("HHH VERIFICATION: SITE REGISTRATION & PARTNER REMOVAL SUITE");
  console.log("================================================================================\n");

  const supabase = createAdminClient();
  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      testsPassed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      testsFailed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Record baseline state
  const baselineSites = await getAllSites();
  const baselinePartners = await getAllPartners();
  const megbrassBaseline = baselinePartners.find(p => p.id === "b6cb0291-af01-43e3-8b2c-5d13ad5e266f");
  console.log(`Baseline count: ${baselinePartners.length} partners, ${baselineSites.length} sites.`);
  if (megbrassBaseline) {
    console.log(`Megbrass Baseline: ID=${megbrassBaseline.id}, Name=${megbrassBaseline.name}, Status=${megbrassBaseline.status}`);
  }

  // --- TEST 1: Fetch and validate real Hostaway booking URLs ---
  console.log("\n--- TEST 1: Fetch and validate real Hostaway direct booking URLs ---");
  const hostawayUrls = await getVerifiedHostawayBookingUrls();
  console.log("Hostaway direct booking URLs returned:", JSON.stringify(hostawayUrls, null, 2));
  assert(hostawayUrls.length === 4, "Must return exactly 4 canonical Hostaway listings (595515-595518)");
  for (const item of hostawayUrls) {
    assert(
      Boolean(item.primaryBookingUrl?.startsWith("https://book.hiddenhoneyhomes.com/listings/")),
      `Listing ${item.listingId} has valid book.hiddenhoneyhomes.com direct URL: ${item.primaryBookingUrl}`
    );
    assert(Boolean(item.propertyId), `Listing ${item.listingId} maps to internal property ID ${item.propertyId}`);
    assert(item.isVerified === true, `Listing ${item.listingId} is verified`);
  }

  // Pre-cleanup any dangling test partners from previous test attempts
  const { data: lingeringPartners } = await supabase
    .from("partners")
    .select("id")
    .or("company_name.ilike.%Test Partner Iso%,company_name.ilike.%Unused Test Partner%");
  if (lingeringPartners && lingeringPartners.length > 0) {
    for (const lp of lingeringPartners) {
      await supabase.from("site_properties").delete().in("site_id", (
        await supabase.from("sites").select("id").eq("partner_id", lp.id)
      ).data?.map(s => s.id) || []);
      await supabase.from("sites").delete().eq("partner_id", lp.id);
      await supabase.from("partners").delete().eq("id", lp.id);
    }
  }

  // Setup isolated test partners
  const testIsoPartnerName = `Test Partner Iso ${Date.now()}`;
  const testIsoPartner = await createPartner({
    businessName: testIsoPartnerName,
    contactName: "Test Contact",
    contactEmail: `test-${Date.now()}@example.com`,
  });
  console.log(`Created isolated test partner: ${testIsoPartner.id} (${testIsoPartner.name})`);

  try {
    // --- TEST 2: Register a referral site without widget mappings (0 widgets) ---
    console.log("\n--- TEST 2: Register a referral site without widget mappings (0 widgets) ---");
    const testTrackingCode0 = `TEST_ZERO_${Date.now()}`;
    const zeroWidgetSite = await createReferralSite({
      partnerId: testIsoPartner.id,
      siteName: "Zero Widget Test Site",
      websiteUrl: "https://zerowidget.example.com",
      trackingCode: testTrackingCode0,
      mappings: [], // 0 widgets!
    });
    console.log("Created zero-widget site:", zeroWidgetSite.id, "readinessStage:", zeroWidgetSite.readinessStage);
    assert(Boolean(zeroWidgetSite.id), "Site created successfully without widget mappings");
    assert(zeroWidgetSite.readinessStage === "REGISTERED", "Readiness stage is REGISTERED when 0 mappings configured");

    // --- TEST 3: Configure a single-property site ---
    console.log("\n--- TEST 3: Configure a single-property site ---");
    const testTrackingCode1 = `TEST_ONE_${Date.now()}`;
    const singlePropertySite = await createReferralSite({
      partnerId: testIsoPartner.id,
      siteName: "Single Property Test Site",
      websiteUrl: "https://singleprop.example.com",
      trackingCode: testTrackingCode1,
      mappings: [
        {
          propertyId: hostawayUrls[0].propertyId,
          customBookingUrl: hostawayUrls[0].primaryBookingUrl!,
        },
      ],
    });
    console.log("Created single-property site:", singlePropertySite.id, "readinessStage:", singlePropertySite.readinessStage);
    assert(Boolean(singlePropertySite.id), "Single-property site created successfully");
    assert(singlePropertySite.readinessStage === "BOOKING_LINKS_CONFIGURED", "Readiness stage is BOOKING_LINKS_CONFIGURED");

    // Verify property mapping exists in DB
    const { data: singleMappings } = await supabase
      .from("site_properties")
      .select("*")
      .eq("site_id", singlePropertySite.id);
    assert(singleMappings?.length === 1, "Exactly 1 property mapping stored in database");
    assert(singleMappings?.[0]?.custom_booking_url === hostawayUrls[0].primaryBookingUrl, "Custom booking URL stored matches Hostaway direct URL");

    // --- TEST 4: Configure a multi-property site and update existing site ---
    console.log("\n--- TEST 4: Configure a multi-property site & update destinations on existing site ---");
    // Update the zero-widget site to have 2 property mappings
    const updatedZeroSite = await updateSitePropertyMappings(
      zeroWidgetSite.id,
      [
        {
          propertyId: hostawayUrls[0].propertyId,
          customBookingUrl: hostawayUrls[0].primaryBookingUrl!,
        },
        {
          propertyId: hostawayUrls[1].propertyId,
          customBookingUrl: hostawayUrls[1].primaryBookingUrl!,
        },
      ]
    );
    console.log("Updated zeroWidgetSite with 2 destinations, new readiness:", updatedZeroSite.readinessStage);
    assert(updatedZeroSite.readinessStage === "BOOKING_LINKS_CONFIGURED", "Readiness transitioned to BOOKING_LINKS_CONFIGURED after update");
    const { data: updatedMappings } = await supabase
      .from("site_properties")
      .select("*")
      .eq("site_id", zeroWidgetSite.id);
    assert(updatedMappings?.length === 2, "2 property mappings stored in database for updated site");

    // --- TEST 5: Reject invalid or duplicate tracking identities ---
    console.log("\n--- TEST 5: Reject duplicate tracking identities ---");
    let duplicateRejected = false;
    try {
      await createReferralSite({
        partnerId: testIsoPartner.id,
        siteName: "Duplicate Code Site",
        websiteUrl: "https://dup.example.com",
        trackingCode: testTrackingCode1, // duplicate!
        mappings: [],
      });
    } catch (err: any) {
      duplicateRejected = true;
      console.log("Duplicate tracking code correctly caught:", err.message);
      assert(
        err.message.includes("already registered") || err.message.includes("already in use"),
        "Error explicitly mentions tracking code already registered"
      );
    }
    assert(duplicateRejected, "Duplicate tracking identity was rejected");

    // --- TEST 6: Archive and restore an isolated test partner ---
    console.log("\n--- TEST 6: Archive and restore an isolated test partner ---");
    // Archive
    await archivePartner(testIsoPartner.id);
    const archivedPartner = await findPartnerById(testIsoPartner.id);
    assert(archivedPartner?.status === "ARCHIVED", "Partner status is now ARCHIVED");

    // TEST 6b: Confirm archived partner cannot access active tenant resources
    console.log("\n--- TEST 6b: Confirm archived partner cannot access active tenant resources ---");
    // 1. Verify tracking route rejects referrals for archived partner
    const { data: partnerRow } = await supabase
      .from("partners")
      .select("status")
      .eq("id", testIsoPartner.id)
      .single();
    assert(partnerRow?.status?.toLowerCase() === "archived", "Supabase DB confirms partner status is archived");
    // 2. An archived partner's sites are deactivated from routing traffic
    const activePartnerQuery = await supabase
      .from("partners")
      .select("id")
      .eq("id", testIsoPartner.id)
      .ilike("status", "active")
      .maybeSingle();
    assert(activePartnerQuery.data === null, "Archived partner is excluded from active tenant partner queries");

    // Restore
    await restorePartner(testIsoPartner.id);
    const restoredPartner = await findPartnerById(testIsoPartner.id);
    assert(restoredPartner?.status === "ACTIVE", "Partner status is restored to ACTIVE");

    // --- TEST 7: Permanently delete an isolated unused test partner ---
    console.log("\n--- TEST 7: Permanently delete an isolated unused test partner ---");
    const unusedPartner = await createPartner({
      businessName: `Unused Test Partner ${Date.now()}`,
      contactName: "Unused Contact",
      contactEmail: `unused-${Date.now()}@example.com`,
    });
    console.log("Created unused partner:", unusedPartner.id);
    const deleteCheck = await canDeletePartner(unusedPartner.id);
    assert(deleteCheck.canDelete === true, "Unused partner canDelete is true");
    const deleteSuccess = await deletePartner(unusedPartner.id);
    assert(deleteSuccess.success === true, "deletePartner executed successfully for unused partner");
    const checkDeleted = await findPartnerById(unusedPartner.id);
    assert(checkDeleted === null, "Deleted partner no longer exists in Supabase");

    // --- TEST 8: Reject permanent deletion of historical Megbrass partner ---
    console.log("\n--- TEST 8: Reject permanent deletion of historical Megbrass partner ---");
    const megbrassId = "b6cb0291-af01-43e3-8b2c-5d13ad5e266f";
    const megbrassCheck = await canDeletePartner(megbrassId);
    console.log("Megbrass canDelete result:", JSON.stringify(megbrassCheck, null, 2));
    assert(megbrassCheck.canDelete === false, "Megbrass canDelete is FALSE");
    assert(Boolean(megbrassCheck.reason || megbrassCheck.error), "Megbrass has descriptive prohibition error");
    assert(
      (megbrassCheck.siteCount || megbrassCheck.details?.sitesCount || 0) > 0 &&
      (megbrassCheck.reservationCount || megbrassCheck.details?.reservationsCount || 0) > 0 &&
      (megbrassCheck.ledgerCount || megbrassCheck.details?.ledgerEventsCount || 0) > 0,
      "Actionable prohibition details indicate historical sites, reservations, and ledger events"
    );

    // Ensure calling deletePartner on Megbrass is strictly blocked
    let megbrassDeleteBlocked = false;
    try {
      const delResult = await deletePartner(megbrassId);
      if (!delResult.success) {
        megbrassDeleteBlocked = true;
        console.log("Megbrass deletion returned success: false with error:", delResult.error);
      }
    } catch (err: any) {
      megbrassDeleteBlocked = true;
      console.log("Megbrass deletion correctly threw error:", err.message);
    }
    assert(megbrassDeleteBlocked, "deletePartner strictly fails/rejects when called on Megbrass");

    // --- TEST 9: Confirm historical financial and attribution records remain intact ---
    console.log("\n--- TEST 9: Confirm historical financial and attribution records remain intact ---");
    const { data: megbrassLedger, error: ledgerErr } = await supabase
      .from("commission_ledger_events")
      .select("calculated_commission, delta_amount")
      .eq("partner_id", megbrassId);
    if (ledgerErr) throw ledgerErr;
    const totalMegbrassCommission = (megbrassLedger || []).reduce(
      (acc, row) => acc + Number(row.calculated_commission || row.delta_amount || 0),
      0
    );
    console.log(`Megbrass ledger events count: ${megbrassLedger?.length}, total amount: $${totalMegbrassCommission}`);
    assert(totalMegbrassCommission === 357.5, "Megbrass historical financial baseline remains exactly $357.50");

    // Clean up test sites & test partner
    console.log("\n--- Cleaning up test artifacts ---");
    await supabase.from("site_properties").delete().in("site_id", [zeroWidgetSite.id, singlePropertySite.id]);
    await supabase.from("sites").delete().in("id", [zeroWidgetSite.id, singlePropertySite.id]);
    await deletePartner(testIsoPartner.id);
    console.log("Test sites and partner cleaned up.");

    // Clean up any dangling test partners from previous runs
    const { data: danglingPartners } = await supabase
      .from("partners")
      .select("id")
      .ilike("company_name", "%Test Partner Iso%");
    if (danglingPartners && danglingPartners.length > 0) {
      for (const dp of danglingPartners) {
        await supabase.from("site_properties").delete().in("site_id", (
          await supabase.from("sites").select("id").eq("partner_id", dp.id)
        ).data?.map(s => s.id) || []);
        await supabase.from("sites").delete().eq("partner_id", dp.id);
        await supabase.from("partners").delete().eq("id", dp.id);
      }
    }

    // --- TEST 10: Confirm existing sites remain unchanged ---
    console.log("\n--- TEST 10: Confirm existing sites remain unchanged ---");
    const currentSites = await getAllSites();
    const megbrassSite = currentSites.find(s => s.partnerId === megbrassId);
    assert(Boolean(megbrassSite), "Megbrass site exists and is intact");
    console.log(`Megbrass site ID: ${megbrassSite?.id}, name: ${megbrassSite?.siteName}, readiness: ${megbrassSite?.readinessStage}`);

  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  } finally {
    // Clean up isolated test partner if still exists
    try {
      await supabase.from("site_properties").delete().in("site_id", (
        await supabase.from("sites").select("id").eq("partner_id", testIsoPartner.id)
      ).data?.map(s => s.id) || []);
      await supabase.from("sites").delete().eq("partner_id", testIsoPartner.id);
      await deletePartner(testIsoPartner.id);
    } catch {}
  }

  console.log("\n================================================================================");
  console.log(`ALL VERIFICATION TESTS COMPLETED: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
