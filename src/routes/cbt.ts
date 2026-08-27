import { Hono } from "hono";
import { z } from "zod";
import type { CBTQuestion } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/require-admin.js";

export const cbtRoutes = new Hono();

// ── PUBLIC ──────────────────────────────────────────────

// GET /cbt/subjects
cbtRoutes.get("/subjects", async (c) => {
  const subjects = await prisma.cBTSubject.findMany();
  return c.json({ subjects });
});

// GET /cbt/subjects/:id/questions?limit=20
// Correct answers/explanations are stripped here — only revealed after
// the practice session is submitted, via /cbt/sessions.
cbtRoutes.get("/subjects/:id/questions", async (c) => {
  const subjectId = c.req.param("id")!;
  const limit = Number(c.req.query("limit") || 20);

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
    },
  });

  return c.json({ questions });
});

const submitSchema = z.object({
  subjectId: z.string(),
  email: z.string().email().optional(),
  answers: z.array(z.object({ questionId: z.string(), selected: z.enum(["A", "B", "C", "D"]) })),
});

// POST /cbt/sessions — grades the attempt and records a practice session
cbtRoutes.post("/sessions", async (c) => {
  const parsed = submitSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { subjectId, email, answers } = parsed.data;

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
      email,
      totalAsked: answers.length,
      totalCorrect,
      completedAt: new Date(),
    },
  });

  return c.json({ session, results });
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
