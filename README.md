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
