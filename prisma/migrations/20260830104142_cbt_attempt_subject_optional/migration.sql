-- DropForeignKey
ALTER TABLE "CBTAttempt" DROP CONSTRAINT "CBTAttempt_subjectId_fkey";

-- AlterTable
ALTER TABLE "CBTAttempt" ALTER COLUMN "subjectId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "CBTAttempt" ADD CONSTRAINT "CBTAttempt_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "CBTSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
