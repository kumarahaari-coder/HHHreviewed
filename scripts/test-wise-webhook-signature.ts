/**
 * Self-test for webhook signature verification, no network or Wise account needed.
 * Run: npx tsx scripts/test-wise-webhook-signature.ts
 * Generates a throwaway RSA key pair, signs a sample event the way Wise does (RSA-SHA256, base64 of the raw
 * body), and checks that verifyWiseSignature accepts it and rejects tampering, a wrong key, and a missing key.
 */

import { createSign, generateKeyPairSync } from "crypto";
import { verifyWiseSignature } from "../src/lib/wise/webhook";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok: ${msg}`);
}

const sign = (priv: string, body: string) => createSign("RSA-SHA256").update(body).sign(priv, "base64");
const pair = () => generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

const a = pair();
const b = pair();
const body = JSON.stringify({
  data: { resource: { id: 1, profile_id: 2, type: "transfer" }, current_state: "outgoing_payment_sent", previous_state: "funds_converted" },
  subscription_id: "x",
  event_type: "transfers#state-change",
  schema_version: "2.0.0",
});

process.env.WISE_WEBHOOK_PUBLIC_KEY = a.publicKey;
assert(verifyWiseSignature(body, sign(a.privateKey, body)), "valid signature accepted");
assert(!verifyWiseSignature(body + " ", sign(a.privateKey, body)), "tampered body rejected");
assert(!verifyWiseSignature(body, sign(b.privateKey, body)), "signature from another key rejected");
assert(!verifyWiseSignature(body, null), "missing signature rejected");
process.env.WISE_WEBHOOK_PUBLIC_KEY = a.publicKey.replace(/\n/g, "\\n");
assert(verifyWiseSignature(body, sign(a.privateKey, body)), "key with escaped \\n (env style) accepted");
delete process.env.WISE_WEBHOOK_PUBLIC_KEY;
assert(!verifyWiseSignature(body, sign(a.privateKey, body)), "fails closed when no public key is configured");
console.log("All webhook signature checks passed.");
