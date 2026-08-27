import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/require-admin.js";

export const inquiriesRoutes = new Hono();

const inquirySchema = z.object({
  type: z.enum(["PUBLISHING_SERVICES", "COACHING_CONSULTING", "GENERAL_CONTACT"]),
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(1),
});

// POST /inquiries — used by the Publishing Services, Coaching & Consulting,
// and Connect With Me / Contact forms
inquiriesRoutes.post("/", async (c) => {
  const parsed = inquirySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const inquiry = await prisma.inquiry.create({ data: parsed.data });
  return c.json({ inquiry }, 201);
});

// GET /inquiries — admin dashboard inbox
inquiriesRoutes.get("/", requireAdmin, async (c) => {
  const inquiries = await prisma.inquiry.findMany({ orderBy: { createdAt: "desc" } });
  return c.json({ inquiries });
});

inquiriesRoutes.patch("/:id/handled", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const inquiry = await prisma.inquiry.update({ where: { id }, data: { handled: true } });
  return c.json({ inquiry });
});
