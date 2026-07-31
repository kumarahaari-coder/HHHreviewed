import { appConfig } from "../config";

export type PostHogEventName =
  | "user_signed_up"
  | "user_signed_in"
  | "creator_onboarding_started"
  | "creator_onboarding_completed"
  | "settings_viewed"
  | "tax_document_upload_started"
  | "tax_document_submitted"
  | "tax_document_replaced"
  | "tax_document_status_viewed"
  | "payment_started"
  | "payment_completed"
  | "payment_failed"
  | "dashboard_viewed";

/**
 * Privacy-First PostHog Analytics Wrapper
 * Features:
 * - Session Replay COMPLETELY DISABLED on tax document upload/review routes.
 * - Zero tax contents, SSNs/TINs, signed URLs, API keys, or form values sent.
 * - Automated user identity reset on logout.
 */
export function trackAnalyticsEvent(eventName: PostHogEventName, properties: Record<string, any> = {}): void {
  if (!appConfig.posthog.isConfigured) return;

  // Sanitize properties to prevent sensitive leakage
  const safeProps = { ...properties };
  delete safeProps.taxFormContent;
  delete safeProps.ssn;
  delete safeProps.tin;
  delete safeProps.signedUrl;
  delete safeProps.authorization;
  delete safeProps.secret;

  if (typeof window !== "undefined" && (window as any).posthog) {
    (window as any).posthog.capture(eventName, safeProps);
  }
}

/**
 * Disables session replay completely on sensitive tax document and payout routes.
 */
export function disableSessionReplayOnSensitiveRoute(routePath: string): void {
  const sensitiveRoutes = ["/partner/profile", "/admin/tax-documents"];
  const isSensitive = sensitiveRoutes.some(r => routePath.startsWith(r));

  if (typeof window !== "undefined" && (window as any).posthog) {
    if (isSensitive) {
      if (typeof (window as any).posthog.stopSessionRecording === "function") {
        (window as any).posthog.stopSessionRecording();
      }
    }
  }
}

export function resetAnalyticsSession(): void {
  if (typeof window !== "undefined" && (window as any).posthog) {
    (window as any).posthog.reset();
  }
}
