import { NextRequest, NextResponse } from "next/server";
import { verifyWiseSignature } from "@/lib/wise/webhook";
import { applyWiseTransferState } from "@/lib/wise/payout";
import { getWiseConfig } from "@/lib/wise/client";

export const dynamic = "force-dynamic";

/**
 * Wise delivers at-least-once and retries on anything but a 2xx, so: reject bad signatures (401, Wise gives up
 * quickly on 4xx), acknowledge events we do not care about, and return 500 only when processing really failed.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verifyWiseSignature(raw, req.headers.get("x-signature-sha256"))) {
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }

  try {
    const event = JSON.parse(raw);
    const isTest = req.headers.get("x-test-notification") === "true";
    if (event?.event_type !== "transfers#state-change") {
      return NextResponse.json({ success: true, ignored: event?.event_type });
    }

    // Tolerate schema differences between webhook versions.
    const data = event?.data || {};
    const transferId = data?.resource?.id ?? data?.id;
    const state = data?.current_state ?? data?.currentState;
    if (!transferId || !state) {
      return NextResponse.json({ success: false, error: "Malformed event" }, { status: 400 });
    }

    // A subscription on a shared application can deliver other profiles' events; never act on them.
    const profileId = data?.resource?.profile_id ?? data?.resource?.profileId;
    const ours = getWiseConfig().profileId;
    if (profileId && ours && String(profileId) !== String(ours)) {
      return NextResponse.json({ success: true, ignored: "other profile" });
    }

    if (isTest) {
      return NextResponse.json({ success: true, test: true });
    }

    const result = await applyWiseTransferState(String(transferId), String(state));
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Wise Webhook] processing failed:", err);
    // 500 makes Wise retry the delivery.
    return NextResponse.json({ success: false, error: "Processing failed" }, { status: 500 });
  }
}
