-- CreateEnum
CREATE TYPE "CBTAttemptStatus" AS ENUM ('PENDING_PAYMENT', 'PAID');

-- AlterTable
ALTER TABLE "CBTPracticeSession" ADD COLUMN     "attemptId" TEXT;

-- CreateTable
CREATE TABLE "CBTAttempt" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "attemptsGranted" INTEGER NOT NULL DEFAULT 1,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "status" "CBTAttemptStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paystackReference" TEXT,
    "paystackAuthUrl" TEXT,
    "paystackVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CBTAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CBTAttempt_paystackReference_key" ON "CBTAttempt"("paystackReference");

-- AddForeignKey
ALTER TABLE "CBTAttempt" ADD CONSTRAINT "CBTAttempt_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "CBTSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CBTPracticeSession" ADD CONSTRAINT "CBTPracticeSession_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CBTAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
