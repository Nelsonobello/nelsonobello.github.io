// backend: src/index.ts

import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { adminRoutes } from "./routes/admin.js";
import { booksRoutes } from "./routes/books.js";
import { ordersRoutes } from "./routes/orders.js";
import { cbtRoutes } from "./routes/cbt.js";
import { inquiriesRoutes } from "./routes/inquiries.js";
import { settingsRoutes } from "./routes/settings.js";
import { dashboardRoutes } from "./routes/dashboardstats.js";
// ...

// ✅ Create main app
const app = new Hono();

// ✅ Middleware on main app (applies to ALL routes)
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : "*",
  })
);

// ✅ Health check on main app (no version)
app.get("/", (c) => c.json({ status: "ok", service: "nelbell-backend" }));

// ✅ API info endpoint
app.get("/api", (c) => c.json({
  version: "1.0.0",
  endpoints: {
    admin: "/api/v1/admin",
    books: "/api/v1/books",
    orders: "/api/v1/orders",
    cbt: "/api/v1/cbt",
    inquiries: "/api/v1/inquiries",
    settings: "/api/v1/settings",
    dashboard: "/api/v1/dashboard"
  }
}));

// ✅ Create API v1 group
const apiV1 = new Hono();

// ✅ Mount routes under apiV1
apiV1.route("/admin", adminRoutes);
apiV1.route("/books", booksRoutes);
apiV1.route("/orders", ordersRoutes);
apiV1.route("/cbt", cbtRoutes);
apiV1.route("/inquiries", inquiriesRoutes);
apiV1.route("/settings", settingsRoutes);
apiV1.route("/dashboard", dashboardRoutes);

// ✅ Mount apiV1 under /api/v1 on main app
app.route("/api/v1", apiV1);


const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`nelbell-backend listening on http://localhost:${info.port}`);
  console.log(`📚 API v1: http://localhost:${info.port}/api/v1`);
  console.log(`ℹ️  Info: http://localhost:${info.port}/api`);
});