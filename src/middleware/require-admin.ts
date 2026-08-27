import type { Next } from "hono";
import { verifyAdminToken } from "../lib/jwt.js";
import type { AppContext } from "../types.js";

/**
 * Protects dashboard-only routes (managing books, viewing orders, etc.).
 * Expects "Authorization: Bearer <token>" set after a successful
 * POST /admin/login.
 */
export async function requireAdmin(c: AppContext, next: Next) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  try {
    const payload = verifyAdminToken(token);
    c.set("adminId", payload.adminId);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired session" }, 401);
  }
}
