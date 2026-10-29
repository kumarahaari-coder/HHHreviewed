import { createPublicKey, createVerify } from "crypto";

/**
 * Verifies a Wise webhook: RSA-SHA256 signature of the raw body, sent in X-Signature-SHA256 (base64).
 * Fails closed: without WISE_WEBHOOK_PUBLIC_KEY (the PEM public key Wise publishes for your environment)
 * nothing is accepted.
 */
export function verifyWiseSignature(rawBody: string, signature: string | null): boolean {
  const pem = process.env.WISE_WEBHOOK_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
  if (!pem || !signature) return false;
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(rawBody);
    return verifier.verify(createPublicKey(pem), signature, "base64");
  } catch {
    return false;
  }
}
