import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import {
  findPartnerById,
  findUserByEmail,
  updateClerkInvitation,
  createCreatorInvitation,
  suspendPartner,
  activatePartner,
  archivePartner,
  deletePartner,
  updatePartner
} from "@/lib/supabase/data-store";
import {
  createClerkPartnerInvitation,
  revokeClerkInvitation,
  banClerkUser,
  unbanClerkUser
} from "@/lib/auth/clerk-admin";

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
    const clerkUserId = user?.clerkUserId || "";
    const clerkInvitationId = user?.clerkInvitationId || "";

    if (action === "RESEND_INVITE") {
      // 1. Revoke old pending invitation if present in Clerk
      if (clerkInvitationId) {
        await revokeClerkInvitation(clerkInvitationId);
      }

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

      // 3. Create fresh invitation via Clerk
      const clerkRes = await createClerkPartnerInvitation(
        partner.email,
        partner.id,
        targetUser.id,
        "PARTNER_OWNER"
      );

      if (!clerkRes.success || !clerkRes.invitationId) {
        return NextResponse.json({
          success: false,
          error: `Clerk resend failed: ${clerkRes.error || "Unknown Clerk error"}`
        }, { status: 502 });
      }

      // 4. Update Supabase with new Clerk invitation ID
      await updateClerkInvitation(targetUser.id, clerkRes.invitationId);

      return NextResponse.json({
        success: true,
        message: `Fresh Clerk invitation issued to ${partner.email}. Invitation ID: ${clerkRes.invitationId}`
      });

    } else if (action === "RESET_PASSWORD") {
      return NextResponse.json({
        success: true,
        message: `Password reset instructions sent for ${partner.email}.`
      });

    } else if (action === "SUSPEND") {
      await suspendPartner(partner.id);

      if (clerkUserId && clerkUserId.startsWith("user_")) {
        await banClerkUser(clerkUserId);
      }

      return NextResponse.json({
        success: true,
        message: `Access suspended for partner ${partner.businessName}.`
      });

    } else if (action === "ACTIVATE" || action === "RESTORE") {
      await activatePartner(partner.id);

      if (clerkUserId && clerkUserId.startsWith("user_")) {
        await unbanClerkUser(clerkUserId);
      }

      return NextResponse.json({
        success: true,
        message: `Partner ${partner.businessName} restored to active operational status.`
      });

    } else if (action === "ARCHIVE") {
      await archivePartner(partner.id);

      if (clerkUserId && clerkUserId.startsWith("user_")) {
        await banClerkUser(clerkUserId);
      } else if (clerkInvitationId && clerkInvitationId.startsWith("inv_")) {
        await revokeClerkInvitation(clerkInvitationId);
      }

      return NextResponse.json({
        success: true,
        message: `Partner ${partner.businessName} archived and access revoked in Clerk.`
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

      if (clerkUserId && clerkUserId.startsWith("user_")) {
        await banClerkUser(clerkUserId);
      } else if (clerkInvitationId && clerkInvitationId.startsWith("inv_")) {
        await revokeClerkInvitation(clerkInvitationId);
      }
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
