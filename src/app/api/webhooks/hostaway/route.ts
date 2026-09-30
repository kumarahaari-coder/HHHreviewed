/**
 * Hostaway Unified Webhooks Ingestion Route
 * 
 * Endpoint: POST /api/webhooks/hostaway
 * 
 * Security:
 * - Basic Auth or secret header verification (fail-closed)
 * - Safe schema validation
 * - Idempotent event execution
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyHostawayWebhookRequest, processHostawayWebhook } from "@/lib/hostaway/webhooks";

export async function POST(req: NextRequest) {
  // 1. Verify authentication
  const auth = verifyHostawayWebhookRequest(req);
  if (!auth.isValid) {
    return NextResponse.json(
      { success: false, error: auth.error || "Unauthorized" },
      { status: auth.statusCode || 401 }
    );
  }

  // 2. Parse and validate JSON payload
  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { success: false, error: "Empty or invalid webhook payload" },
      { status: 400 }
    );
  }

  // 3. Process webhook
  try {
    const result = await processHostawayWebhook(payload);
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error("[Hostaway Webhook Error]:", err?.message);
    return NextResponse.json(
      { success: false, error: err?.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}
