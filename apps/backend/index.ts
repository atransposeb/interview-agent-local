import axios from "axios";
import express from "express";
import { createEphemeralToken } from "./sideband";
import { MAX_RESUME_PDF_BYTES, PreInterviewRequestSchema } from "./types";
import { loadGithubRepos, parseGithubUsername } from "./scrapers/github";
import { extractResume, type ResumeSource } from "./agents/resumeExtractor";
import { assessJobFit, keywordJobMatch } from "./agents/jdFeedbackAgent";
import { describeError, HttpError } from "./lib/httpError";
import { prisma } from "./prisma/db";
import type { Prisma } from "./generated/prisma/client";

const app = express();
// Room for a base64-encoded resume PDF (4 MB becomes about 5.4 MB).
app.use(express.json({ limit: "6mb" }));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "http://localhost:3000");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

function readResumePdf(base64: string): ResumeSource {
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > MAX_RESUME_PDF_BYTES) {
        throw new HttpError(413, "Resume PDFs must be 4 MB or smaller");
    }
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
        throw new HttpError(400, "The resume file must be a PDF");
    }
    return { kind: "pdf", base64: bytes.toString("base64") };
}

app.post("/api/v1/pre-interview", async (req, res) => {
    const parsed = PreInterviewRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request body" });
    }

    const { jobDescription, githubUrl, resumeText, resumePdfBase64 } = parsed.data;
    const resume: ResumeSource = resumePdfBase64 ? readResumePdf(resumePdfBase64) : { kind: "text", text: resumeText ?? "" };

    // Resume extraction and the GitHub lookup run in parallel; job fit starts as
    // soon as the repos arrive. Every promise is awaited together, so a GitHub
    // 404 rejects once and never goes unhandled.
    const githubPromise = loadGithubRepos(githubUrl ? parseGithubUsername(githubUrl) : null);
    const fitPromise = githubPromise.then((github) =>
        assessJobFit(jobDescription, resume, github.repos).catch((error) => {
            console.warn("Job fit assessment failed, using keyword matching:", describeError(error));
            return null;
        }),
    );
    const [github, resumeData, llmFit] = await Promise.all([githubPromise, extractResume(resume), fitPromise]);
    const jdFeedback = llmFit ?? keywordJobMatch(jobDescription, resumeData, github.repos);

    const interview = await prisma.interview.create({
        data: {
            jobDescription,
            githubMetadata: github.repos as unknown as Prisma.InputJsonValue,
            resumeData: resumeData as unknown as Prisma.InputJsonValue,
            jdFeedback: jdFeedback as unknown as Prisma.InputJsonValue,
            status: "pre",
            score: jdFeedback.score,
        },
    });

    return res.status(200).json({
        interviewId: interview.id,
        warnings: github.warning ? [github.warning] : [],
    });
});

app.get("/api/v1/gemini/session", async (_req, res) => {
    try {
        const token = await createEphemeralToken();
        res.json({ token });
    } catch (error) {
        console.error("Failed to create Gemini session:", describeError(error));
        res.status(500).json({ message: "Failed to create Gemini session" });
    }
});

app.get("/api/v1/interviews/:id/context", async (req, res) => {
    const interview = await prisma.interview.findUnique({
        where: { id: req.params.id },
        select: {
            id: true,
            jobDescription: true,
            githubMetadata: true,
            resumeData: true,
            jdFeedback: true,
        },
    });

    if (!interview) {
        return res.status(404).json({ message: "Interview not found" });
    }

    return res.status(200).json(interview);
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
        return res.status(error.status).json({ message: error.message });
    }

    // Errors thrown by express.json() carry a `type`.
    const type = (error as { type?: string }).type;
    if (type === "entity.too.large") {
        return res.status(413).json({ message: "Request is too large. Resume PDFs must be 4 MB or smaller." });
    }
    if (error instanceof SyntaxError || type === "entity.parse.failed") {
        return res.status(400).json({ message: "Request body must be valid JSON" });
    }

    console.error(axios.isAxiosError(error) ? describeError(error) : error);
    return res.status(500).json({ message: "Unexpected server error" });
});

app.listen(3001, () => {
    console.log("Backend listening on http://localhost:3001");
});
