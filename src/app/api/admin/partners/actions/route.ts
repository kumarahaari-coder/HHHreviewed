import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { sendTransactionalEmail } from "@/lib/email/brevo";

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

    if (action === "RESEND_INVITE") {
      partner.status = "INVITED";
      const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || "https://hiddenhoneyhomes.com"}/sign-in?invite=${user?.clerkUserId || partnerId}`;

      await sendTransactionalEmail({
        eventType: "WELCOME",
        recipientEmail: partner.email,
        recipientName: partner.contactName,
        params: {
          partnerName: partner.contactName,
          businessName: partner.businessName,
          inviteLink,
          actionNotice: "Invitation Resent by Administrator"
        }
      });

      db.addNotification("SUCCESS", `Invitation email resent to ${partner.email}.`);
      return NextResponse.json({ success: true, message: `Invitation resent successfully to ${partner.email}.` });

    } else if (action === "RESET_PASSWORD") {
      await sendTransactionalEmail({
        eventType: "WELCOME",
        recipientEmail: partner.email,
        recipientName: partner.contactName,
        params: {
          partnerName: partner.contactName,
          businessName: partner.businessName,
          resetNotice: "Password Reset Request from Administrator"
        }
      });

      db.addNotification("INFO", `Password reset email issued for ${partner.email}.`);
      return NextResponse.json({ success: true, message: `Password reset email sent to ${partner.email}.` });

    } else if (action === "SUSPEND") {
      partner.status = "SUSPENDED";
      if (user) user.status = "SUSPENDED";
      db.addNotification("WARNING", `Access suspended for partner ${partner.businessName}.`);
      return NextResponse.json({ success: true, message: `Partner ${partner.businessName} suspended.` });

    } else if (action === "ACTIVATE") {
      partner.status = "ACTIVE";
      if (user) user.status = "ACTIVE";
      db.addNotification("SUCCESS", `Access activated for partner ${partner.businessName}.`);
      return NextResponse.json({ success: true, message: `Partner ${partner.businessName} activated.` });

    } else if (action === "ARCHIVE") {
      partner.status = "ARCHIVED";
      if (user) user.status = "SUSPENDED";
      db.addNotification("WARNING", `Partner ${partner.businessName} archived.`);
      return NextResponse.json({ success: true, message: `Partner ${partner.businessName} archived.` });

    } else {
      return NextResponse.json({ success: false, error: `Invalid action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Action failed" }, { status: 500 });
  }
}
