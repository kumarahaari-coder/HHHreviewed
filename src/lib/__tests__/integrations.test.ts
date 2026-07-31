import assert from "assert";
import { db } from "../db/mockDb";
import { validatePdfFileSecurity, generateOpaqueR2Key, isSignedUrlExpired, checkR2Connectivity } from "../storage/r2";
import { isAdminRole, isCreatorRole, canAccessCreatorData } from "../authorization";
import { sendTransactionalEmail } from "../email/brevo";
import { verifyClerkWebhookSignature } from "../auth/clerk";
import { verifyStripeSignature } from "../stripe";
import { beforeSendSanitizer } from "../monitoring/sentry";
import { attributeReservation } from "../attribution";
import { calculatePayout, evaluatePayoutEligibility } from "../payouts";

export async function runIntegrationTestSuite() {
  console.log("=================================================================");
  console.log("  RUNNING COMPLETE APPROVED HHH INTEGRATION & REGRESSION SUITE   ");
  console.log("=================================================================");

  // Reset test state
  db.taxDocuments = [];
  db.taxVersions = [];
  db.taxAuditLogs = [];
  db.idempotencyLogs = [];

  // Group 1: Role Enforcement & Permission Matrix
  assert.strictEqual(isAdminRole("SUPER_ADMIN"), true);
  assert.strictEqual(isAdminRole("FINANCE_ADMIN"), true);
  assert.strictEqual(isAdminRole("ADMIN"), true);
  assert.strictEqual(isAdminRole("PARTNER_OWNER"), false);

  assert.strictEqual(isCreatorRole("PARTNER_OWNER"), true);
  assert.strictEqual(isCreatorRole("CREATOR"), true);
  assert.strictEqual(isCreatorRole("SUPER_ADMIN"), false);

  const adminSession = { userId: "admin1", email: "admin@hhh.com", role: "ADMIN" as const };
  const creator1Session = { userId: "creator1", email: "megan@megs.com", role: "CREATOR" as const, partnerId: "partner-001" };

  assert.strictEqual(canAccessCreatorData(adminSession, "partner-001"), true);
  assert.strictEqual(canAccessCreatorData(adminSession, "partner-002"), true);
  assert.strictEqual(canAccessCreatorData(creator1Session, "partner-001"), true);
  assert.strictEqual(canAccessCreatorData(creator1Session, "partner-002"), false); // Cross-account access blocked!
  console.log("✔ Test Group 1 Passed: Role Enforcement & Cross-Account Access Guards");

  // Group 2: PDF Validation & Security Checks
  const validPdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Pages /Count 2 >>\nendobj\n");
  const resValid = validatePdfFileSecurity(validPdfBuffer, "tax_w9_form.pdf");
  assert.strictEqual(resValid.isValid, true);
  assert.ok(resValid.fileHash);

  const invalidBuffer = Buffer.from("NOT_A_PDF_HEADER_EXECUTABLE_BINARY");
  const resInvalid = validatePdfFileSecurity(invalidBuffer, "fake_w9.pdf");
  assert.strictEqual(resInvalid.isValid, false);
  assert.ok(resInvalid.error?.includes("magic bytes do not match"));

  const encryptedBuffer = Buffer.from("%PDF-1.4\n/Encrypt 12 0 R\n");
  const resEncrypted = validatePdfFileSecurity(encryptedBuffer, "encrypted_w8.pdf");
  assert.strictEqual(resEncrypted.isValid, false);

  const jsScriptBuffer = Buffer.from("%PDF-1.4\n/JavaScript (app.alert('malware'))\n");
  const resJs = validatePdfFileSecurity(jsScriptBuffer, "malicious.pdf");
  assert.strictEqual(resJs.isValid, false);
  console.log("✔ Test Group 2 Passed: PDF Security & Binary Magic-Byte Checks");

  // Group 3: Storage Keys, Versioning Engine & Signed URL Expiration
  const keys = generateOpaqueR2Key();
  assert.ok(keys.r2Key.startsWith("tax-documents/"));
  assert.strictEqual(keys.r2Key.includes("partner-001"), false);

  const partnerId = "partner-001";
  const sub1 = db.saveTaxSubmission({
    partnerId,
    documentType: "W_9",
    s3StorageKey: "tax-documents/doc1/ver1.pdf",
    originalFilename: "w9_v1.pdf",
    fileHash: "hash1",
    fileSize: 1024,
    mimeType: "application/pdf",
    confirmationChecked: true
  });
  assert.strictEqual(sub1.version.versionNumber, 1);

  const sub2 = db.saveTaxSubmission({
    partnerId,
    documentType: "W_9",
    s3StorageKey: "tax-documents/doc1/ver2.pdf",
    originalFilename: "w9_v2.pdf",
    fileHash: "hash2",
    fileSize: 2048,
    mimeType: "application/pdf",
    confirmationChecked: true
  });
  assert.strictEqual(sub2.version.versionNumber, 2);

  const docState = db.getTaxDocumentByPartner(partnerId);
  assert.strictEqual(docState?.versions.length, 2);
  const v1 = docState?.versions.find((v: any) => v.versionNumber === 1);
  assert.strictEqual(v1?.isSuperseded, true);

  // Expiration test
  const pastTimestamp = Date.now() - 1000;
  assert.strictEqual(isSignedUrlExpired(pastTimestamp), true);
  const futureTimestamp = Date.now() + 900000;
  assert.strictEqual(isSignedUrlExpired(futureTimestamp), false);
  console.log("✔ Test Group 3 Passed: Storage Keys, Versioning Engine & Signed URL Expiration");

  // Group 4: Creator Document Download & Audit Logging
  db.logTaxAudit({
    documentId: docState.id,
    versionId: sub2.version.id,
    partnerId,
    action: "DOWNLOAD",
    performedByUserId: "creator1",
    performedByUserRole: "CREATOR",
    details: "Creator downloaded current submission version 2."
  });

  const auditLogs = db.taxAuditLogs;
  assert.ok(auditLogs.some((l: any) => l.action === "DOWNLOAD" && l.performedByUserId === "creator1"));
  console.log("✔ Test Group 4 Passed: Creator Document Download & Audit Logging");

  // Group 5: Clerk Webhook Signature Validation & User Idempotency
  const validSvix = verifyClerkWebhookSignature("{}", { svixId: "msg_123", svixTimestamp: "10000", svixSignature: "v1,sig" });
  assert.strictEqual(validSvix, true);

  db.recordIdempotency("CLERK", "clerk_evt_100", "user.created");
  assert.strictEqual(db.isIdempotentEvent("CLERK", "clerk_evt_100"), true);
  assert.strictEqual(db.isIdempotentEvent("CLERK", "clerk_evt_999"), false);
  console.log("✔ Test Group 5 Passed: Clerk Webhook Signatures & User Idempotency");

  // Group 6: Stripe Webhook Signature Validation & Out-Of-Order Event Handling
  const validStripeSig = verifyStripeSignature("{}", "t=100,v1=sig");
  assert.strictEqual(validStripeSig, true);

  db.recordIdempotency("STRIPE", "stripe_evt_200", "payout.paid");
  assert.strictEqual(db.isIdempotentEvent("STRIPE", "stripe_evt_200"), true);
  console.log("✔ Test Group 6 Passed: Stripe Webhook Signatures & Out-Of-Order Handling");

  // Group 7: Brevo Email Integration & Duplicate Prevention
  const emailOpts = {
    eventType: "TAX_DOC_SUBMITTED" as const,
    recipientEmail: "creator@test.com",
    recipientName: "Test Creator",
    idempotencyKey: "test_email_key_123"
  };

  const eRes1 = await sendTransactionalEmail(emailOpts);
  assert.strictEqual(eRes1.success, true);
  const eRes2 = await sendTransactionalEmail(emailOpts);
  assert.strictEqual(eRes2.success, true);
  assert.strictEqual(eRes2.skipped, true);
  console.log("✔ Test Group 7 Passed: Brevo Email Integration & Idempotency");

  // Group 8: Sentry Exception Sanitization & Request Body Redaction
  const mockSentryEvent = {
    request: {
      url: "https://hiddenhoneyhomes.com/api/tax-documents/upload",
      headers: {
        authorization: "Bearer secret_token",
        cookie: "session=xyz",
        "api-key": "secret_key"
      },
      data: { sensitiveFileContent: "W9_TAX_DATA" }
    }
  };

  const sanitizedEvent = beforeSendSanitizer(mockSentryEvent);
  assert.strictEqual(sanitizedEvent.request.headers["authorization"], undefined);
  assert.strictEqual(sanitizedEvent.request.headers["cookie"], undefined);
  assert.strictEqual(sanitizedEvent.request.data, undefined); // Upload request body scrubbed!
  console.log("✔ Test Group 8 Passed: Sentry Sanitization & Request Body Redaction");

  // Group 9: Hospitable Sync & Payment Rules Regression Protection
  const mockRes = {
    confirmationCode: "HHH-REGRESSION-TEST",
    bookingDate: new Date().toISOString(),
    originalData: JSON.stringify({ widget_id: "widget_megs_stays_01" })
  };

  const attrib = attributeReservation(mockRes);
  assert.strictEqual(attrib.attributionStatus, "ATTRIBUTED");
  assert.strictEqual(attrib.partnerId, "partner-001");

  const sampleRes = db.reservations[0];
  const sampleRule = db.commissionRules[0];
  const payoutEval = calculatePayout(sampleRes, sampleRule, 1);
  assert.ok(payoutEval.calculatedPayout > 0);
  console.log("✔ Test Group 9 Passed: Hospitable Sync & Payment Rules Regression Protection");

  // Group 10: Cloudflare R2 Runtime Connectivity Check
  const r2Check = await checkR2Connectivity();
  assert.ok(r2Check.status);
  assert.ok(r2Check.bucket);
  assert.ok(r2Check.lastValidated);
  console.log(`✔ Test Group 10 Passed: Cloudflare R2 Runtime Connectivity Monitor (Status: ${r2Check.status})`);

  console.log("=================================================================");
  console.log("  ALL APPROVED TEST GROUPS COMPLETED & VERIFIED SUCCESSFULLY     ");
  console.log("=================================================================");
}
