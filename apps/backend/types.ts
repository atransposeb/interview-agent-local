import z from "zod";

export const PreInterviewRequestSchema = z.object({
    githubUrl: z.string(),
});