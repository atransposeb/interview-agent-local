import express from "express";
import { createEphemeralToken } from "../sideband";
import { MAX_RESUME_PDF_BYTES, PreInterviewRequestSchema, SaveMessagesRequestSchema } from "../types";
import { loadGithubRepos, parseGithubUsername } from "../scrapers/github";
import { extractResume, type ResumeSource } from "../agents/resumeExtractor";
import { assessJobFit, keywordJobMatch } from "../agents/jdFeedbackAgent";
import { evaluateInterview } from "../agents/interviewEvaluator";
import { describeError, HttpError } from "../lib/httpError";
import { readInterviewContext } from "../lib/interviewContext";
import { buildLiveSetup, INTERVIEW_DURATION_SECONDS } from "../lib/liveSession";
import { prisma } from "../prisma/db";
import type { MessageType, Prisma } from "../generated/prisma/client";

export const interviewsRouter = express.Router();

const MESSAGE_TYPES: Record<"user" | "assistant", MessageType> = { user: "User", assistant: "Assistant" };

// Scoring takes several seconds, so concurrent /complete calls for the same
// interview (a double click, React StrictMode, a retry) share one run.
const evaluationsInFlight = new Map<string, Promise<void>>();

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

async function loadTranscript(interviewId: string) {
    const messages = await prisma.message.findMany({ where: { interviewId }, orderBy: { seq: "asc" } });
    return messages.map((message) => ({
        seq: message.seq,
        role: message.type === "User" ? ("user" as const) : ("assistant" as const),
        text: message.message,
    }));
}

async function scoreInterview(interviewId: string) {
    const interview = await findInterview(interviewId);
    if (interview.evaluation) return; // scored by a request that finished just before this one

    const evaluation = await evaluateInterview(readInterviewContext(interview), await loadTranscript(interviewId));
    await prisma.interview.update({
        where: { id: interviewId },
        data: {
            evaluation: evaluation as unknown as Prisma.InputJsonValue,
            score: evaluation.overallScore,
        },
    });
}

function scoreOnce(interviewId: string) {
    let run = evaluationsInFlight.get(interviewId);
    if (!run) {
        run = scoreInterview(interviewId).finally(() => evaluationsInFlight.delete(interviewId));
        evaluationsInFlight.set(interviewId, run);
    }
    return run;
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
        data: { status: "InProgress", startedAt: new Date() },
    });

    // A reconnect continues the transcript numbering instead of overwriting it.
    const lastMessage = await prisma.message.findFirst({
        where: { interviewId: interview.id },
        orderBy: { seq: "desc" },
        select: { seq: true },
    });

    return res.status(200).json({
        token,
        model: setup.model,
        durationSeconds: INTERVIEW_DURATION_SECONDS,
        nextSeq: (lastMessage?.seq ?? -1) + 1,
    });
});

// Saves finished transcript turns. Upserting by (interviewId, seq) makes retries
// and the final full re-send idempotent.
interviewsRouter.post("/interviews/:id/messages", async (req, res) => {
    const parsed = SaveMessagesRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: "Invalid transcript messages" });
    }

    const interview = await findInterview(req.params.id);
    if (interview.status === "Done") {
        throw new HttpError(409, "This interview has already finished");
    }

    await prisma.$transaction(
        parsed.data.messages.map(({ seq, role, text }) =>
            prisma.message.upsert({
                where: { interviewId_seq: { interviewId: interview.id, seq } },
                create: { interviewId: interview.id, seq, type: MESSAGE_TYPES[role], message: text },
                update: { type: MESSAGE_TYPES[role], message: text },
            }),
        ),
    );

    return res.status(204).end();
});

// Ends the interview (idempotent), scores it once, and returns the report.
interviewsRouter.post("/interviews/:id/complete", async (req, res) => {
    const interview = await findInterview(req.params.id);

    await prisma.interview.updateMany({
        where: { id: interview.id, status: { not: "Done" } },
        data: { status: "Done", endedAt: new Date() },
    });

    if (!interview.evaluation) {
        try {
            await scoreOnce(interview.id);
        } catch (error) {
            console.error("Interview scoring failed:", describeError(error));
            throw new HttpError(502, "Couldn't score the interview right now. Please try again in a moment.");
        }
    }

    const done = await findInterview(interview.id);
    return res.status(200).json({
        id: done.id,
        status: done.status,
        score: done.score,
        evaluation: done.evaluation,
        jobFit: readInterviewContext(done).jobFit,
        startedAt: done.startedAt,
        endedAt: done.endedAt,
        messages: await loadTranscript(done.id),
    });
});
