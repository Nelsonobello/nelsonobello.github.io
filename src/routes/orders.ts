import { Hono } from "hono";
import { z } from "zod";
import type { Book } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { initializeTransaction, verifyTransaction } from "../lib/paystack.js";
import { isValidPaystackSignature } from "../lib/paystack-webhook.js";
import { fulfillOrder } from "../lib/fulfillment.js";

export const ordersRoutes = new Hono();

// ── CHECKOUT ────────────────────────────────────────────

const checkoutSchema = z.object({
  customer: z.object({
    fullName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(1),
    deliveryAddress: z.string().optional(), // required for physical books; checked below
  }),
  items: z
    .array(
      z.object({
        bookId: z.string(),
        quantity: z.number().int().positive().default(1),
      })
    )
    .min(1),
  paymentMethod: z.enum(["BANK_TRANSFER", "PAYSTACK"]),
});

// POST /orders/checkout
// Creates the Customer + Order + OrderItems, then either:
//   - BANK_TRANSFER: returns the site's bank details for the customer to pay into manually
//   - PAYSTACK: calls /transaction/initialize and returns the authorization_url to redirect to
ordersRoutes.post("/checkout", async (c) => {
  const parsed = checkoutSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const { customer, items, paymentMethod } = parsed.data;

  const books = await prisma.book.findMany({
    where: { id: { in: items.map((i) => i.bookId) }, status: "ACTIVE" },
  });

  if (books.length !== items.length) {
    return c.json({ error: "One or more books are unavailable" }, 400);
  }

  const requiresAddress = books.some((b: Book) => b.format === "PHYSICAL");
  if (requiresAddress && !customer.deliveryAddress) {
    return c.json(
      { error: "deliveryAddress is required when the order includes a physical book" },
      400
    );
  }

  const totalKobo = items.reduce((sum, item) => {
    const book = books.find((b: Book) => b.id === item.bookId)!;
    return sum + book.priceKobo * item.quantity;
  }, 0);

  const order = await prisma.order.create({
    data: {
      paymentMethod,
      totalKobo,
      customer: {
        create: {
          fullName: customer.fullName,
          email: customer.email,
          phone: customer.phone,
          deliveryAddress: customer.deliveryAddress,
        },
      },
      items: {
        create: items.map((item) => {
          const book = books.find((b: Book) => b.id === item.bookId)!;
          return {
            bookId: book.id,
            quantity: item.quantity,
            unitPriceKobo: book.priceKobo,
          };
        }),
      },
    },
    include: { items: true, customer: true },
  });

  if (paymentMethod === "BANK_TRANSFER") {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: "singleton" },
    });
    return c.json({
      order,
      bankDetails: settings
        ? {
            bankName: settings.bankName,
            accountName: settings.bankAccountName,
            accountNumber: settings.bankAccountNumber,
          }
        : null,
      instructions:
        "Transfer the total amount to the account above, then contact us with your order ID as reference so we can confirm and fulfil your order.",
    });
  }

  // PAYSTACK — initialize and hand back the redirect URL
  const paystackData = await initializeTransaction({
    email: customer.email,
    amountKobo: totalKobo,
    reference: order.id, // reuse our own order id as the Paystack reference
  });

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      paystackReference: paystackData.reference,
      paystackAuthUrl: paystackData.authorization_url,
    },
  });

  return c.json({
    order: updated,
    authorizationUrl: paystackData.authorization_url,
  });
});

// ── PAYSTACK CALLBACK (browser redirect after payment) ──

// GET /orders/callback?reference=...
// Paystack redirects the customer's browser here. We verify server-side
// before trusting it — this is UX (fast confirmation for the customer),
// the webhook below is the source of truth in case the customer closes
// the tab before this loads.
ordersRoutes.get("/callback", async (c) => {
  const reference = c.req.query("reference");
  if (!reference) return c.json({ error: "Missing reference" }, 400);

  const verified = await verifyTransaction(reference);
  if (verified.status !== "success") {
    return c.json({ status: "failed", message: "Payment was not successful" }, 200);
  }

  const order = await prisma.order.findUnique({ where: { paystackReference: reference } });
  if (!order) return c.json({ error: "Order not found" }, 404);

  if (verified.amount !== order.totalKobo) {
    return c.json({ status: "failed", message: "Amount mismatch" }, 400);
  }

  if (order.status === "FULFILLED") {
    return c.json({ status: "success", order }); // already handled, likely by webhook
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { paystackVerifiedAt: new Date(), status: "PAID", paidAt: new Date() },
  });

  const fulfilled = await fulfillOrder(updated.id);
  return c.json({ status: "success", order: fulfilled });
});
// ── PAYSTACK WEBHOOK (server-to-server, source of truth) ─

// POST /orders/webhook
// IMPORTANT: this route needs the raw request body for signature
// verification, so make sure whatever body-parsing you add elsewhere in
// the app doesn't run before this on this specific route.
ordersRoutes.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-paystack-signature");

  if (!isValidPaystackSignature(rawBody, signature)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = JSON.parse(rawBody) as {
    event: string;
    data: { reference?: string };
  };

  if (event.event === "charge.success" && event.data.reference) {
    const reference = event.data.reference;

    // Re-verify against Paystack directly rather than trusting the webhook
    // payload's own "status" field — belt and suspenders.
        const verified = await verifyTransaction(reference);
    if (verified.status === "success") {
      const order = await prisma.order.findUnique({ where: { paystackReference: reference } });
      if (order && order.status !== "FULFILLED" && verified.amount === order.totalKobo) {
        await prisma.order.update({
          where: { id: order.id },
          data: { paystackVerifiedAt: new Date(), status: "PAID", paidAt: new Date() },
        });
        await fulfillOrder(order.id);
      }
    }
  }

  // Always 200 quickly so Paystack doesn't keep retrying
  return c.json({ received: true });
});





// ── CUSTOMER ORDER LOOKUP ────────────────────────────────

// GET /orders/:id — lets the "order confirmed" page poll for status and
// show download links once ready.
ordersRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { book: true } } },
  });
  if (!order) return c.json({ error: "Order not found" }, 404);
  return c.json({ order });
});

// ── ADMIN ────────────────────────────────────────────────

// GET /orders — dashboard order list
ordersRoutes.get("/", requireAdmin, async (c) => {
  const orders = await prisma.order.findMany({
    include: { customer: true, items: { include: { book: true } } },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ orders });
});

// PATCH /orders/:id/confirm-transfer — admin manually confirms a bank
// transfer landed, then triggers the same fulfillment logic as Paystack
ordersRoutes.patch("/:id/confirm-transfer", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.json().catch(() => ({}));

  await prisma.order.update({
    where: { id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      bankTransferRef: body.bankTransferRef ?? undefined,
    },
  });

  const fulfilled = await fulfillOrder(id);
  return c.json({ order: fulfilled });
});
