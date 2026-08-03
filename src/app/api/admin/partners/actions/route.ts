import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createClerkPartnerInvitation, revokeClerkInvitation, banClerkUser, unbanClerkUser } from "@/lib/auth/clerk-admin";
import { isSupabaseEnabled } from "@/lib/supabase/data-store";
import { createAdminClient } from "@/lib/supabase/admin";

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

    let partnerEmail = "";
    let partnerBusinessName = "";
    let clerkUserId = "";

    if (isSupabaseEnabled()) {
      const supabase = createAdminClient();
      const { data: pRow, error: pErr } = await supabase.from("partners").select("*").eq("id", partnerId).single();
      if (pErr || !pRow) {
        return NextResponse.json({ success: false, error: `Partner with ID ${partnerId} not found in Supabase.` }, { status: 404 });
      }

      partnerEmail = pRow.contact_email;
      partnerBusinessName = pRow.business_name;

      const { data: uRow } = await supabase.from("users").select("*").eq("partner_id", partnerId).maybeSingle();
      clerkUserId = uRow?.clerk_user_id || "";

      if (action === "SUSPEND") {
        await supabase.from("partners").update({ status: "SUSPENDED" }).eq("id", partnerId);
        await supabase.from("users").update({ status: "SUSPENDED" }).eq("partner_id", partnerId);
      } else if (action === "ACTIVATE") {
        await supabase.from("partners").update({ status: "ACTIVE" }).eq("id", partnerId);
        await supabase.from("users").update({ status: "ACTIVE" }).eq("partner_id", partnerId);
      } else if (action === "ARCHIVE") {
        await supabase.from("partners").update({ status: "ARCHIVED" }).eq("id", partnerId);
        await supabase.from("users").update({ status: "SUSPENDED" }).eq("partner_id", partnerId);
      }
    } else {
      const partner = db.partners.find(p => p.id === partnerId);
      if (!partner) {
        return NextResponse.json({ success: false, error: `Partner with ID ${partnerId} not found.` }, { status: 404 });
      }
      partnerEmail = partner.email;
      partnerBusinessName = partner.businessName;
      const user = db.users.find(u => u.partnerId === partnerId || u.email.toLowerCase() === partner.email.toLowerCase());
      clerkUserId = user?.clerkUserId || "";

      if (action === "SUSPEND") {
        partner.status = "SUSPENDED";
        if (user) user.status = "SUSPENDED";
      } else if (action === "ACTIVATE") {
        partner.status = "ACTIVE";
        if (user) user.status = "ACTIVE";
      } else if (action === "ARCHIVE") {
        partner.status = "ARCHIVED";
        if (user) user.status = "SUSPENDED";
      }
    }

    if (action === "RESEND_INVITE") {
      // Create fresh invitation via Clerk
      const clerkRes = await createClerkPartnerInvitation(partnerEmail, partnerId, `user-partner-${partnerId}`, "PARTNER_OWNER");
      if (!clerkRes.success || !clerkRes.invitationId) {
        return NextResponse.json({ success: false, error: `Clerk resend failed: ${clerkRes.error}` }, { status: 502 });
      }

      db.addNotification("SUCCESS", `Fresh Clerk invitation issued to ${partnerEmail}. Invitation ID: ${clerkRes.invitationId}`);
      return NextResponse.json({ success: true, message: `Clerk invitation resent successfully to ${partnerEmail}.` });

    } else if (action === "RESET_PASSWORD") {
      db.addNotification("INFO", `Password reset request logged for ${partnerEmail}.`);
      return NextResponse.json({ success: true, message: `Password reset request logged for ${partnerEmail}.` });

    } else if (action === "SUSPEND") {
      // Disable login in Clerk if user has completed sign up
      if (clerkUserId && clerkUserId.startsWith("user_")) {
        await banClerkUser(clerkUserId);
      }

      db.addNotification("WARNING", `Access suspended for partner ${partnerBusinessName}.`);
      return NextResponse.json({ success: true, message: `Partner ${partnerBusinessName} suspended.` });

    } else if (action === "ACTIVATE") {
      // Unban in Clerk if user ID exists
      if (clerkUserId && clerkUserId.startsWith("user_")) {
        await unbanClerkUser(clerkUserId);
      }

      db.addNotification("SUCCESS", `Access reactivated for partner ${partnerBusinessName}.`);
      return NextResponse.json({ success: true, message: `Partner ${partnerBusinessName} reactivated.` });

    } else if (action === "ARCHIVE") {
      // Ban Clerk user if user ID exists
      if (clerkUserId && clerkUserId.startsWith("user_")) {
        await banClerkUser(clerkUserId);
      }

      db.addNotification("WARNING", `Partner ${partnerBusinessName} archived and access revoked in Clerk.`);
      return NextResponse.json({ success: true, message: `Partner ${partnerBusinessName} archived and access revoked.` });

    } else {
      return NextResponse.json({ success: false, error: `Invalid action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Action failed" }, { status: 500 });
  }
}
