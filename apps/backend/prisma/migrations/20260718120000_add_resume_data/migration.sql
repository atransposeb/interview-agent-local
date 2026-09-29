ALTER TABLE "Interview" ADD COLUMN "resumeData" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Interview" ADD COLUMN "jdFeedback" JSONB;
