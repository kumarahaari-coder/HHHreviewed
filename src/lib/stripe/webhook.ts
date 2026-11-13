/**
 * Stripe webhook handling: disputes and refunds that happen AFTER a guest payment was counted.
 *
 * Without this the Stripe check only runs when a payout batch is built, so a chargeback or refund that arrives
 * after a payout would never reach the commission ledger.
 *
 *  charge.dispute.created  -> DISPUTE_HOLD   (delta 0; blocks payout eligibility)
 *  charge.dispute.closed   -> won:  DISPUTE_RELEASE | lost: REFUND_CLAWBACK for the disputed share (hold stays)
 *  charge.refunded         -> REFUND_CLAWBACK for the refunded share of the realized commission (+ refund_amount)
 *
 * Reservations are found through the "Reservation Id: N" text Hostaway writes into the Stripe charge description.
 * Everything is idempotent (ledger idempotency keys), so Stripe's at-least-once delivery is safe. Events for charges
 * we cannot map to a partner-attributed reservation are acknowledged and ignored.
 */
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDisputeHold, createDisputeRelease, createRefundClawback } from "@/lib/commissions/ledger";

const round2 = (n: number) => Math.round(n * 100) / 100;

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/** Verifies the `Stripe-Signature` header (t=timestamp,v1=hmac...) against the RAW request body. */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = STRIPE_SIGNATURE_TOLERANCE_SECONDS
): boolean {
  if (!secret || !header) return false;
  const parts = header.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const t = Number(timestamp);
  if (!Number.isFinite(t) || Math.abs(nowSeconds - t) > toleranceSeconds) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

export type StripeEventOutcome = { handled: boolean; action: string; detail?: string };

export interface StripeEventDeps {
  supabase?: any;
  /** Retrieves a Stripe charge by id (needed for dispute events, which only carry the charge id). */
  fetchCharge?: (chargeId: string) => Promise<any | null>;
}

async function defaultFetchCharge(chargeId: string): Promise<any | null> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  const res = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(chargeId)}`, { headers: { Authorization: `Bearer ${key}` } });
  const json: any = await res.json();
  if (res.status === 404 || json?.error?.code === "resource_missing") return null;
  if (!res.ok) throw new Error(json?.error?.message || `Stripe API ${res.status}`);
  return json;
}

interface Context {
  reservation: any;
  hostawayId: string;
  ledger: any[];
  realized: number;
  clawedBack: number;
}

async function loadContext(supabase: any, charge: any): Promise<Context | null> {
  const hostawayId = /Reservation Id:\s*(\d+)/i.exec(String(charge?.description || ""))?.[1];
  if (!hostawayId) return null;
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, partner_id, site_id, platform, gross_amount, refund_amount, hostaway_reservation_id")
    .eq("hostaway_reservation_id", Number(hostawayId))
    .maybeSingle();
  if (!reservation || !reservation.partner_id) return null; // the ledger only tracks partner-attributed bookings

  const { data: ledger } = await supabase
    .from("commission_ledger_events")
    .select("event_type, delta_amount, metadata")
    .eq("reservation_id", reservation.id);
  const events = ledger || [];
  const realized = round2(events.filter((e: any) => e.event_type === "PAYMENT_REALIZED").reduce((a: number, e: any) => a + Number(e.delta_amount || 0), 0));
  const clawedBack = round2(events.filter((e: any) => e.event_type === "REFUND_CLAWBACK").reduce((a: number, e: any) => a + Math.abs(Number(e.delta_amount || 0)), 0));
  return { reservation, hostawayId, ledger: events, realized, clawedBack };
}

function ledgerBase(ctx: Context) {
  return {
    partnerId: ctx.reservation.partner_id as string,
    siteId: ctx.reservation.site_id as string | null,
    reservationId: ctx.reservation.id as string,
    sourceProvider: "hostaway" as const,
    bookingChannel: String(ctx.reservation.platform || "direct"),
    providerBookingId: ctx.hostawayId,
  };
}

/** Commission to claw back for `amount` of a booking whose total is `gross`, never more than what is still realized. */
function clawbackFor(ctx: Context, amount: number, alreadyForThisSource: number): number {
  const gross = Number(ctx.reservation.gross_amount || 0);
  if (gross <= 0 || ctx.realized <= 0) return 0;
  const target = round2(ctx.realized * Math.min(1, amount / gross));
  const forThis = round2(target - alreadyForThisSource);
  const remaining = round2(ctx.realized - ctx.clawedBack);
  return Math.max(0, Math.min(forThis, remaining));
}

const HANDLED_TYPES = new Set(["charge.refunded", "charge.dispute.created", "charge.dispute.closed"]);

export async function handleStripeEvent(event: any, deps: StripeEventDeps = {}): Promise<StripeEventOutcome> {
  const type = String(event?.type || "");
  const obj = event?.data?.object;
  if (!obj) return { handled: false, action: "ignored", detail: "no object" };
  if (!HANDLED_TYPES.has(type)) return { handled: false, action: "ignored", detail: type };

  const supabase = deps.supabase || createAdminClient();
  const fetchCharge = deps.fetchCharge || defaultFetchCharge;

  if (type === "charge.refunded") {
    const ctx = await loadContext(supabase, obj);
    if (!ctx) return { handled: false, action: "ignored", detail: "charge not linked to a partner-attributed reservation" };
    const refunded = round2(Number(obj.amount_refunded || 0) / 100);
    if (refunded <= 0) return { handled: false, action: "ignored", detail: "nothing refunded" };

    // Make the booking read as having refund activity so payment realization fails closed from now on.
    if (refunded > Number(ctx.reservation.refund_amount || 0)) {
      await supabase.from("reservations").update({ refund_amount: refunded, updated_at: new Date().toISOString() }).eq("id", ctx.reservation.id);
    }

    const prior = round2(
      ctx.ledger
        .filter((e: any) => e.event_type === "REFUND_CLAWBACK" && e.metadata?.stripeChargeId === obj.id && !e.metadata?.stripeDisputeId)
        .reduce((a: number, e: any) => a + Math.abs(Number(e.delta_amount || 0)), 0)
    );
    const amount = clawbackFor(ctx, refunded, prior);
    if (amount <= 0) return { handled: true, action: "refund_recorded", detail: "no realized commission to claw back" };

    await createRefundClawback({
      ...ledgerBase(ctx),
      clawbackAmount: amount,
      refundReferenceId: `stripe_${obj.id}_${Math.round(refunded * 100)}`,
      metadata: { stripeEventId: event.id, stripeChargeId: obj.id, refundedAmount: refunded, grossAmount: Number(ctx.reservation.gross_amount) },
      supabaseClient: supabase,
    });
    return { handled: true, action: "refund_clawback", detail: `$${amount.toFixed(2)}` };
  }

  if (type === "charge.dispute.created" || type === "charge.dispute.closed") {
    const chargeId = typeof obj.charge === "string" ? obj.charge : obj.charge?.id;
    if (!chargeId) return { handled: false, action: "ignored", detail: "dispute without charge" };
    const charge = await fetchCharge(chargeId);
    const ctx = charge ? await loadContext(supabase, charge) : null;
    if (!ctx) return { handled: false, action: "ignored", detail: "charge not linked to a partner-attributed reservation" };

    const base = ledgerBase(ctx);
    const meta = { stripeEventId: event.id, stripeChargeId: chargeId, stripeDisputeId: obj.id, disputeReason: obj.reason, disputeStatus: obj.status };

    if (type === "charge.dispute.created") {
      await createDisputeHold({ ...base, disputeId: obj.id, reason: `Stripe dispute opened (${obj.reason || "unspecified"})`, createdBy: "stripe-webhook", metadata: meta, supabaseClient: supabase });
      return { handled: true, action: "dispute_hold" };
    }

    // closed
    if (obj.status === "won" || obj.status === "warning_closed") {
      await createDisputeRelease({ ...base, disputeId: obj.id, reason: `Stripe dispute closed in our favour (${obj.status})`, createdBy: "stripe-webhook", metadata: meta, supabaseClient: supabase });
      return { handled: true, action: "dispute_release" };
    }
    if (obj.status === "lost") {
      const disputed = round2(Number(obj.amount || 0) / 100);
      const prior = round2(
        ctx.ledger
          .filter((e: any) => e.event_type === "REFUND_CLAWBACK" && e.metadata?.stripeDisputeId === obj.id)
          .reduce((a: number, e: any) => a + Math.abs(Number(e.delta_amount || 0)), 0)
      );
      const amount = clawbackFor(ctx, disputed, prior);
      // The hold intentionally stays open: the money is gone, so the booking must not become payable again.
      if (amount <= 0) return { handled: true, action: "dispute_lost", detail: "no realized commission to claw back" };
      await createRefundClawback({
        ...base,
        clawbackAmount: amount,
        refundReferenceId: `stripe_dispute_${obj.id}`,
        metadata: { ...meta, disputedAmount: disputed, grossAmount: Number(ctx.reservation.gross_amount) },
        supabaseClient: supabase,
      });
      return { handled: true, action: "dispute_lost_clawback", detail: `$${amount.toFixed(2)}` };
    }
    return { handled: false, action: "ignored", detail: `dispute status ${obj.status}` };
  }

  return { handled: false, action: "ignored", detail: type };
}
