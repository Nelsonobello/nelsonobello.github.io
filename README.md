# NELBELL Backend

Node + Hono + Prisma + PostgreSQL (Supabase). Separate service from the
Next.js frontend — its own repo, its own deploy, its own URL.

## Setup

```bash
npm install
cp .env.example .env
# fill in .env: DATABASE_URL, SUPABASE_*, PAYSTACK_SECRET_KEY, JWT_SECRET, SEED_ADMIN_*

npx prisma migrate dev --name init
npm run seed:admin      # creates the one Admin row — no signup route exists
npm run dev             # starts on http://localhost:4000
```

## Routes

**Public**
- `GET /books`, `GET /books/:slug`
- `POST /orders/checkout` — body: `{ customer, items, paymentMethod }`
- `GET /orders/callback` — Paystack redirect target
- `POST /orders/webhook` — Paystack webhook (set this URL in the Paystack dashboard)
- `GET /orders/:id` — order status/download links
- `GET /cbt/subjects`, `GET /cbt/subjects/:id/questions`, `POST /cbt/sessions`
- `POST /inquiries`
- `GET /settings`

**Admin** (send `Authorization: Bearer <token>` from `POST /admin/login`)
- `POST /admin/login`, `GET /admin/me`
- `GET /books/admin/all`, `POST /books`, `PATCH /books/:id`, `PATCH /books/:id/(de)activate`
- `GET /orders`, `PATCH /orders/:id/confirm-transfer`
- `POST /cbt/subjects`, `POST /cbt/questions`, `PATCH /cbt/questions/:id`, `DELETE /cbt/questions/:id`
- `GET /inquiries`, `PATCH /inquiries/:id/handled`
- `PATCH /settings`

## Notes

- **No signup route, one admin.** The single `Admin` row is created by
  `npm run seed:admin`, reading `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
  from `.env`. To rotate the password later, either re-run a small script
  or add it to the dashboard yourself — there's deliberately no public
  endpoint that creates or edits admin credentials.
- **Ebook files** live in a *private* Supabase Storage bucket.
  `Book.ebookFileUrl` stores the file path (e.g. `my-book.pdf`), not a
  public URL. `src/lib/fulfillment.ts` generates a time-limited signed
  URL only after payment is verified.
- **Paystack**: uses the redirect/Standard flow, restricted to the
  one-time "Pay with Transfer" channel (`channels: ["bank_transfer"]`)
  rather than Dedicated Virtual Accounts. The webhook
  (`POST /orders/webhook`) is the source of truth; the callback route is
  just for fast UX in the customer's browser. Both call the shared
  `fulfillOrder()` helper, which checks current status first so an order
  can't be double-fulfilled if both fire.
- **Bank transfer** orders are confirmed manually by you via
  `PATCH /orders/:id/confirm-transfer` from the dashboard — same
  `fulfillOrder()` path as Paystack, so ebook delivery works identically
  either way.
