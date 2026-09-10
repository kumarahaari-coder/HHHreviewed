/**
 * Phase 6 Initial Accrual Gate: OwnerRez Booking 19150249
 *
 * Requirements:
 * 1. Verify preconditions:
 *    - Deterministic OwnerRez attribution at 100%
 *    - Exactly one active Megbrass commission rule
 *    - Rent-only base $1,275.00
 *    - Calculated commission $127.50
 *    - Amount received $0.00
 *    - Lifecycle status PENDING_PAYMENT
 * 2. Create exactly one INITIAL_ACCRUAL ledger event using existing Phase 6 ledger engine
 *    - delta_amount = 0.00
 *    - calculated_commission = 127.50
 *    - source_provider = 'ownerrez'
 *    - booking_channel = 'direct'
 *    - provider_booking_id = '19150249'
 *    - ownerrez_booking_id = 19150249
 *    - currency = 'USD'
 *    - Deterministic idempotency_key based on reservation ID and commission rule ID
 * 3. Run the exact operation twice and verify idempotency (zero rows added on second run)
 * 4. Verify no other financial rows created:
 *    - commission_ledger_events = 1
 *    - payout_batches = 0
 *    - payout_items = 0
 *    - payout_payment_attempts = 0
 *    - commission_adjustment_requests = 0
 *    - legacy payouts = 0
 *    - reservations = 38
 *    - booking 19150249 preview remains PENDING_PAYMENT, realized $0.00, eligible $0.00
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
const envPath = path.resolve(".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.trim().match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = val;
    }
  }
}

// Kill switch safety checks
process.env.PHASE6_SETTLEMENT_ENABLED = "false";
process.env.PHASE6_EXTERNAL_PAYOUTS_ENABLED = "false";

import { createInitialAccrual } from "../src/lib/commissions/ledger";
import { getOwnerRezCommissionPreviews } from "../src/lib/ownerrez/commission-preview";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function main() {
  console.log("================================================================================");
  console.log("PHASE 6: INITIAL ACCRUAL GATE FOR OWNERREZ BOOKING 19150249");
  console.log("================================================================================\n");

  // Step 1: Preconditions check
  console.log("[1/5] Verifying preconditions for booking 19150249...");

  const previewData = await getOwnerRezCommissionPreviews();
  const preview = previewData.previews.find((p) => p.ownerrezBookingId === 19150249);

  if (!preview) {
    throw new Error("Precondition FAILED: Booking 19150249 not found in preview.");
  }

  console.log("  • Attribution status:", preview.attribution.status);
  console.log("  • Attribution method:", preview.attribution.method);
  console.log("  • Attribution confidence:", preview.attribution.confidenceScore);
  console.log("  • Attribution isDeterministic:", preview.attribution.isDeterministic);

  if (
    !preview.attribution.isDeterministic ||
    preview.attribution.confidenceScore !== 100 ||
    preview.attribution.method !== "OWNERREZ_LISTING_SITE"
  ) {
    throw new Error("Precondition FAILED: Deterministic OwnerRez attribution at 100% required.");
  }

  console.log("  • Rule found:", preview.ruleResolution.found);
  console.log("  • Rule ID:", preview.ruleResolution.ruleId);
  console.log("  • Rule Name:", preview.ruleResolution.ruleName);
  console.log("  • Payout base:", preview.ruleResolution.payoutBase);

  // Check active rules for partner
  const { data: rules, error: rulesErr } = await supabase
    .from("commission_rules")
    .select("*")
    .eq("partner_id", preview.partnerId)
    .eq("status", "active");

  if (rulesErr || !rules || rules.length !== 1) {
    throw new Error(`Precondition FAILED: Expected exactly 1 active Megbrass commission rule, found ${rules?.length}`);
  }
  console.log(`  • Active commission rules in DB: ${rules.length} (${rules[0].name})`);

  console.log("  • Contracted commissionable base:", preview.commissionCalculations.contractedCommissionableBase);
  if (preview.commissionCalculations.contractedCommissionableBase !== 1275) {
    throw new Error(`Precondition FAILED: Rent-only base expected $1,275.00, got ${preview.commissionCalculations.contractedCommissionableBase}`);
  }

  console.log("  • Calculated commission:", preview.commissionCalculations.calculatedCommission);
  if (preview.commissionCalculations.calculatedCommission !== 127.5) {
    throw new Error(`Precondition FAILED: Calculated commission expected $127.50, got ${preview.commissionCalculations.calculatedCommission}`);
  }

  console.log("  • Amount received:", preview.financialSummary.amountReceived);
  if (preview.financialSummary.amountReceived !== 0) {
    throw new Error(`Precondition FAILED: Amount received expected $0.00, got ${preview.financialSummary.amountReceived}`);
  }

  console.log("  • Lifecycle status:", preview.lifecycle.status);
  if (preview.lifecycle.status !== "PENDING_PAYMENT") {
    throw new Error(`Precondition FAILED: Lifecycle status expected PENDING_PAYMENT, got ${preview.lifecycle.status}`);
  }

  console.log("  ✓ All preconditions verified successfully.\n");

  // Step 2: Verify initial table counts are clean
  console.log("[2/5] Checking clean initial ledger and financial tables...");
  const { count: initialEvents } = await supabase
    .from("commission_ledger_events")
    .select("*", { count: "exact", head: true });
  const { count: initialBatches } = await supabase
    .from("payout_batches")
    .select("*", { count: "exact", head: true });
  const { count: initialItems } = await supabase
    .from("payout_items")
    .select("*", { count: "exact", head: true });
  const { count: initialAttempts } = await supabase
    .from("payout_payment_attempts")
    .select("*", { count: "exact", head: true });
  const { count: initialAdjustments } = await supabase
    .from("commission_adjustment_requests")
    .select("*", { count: "exact", head: true });

  console.log(`  • commission_ledger_events: ${initialEvents}`);
  console.log(`  • payout_batches: ${initialBatches}`);
  console.log(`  • payout_items: ${initialItems}`);
  console.log(`  • payout_payment_attempts: ${initialAttempts}`);
  console.log(`  • commission_adjustment_requests: ${initialAdjustments}`);

  if (initialEvents !== 0 || initialBatches !== 0 || initialItems !== 0 || initialAttempts !== 0 || initialAdjustments !== 0) {
    throw new Error("Financial tables must be completely empty before initial accrual gate.");
  }
  console.log("  ✓ Clean initial state confirmed.\n");

  // Step 3: Execute initial accrual via Phase 6 engine
  const idempotencyKey = `evt_accrual_${preview.reservationId}_${preview.ruleResolution.ruleId}`;
  console.log(`[3/5] Executing initial accrual (Pass 1)...`);
  console.log(`  • Deterministic idempotency_key: ${idempotencyKey}`);

  const accrualParams = {
    partnerId: preview.partnerId,
    siteId: preview.siteId,
    reservationId: preview.reservationId,
    commissionRuleId: preview.ruleResolution.ruleId,
    sourceProvider: "ownerrez" as const,
    bookingChannel: "direct",
    providerBookingId: "19150249",
    ownerrezBookingId: 19150249,
    calculatedCommission: 127.50,
    idempotencyKey: idempotencyKey,
    metadata: {
      gate: "phase6_initial_accrual_gate",
      booking_channel: "direct",
      contracted_base: 1275.00,
      calculated_commission: 127.50,
      timestamp: new Date().toISOString(),
    },
  };

  const event1 = await createInitialAccrual(accrualParams);

  if (!event1) {
    throw new Error("Pass 1 FAILED: createInitialAccrual returned null.");
  }

  console.log("  Pass 1 Event Created:");
  console.log("  • id:                    ", event1.id);
  console.log("  • event_type:            ", event1.event_type);
  console.log("  • delta_amount:          ", event1.delta_amount);
  console.log("  • calculated_commission: ", event1.calculated_commission);
  console.log("  • source_provider:       ", event1.source_provider);
  console.log("  • booking_channel:       ", event1.booking_channel);
  console.log("  • provider_booking_id:   ", event1.provider_booking_id);
  console.log("  • ownerrez_booking_id:   ", event1.ownerrez_booking_id);
  console.log("  • currency:              ", event1.currency);
  console.log("  • idempotency_key:       ", event1.idempotency_key);

  // Verify field specifications
  if (
    Number(event1.delta_amount) !== 0 ||
    Number(event1.calculated_commission) !== 127.50 ||
    event1.source_provider !== "ownerrez" ||
    event1.booking_channel !== "direct" ||
    event1.provider_booking_id !== "19150249" ||
    event1.ownerrez_booking_id !== 19150249 ||
    event1.currency !== "USD" ||
    event1.idempotency_key !== idempotencyKey
  ) {
    throw new Error("Pass 1 FAILED: Event fields do not match required Phase 6 accrual specification.");
  }

  const { count: countAfterPass1 } = await supabase
    .from("commission_ledger_events")
    .select("*", { count: "exact", head: true });
  console.log(`  ✓ Table count after Pass 1: ${countAfterPass1} (Expected: 1)\n`);

  if (countAfterPass1 !== 1) {
    throw new Error(`Pass 1 FAILED: Expected exactly 1 event row, got ${countAfterPass1}`);
  }

  // Step 4: Run exact same operation a second time to prove idempotency
  console.log("[4/5] Executing exact same accrual operation again (Pass 2 - Idempotency test)...");
  const event2 = await createInitialAccrual(accrualParams);

  console.log("  Pass 2 Event Result:");
  console.log("  • id:              ", event2?.id);
  console.log("  • idempotency_key: ", event2?.idempotency_key);

  const { count: countAfterPass2 } = await supabase
    .from("commission_ledger_events")
    .select("*", { count: "exact", head: true });
  console.log(`  ✓ Table count after Pass 2: ${countAfterPass2} (Expected: 1)`);

  if (countAfterPass2 !== 1) {
    throw new Error(`Idempotency FAILED: Pass 2 created duplicate row! Count is ${countAfterPass2}`);
  }
  if (event2?.id !== event1.id) {
    throw new Error(`Idempotency FAILED: Pass 2 returned different ID (${event2?.id} vs ${event1.id})`);
  }
  console.log("  ✓ Idempotency verified: zero additional rows created, exact same record returned.\n");

  // Step 5: Post-execution read-only verification of all invariants
  console.log("[5/5] Verifying post-accrual production invariants...");

  const { count: finalEvents } = await supabase
    .from("commission_ledger_events")
    .select("*", { count: "exact", head: true });
  const { count: finalBatches } = await supabase
    .from("payout_batches")
    .select("*", { count: "exact", head: true });
  const { count: finalItems } = await supabase
    .from("payout_items")
    .select("*", { count: "exact", head: true });
  const { count: finalAttempts } = await supabase
    .from("payout_payment_attempts")
    .select("*", { count: "exact", head: true });
  const { count: finalAdjustments } = await supabase
    .from("commission_adjustment_requests")
    .select("*", { count: "exact", head: true });
  const { count: finalReservations } = await supabase
    .from("reservations")
    .select("*", { count: "exact", head: true });
  const { count: finalPayouts } = await supabase
    .from("payouts")
    .select("*", { count: "exact", head: true });

  console.log(`  • commission_ledger_events:       ${finalEvents} (Expected: 1)`);
  console.log(`  • payout_batches:                 ${finalBatches} (Expected: 0)`);
  console.log(`  • payout_items:                   ${finalItems} (Expected: 0)`);
  console.log(`  • payout_payment_attempts:        ${finalAttempts} (Expected: 0)`);
  console.log(`  • commission_adjustment_requests: ${finalAdjustments} (Expected: 0)`);
  console.log(`  • reservations:                   ${finalReservations} (Expected: 38)`);
  console.log(`  • legacy payouts:                 ${finalPayouts} (Expected: 0)`);

  if (finalEvents !== 1) throw new Error(`Invariant FAILED: commission_ledger_events = ${finalEvents}`);
  if (finalBatches !== 0) throw new Error(`Invariant FAILED: payout_batches = ${finalBatches}`);
  if (finalItems !== 0) throw new Error(`Invariant FAILED: payout_items = ${finalItems}`);
  if (finalAttempts !== 0) throw new Error(`Invariant FAILED: payout_payment_attempts = ${finalAttempts}`);
  if (finalAdjustments !== 0) throw new Error(`Invariant FAILED: commission_adjustment_requests = ${finalAdjustments}`);
  if (finalReservations !== 38) throw new Error(`Invariant FAILED: reservations = ${finalReservations}`);
  if (finalPayouts !== 0) throw new Error(`Invariant FAILED: payouts = ${finalPayouts}`);

  // Verify booking 19150249 preview state remains untouched
  const postPreviewData = await getOwnerRezCommissionPreviews();
  const postPreview = postPreviewData.previews.find((p) => p.ownerrezBookingId === 19150249);
  if (!postPreview) throw new Error("Could not find booking 19150249 in post-preview.");

  console.log("\n  Booking 19150249 post-preview state:");
  console.log("  • status:                    ", postPreview.lifecycle.status);
  console.log("  • isPayoutEligible:          ", postPreview.lifecycle.isPayoutEligible);
  console.log("  • amountReceived:            ", postPreview.financialSummary.amountReceived);
  console.log("  • realizedCommission:        ", postPreview.commissionCalculations.realizedCommission);
  console.log("  • payoutEligibleCommission:  ", postPreview.commissionCalculations.payoutEligibleCommission);
  console.log("  • calculatedCommission:      ", postPreview.commissionCalculations.calculatedCommission);

  if (
    postPreview.lifecycle.status !== "PENDING_PAYMENT" ||
    postPreview.lifecycle.isPayoutEligible !== false ||
    postPreview.commissionCalculations.realizedCommission !== 0 ||
    postPreview.commissionCalculations.payoutEligibleCommission !== 0
  ) {
    throw new Error("Invariant FAILED: Booking 19150249 preview state was unexpectedly altered!");
  }

  console.log("\n================================================================================");
  console.log("PHASE 6 INITIAL ACCRUAL GATE COMPLETED SUCCESSFULLY!");
  console.log("================================================================================");

  console.log(JSON.stringify({
    success: true,
    createdEvent: {
      id: event1.id,
      eventType: event1.event_type,
      deltaAmount: event1.delta_amount,
      calculatedCommission: event1.calculated_commission,
      sourceProvider: event1.source_provider,
      bookingChannel: event1.booking_channel,
      providerBookingId: event1.provider_booking_id,
      ownerrezBookingId: event1.ownerrez_booking_id,
      currency: event1.currency,
      idempotencyKey: event1.idempotency_key,
      createdAt: event1.created_at,
    },
    idempotencyProof: {
      pass1Id: event1.id,
      pass2Id: event2?.id,
      identical: event1.id === event2?.id,
      totalRows: finalEvents,
    },
    invariants: {
      commission_ledger_events: finalEvents,
      payout_batches: finalBatches,
      payout_items: finalItems,
      payout_payment_attempts: finalAttempts,
      commission_adjustment_requests: finalAdjustments,
      reservations: finalReservations,
      legacy_payouts: finalPayouts,
      booking_19150249: {
        status: postPreview.lifecycle.status,
        amount_received: postPreview.financialSummary.amountReceived,
        realized_commission: postPreview.commissionCalculations.realizedCommission,
        payout_eligible_commission: postPreview.commissionCalculations.payoutEligibleCommission,
        calculated_commission: postPreview.commissionCalculations.calculatedCommission,
      },
    },
  }, null, 2));
}

main().catch((err) => {
  console.error("\n[FATAL ACCRUAL GATE ERROR]:", err);
  process.exit(1);
});
