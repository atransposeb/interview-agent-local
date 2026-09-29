import axios from "axios";
import express from "express";
import { interviewsRouter } from "./routes/interviews";
import { describeError, HttpError } from "./lib/httpError";

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

app.listen(3001, () => {
    console.log("Backend listening on http://localhost:3001");
});
