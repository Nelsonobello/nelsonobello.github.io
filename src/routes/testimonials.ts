import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { uploadTestimonialImage, deleteTestimonialImage } from "../lib/supabase.js";

export const testimonialsRoutes = new Hono();

// ── PUBLIC ──────────────────────────────────────────────

// GET /testimonials — homepage, published only
testimonialsRoutes.get("/", async (c) => {
  const testimonials = await prisma.testimonial.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ testimonials });
});

// ── ADMIN ───────────────────────────────────────────────

const testimonialSchema = z.object({
  name: z.string().trim().min(1),
  company: z.string().trim().nullish().transform((v) => v || null),
  quote: z.string().trim().min(1),
  published: z.boolean().optional(),
});

// GET /testimonials/admin/all — includes unpublished, for the dashboard
testimonialsRoutes.get("/admin/all", requireAdmin, async (c) => {
  const testimonials = await prisma.testimonial.findMany({
    orderBy: { createdAt: "desc" },
  });
  return c.json({ testimonials });
});

// POST /testimonials — create
testimonialsRoutes.post("/", requireAdmin, async (c) => {
  const parsed = testimonialSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const testimonial = await prisma.testimonial.create({ data: parsed.data });
  return c.json({ testimonial }, 201);
});

// PATCH /testimonials/:id — edit text fields or show/hide
testimonialsRoutes.patch("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const parsed = testimonialSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const existing = await prisma.testimonial.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Testimonial not found" }, 404);

  const testimonial = await prisma.testimonial.update({
    where: { id },
    data: parsed.data,
  });
  return c.json({ testimonial });
});

// POST /testimonials/:id/image — upload or replace the photo (multipart, field "file")
testimonialsRoutes.post("/:id/image", requireAdmin, async (c) => {
  const id = c.req.param("id")!;

  const existing = await prisma.testimonial.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Testimonial not found" }, 404);

  const body = await c.req.parseBody();
  const file = body["file"];

  if (!(file instanceof File)) {
    return c.json({ error: "No file provided under the 'file' field" }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: "Photo must be an image file" }, 400);
  }

  const imageUrl = await uploadTestimonialImage(id, file);
  const testimonial = await prisma.testimonial.update({ where: { id }, data: { imageUrl } });

  // Remove the old photo only after the new one is saved
  await deleteTestimonialImage(existing.imageUrl);

  return c.json({ testimonial });
});

// DELETE /testimonials/:id — permanent delete, photo included
testimonialsRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id")!;

  const existing = await prisma.testimonial.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Testimonial not found" }, 404);

  await prisma.testimonial.delete({ where: { id } });
  await deleteTestimonialImage(existing.imageUrl);

  return c.json({ deleted: true });
});