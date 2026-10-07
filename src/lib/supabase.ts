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

/**
 * Removes a deleted book's cover and ebook files from Storage.
 * Best-effort: failures are logged but never block the delete.
 */
export async function deleteBookFiles(
  coverImageUrl: string | null,
  ebookFileUrl: string | null
) {
  if (coverImageUrl) {
    const coverPath = decodeURIComponent(
      coverImageUrl.split("?")[0].split("/").pop() || ""
    );
    if (coverPath) {
      const { error } = await supabase.storage.from(COVERS_BUCKET).remove([coverPath]);
      if (error) console.error("Failed to delete cover file:", error.message);
    }
  }

  if (ebookFileUrl) {
    const { error } = await supabase.storage.from(EBOOKS_BUCKET).remove([ebookFileUrl]);
    if (error) console.error("Failed to delete ebook file:", error.message);
  }
}

/**
 * Uploads a testimonial photo to the public "covers" bucket, inside a
 * "testimonials/" folder, and returns its public URL.
 */
export async function uploadTestimonialImage(testimonialId: string, file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `testimonials/${testimonialId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(COVERS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    throw new Error(`Testimonial image upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Removes a testimonial photo from Storage. Best-effort, never throws. */
export async function deleteTestimonialImage(imageUrl: string | null) {
  if (!imageUrl) return;
  const marker = `/object/public/${COVERS_BUCKET}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return;

  const path = decodeURIComponent(imageUrl.slice(idx + marker.length).split("?")[0]);
  const { error } = await supabase.storage.from(COVERS_BUCKET).remove([path]);
  if (error) console.error("Failed to delete testimonial image:", error.message);
}

const QUESTIONS_BUCKET = process.env.SUPABASE_QUESTIONS_BUCKET || "cbt-question-images";

/**
 * Uploads a CBT question image to the public "cbt-question-images" bucket
 * and returns its public URL — saved directly onto CBTQuestion.imageUrl.
 */
export async function uploadQuestionImage(questionId: string, file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${questionId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(QUESTIONS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    throw new Error(`Question image upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(QUESTIONS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}