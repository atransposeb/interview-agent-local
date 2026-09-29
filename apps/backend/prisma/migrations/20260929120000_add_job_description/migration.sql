-- Existing interviews were scored against the old server-side jd.txt, so they
-- get an empty job description. The temporary default only backfills them; new
-- rows must provide one.
ALTER TABLE "Interview" ADD COLUMN "jobDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Interview" ALTER COLUMN "jobDescription" DROP DEFAULT;

-- The add_resume_data migration gave resumeData a default the schema never declared.
ALTER TABLE "Interview" ALTER COLUMN "resumeData" DROP DEFAULT;
