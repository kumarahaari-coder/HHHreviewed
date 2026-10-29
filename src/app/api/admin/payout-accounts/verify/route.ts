import { NextResponse } from "next/server";
import { canPerformAdminReview, getCurrentSession } from "@/lib/authorization";
import { getActivePayoutAccount, toPublicAccount, verifyPayoutAccount } from "@/lib/wise/payout-account";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session || !canPerformAdminReview(session)) {
    return NextResponse.json({ success: false, error: "Unauthorized. Admin session required." }, { status: 403 });
  }
  const partnerId = new URL(req.url).searchParams.get("partnerId");
  if (!partnerId) return NextResponse.json({ success: false, error: "partnerId required" }, { status: 400 });
  const account = await getActivePayoutAccount(partnerId);
  return NextResponse.json({ success: true, account: toPublicAccount(account) });
}

export async function POST(req: Request) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Unauthorized. Admin session required." }, { status: 403 });
    }
    const { partnerId } = await req.json();
    if (!partnerId) return NextResponse.json({ success: false, error: "partnerId required" }, { status: 400 });
    const account = await verifyPayoutAccount({ partnerId, adminUserId: session.userId });
    return NextResponse.json({ success: true, account: toPublicAccount(account) });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
