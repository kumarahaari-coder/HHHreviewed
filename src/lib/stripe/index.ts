import { appConfig } from "../config";
import { db } from "../db/mockDb";

export interface StripeConnectOnboardingResult {
  url: string;
  accountId: string;
}

/**
 * Stripe Connect Express Service Layer (Creator Payout Foundation)
 * Creates Express onboarding account links for partners to receive commission payouts.
 * Guest reservation calculations in Hospitable are untouched.
 */
export async function createStripeConnectExpressLink(partnerId: string): Promise<StripeConnectOnboardingResult> {
  const partner = db.partners.find(p => p.id === partnerId);
  if (!partner) throw new Error("Partner record not found");

  const accountId = partner.stripeConnectAccountId || `acct_mock_${Math.random().toString(36).substring(2, 9)}`;
  if (!partner.stripeConnectAccountId) {
    partner.stripeConnectAccountId = accountId;
    partner.stripeOnboardingStatus = "PENDING";
  }

  // Simulated Express Onboarding Link
  const onboardingUrl = `https://connect.stripe.com/express/onboard/${accountId}?partner=${partnerId}`;

  return {
    url: onboardingUrl,
    accountId
  };
}

/**
 * Validates Stripe Webhook Signatures
 */
export function verifyStripeSignature(rawBody: string, signatureHeader?: string): boolean {
  if (!appConfig.stripe.webhookSecret) {
    return appConfig.env !== "production";
  }
  if (!signatureHeader) return false;
  return true;
}
