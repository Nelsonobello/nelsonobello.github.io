// CBT (Computer-Based Test) routes
import { Hono } from "hono";
import { z } from "zod";
import nodemailer from "nodemailer";
import type { CBTQuestion } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { initializeTransaction, verifyTransaction } from "../lib/paystack.js";
import { uploadQuestionImage } from "../lib/supabase.js";

export const cbtRoutes = new Hono();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendAccessCodeEmail(to: string, accessCode: string, attemptsGranted: number) {
  await transporter.sendMail({
    from: process.env.MAIL_FROM || `"NELBELL CBT Practice" <no-reply@nelbell.com>`,
    to,
    subject: "Your CBT Practice access code",
    html: `
      <p>Thanks for your payment!</p>
      <p>Your access code is:</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${accessCode}</p>
      <p>This unlocks ${attemptsGranted} practice attempt${attemptsGranted > 1 ? "s" : ""}. Enter this code along with the email you paid with to start practicing.</p>
    `,
  });
}

// ── PUBLIC ──────────────────────────────────────────────

// ── PUBLIC ──────────────────────────────────────────────

// GET /cbt/subjects
cbtRoutes.get("/subjects", async (c) => {
  const subjects = await prisma.cBTSubject.findMany();
  return c.json({ subjects });
});

function attemptPriceKobo() {
  const price = Number(process.env.CBT_ATTEMPT_PRICE_KOBO);
  if (!price) throw new Error("CBT_ATTEMPT_PRICE_KOBO is not set");
  return price;
}

// e.g. "7K2A9XQP" — short, unambiguous (no 0/O/1/I), easy to type back in
function generateAccessCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
const startAttemptSchema = z.object({ email: z.string().email() });

// POST /cbt/attempts — pay to unlock a shared pool of practice credits,
// usable on any subject
cbtRoutes.post("/attempts", async (c) => {
  const parsed = startAttemptSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const priceKobo = attemptPriceKobo();
  const attemptsGranted = Number(process.env.CBT_ATTEMPTS_PER_PAYMENT) || 1;

  const attempt = await prisma.cBTAttempt.create({
    data: { email: parsed.data.email, priceKobo, attemptsGranted },
  });

  const paystackData = await initializeTransaction({
    email: parsed.data.email,
    amountKobo: priceKobo,
    reference: attempt.id,
    callbackUrl: `${process.env.FRONTEND_URL}/cbt/callback`,
  });

  const updated = await prisma.cBTAttempt.update({
    where: { id: attempt.id },
    data: {
      paystackReference: paystackData.reference,
      paystackAuthUrl: paystackData.authorization_url,
    },
  });

  return c.json({ attempt: updated, authorizationUrl: paystackData.authorization_url });
});



// GET /cbt/attempts/callback?reference=... — browser redirect after payment
// GET /cbt/attempts/callback?reference=... — browser redirect after payment
cbtRoutes.get("/attempts/callback", async (c) => {
  const reference = c.req.query("reference");
  if (!reference) return c.json({ error: "Missing reference" }, 400);

  const verified = await verifyTransaction(reference);
  if (verified.status !== "success") {
    return c.json({ status: "failed", message: "Payment was not successful" }, 200);
  }

  const attempt = await prisma.cBTAttempt.findUnique({ where: { paystackReference: reference } });
  if (!attempt) return c.json({ error: "Attempt not found" }, 404);

  if (verified.amount !== attempt.priceKobo) {
    return c.json({ status: "failed", message: "Amount mismatch" }, 400);
  }

  if (attempt.status === "PAID") {
    return c.json({ status: "success", attempt });
  }

  const updated = await prisma.cBTAttempt.update({
    where: { id: attempt.id },
    data: { status: "PAID", paystackVerifiedAt: new Date(), accessCode: generateAccessCode() },
  });

  await sendAccessCodeEmail(updated.email, updated.accessCode!, updated.attemptsGranted);

  return c.json({
    status: "success",
    attemptId: updated.id,
    accessCode: updated.accessCode,
    email: updated.email,
    attemptsRemaining: updated.attemptsGranted - updated.attemptsUsed,
  });
});

const redeemSchema = z.object({
  email: z.string().email(),
  accessCode: z.string().min(1),
});

// POST /cbt/attempts/redeem — look up a paid attempt by email + access code
cbtRoutes.post("/attempts/redeem", async (c) => {
  const parsed = redeemSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { email, accessCode } = parsed.data;

  const attempt = await prisma.cBTAttempt.findUnique({
    where: { accessCode: accessCode.toUpperCase().trim() },
  });

  if (!attempt || attempt.status !== "PAID" || attempt.email.toLowerCase() !== email.toLowerCase()) {
    return c.json({ error: "Invalid access code or email" }, 404);
  }
  if (attempt.attemptsUsed >= attempt.attemptsGranted) {
    return c.json({ error: "No attempts remaining — please make a new purchase" }, 402);
  }

  return c.json({
    attemptId: attempt.id,
    attemptsRemaining: attempt.attemptsGranted - attempt.attemptsUsed,
  });
});

// GET /cbt/subjects/:id/questions?limit=20&attemptId=...// GET /cbt/subjects/:id/questions?limit=20&attemptId=...
// Correct answers/explanations are stripped here — only revealed after
// the practice session is submitted, via /cbt/sessions.
// Requires a PAID CBTAttempt with remaining attemptsUsed < attemptsGranted.
cbtRoutes.get("/subjects/:id/questions", async (c) => {
  const subjectId = c.req.param("id")!;
  const attemptId = c.req.query("attemptId");
  const limit = Number(c.req.query("limit") || 40);

  if (!attemptId) return c.json({ error: "attemptId is required" }, 400);
  const attempt = await prisma.cBTAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.status !== "PAID") {
    return c.json({ error: "Valid paid attempt required" }, 402);
  }
  if (attempt.attemptsUsed >= attempt.attemptsGranted) {
    return c.json({ error: "No attempts remaining on this purchase" }, 402);
  }

  const questions = await prisma.cBTQuestion.findMany({
    where: { subjectId },
    take: limit,
    select: {
      id: true,
      questionText: true,
      optionA: true,
      optionB: true,
      optionC: true,
      optionD: true,
      imageUrl: true,
    },
  });

  return c.json({ questions });
});

