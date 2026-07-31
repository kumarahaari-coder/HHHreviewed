import { appConfig } from "../config";
import { db } from "../db/mockDb";

export type BrevoEventType =
  | "WELCOME"
  | "CREATOR_ONBOARDING_REMINDER"
  | "TAX_DOC_SUBMITTED"
  | "TAX_DOC_APPROVED"
  | "TAX_DOC_REJECTED"
  | "TAX_DOC_REPLACEMENT_REQUESTED"
  | "PAYMENT_CONFIRMATION"
  | "PAYMENT_FAILURE"
  | "ADMIN_INTEGRATION_ALERT";

export interface SendEmailOptions {
  eventType: BrevoEventType;
  recipientEmail: string;
  recipientName: string;
  params?: Record<string, any>;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Reusable Brevo API Service Layer
 * Sends transactional email using stable internal event names mapped to externalized Brevo template IDs.
 * Enforces duplicate email prevention (idempotency), provider message ID logging, and development recipient overrides.
 */
export async function sendTransactionalEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { eventType, recipientEmail, recipientName, params, idempotencyKey } = options;

  // 1. Idempotency Check
  const key = idempotencyKey || `email_${eventType}_${recipientEmail}_${JSON.stringify(params || {})}`;
  if (db.isIdempotentEvent("BREVO", key)) {
    return { success: true, skipped: true, messageId: `skipped_duplicate_${key}` };
  }

  // 2. Resolve Recipient (Dev Override Check)
  const finalRecipient = appConfig.brevo.devRecipientOverride || recipientEmail;

  // 3. Resolve Template ID
  let templateId: number | undefined;
  switch (eventType) {
    case "WELCOME":
      templateId = appConfig.brevo.templates.welcome ? parseInt(appConfig.brevo.templates.welcome, 10) : undefined;
      break;
    case "TAX_DOC_SUBMITTED":
      templateId = appConfig.brevo.templates.taxSubmitted ? parseInt(appConfig.brevo.templates.taxSubmitted, 10) : undefined;
      break;
    case "TAX_DOC_APPROVED":
      templateId = appConfig.brevo.templates.taxApproved ? parseInt(appConfig.brevo.templates.taxApproved, 10) : undefined;
      break;
    case "TAX_DOC_REJECTED":
      templateId = appConfig.brevo.templates.taxRejected ? parseInt(appConfig.brevo.templates.taxRejected, 10) : undefined;
      break;
    case "TAX_DOC_REPLACEMENT_REQUESTED":
      templateId = appConfig.brevo.templates.taxReplacementReq ? parseInt(appConfig.brevo.templates.taxReplacementReq, 10) : undefined;
      break;
    default:
      templateId = undefined;
  }

  // 4. API Request Payload (NEVER attach tax documents!)
  const payload = {
    to: [{ email: finalRecipient, name: recipientName }],
    sender: {
      email: appConfig.brevo.senderEmail || "noreply@hiddenhoneyhomes.com",
      name: appConfig.brevo.senderName || "Hidden Honey Homes"
    },
    ...(templateId ? { templateId } : {
      subject: `[HHH Notice] ${eventType.replace(/_/g, " ")}`,
      htmlContent: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4a154b;">Hidden Honey Homes Notification</h2>
          <p>Hello ${recipientName},</p>
          <p>This is an automated notification regarding event: <strong>${eventType}</strong>.</p>
          <p>Please log in to your authenticated dashboard to view details and action items.</p>
          <p><a href="https://hiddenhoneyhomes.com/login" style="color: #4a154b; font-weight: bold;">Log In to Dashboard</a></p>
        </div>
      `
    }),
    params: {
      ...params,
      dashboardUrl: "https://hiddenhoneyhomes.com/login"
    }
  };

  try {
    if (!appConfig.brevo.apiKey) {
      // Dev mode simulate log
      const mockMsgId = `mock_brevo_msg_${Date.now()}`;
      db.recordIdempotency("BREVO", key, eventType, "PROCESSED");
      return { success: true, messageId: mockMsgId };
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": appConfig.brevo.apiKey
      },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();
    if (response.ok && resData.messageId) {
      db.recordIdempotency("BREVO", key, eventType, "PROCESSED");
      return { success: true, messageId: resData.messageId };
    } else {
      db.recordIdempotency("BREVO", key, eventType, "FAILED");
      return { success: false, error: resData.message || "Brevo API delivery error" };
    }
  } catch (err: any) {
    db.recordIdempotency("BREVO", key, eventType, "FAILED");
    return { success: false, error: err?.message || "Brevo email network error" };
  }
}
