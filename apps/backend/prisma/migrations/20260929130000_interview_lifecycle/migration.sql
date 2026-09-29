-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_interviewId_fkey";

-- AlterTable: lifecycle timestamps and the evaluation. updatedAt backfills
-- existing rows through a temporary default; Prisma maintains it from here.
ALTER TABLE "Interview" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "evaluation" JSONB,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "score" DROP NOT NULL,
ALTER COLUMN "score" DROP DEFAULT;
ALTER TABLE "Interview" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- score now means interview performance. Existing values were resume-screen
-- match scores, which are still in jdFeedback.score.
UPDATE "Interview" SET "score" = NULL;

-- AlterTable: no messages were ever written before this migration.
ALTER TABLE "Message" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "seq" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Message_interviewId_seq_key" ON "Message"("interviewId", "seq");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
