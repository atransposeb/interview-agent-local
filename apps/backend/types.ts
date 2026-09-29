import z from "zod";

export const PreInterviewRequestSchema = z.object({
    githubUrl: z.string(),
    resumeText: z.string().min(1),
});
