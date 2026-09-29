import z from "zod";
import { parseGithubUsername } from "./scrapers/github";

export const MAX_RESUME_PDF_BYTES = 4 * 1024 * 1024;

export const PreInterviewRequestSchema = z
    .object({
        jobDescription: z
            .string()
            .trim()
            .min(1, "Paste the job description, or at least the role title")
            .max(20_000, "The job description is too long (20,000 characters max)"),
        githubUrl: z
            .string()
            .trim()
            .optional()
            .refine((value) => !value || parseGithubUsername(value) !== null, "Enter a GitHub profile URL like https://github.com/username"),
        resumeText: z.string().trim().max(50_000, "The resume text is too long (50,000 characters max)").optional(),
        resumePdfBase64: z.string().optional(),
    })
    .refine((body) => Boolean(body.resumeText) !== Boolean(body.resumePdfBase64), "Provide your resume as a PDF or as pasted text");

export type PreInterviewRequest = z.infer<typeof PreInterviewRequestSchema>;
