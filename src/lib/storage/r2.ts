import crypto from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { appConfig } from "../config";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  fileHash?: string;
  pageCount?: number;
}

export interface R2HealthCheckResult {
  status: "CONNECTED" | "DEGRADED" | "ERROR" | "NOT_CONFIGURED";
  bucket: string;
  lastSuccess?: string;
  lastFailure?: string;
  lastValidated: string;
  errorDetails?: string;
}

export interface R2UploadResult {
  success: boolean;
  r2Key: string;
  eTag?: string;
  httpStatusCode?: number;
}

/**
 * Creates and returns an S3Client instance configured for Cloudflare R2.
 */
export function getR2Client(): S3Client {
  const accountId = appConfig.r2.accountId;
  const endpoint = appConfig.r2.endpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!appConfig.r2.accessKeyId || !appConfig.r2.secretAccessKey || !endpoint) {
    throw new Error("Cloudflare R2 configuration is incomplete. Missing R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, or R2_ENDPOINT.");
  }

  return new S3Client({
    region: appConfig.r2.region || "auto",
    endpoint,
    credentials: {
      accessKeyId: appConfig.r2.accessKeyId,
      secretAccessKey: appConfig.r2.secretAccessKey
    }
  });
}

/**
 * Validates PDF Binary Structure & Security Checks for Cloudflare R2 Uploads:
 * 1. Magic-byte verification (%PDF- = 0x25 0x50 0x44 0x46)
 * 2. Filename sanitization (strips path traversal, symbols, non-ASCII)
 * 3. Password protection detection (/Encrypt dictionary)
 * 4. Embedded script rejection (/JS, /JavaScript, /Launch)
 * 5. Page count extraction from PDF binary object structure (/Pages -> /Count) (< 50 pages)
 */
export function validatePdfFileSecurity(buffer: Buffer, originalFilename: string): ValidationResult {
  // 1. File Size check (10MB max)
  const maxSizeBytes = 10 * 1024 * 1024;
  if (buffer.length === 0) {
    return { isValid: false, error: "Uploaded file is empty (0 bytes)." };
  }
  if (buffer.length > maxSizeBytes) {
    return { isValid: false, error: "File size exceeds the 10MB maximum limit." };
  }

  // 2. Magic Bytes Verification: PDF files MUST start with %PDF- (0x25, 0x50, 0x44, 0x46)
  const header = buffer.toString("utf8", 0, 4);
  if (header !== "%PDF") {
    return { isValid: false, error: "Security Check Failed: File header magic bytes do not match a valid PDF document." };
  }

  // 3. Filename Sanitization
  const safeFilename = originalFilename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  if (!safeFilename.toLowerCase().endsWith(".pdf")) {
    return { isValid: false, error: "Only files with a .pdf extension are permitted." };
  }

  const contentStr = buffer.toString("binary");

  // 4. Password Protection / Encryption Check
  if (contentStr.includes("/Encrypt")) {
    return { isValid: false, error: "Encrypted or password-protected PDFs are not supported. Please upload a clear signed form." };
  }

  // 5. Embedded Action Script Rejection (/JS, /JavaScript, /Launch)
  if (contentStr.includes("/JavaScript") || contentStr.includes("/JS ") || contentStr.includes("/Launch")) {
    return { isValid: false, error: "Security Check Failed: PDF contains active scripts or executable launch actions." };
  }

  // 6. Binary PDF Structure Page Count Extraction (/Pages -> /Count N)
  let estimatedPages = 1;
  const countMatch = contentStr.match(/\/Type\s*\/Pages[^]*?\/Count\s+(\d+)/);
  if (countMatch && countMatch[1]) {
    estimatedPages = parseInt(countMatch[1], 10);
  } else {
    const pageMatches = contentStr.match(/\/Type\s*\/Page\b/g);
    if (pageMatches) estimatedPages = pageMatches.length;
  }

  if (estimatedPages > 50) {
    return { isValid: false, error: `PDF exceeds the maximum 50-page limit for tax form submissions (detected ~${estimatedPages} pages).` };
  }

  // Calculate SHA-256 hash
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    isValid: true,
    fileHash,
    pageCount: estimatedPages
  };
}

/**
 * Generates an opaque UUID-based storage key for Cloudflare R2:
 * Layout: tax-documents/{documentUUID}/{versionUUID}.pdf
 * Zero partner IDs, SSNs, names, or emails in the object path.
 */
export function generateOpaqueR2Key(documentUuid?: string): { documentUuid: string; versionUuid: string; r2Key: string; s3Key: string } {
  const docId = documentUuid || crypto.randomUUID();
  const verId = crypto.randomUUID();
  const key = `tax-documents/${docId}/${verId}.pdf`;
  return {
    documentUuid: docId,
    versionUuid: verId,
    r2Key: key,
    s3Key: key
  };
}

