import { createHash } from "crypto";

/**
 * Minimal Wise Platform API client (server-side only).
 * Defaults to the SANDBOX unless WISE_ENV=production, so a missing variable can never move real money.
 */

export class WiseError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
    this.name = "WiseError";
  }
}

export function getWiseConfig() {
  const env = process.env.WISE_ENV === "production" ? "production" : "sandbox";
  const baseUrl =
    process.env.WISE_BASE_URL?.trim() ||
    (env === "production" ? "https://api.transferwise.com" : "https://api.wise-sandbox.com");
  const token = process.env.WISE_API_TOKEN?.trim();
  const profileId = process.env.WISE_PROFILE_ID?.trim();
  return { env, baseUrl, token, profileId, isConfigured: Boolean(token && profileId) };
}

function requireConfig() {
  const cfg = getWiseConfig();
  if (!cfg.token || !cfg.profileId) {
    throw new WiseError("Wise is not configured (WISE_API_TOKEN / WISE_PROFILE_ID missing).");
  }
  return { ...cfg, token: cfg.token, profileId: cfg.profileId };
}

async function wiseFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const cfg = requireConfig();
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    // Never include request bodies (bank details) in error text.
    const detail = json?.errors?.[0]?.message || json?.message || json?.error_description || res.statusText;
    throw new WiseError(`Wise API ${res.status}: ${detail}`, res.status, json);
  }
  return json as T;
}

/** Deterministic UUID so a retried request is deduplicated by Wise (customerTransactionId). */
export function deterministicUuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface UsRecipientInput {
  accountHolderName: string;
  legalType: "PRIVATE" | "BUSINESS";
  routingNumber: string;
  accountNumber: string;
  accountType: "CHECKING" | "SAVINGS";
  address: { street: string; city: string; state: string; zip: string };
}

/** Creates a USD (ABA) recipient. Returns Wise's numeric recipient id. */
export async function createUsdRecipient(input: UsRecipientInput): Promise<{ id: number }> {
  const cfg = requireConfig();
  return wiseFetch<{ id: number }>("/v1/accounts", {
    method: "POST",
    body: {
      profile: Number(cfg.profileId),
      currency: "USD",
      type: "aba",
      accountHolderName: input.accountHolderName,
      ownedByCustomer: false,
      details: {
        legalType: input.legalType,
        abartn: input.routingNumber,
        accountNumber: input.accountNumber,
        accountType: input.accountType,
        address: {
          country: "US",
          city: input.address.city,
          state: input.address.state,
          postCode: input.address.zip,
          firstLine: input.address.street,
        },
      },
    },
  });
}

/** Best-effort removal of a replaced recipient. Failures are non-fatal for callers. */
export async function deactivateRecipient(recipientId: number): Promise<void> {
  await wiseFetch(`/v1/accounts/${recipientId}`, { method: "DELETE" });
}

export async function createQuote(params: { targetAmountUsd: number; targetAccountId: number }) {
  const cfg = requireConfig();
  return wiseFetch<{ id: string; sourceAmount: number; targetAmount: number; rate: number }>(
    `/v3/profiles/${cfg.profileId}/quotes`,
    {
      method: "POST",
      body: {
        sourceCurrency: "USD",
        targetCurrency: "USD",
        targetAmount: params.targetAmountUsd,
        targetAccount: params.targetAccountId,
      },
    }
  );
}

export interface WiseTransfer {
  id: number;
  status: string;
  sourceValue?: number;
  targetValue?: number;
  customerTransactionId?: string;
}

export async function createTransfer(params: {
  targetAccountId: number;
  quoteId: string;
  customerTransactionId: string;
  reference: string;
}) {
  return wiseFetch<WiseTransfer>("/v1/transfers", {
    method: "POST",
    body: {
      targetAccount: params.targetAccountId,
      quoteUuid: params.quoteId,
      customerTransactionId: params.customerTransactionId,
      details: { reference: params.reference.slice(0, 10) },
    },
  });
}

/** Funds a transfer from the Wise USD balance. */
export async function fundTransferFromBalance(transferId: number) {
  const cfg = requireConfig();
  return wiseFetch<{ status: string; errorCode?: string }>(
    `/v3/profiles/${cfg.profileId}/transfers/${transferId}/payments`,
    { method: "POST", body: { type: "BALANCE" } }
  );
}

/** Available USD in the Wise standard balance. 0 when the profile has no USD balance. */
export async function getUsdBalance(): Promise<number> {
  const cfg = requireConfig();
  const balances = await wiseFetch<Array<{ currency: string; amount?: { value: number } }>>(
    `/v4/profiles/${cfg.profileId}/balances?types=STANDARD`
  );
  return Number(balances.find(b => b.currency === "USD")?.amount?.value ?? 0);
}

/** Cancels a transfer that has not been sent yet. Wise rejects it once the money is on its way. */
export async function cancelTransfer(transferId: number | string) {
  return wiseFetch<WiseTransfer>(`/v1/transfers/${transferId}/cancel`, { method: "PUT" });
}

export async function getTransfer(transferId: number | string) {
  return wiseFetch<WiseTransfer>(`/v1/transfers/${transferId}`);
}

/** Wise states that mean the money has left Wise toward the partner. */
export const WISE_SENT_STATES = new Set(["outgoing_payment_sent"]);
/** Wise states that mean the transfer did not complete. */
/** States where the transfer is created but still waiting for us to fund it. */
export const WISE_UNFUNDED_STATES = new Set(["incoming_payment_waiting", "draft"]);
export const WISE_FAILED_STATES = new Set(["cancelled", "funds_refunded", "bounced_back", "charged_back"]);
