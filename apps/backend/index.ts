import axios from "axios";
import express from "express";
import { PreInterviewRequestSchema } from "./types";
import { scrapeGithub } from "./scrapers/github";

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
        return res.status(411).json({ message: "Invalid request body" });
    }

    const githubUrl = data.githubUrl.endsWith("/") ? data.githubUrl.slice(0, -1) : data.githubUrl;
    const githubUsername = githubUrl.split("/").pop();
    if (!githubUsername) {
        return res.status(400).json({ message: "Invalid GitHub URL" });
    }

    try {
        const githubData = await scrapeGithub(githubUsername);

        return res.status(200).json({ githubData });
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
