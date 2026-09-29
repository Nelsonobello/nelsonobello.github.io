import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signAdminToken } from "../lib/jwt.js";
import { requireAdmin } from "../middleware/require-admin.js";
import type { Variables } from "../types.js";

export const adminRoutes = new Hono<{ Variables: Variables }>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /admin/login — the only auth endpoint that exists.
// There is deliberately no /admin/signup route: the single Admin row
// is created once via `npm run seed:admin`, not through the API.
adminRoutes.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Invalid email or password format" }, 400);
  }

  const { email, password } = parsed.data;

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const passwordMatches = await bcrypt.compare(password, admin.passwordHash);
  if (!passwordMatches) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = signAdminToken(admin.id);
  return c.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(6),
  name: z.string().optional(),
  secret: z.string(),
});

// TEMPORARY — remove this route after use.
adminRoutes.post("/reset-password", async (c) => {
  const parsed = resetPasswordSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const { email, newPassword, name, secret } = parsed.data;

  if (secret !== "put-any-random-string-here-just-for-now") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  const admin = await prisma.admin.upsert({
    where: { email },
    create: { email, passwordHash, name: name || "Admin" },
    update: { passwordHash },
  });

  return c.json({ message: `Admin ready: ${admin.email}`, id: admin.id });
});

// GET /admin/me — lets the dashboard confirm the current session and load
// the admin's name without re-sending the password.
adminRoutes.get("/me", requireAdmin, async (c) => {
  const adminId = c.get("adminId") as string;
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { id: true, name: true, email: true },
  });
  return c.json({ admin });
});
