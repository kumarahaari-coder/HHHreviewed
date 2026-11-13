/**
 * Plain-language reasons why a partner's bookings are not (yet) payable, one line per booking.
 * Follows the payout chain in order: rule -> accrual -> fully paid -> payment realized -> released after the stay
 * -> no dispute -> not already paid out. Used to turn "No payout available" into something an admin can act on.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getOfflineHoldHours, loadApprovedOfflineSummaries } from "@/lib/payments/offline-payments";

const money = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const day = (iso?: string | null) => String(iso || "").slice(0, 10);

export async function explainPayoutBlockers(
  partnerId: string,
  supabaseClient?: any,
  maxLines = 8,
  audience: "admin" | "partner" = "admin"
): Promise<string[]> {
  const supabase = supabaseClient || createAdminClient();
  const lines: string[] = [];
  // Partners get the same facts in plain language, without internal settings or system names.
  const say = (admin: string, partner: string) => (audience === "partner" ? partner : admin);

  const { data: rules } = await supabase.from("commission_rules").select("id").eq("partner_id", partnerId).eq("status", "active");
  const hasRule = (rules || []).length > 0;

  const { data: reservations } = await supabase
    .from("reservations")
    .select("id, confirmation_code, reservation_status, payment_status, gross_amount, amount_received, check_out_date")
    .eq("partner_id", partnerId)
    .order("check_out_date", { ascending: false })
    .limit(200);
  const live = (reservations || []).filter((r: any) => r.reservation_status !== "CANCELLED");
  if (live.length === 0) {
    return [`This partner has no active (non-cancelled) bookings${(reservations || []).length ? ` (${(reservations || []).length} cancelled)` : ""}.`];
  }
  if (!hasRule) {
    lines.push(say(
      "No commission rate is set for this partner, so no booking can earn commission. Set one under Partners > Edit, then run a Hostaway sync.",
      "Your commission terms are still being set up by HHH, so bookings can't earn commission yet."
    ));
  }

  const ids = live.map((r: any) => r.id);
  const { data: events } = await supabase
    .from("commission_ledger_events")
    .select("reservation_id, event_type, delta_amount, created_at")
    .in("reservation_id", ids);
  const byRes = new Map<string, any[]>();
  for (const e of events || []) byRes.set(e.reservation_id, [...(byRes.get(e.reservation_id) || []), e]);
  const { data: items } = await supabase
    .from("payout_items")
    .select("reservation_id, disbursed_amount, status")
    .in("reservation_id", ids)
    .in("status", ["PENDING", "SETTLED"]);
  const itemTotal = new Map<string, number>();
  for (const i of items || []) itemTotal.set(i.reservation_id, (itemTotal.get(i.reservation_id) || 0) + Number(i.disbursed_amount || 0));
  let offline = new Map<string, any>();
  try { offline = await loadApprovedOfflineSummaries(supabase, ids); } catch { /* informational only */ }
  const extraHold = getOfflineHoldHours();

  const today = new Date().toISOString().slice(0, 10);
  const reasons: string[] = [];
  for (const r of live) {
    const code = r.confirmation_code;
    const ev = byRes.get(r.id) || [];
    const has = (t: string) => ev.some((e) => e.event_type === t);
    const gross = Number(r.gross_amount || 0);
    const received = Number(r.amount_received || 0);
    let reason: string | null = null;

    if (!has("INITIAL_ACCRUAL")) {
      reason = hasRule
        ? say("No commission accrual yet. It is created on the next Hostaway sync (needs HOSTAWAY_COMMISSION_ATTRIBUTION_ENABLED=true).", "Your commission is being calculated. It appears after the next daily update.")
        : say("No commission accrual, because the partner has no commission rate.", "Waiting for your commission terms to be set up.");
    } else if (!has("PAYMENT_REALIZED")) {
      if (r.payment_status === "UNPAID" || received <= 0) reason = say(`Not paid yet (${money(received)} of ${money(gross)} received).`, `Waiting for the guest's payment (${money(received)} of ${money(gross)} received).`);
      else if (received + 0.005 < gross) reason = say(
        `Not fully paid: ${money(received)} of ${money(gross)} received, ${money(gross - received)} still owed. Commission is realised only when the booking is fully paid.`,
        `The guest has paid ${money(received)} of ${money(gross)}. Commission is earned once the booking is paid in full.`
      );
      else reason = say("Fully paid, but the commission has not been realised yet. It happens on the next Hostaway sync.", "Paid in full. Your commission is being confirmed and appears after the next daily update.");
    } else if (ev.some((e) => e.event_type === "DISPUTE_HOLD") && !has("DISPUTE_RELEASE")) {
      reason = say("On hold: a payment dispute is open.", "On hold while a payment dispute is reviewed.");
    } else if (!has("ELIGIBILITY_RELEASE")) {
      const out = day(r.check_out_date);
      const off = offline.get(r.id);
      reason = out > today
        ? say(`Paid. Waiting for the stay to finish: check-out is ${out}, payable 24 hours after.`, `Paid. Available 24 hours after check-out on ${out}.`)
        : off && extraHold > 24
        ? say(`Paid offline. Extra ${extraHold}h hold applies after approval.`, "Paid. A short extra review period applies.")
        : say(`Paid and checked out (${out}). It becomes payable 24 hours after check-out; the release runs with the next sync.`, `Paid and checked out (${out}). Becomes available within about a day (the daily update).`);
    } else {
      const realized = ev.filter((e) => e.event_type === "PAYMENT_REALIZED").reduce((a, e) => a + Number(e.delta_amount || 0), 0);
      const clawed = ev.filter((e) => e.event_type === "REFUND_CLAWBACK").reduce((a, e) => a + Math.abs(Number(e.delta_amount || 0)), 0);
      const out = realized - clawed - (itemTotal.get(r.id) || 0);
      if (out <= 0.004) reason = (itemTotal.get(r.id) || 0) > 0 ? say("Already included in a payout.", "Already included in a payout.") : say("Nothing left to pay (fully refunded or clawed back).", "Nothing left to pay on this booking (refunded).");
    }
    if (reason) reasons.push(`${code}: ${reason}`);
  }

  lines.push(...reasons.slice(0, Math.max(0, maxLines - lines.length)));
  if (reasons.length > maxLines) lines.push(`…and ${reasons.length - maxLines} more bookings.`);
  return lines;
}
