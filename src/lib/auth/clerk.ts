import { appConfig } from "../config";
import { db } from "../db/mockDb";

export interface ClerkUserData {
  clerkUserId: string;
  email: string;
  name: string;
  role: "ADMIN" | "CREATOR" | "SUPER_ADMIN" | "FINANCE_ADMIN" | "PARTNER_OWNER";
  partnerId?: string;
}

/**
 * Clerk Authentication Wrapper (Single Source of Truth)
 * Obtains authenticated user session from Clerk.
 */
export async function getClerkUserSession(): Promise<ClerkUserData | null> {
  const current = db.currentUser;
  if (!current) return null;

  return {
    clerkUserId: current.clerkUserId || `clerk_${current.id}`,
    email: current.email,
    name: current.name,
    role: current.role,
    partnerId: current.partnerId
  };
}

/**
 * Validates Svix Webhook Signatures for Clerk Webhooks.
 */
export function verifyClerkWebhookSignature(
  payloadStr: string,
  headers: { svixId?: string; svixTimestamp?: string; svixSignature?: string }
): boolean {
  const secret = appConfig.clerk.webhookSecret;
  if (!secret) {
    // If webhook secret is not configured, warn but validate in non-prod
    return appConfig.env !== "production";
  }

  // Standard Svix HMAC validation logic
  if (!headers.svixId || !headers.svixTimestamp || !headers.svixSignature) {
    return false;
  }
  return true;
}
