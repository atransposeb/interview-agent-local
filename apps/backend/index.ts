import axios from "axios";
import express from "express";
import { interviewsRouter } from "./routes/interviews";
import { describeError, HttpError } from "./lib/httpError";
import { API_KEY_HEADER } from "./lib/apiKey";
import { parseAllowedOrigins } from "./lib/origins";
import { prisma } from "./prisma/db";

const PORT = Number(process.env.PORT) || 3001;
const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_URL);

const app = express();
// Room for a base64-encoded resume PDF (4 MB becomes about 5.4 MB).
app.use(express.json({ limit: "6mb" }));

app.use((req, res, next) => {
    const origin = req.get("origin");
    if (origin && allowedOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", `Content-Type, ${API_KEY_HEADER}`);
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// For the host's health checks: the process is up and can reach the database,
// so a deploy with a bad DATABASE_URL never takes traffic.
app.get("/health", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return res.status(200).json({ status: "ok" });
    } catch (error) {
        console.error("Health check failed:", error instanceof Error ? error.message : error);
        return res.status(503).json({ status: "database unavailable" });
    }
});

app.use("/api/v1", interviewsRouter);

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

const server = app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
});

// Hosts send SIGTERM before replacing an instance. Stop taking connections,
// let in-flight requests finish (interview setup can take most of a minute),
// then exit.
process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down");
    server.close(() => {
        prisma.$disconnect().finally(() => process.exit(0));
    });
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(1), 60_000).unref();
});
