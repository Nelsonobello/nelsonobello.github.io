import crypto from "node:crypto";

/**
 * Paystack signs every webhook body with your secret key (HMAC SHA512).
 * Always verify this before trusting a webhook payload — anyone can
 * POST to a public webhook URL, so the signature is what proves the
 * request actually came from Paystack.
 */
export function isValidPaystackSignature(
  rawBody: string,
  signatureHeader: string | undefined
): boolean {
  if (!signatureHeader) return false;

  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(rawBody)
    .digest("hex");

  return hash === signatureHeader;
}