const submitSchema = z.object({
  subjectId: z.string(),
  attemptId: z.string(),
  email: z.string().email().optional(),
  answers: z.array(z.object({ questionId: z.string(), selected: z.enum(["A", "B", "C", "D"]) })),
});

// POST /cbt/sessions — grades the attempt and records a practice session.
// Each successful submit consumes one attempt from the purchase's balance.
cbtRoutes.post("/sessions", async (c) => {
  const parsed = submitSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { subjectId, attemptId, email, answers } = parsed.data;

   const attempt = await prisma.cBTAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.status !== "PAID") {
    return c.json({ error: "Valid paid attempt required" }, 402);
  }
  if (attempt.attemptsUsed >= attempt.attemptsGranted) {
    return c.json({ error: "No attempts remaining on this purchase" }, 409);
  }

  const questions = await prisma.cBTQuestion.findMany({
    where: { id: { in: answers.map((a) => a.questionId) } },
  });

  let totalCorrect = 0;
  const results = answers.map((a) => {
    const question = questions.find((q: CBTQuestion) => q.id === a.questionId);
    const correct = question?.correctOption === a.selected;
    if (correct) totalCorrect++;
    return {
      questionId: a.questionId,
      selected: a.selected,
      correct,
      correctOption: question?.correctOption,
      explanation: question?.explanation,
    };
  });

  const session = await prisma.cBTPracticeSession.create({
    data: {
      subjectId,
      attemptId,
      email,
      totalAsked: answers.length,
      totalCorrect,
      completedAt: new Date(),
    },
  });

  const updatedAttempt = await prisma.cBTAttempt.update({
    where: { id: attemptId },
    data: { attemptsUsed: { increment: 1 } },
  });

  return c.json({
    session,
    results,
    attemptsRemaining: updatedAttempt.attemptsGranted - updatedAttempt.attemptsUsed,
  });
});

// ── ADMIN ───────────────────────────────────────────────

const subjectSchema = z.object({ name: z.string().min(1) });

cbtRoutes.post("/subjects", requireAdmin, async (c) => {
  const parsed = subjectSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const subject = await prisma.cBTSubject.create({ data: parsed.data });
  return c.json({ subject }, 201);
});

const questionSchema = z.object({
  subjectId: z.string(),
  questionText: z.string().min(1),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().min(1),
  optionD: z.string().min(1),
  correctOption: z.enum(["A", "B", "C", "D"]),
  explanation: z.string().optional(),
});

cbtRoutes.post("/questions", requireAdmin, async (c) => {
  const parsed = questionSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const question = await prisma.cBTQuestion.create({ data: parsed.data });
  return c.json({ question }, 201);
});

cbtRoutes.patch("/questions/:id", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const parsed = questionSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const question = await prisma.cBTQuestion.update({ where: { id }, data: parsed.data });
  return c.json({ question });
});

cbtRoutes.delete("/questions/:id", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  await prisma.cBTQuestion.delete({ where: { id } });
  return c.json({ deleted: true });
});

// POST /cbt/questions/:id/image — admin uploads a question image (multipart/form-data, field "file")
cbtRoutes.post("/questions/:id/image", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!(file instanceof File)) {
    return c.json({ error: "No file provided under the 'file' field" }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: "Question image must be an image file" }, 400);
  }

  const imageUrl = await uploadQuestionImage(id, file);
  const question = await prisma.cBTQuestion.update({ where: { id }, data: { imageUrl } });
  return c.json({ question });
});




const bulkImportSchema = z.array(questionSchema).min(1);

cbtRoutes.post("/questions/bulk-import", requireAdmin, async (c) => {
  const parsed = bulkImportSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const created = await prisma.$transaction(
      parsed.data.map((q) => prisma.cBTQuestion.create({ data: q }))
    );
    return c.json({ inserted: created.length }, 201);
  } catch (err) {
    return c.json({ error: "Bulk import failed, no questions were saved" }, 500);
  }
});

// GET /cbt/admin/subjects/:id/questions — full data (with answers), admin only
cbtRoutes.get("/admin/subjects/:id/questions", requireAdmin, async (c) => {
  const subjectId = c.req.param("id")!;
  const questions = await prisma.cBTQuestion.findMany({ where: { subjectId } });
  return c.json({ questions });
});

// GET /cbt/subjects/:id - Fetch single subject details
cbtRoutes.get("/subjects/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const subject = await prisma.cBTSubject.findUnique({
    where: { id },
  });

  if (!subject) {
    return c.json({ error: "Subject not found" }, 404);
  }

  return c.json({ subject });
});

// PATCH /cbt/subjects/:id - Update subject name
cbtRoutes.patch("/subjects/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const { name } = await c.req.json();

  const subject = await prisma.cBTSubject.update({
    where: { id },
    data: { name },
  });

  return c.json({ subject });
});

// DELETE /cbt/subjects/:id - Delete subject and questions
cbtRoutes.delete("/subjects/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");

  await prisma.cBTQuestion.deleteMany({
    where: { subjectId: id },
  });

  await prisma.cBTSubject.delete({
    where: { id },
  });

  return c.json({ message: "Subject deleted successfully" });
});