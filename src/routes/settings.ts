import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/require-admin.js";

export const settingsRoutes = new Hono();

// GET /settings — public: powers the WhatsApp button, social icons, and
// the bank details shown at checkout
settingsRoutes.get("/", async (c) => {
  const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  return c.json({ settings });
});

const settingsSchema = z.object({
  bankName: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  whatsappNumber: z.string().optional(),
  facebookUrl: z.string().url().optional(),
  instagramUrl: z.string().url().optional(),
  twitterUrl: z.string().url().optional(),
  youtubeUrl: z.string().url().optional(),
});

// PATCH /settings — admin dashboard edits (upserts the single row)
settingsRoutes.patch("/", requireAdmin, async (c) => {
  const parsed = settingsSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const settings = await prisma.siteSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...parsed.data },
    update: parsed.data,
  });

  return c.json({ settings });
});
