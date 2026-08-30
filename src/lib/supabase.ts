import { createClient } from "@supabase/supabase-js";

// Service-role client — full access to Storage, used server-side only.
// Never send SUPABASE_SERVICE_ROLE_KEY to any frontend.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EBOOKS_BUCKET = process.env.SUPABASE_EBOOKS_BUCKET || "ebooks";
const COVERS_BUCKET = process.env.SUPABASE_COVERS_BUCKET || "covers";

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




/**
 * Uploads a book cover image to the public "covers" bucket and returns
 * its public URL — this is what gets saved directly onto Book.coverImageUrl.
 */
export async function uploadCoverImage(bookId: string, file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${bookId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(COVERS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    throw new Error(`Cover upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads an ebook PDF to the private "ebooks" bucket and returns the
 * storage path (not a public URL) — this is what gets saved onto
 * Book.ebookFileUrl. A real download link is only ever generated later,
 * on-demand, via createEbookSignedUrl.
 */
export async function uploadEbookFile(bookId: string, file: File) {
  const ext = file.name.split(".").pop() || "pdf";
  const path = `${bookId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(EBOOKS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    throw new Error(`Ebook upload failed: ${error.message}`);
  }

  return path;
}