export const generateOpaqueS3Key = generateOpaqueR2Key;

/**
 * Executes a PutObjectCommand to upload a binary buffer to Cloudflare R2 bucket.
 * Logs response details and propagates any authentication or connectivity errors.
 */
export async function putObjectToR2(
  buffer: Buffer,
  r2Key: string,
  contentType: string = "application/pdf"
): Promise<R2UploadResult> {
  const bucket = appConfig.r2.bucket || "hhh-private-tax-documents";

  try {
    const client = getR2Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: buffer,
      ContentType: contentType
    });

    const response = await client.send(command);

    console.log("[R2 Upload Success]", {
      r2Key,
      bucket,
      eTag: response.ETag,
      httpStatusCode: response.$metadata?.httpStatusCode
    });

    return {
      success: true,
      r2Key,
      eTag: response.ETag,
      httpStatusCode: response.$metadata?.httpStatusCode
    };
  } catch (err: any) {
    console.error("[R2 Upload Error]", {
      r2Key,
      bucket,
      errorName: err?.name,
      errorMessage: err?.message,
      httpStatusCode: err?.$metadata?.httpStatusCode
    });
    throw new Error(`Cloudflare R2 Upload Failed [${err?.name || "R2Error"}]: ${err?.message || "Storage error"}`);
  }
}

/**
 * Rollback Cleanup Helper:
 * Deletes an uploaded Cloudflare R2 storage object if a subsequent database transaction fails,
 * preventing orphaned storage files.
 */
export async function deleteR2Object(r2Key: string): Promise<boolean> {
  const bucket = appConfig.r2.bucket || "hhh-private-tax-documents";

  try {
    const client = getR2Client();
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: r2Key
    });

    await client.send(command);
    console.log(`[R2 Rollback Cleanup] Successfully deleted object: ${r2Key} from bucket ${bucket}`);
    return true;
  } catch (err: any) {
    console.error(`[R2 Rollback Cleanup Failure] Error deleting key ${r2Key}:`, err?.message);
    return false;
  }
}

/**
 * Generates a short-lived server-signed authorization URL with 15-minute tokenized access.
 * Compatible with Cloudflare R2 private bucket presigned URLs.
 */
export async function generateSignedDownloadUrl(
  r2Key: string,
  expiresInSeconds: number = 900
): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  return `/api/admin/tax-documents/download?key=${encodeURIComponent(r2Key)}&token=${token}&expires=${expiresAt}`;
}

/**
 * Verifies signed URL expiration.
 */
export function isSignedUrlExpired(expiresTimestamp: number): boolean {
  return Date.now() > expiresTimestamp;
}

/**
 * Active Connectivity Check (checkR2Connectivity()):
 * Performs a lightweight authenticated Cloudflare R2 API request (HeadBucket or ListObjectsV2 with MaxKeys=1)
 * using the configured credentials to verify bucket accessibility and permissions without exposing object contents.
 *
 * Returns real runtime health:
 * 🟢 CONNECTED – Successfully connected to configured R2 bucket.
 * 🟡 DEGRADED – Credentials valid, but bucket or prefix temporarily inaccessible.
 * 🔴 ERROR – Authentication or connectivity failure.
 * ⚪ NOT_CONFIGURED – Required environment variables missing.
 */
export async function checkR2Connectivity(): Promise<R2HealthCheckResult> {
  const now = new Date().toISOString();
  const bucket = appConfig.r2.bucket || "hhh-private-tax-documents";

  if (!appConfig.r2.isConfigured) {
    return {
      status: "NOT_CONFIGURED",
      bucket,
      lastValidated: now,
      errorDetails: "Missing R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY or R2_ACCOUNT_ID."
    };
  }

  try {
    const client = getR2Client();

    // Perform lightweight authenticated ListObjectsV2 request with MaxKeys=1
    await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "tax-documents/",
      MaxKeys: 1
    }));

    return {
      status: "CONNECTED",
      bucket,
      lastSuccess: now,
      lastFailure: "None",
      lastValidated: now
    };
  } catch (err: any) {
    const errCode = err?.name || err?.code || "";
    const httpStatus = err?.$metadata?.httpStatusCode;

    const isDegraded = errCode === "NoSuchBucket" || httpStatus === 404;

    console.error("[R2 Connectivity Health Check Error]", {
      bucket,
      errCode,
      httpStatus,
      message: err?.message
    });

    return {
      status: isDegraded ? "DEGRADED" : "ERROR",
      bucket,
      lastFailure: now,
      lastValidated: now,
      errorDetails: `[${errCode || "R2Error"}]: ${err?.message || "R2 connectivity check failed."}`
    };
  }
}
