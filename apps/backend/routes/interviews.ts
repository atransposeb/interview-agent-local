import express from "express";
import { createEphemeralToken } from "../sideband";
import { MAX_RESUME_PDF_BYTES, PreInterviewRequestSchema } from "../types";
import { loadGithubRepos, parseGithubUsername } from "../scrapers/github";
import { extractResume, type ResumeSource } from "../agents/resumeExtractor";
import { assessJobFit, keywordJobMatch } from "../agents/jdFeedbackAgent";
import { describeError, HttpError } from "../lib/httpError";
import { readInterviewContext } from "../lib/interviewContext";
import { buildLiveSetup, INTERVIEW_DURATION_SECONDS } from "../lib/liveSession";
import { prisma } from "../prisma/db";
import type { Prisma } from "../generated/prisma/client";

export const interviewsRouter = express.Router();

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

async function findInterview(id: string) {
    const interview = await prisma.interview.findUnique({ where: { id } });
    if (!interview) {
        throw new HttpError(404, "Interview not found");
    }
    return interview;
}

interviewsRouter.post("/pre-interview", async (req, res) => {
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

// Mints a Gemini Live token with this interview's prompt and tools locked in.
interviewsRouter.post("/interviews/:id/session", async (req, res) => {
    const interview = await findInterview(req.params.id);
    if (interview.status === "Done") {
        throw new HttpError(409, "This interview has already finished");
    }

    const setup = buildLiveSetup(readInterviewContext(interview));
    let token: string;
    try {
        token = await createEphemeralToken(setup);
    } catch (error) {
        console.error("Failed to create Gemini session:", describeError(error));
        throw new HttpError(502, "Couldn't start the voice session. Please try again.");
    }

    // Only the first session moves the interview forward; reconnects keep their status.
    await prisma.interview.updateMany({
        where: { id: interview.id, status: "pre" },
        data: { status: "InProgress" },
    });

    return res.status(200).json({
        token,
        model: setup.model,
        durationSeconds: INTERVIEW_DURATION_SECONDS,
    });
});
