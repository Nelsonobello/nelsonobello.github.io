import { createClient } from "@supabase/supabase-js";

// Service-role client — full access to Storage, used server-side only.
// Never send SUPABASE_SERVICE_ROLE_KEY to any frontend.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EBOOKS_BUCKET = process.env.SUPABASE_EBOOKS_BUCKET || "ebooks";

/**
 * Generates a time-limited signed URL for a private ebook file.
 * `filePath` is the path stored on Book.ebookFileUrl, e.g. "my-book.pdf".
 * `expiresInSeconds` defaults to 48 hours.
 */
export async function createEbookSignedUrl(
  filePath: string,
  expiresInSeconds = 60 * 60 * 48
) {
  const { data, error } = await supabase.storage
    .from(EBOOKS_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Failed to create signed URL: ${error?.message}`);
  }

  return {
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}
