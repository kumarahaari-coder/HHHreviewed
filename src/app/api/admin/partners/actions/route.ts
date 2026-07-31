import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createClerkPartnerInvitation, revokeClerkInvitation, banClerkUser, unbanClerkUser } from "@/lib/auth/clerk-admin";

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
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
    const clerkInvitationId = user?.clerkInvitationId || "";

    if (action === "RESEND_INVITE") {
      partner.status = "INVITED";

      // Revoke old pending invitation if present
      if (clerkInvitationId) {
        await revokeClerkInvitation(clerkInvitationId);
      }

      // Create fresh invitation via Clerk
      const clerkRes = await createClerkPartnerInvitation(partner.email, partner.id, user?.id || `user-partner-${partner.id}`, "CREATOR");
      if (!clerkRes.success || !clerkRes.invitationId) {
        return NextResponse.json({ success: false, error: `Clerk resend failed: ${clerkRes.error}` }, { status: 502 });
      }

      if (user) {
        user.clerkInvitationId = clerkRes.invitationId;
      }

      db.addNotification("SUCCESS", `Fresh Clerk invitation issued to ${partner.email}. Invitation ID: ${clerkRes.invitationId}`);
      return NextResponse.json({ success: true, message: `Clerk invitation resent successfully to ${partner.email}.` });

    } else if (action === "RESET_PASSWORD") {
      db.addNotification("INFO", `Password reset request logged for ${partner.email}.`);
      return NextResponse.json({ success: true, message: `Password reset request logged for ${partner.email}.` });

    } else if (action === "SUSPEND") {
      partner.status = "SUSPENDED";
      if (user) user.status = "SUSPENDED";

      // Disable login in Clerk if user has completed sign up
      if (clerkUserId && clerkUserId.startsWith("user_")) {
        await banClerkUser(clerkUserId);
      }

      db.addNotification("WARNING", `Access suspended for partner ${partner.businessName}.`);
      return NextResponse.json({ success: true, message: `Partner ${partner.businessName} suspended.` });

    } else if (action === "ACTIVATE") {
      // Manual activation used for reactivating a suspended account
      partner.status = "ACTIVE";
      if (user) user.status = "ACTIVE";

      // Unban in Clerk if user ID exists
      if (clerkUserId && clerkUserId.startsWith("user_")) {
        await unbanClerkUser(clerkUserId);
      }

      db.addNotification("SUCCESS", `Access reactivated for partner ${partner.businessName}.`);
      return NextResponse.json({ success: true, message: `Partner ${partner.businessName} reactivated.` });

    } else if (action === "ARCHIVE") {
      partner.status = "ARCHIVED";
      if (user) user.status = "SUSPENDED";

      // Ban Clerk user if user ID exists
      if (clerkUserId && clerkUserId.startsWith("user_")) {
        await banClerkUser(clerkUserId);
      } else if (clerkInvitationId && clerkInvitationId.startsWith("inv_")) {
        // If invite is still pending and no Clerk user exists, revoke invitation
        await revokeClerkInvitation(clerkInvitationId);
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
