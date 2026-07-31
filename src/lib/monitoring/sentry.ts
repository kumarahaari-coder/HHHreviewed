import { appConfig } from "../config";

export interface ErrorContext {
  userId?: string;
  role?: string;
  route?: string;
  integrationName?: string;
  [key: string]: any;
}

/**
 * Sentry Error & Exception Capture Module
 * Features strict beforeSend sanitization:
 * - Excludes request bodies on tax upload endpoints.
 * - Strips multipart form data, signed URLs, auth headers, and session tokens.
 * - Enriches exceptions with non-sensitive contextual metadata.
 */
export function captureException(error: Error | any, context: ErrorContext = {}): void {
  if (!appConfig.sentry.isConfigured) {
    console.error("[Sentry Local Capture]", error?.message || error, context);
    return;
  }

  // Sanitize context
  const safeContext = { ...context };
  delete safeContext.requestBody;
  delete safeContext.formData;
  delete safeContext.signedUrl;
  delete safeContext.authorization;
  delete safeContext.cookie;
  delete safeContext.pat;

  if (typeof window !== "undefined" && (window as any).Sentry) {
    (window as any).Sentry.captureException(error, { extra: safeContext });
  }
}

/**
 * Sanitizes Sentry event payloads before transmission.
 */
export function beforeSendSanitizer(event: any): any | null {
  if (!event) return null;

  // Sanitize headers
  if (event.request && event.request.headers) {
    delete event.request.headers["authorization"];
    delete event.request.headers["cookie"];
    delete event.request.headers["api-key"];
    delete event.request.headers["svix-signature"];
    delete event.request.headers["stripe-signature"];
  }

  // Exclude request bodies on tax upload endpoints
  if (event.request && event.request.url && event.request.url.includes("/api/tax-documents")) {
    delete event.request.data;
  }

  return event;
}
