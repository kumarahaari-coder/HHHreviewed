const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

export function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Hidden Honey Homes";

  if (!apiKey || !senderEmail) {
    if (process.env.NODE_ENV === "production") {
      console.error("[Email] BREVO_API_KEY / BREVO_SENDER_EMAIL not configured; email not sent.");
      return { success: false, error: "Email service is not configured." };
    }
    console.log(`[Email Dev] Brevo not configured. Would send to ${params.to}: "${params.subject}"\n${params.text}`);
    return { success: true };
  }

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
        textContent: params.text
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Email] Brevo rejected message (${res.status}): ${body.slice(0, 300)}`);
      return { success: false, error: `Email provider error (${res.status}).` };
    }
    return { success: true };
  } catch (err) {
    console.error("[Email] Failed to reach Brevo:", err);
    return { success: false, error: "Could not reach the email provider." };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function layout(heading: string, intro: string, buttonLabel: string, url: string, footnote: string): string {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f7;padding:32px 16px;"><tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e8e8ed;">
    <tr><td style="padding:28px 32px 0 32px;font-size:14px;font-weight:600;color:#1d1d1f;">
      <span style="display:inline-block;width:10px;height:10px;background:#b7791f;border-radius:3px;margin-right:8px;"></span>Hidden Honey Homes
    </td></tr>
    <tr><td style="padding:20px 32px 0 32px;font-size:22px;font-weight:600;color:#1d1d1f;letter-spacing:-0.01em;">${escapeHtml(heading)}</td></tr>
    <tr><td style="padding:12px 32px 0 32px;font-size:14px;line-height:1.6;color:#6e6e73;">${escapeHtml(intro)}</td></tr>
    <tr><td style="padding:24px 32px;"><a href="${safeUrl}" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;">${escapeHtml(buttonLabel)}</a></td></tr>
    <tr><td style="padding:0 32px 8px 32px;font-size:12px;line-height:1.5;color:#86868b;">If the button doesn't work, copy this link into your browser:<br><a href="${safeUrl}" style="color:#b7791f;word-break:break-all;">${safeUrl}</a></td></tr>
    <tr><td style="padding:16px 32px 28px 32px;font-size:12px;line-height:1.5;color:#86868b;">${escapeHtml(footnote)}</td></tr>
  </table>
</td></tr></table></body></html>`;
}

export async function sendInvitationEmail(to: string, businessName: string, token: string): Promise<SendEmailResult> {
  const url = `${getAppBaseUrl()}/accept-invitation?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: "You're invited to the Hidden Honey Homes partner portal",
    html: layout(
      "Set up your partner account",
      `You've been invited to join the Hidden Honey Homes partner portal${businessName ? ` as ${businessName}` : ""}. Create your password to get started.`,
      "Set up my account",
      url,
      "This link expires in 7 days and can be used once. If you weren't expecting this invitation, you can ignore this email."
    ),
    text: `You've been invited to the Hidden Honey Homes partner portal. Set up your account: ${url}\n\nThis link expires in 7 days.`
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<SendEmailResult> {
  const url = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to,
    subject: "Reset your Hidden Honey Homes password",
    html: layout(
      "Reset your password",
      "We received a request to reset the password for your account. Choose a new one using the button below.",
      "Reset password",
      url,
      "This link expires in 1 hour and can be used once. If you didn't request this, you can safely ignore this email — your password won't change."
    ),
    text: `Reset your Hidden Honey Homes password: ${url}\n\nThis link expires in 1 hour. If you didn't request it, ignore this email.`
  });
}
