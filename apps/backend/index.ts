import axios from "axios";
import express from "express";
import { createEphemeralToken } from "./sideband";
import { PreInterviewRequestSchema } from "./types";
import { scrapeGithub } from "./scrapers/github";
import { parseResume } from "./lib/resumeParser";
import { generateJobMatchFeedback } from "./agents/jdFeedbackAgent";
import { prisma } from "./prisma/db";
import type { Prisma } from "./generated/prisma/client";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "http://localhost:3000");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

app.post("/api/v1/pre-interview", async (req, res, next) => {
    const { success, data } = PreInterviewRequestSchema.safeParse(req.body);
    if (!success) {
        return res.status(400).json({ message: "Invalid request body" });
    }

    const githubUrl = data.githubUrl.endsWith("/") ? data.githubUrl.slice(0, -1) : data.githubUrl;
    const githubUsername = githubUrl.split("/").pop();
    if (!githubUsername) {
        return res.status(400).json({ message: "Invalid GitHub URL" });
    }

    try {
        const githubData = await scrapeGithub(githubUsername);
        const resumeData = parseResume(data.resumeText);
        const jdFeedback = await generateJobMatchFeedback(resumeData, githubData);

        const interview = await prisma.interview.create({
            data: {
                githubMetadata: githubData,
                resumeData: resumeData as unknown as Prisma.InputJsonValue,
                jdFeedback: jdFeedback as unknown as Prisma.InputJsonValue,
                status: "pre",
                score: jdFeedback.score,
            },
        });

        return res.status(200).json({
            interviewId: interview.id,
            githubData,
            resumeData,
            jdFeedback,
        });
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const responseStatus = status === 404 ? 404 : 502;
            const message = status === 404
                ? "GitHub user not found"
                : "Unable to reach the GitHub API. Check this machine's internet or proxy configuration.";

            return res.status(responseStatus).json({ message });
        }

        next(error);
    }
});

app.get("/api/v1/gemini/session", async (_req, res) => {
    try {
        const token = await createEphemeralToken();
        res.json({ token });
    } catch (error) {
        console.error("Failed to create Gemini session:", error);
        res.status(500).json({ message: "Failed to create Gemini session" });
    }
});

app.get("/api/v1/interviews/:id/context", async (req, res, next) => {
    try {
        const interview = await prisma.interview.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                githubMetadata: true,
                resumeData: true,
                jdFeedback: true,
            },
        });

        if (!interview) {
            return res.status(404).json({ message: "Interview not found" });
        }

        return res.status(200).json(interview);
    } catch (error) {
        next(error);
    }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError) {
        return res.status(400).json({ message: "Request body must be valid JSON" });
    }

    console.error(error);
    return res.status(500).json({ message: "Unexpected server error" });
});

app.listen(3001, () => {
    console.log("Backend listening on http://localhost:3001");
});
