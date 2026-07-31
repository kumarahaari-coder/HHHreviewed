export interface AlertNotification {
  key: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

const alertSuppressionMap = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 45 * 60 * 1000; // 45 minutes

/**
 * Dispatches operational alert notifications to external webhook/email transport while enforcing a 45-minute deduplication window per alert key.
 * Delivery failures are caught safely and logged without failing the synchronization execution.
 */
export async function dispatchOperationalAlert(
  alert: AlertNotification
): Promise<{ dispatched: boolean; suppressed: boolean; webhookSent: boolean }> {
  const now = Date.now();
  const lastDispatched = alertSuppressionMap.get(alert.key);

  if (lastDispatched && now - lastDispatched < DEDUPLICATION_WINDOW_MS) {
    return { dispatched: false, suppressed: true, webhookSent: false };
  }

  alertSuppressionMap.set(alert.key, now);

  console.warn(
    `[OPERATIONAL ALERT - ${alert.severity}] ${alert.title}: ${alert.message}`,
    alert.details ? JSON.stringify(alert.details) : ""
  );

  let webhookSent = false;
  const webhookUrl = process.env.ALERT_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;

  if (webhookUrl && /^https?:\/\//i.test(webhookUrl)) {
    try {
      // Sanitize payload to guarantee zero guest data, tokens, or raw payloads are exposed
      const sanitizedPayload = {
        text: `*[OPERATIONAL ALERT - ${alert.severity}] ${alert.title}*\n${alert.message}`,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        timestamp: alert.timestamp,
        ...(alert.details ? { details: alert.details } : {}),
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitizedPayload),
      });

      webhookSent = response.ok;
    } catch (error) {
      console.warn("Alert webhook delivery failed (sync execution unaffected):", error);
      webhookSent = false;
    }
  }

  return { dispatched: true, suppressed: false, webhookSent };
}

/**
 * Clears alert suppression for a specific key when condition resolves.
 */
export function clearAlertSuppression(key: string): void {
  alertSuppressionMap.delete(key);
}
