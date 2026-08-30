/*
  Warnings:

  - A unique constraint covering the columns `[accessCode]` on the table `CBTAttempt` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CBTAttempt" ADD COLUMN     "accessCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CBTAttempt_accessCode_key" ON "CBTAttempt"("accessCode");
