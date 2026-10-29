import { createAdminClient } from "@/lib/supabase/admin";
import { createUsdRecipient, deactivateRecipient } from "./client";

export interface PayoutAccountInput {
  accountHolderName: string;
  legalType: "PRIVATE" | "BUSINESS";
  routingNumber: string;
  accountNumber: string;
  accountType: "CHECKING" | "SAVINGS";
  address: { street: string; city: string; state: string; zip: string };
}

/** ABA routing number checksum (3-7-1 weighting). */
export function isValidRoutingNumber(rtn: string): boolean {
  if (!/^\d{9}$/.test(rtn)) return false;
  const d = rtn.split("").map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

export function validatePayoutAccountInput(raw: any): { ok: true; value: PayoutAccountInput } | { ok: false; error: string } {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = s(raw?.accountHolderName);
  const routing = s(raw?.routingNumber).replace(/\s|-/g, "");
  const account = s(raw?.accountNumber).replace(/\s|-/g, "");
  const accountType = s(raw?.accountType).toUpperCase();
  const legalType = s(raw?.legalType).toUpperCase();
  const a = raw?.address || {};
  const address = { street: s(a.street), city: s(a.city), state: s(a.state).toUpperCase(), zip: s(a.zip) };

  if (name.length < 2 || name.length > 100) return { ok: false, error: "Enter the account holder name." };
  if (!isValidRoutingNumber(routing)) return { ok: false, error: "Routing number is not a valid 9-digit ABA number." };
  if (!/^\d{4,17}$/.test(account)) return { ok: false, error: "Account number must be 4 to 17 digits." };
  if (accountType !== "CHECKING" && accountType !== "SAVINGS") return { ok: false, error: "Select checking or savings." };
  if (legalType !== "PRIVATE" && legalType !== "BUSINESS") return { ok: false, error: "Select individual or business." };
  if (!address.street || !address.city || !/^[A-Z]{2}$/.test(address.state) || !/^\d{5}(-\d{4})?$/.test(address.zip)) {
    return { ok: false, error: "Enter a complete US address (street, city, 2-letter state, ZIP)." };
  }
  return {
    ok: true,
    value: { accountHolderName: name, legalType, routingNumber: routing, accountNumber: account, accountType, address } as PayoutAccountInput,
  };
}

/** Public shape: never includes the Wise recipient id or any bank number beyond last4. */
export function toPublicAccount(row: any) {
  if (!row) return null;
  return {
    accountHolderName: row.account_holder_name,
    accountType: row.account_type,
    last4: row.account_last4,
    currency: row.currency,
    verified: Boolean(row.verified_at),
    updatedAt: row.updated_at,
  };
}

export async function getActivePayoutAccount(partnerId: string, supabaseClient?: any) {
  const supabase = supabaseClient || createAdminClient();
  const { data, error } = await supabase
    .from("partner_payout_accounts")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error) throw new Error(`Failed to load payout account: ${error.message}`);
  return data;
}

/**
 * Sends the bank details straight to Wise and stores only the recipient reference + last4.
 * Replacing an account resets verification: an admin must re-confirm before the next payout.
 */
export class PayoutAccountError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
    this.name = "PayoutAccountError";
  }
}

const IN_FLIGHT_BATCH_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "AWAITING_MANUAL_CONFIRMATION", "PROCESSING", "REQUIRES_RECONCILIATION"];

export async function savePartnerPayoutAccount(params: { partnerId: string; userId: string; input: PayoutAccountInput }) {
  const supabase = createAdminClient();
  const existing = await getActivePayoutAccount(params.partnerId, supabase);

  // Replacing the destination while a payout is being prepared or sent could redirect or break it.
  if (existing) {
    const { data: inFlight } = await supabase
      .from("payout_batches")
      .select("batch_number, status")
      .eq("partner_id", params.partnerId)
      .in("status", IN_FLIGHT_BATCH_STATUSES)
      .limit(1);
    if (inFlight && inFlight.length > 0) {
      throw new PayoutAccountError(
        "A payout is currently being processed for your account, so payout details can't be changed right now. Please try again once it completes, or contact support."
      );
    }
  }

  const recipient = await createUsdRecipient(params.input);

  if (existing) {
    const { error } = await supabase
      .from("partner_payout_accounts")
      .update({ status: "REPLACED", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(`Failed to retire previous payout account: ${error.message}`);
  }

  const { data, error } = await supabase
    .from("partner_payout_accounts")
    .insert({
      partner_id: params.partnerId,
      wise_recipient_id: recipient.id,
      account_holder_name: params.input.accountHolderName,
      account_type: params.input.accountType,
      account_last4: params.input.accountNumber.slice(-4),
      created_by: params.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    // Roll back the retirement so the partner is not left without an account.
    if (existing) await supabase.from("partner_payout_accounts").update({ status: "ACTIVE" }).eq("id", existing.id);
    throw new Error(`Failed to save payout account: ${error?.message}`);
  }

  await supabase.from("application_audit_logs").insert({
    action: existing ? "REPLACE_PAYOUT_ACCOUNT" : "CREATE_PAYOUT_ACCOUNT",
    performed_by_user_id: params.userId,
    partner_id: params.partnerId,
    source: "partner_portal",
    details: { last4: data.account_last4, accountType: data.account_type },
  });

  if (existing) {
    deactivateRecipient(Number(existing.wise_recipient_id)).catch(() => {});
  }
  return data;
}

export async function verifyPayoutAccount(params: { partnerId: string; adminUserId: string }) {
  const supabase = createAdminClient();
  const account = await getActivePayoutAccount(params.partnerId, supabase);
  if (!account) throw new Error("Partner has no active payout account.");
  if (account.created_by === params.adminUserId) {
    throw new Error("You cannot verify a payout account you created yourself.");
  }
  const { data, error } = await supabase
    .from("partner_payout_accounts")
    .update({ verified_at: new Date().toISOString(), verified_by: params.adminUserId, updated_at: new Date().toISOString() })
    .eq("id", account.id)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to verify payout account: ${error.message}`);

  await supabase.from("application_audit_logs").insert({
    action: "VERIFY_PAYOUT_ACCOUNT",
    performed_by_user_id: params.adminUserId,
    partner_id: params.partnerId,
    source: "admin_portal",
    details: { last4: account.account_last4 },
  });
  return data;
}
