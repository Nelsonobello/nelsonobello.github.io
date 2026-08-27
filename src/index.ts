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

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    // Replace with the real frontend domain(s) before going live —
    // "*" is fine for local development only.
    origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : "*",
  })
);

app.get("/", (c) => c.json({ status: "ok", service: "nelbell-backend" }));

app.route("/admin", adminRoutes);
app.route("/books", booksRoutes);
app.route("/orders", ordersRoutes);
app.route("/cbt", cbtRoutes);
app.route("/inquiries", inquiriesRoutes);
app.route("/settings", settingsRoutes);

const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`nelbell-backend listening on http://localhost:${info.port}`);
});
