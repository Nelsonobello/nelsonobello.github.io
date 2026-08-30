// src/routes/dashboardstats.ts
import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/require-admin.js";

export const dashboardRoutes = new Hono();

// GET /dashboard/stats — admin dashboard summary cards
dashboardRoutes.get("/stats", requireAdmin, async (c) => {
  const [
    totalBooks,
    activeBooks,
    totalOrders,
    pendingOrders,
    revenueResult,
    totalInquiries,
    unhandledInquiries,
    totalCustomers,
  ] = await Promise.all([
    prisma.book.count(),
    prisma.book.count({ where: { status: "ACTIVE" } }),
    prisma.order.count(),
    prisma.order.count({ where: { status: "PENDING_PAYMENT" } }),
    prisma.order.aggregate({
      _sum: { totalKobo: true },
      where: { status: { in: ["PAID", "FULFILLED"] } },
    }),
    prisma.inquiry.count(),
    prisma.inquiry.count({ where: { handled: false } }),
    prisma.customer.count(),
  ]);

  return c.json({
    totalBooks,
    activeBooks,
    totalOrders,
    pendingOrders,
    totalRevenueKobo: revenueResult._sum.totalKobo ?? 0,
    totalInquiries,
    unhandledInquiries,
    totalCustomers,
  });
});