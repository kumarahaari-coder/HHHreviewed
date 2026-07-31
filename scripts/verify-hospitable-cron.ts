import { getHospitableConfig } from "../src/lib/hospitable/config";

async function verifyHospitableCron() {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.error("Error: CRON_SECRET environment variable is not configured.");
    process.exit(1);
  }

  const baseUrl = (process.env.PRODUCTION_URL || process.env.VERCEL_URL || "http://localhost:3000").replace(/\/$/, "");
  const targetUrl = /^https?:\/\//i.test(baseUrl) ? `${baseUrl}/api/cron/sync-reservations` : `https://${baseUrl}/api/cron/sync-reservations`;

  console.log(`Verifying Hospitable Cron endpoint at: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawText: text };
    }

    if (!response.ok) {
      console.error(`Cron Verification Failed (HTTP Status ${response.status}):`, data.error || data);
      process.exit(1);
    }

    console.log(`✓ Cron Endpoint Responded (HTTP ${response.status})`);
    console.log("Operational Summary:", {
      success: data.success,
      skipped: data.skipped ?? false,
      reason: data.reason ?? "COMPLETED",
      syncLogId: data.syncLogId ?? null,
      syncType: data.syncType,
      trigger: data.trigger,
      syncMode: data.syncMode,
      windowStart: data.windowStart,
      windowEnd: data.windowEnd,
      summary: data.summary,
      database: data.database,
      validation: data.validation,
      completedAt: data.completedAt,
    });

    const config = getHospitableConfig();
    console.log("Validated Config:", {
      lookbackDays: config.lookbackDays,
      lookaheadDays: config.lookaheadDays,
      leaseSeconds: config.leaseSeconds,
    });
  } catch (error) {
    console.error("Cron verification HTTP request failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

verifyHospitableCron().catch((err) => {
  console.error("Cron verification script error:", err);
  process.exit(1);
});
