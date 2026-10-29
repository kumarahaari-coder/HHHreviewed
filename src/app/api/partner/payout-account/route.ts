import { NextResponse } from "next/server";
import { getAuthSession, isCreatorRole } from "@/lib/authorization";
import { findPartnerById } from "@/lib/supabase/data-store";
import { getWiseConfig } from "@/lib/wise/client";
import {
  getActivePayoutAccount,
  PayoutAccountError,
  savePartnerPayoutAccount,
  toPublicAccount,
  validatePayoutAccountInput,
} from "@/lib/wise/payout-account";

export const dynamic = "force-dynamic";

// The partner always comes from the session, never from the request body.
async function resolvePartner() {
  const session = await getAuthSession();
  if (!session) return { error: NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 }) };
  if (!isCreatorRole(session.role) || !session.partnerId) {
    return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  }
  const partner = await findPartnerById(session.partnerId);
  const status = (partner?.status || "").toLowerCase();
  if (status === "archived" || status === "suspended") {
    return { error: NextResponse.json({ success: false, error: `Partner account is ${status}.` }, { status: 403 }) };
  }
  return { session, partnerId: session.partnerId };
}

export async function GET() {
  try {
    const r = await resolvePartner();
    if (r.error) return r.error;
    const account = await getActivePayoutAccount(r.partnerId!);
    return NextResponse.json({ success: true, account: toPublicAccount(account) });
  } catch (err: any) {
    console.error("[API Error] GET /api/partner/payout-account:", err);
    return NextResponse.json({ success: false, error: "Failed to load payout account." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const r = await resolvePartner();
    if (r.error) return r.error;

    if (!getWiseConfig().isConfigured) {
      return NextResponse.json({ success: false, error: "Payout setup is not available yet. Please try again later." }, { status: 503 });
    }

    const parsed = validatePayoutAccountInput(await req.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

    const saved = await savePartnerPayoutAccount({ partnerId: r.partnerId!, userId: r.session!.userId, input: parsed.value });
    return NextResponse.json({ success: true, account: toPublicAccount(saved) });
  } catch (err: any) {
    if (err instanceof PayoutAccountError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    // Deliberately generic: Wise error bodies may echo submitted bank details.
    console.error("[API Error] PUT /api/partner/payout-account:", err?.name, err?.status);
    const msg = err?.status === 422 || err?.status === 400
      ? "Wise rejected these bank details. Please check the routing and account numbers."
      : "Could not save payout details. Please try again.";
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }
}
