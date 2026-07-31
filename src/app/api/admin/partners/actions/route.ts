import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createClerkPartnerInvitation, banClerkUser, unbanClerkUser, revokeClerkUserSessions } from "@/lib/auth/clerk-admin";

export async function POST(req: NextRequest) {
  try {
    const session = getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { action, partnerId } = body;

    if (!action || !partnerId) {
      return NextResponse.json({ success: false, error: "Action and partnerId are required." }, { status: 400 });
    }

    const partner = db.partners.find(p => p.id === partnerId);
    if (!partner) {
      return NextResponse.json({ success: false, error: `Partner with ID ${partnerId} not found.` }, { status: 404 });
    }

    const user = db.users.find(u => u.partnerId === partnerId || u.email.toLowerCase() === partner.email.toLowerCase());
    const clerkUserId = user?.clerkUserId || "";

    if (action === "RESEND_INVITE") {
      partner.status = "INVITED";
      // Resend invitation via Clerk Backend SDK so invitation state remains consistent
      const clerkRes = await createClerkPartnerInvitation(partner.email, partner.id, "CREATOR");
      if (!clerkRes.success) {
        return NextResponse.json({ success: false, error: `Clerk resend failed: ${clerkRes.error}` }, { status: 502 });
      }

      db.addNotification("SUCCESS", `Clerk invitation resent to ${partner.email}.`);
      return NextResponse.json({ success: true, message: `Clerk invitation resent successfully to ${partner.email}.` });

    } else if (action === "RESET_PASSWORD") {
      db.addNotification("INFO", `Password reset request logged for ${partner.email}.`);
      return NextResponse.json({ success: true, message: `Password reset request logged for ${partner.email}.` });

    } else if (action === "SUSPEND") {
      partner.status = "SUSPENDED";
      if (user) user.status = "SUSPENDED";

      // Disable login & revoke sessions in Clerk
      if (clerkUserId) {
        await banClerkUser(clerkUserId);
        await revokeClerkUserSessions(clerkUserId);
      }

      db.addNotification("WARNING", `Access suspended and Clerk login disabled for partner ${partner.businessName}.`);
      return NextResponse.json({ success: true, message: `Partner ${partner.businessName} suspended and Clerk login disabled.` });

    } else if (action === "ACTIVATE") {
      // Manual activation used for reactivating a suspended account
      partner.status = "ACTIVE";
      if (user) user.status = "ACTIVE";

      // Unban in Clerk
      if (clerkUserId) {
        await unbanClerkUser(clerkUserId);
      }

      db.addNotification("SUCCESS", `Access reactivated for partner ${partner.businessName}.`);
      return NextResponse.json({ success: true, message: `Partner ${partner.businessName} reactivated.` });

    } else if (action === "ARCHIVE") {
      partner.status = "ARCHIVED";
      if (user) user.status = "SUSPENDED";

      // Revoke sessions & disable login in Clerk
      if (clerkUserId) {
        await banClerkUser(clerkUserId);
        await revokeClerkUserSessions(clerkUserId);
      }

      db.addNotification("WARNING", `Partner ${partner.businessName} archived and access revoked in Clerk.`);
      return NextResponse.json({ success: true, message: `Partner ${partner.businessName} archived and access revoked.` });

    } else {
      return NextResponse.json({ success: false, error: `Invalid action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Action failed" }, { status: 500 });
  }
}
