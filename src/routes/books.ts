import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { uploadCoverImage, uploadEbookFile } from "../lib/supabase.js";
export const booksRoutes = new Hono();

// ── SLUG HELPERS ────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "book";
  let slug = base;
  let suffix = 2;

  while (await prisma.book.findUnique({ where: { slug } })) {
    slug = `${base}-${suffix}`;
    suffix++;
  }

  return slug;
}

// ── PUBLIC ──────────────────────────────────────────────

// GET /books — storefront catalog, active books only
booksRoutes.get("/", async (c) => {
  const books = await prisma.book.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ books });
});

// GET /books/:slug — single book detail page
booksRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const book = await prisma.book.findUnique({ where: { slug } });

  if (!book || book.status !== "ACTIVE") {
    return c.json({ error: "Book not found" }, 404);
  }

  // Never expose the storage path for the ebook file publicly —
  // it only becomes a real, temporary link after payment is verified.
  const { ebookFileUrl, ...publicBook } = book;
  return c.json({ book: publicBook });
});




// ── ADMIN ───────────────────────────────────────────────

const bookInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  author: z.string().optional(),
  subtitle: z.string().optional(),
  format: z.enum(["EBOOK", "PHYSICAL"]),
  priceKobo: z.number().int().positive(),
  coverImageUrl: z.string().url().optional(),
  ebookFileUrl: z.string().optional(), // storage path, e.g. "my-book.pdf"
  stockCount: z.number().int().nonnegative().optional(),
});

// GET /books/admin/all — includes deactivated books, for the dashboard
booksRoutes.get("/admin/all", requireAdmin, async (c) => {
  const books = await prisma.book.findMany({ orderBy: { createdAt: "desc" } });
  return c.json({ books });
});

// GET /books/admin/:id — single book by id, for the edit form (any status)
booksRoutes.get("/admin/:id", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const book = await prisma.book.findUnique({ where: { id } });

  if (!book) {
    return c.json({ error: "Book not found" }, 404);
  }

  return c.json({ book });
});


// POST /books — create a new book
booksRoutes.post("admin/createbook", requireAdmin, async (c) => {
  const parsed = bookInputSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const slug = await generateUniqueSlug(parsed.data.title);

  const book = await prisma.book.create({
    data: { ...parsed.data, slug },
  });
  return c.json({ book }, 201);
});

// PATCH /books/:id — edit price, description, cover, etc.
// Note: slug is never regenerated here, even if title changes —
// it's fixed at creation so published book URLs never break.
booksRoutes.patch("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const parsed = bookInputSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const book = await prisma.book.update({
    where: { id },
    data: parsed.data,
  });
  return c.json({ book });
});

// PATCH /books/:id/deactivate — soft-delete, matches the agreement's
// "remove or deactivate products" requirement without losing order history
booksRoutes.patch("/:id/deactivate", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const book = await prisma.book.update({
    where: { id },
    data: { status: "DEACTIVATED" },
  });
  return c.json({ book });
});


booksRoutes.patch("/:id/activate", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const book = await prisma.book.update({
    where: { id },
    data: { status: "ACTIVE" },
  });
  return c.json({ book });
});


// POST /books/:id/cover — admin uploads a cover image (multipart/form-data, field "file")
booksRoutes.post("/:id/cover", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!(file instanceof File)) {
    return c.json({ error: "No file provided under the 'file' field" }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: "Cover must be an image file" }, 400);
  }

  const coverImageUrl = await uploadCoverImage(id, file);
  const book = await prisma.book.update({ where: { id }, data: { coverImageUrl } });
  return c.json({ book });
});



// POST /books/:id/ebook — admin uploads the ebook PDF (multipart/form-data, field "file")
booksRoutes.post("/:id/ebook", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!(file instanceof File)) {
    return c.json({ error: "No file provided under the 'file' field" }, 400);
  }
  if (file.type !== "application/pdf") {
    return c.json({ error: "Ebook file must be a PDF" }, 400);
  }

  const ebookFileUrl = await uploadEbookFile(id, file);
  const book = await prisma.book.update({ where: { id }, data: { ebookFileUrl } });
  return c.json({ book });
});