import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import {
  findPartnerById,
  findUserByEmail,
  createCreatorInvitation,
  suspendPartner,
  activatePartner,
  archivePartner,
  deletePartner,
  updatePartner
} from "@/lib/supabase/data-store";
import { sendPartnerInvitation, sendAdminPasswordReset, revokeUserAccess } from "@/lib/auth/invitations";

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { action, partnerId, updates } = body;

    if (!action || !partnerId) {
      return NextResponse.json({ success: false, error: "Action and partnerId are required." }, { status: 400 });
    }

    const partner = await findPartnerById(partnerId);
    if (!partner) {
      return NextResponse.json({ success: false, error: `Partner with ID ${partnerId} not found.` }, { status: 404 });
    }

    const user = await findUserByEmail(partner.email);

    if (action === "RESEND_INVITE") {
      // 1. (Older unused invitation links are voided automatically when a fresh one is issued)

      // 2. Ensure application user exists
      let targetUser = user;
      if (!targetUser) {
        targetUser = await createCreatorInvitation({
          internalUserId: `user-partner-${Date.now().toString(36)}`,
          name: partner.contactName,
          email: partner.email,
          partnerId: partner.id,
          partnerCode: partner.partnerCode,
          role: "PARTNER_OWNER",
          performedByUserId: session.userId,
          source: "ADMIN_ACTIONS_RESEND"
        });
      }

      // 3. Issue a fresh invitation link by email
      const inviteRes = await sendPartnerInvitation(targetUser.id, partner.email, partner.businessName);

      if (!inviteRes.success) {
        return NextResponse.json({
          success: false,
          error: `Invitation resend failed: ${inviteRes.error || "Unknown error"}`
        }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        message: `Fresh invitation emailed to ${partner.email}.`
      });

    } else if (action === "RESET_PASSWORD") {
      if (!user || user.status !== "ACTIVE") {
        return NextResponse.json({
          success: false,
          error: "Password reset is only available for active accounts. Resend the invitation instead."
        }, { status: 400 });
      }
      const resetRes = await sendAdminPasswordReset(user.id, user.email);
      if (!resetRes.success) {
        return NextResponse.json({ success: false, error: `Reset email failed: ${resetRes.error}` }, { status: 502 });
      }
      return NextResponse.json({
        success: true,
        message: `Password reset link emailed to ${partner.email}.`
      });

    } else if (action === "SUSPEND") {
      await suspendPartner(partner.id);

      if (user) await revokeUserAccess(user.id);

      return NextResponse.json({
        success: true,
        message: `Access suspended for partner ${partner.businessName}.`
      });

    } else if (action === "ACTIVATE" || action === "RESTORE") {
      await activatePartner(partner.id);

      return NextResponse.json({
        success: true,
        message: `Partner ${partner.businessName} restored to active operational status.`
      });

    } else if (action === "ARCHIVE") {
      await archivePartner(partner.id);

      if (user) await revokeUserAccess(user.id);

      return NextResponse.json({
        success: true,
        message: `Partner ${partner.businessName} archived and access revoked.`
      });

    } else if (action === "REMOVE" || action === "DELETE") {
      const result = await deletePartner(partner.id);
      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error,
          requiresArchive: result.requiresArchive,
          details: result.details
        }, { status: 400 });
      }

      if (user) await revokeUserAccess(user.id);
      return NextResponse.json({
        success: true,
        message: result.message
      });

    } else if (action === "EDIT") {
      if (!updates || typeof updates !== "object") {
        return NextResponse.json({ success: false, error: "Updates object required for EDIT action." }, { status: 400 });
      }

      const updated = await updatePartner(partner.id, {
        contactName: updates.contactName,
        businessName: updates.businessName,
        phone: updates.phone,
        status: updates.status
      });

      return NextResponse.json({
        success: true,
        message: `Partner ${updated.businessName} updated successfully.`,
        partner: updated
      });

    } else {
      return NextResponse.json({ success: false, error: `Invalid action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error("[Admin Partner Actions Error]", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Action request failed"
    }, { status: 500 });
  }
}
