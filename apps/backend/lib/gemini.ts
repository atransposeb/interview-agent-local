import axios from "axios";
import { z } from "zod";
import { httpsAgent } from "../proxy";
import { HttpError } from "./httpError";

// Used for resume extraction, job fit, and scoring. Flash-Lite models answered
// in 1-4s while the larger Flash models often returned 503 "high demand", so a
// busy or rate-limited primary falls back to a second model.
export const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash-lite";
const GEMINI_TEXT_FALLBACK_MODEL = process.env.GEMINI_TEXT_FALLBACK_MODEL || "gemini-3.1-flash-lite";

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

interface GenerateJsonOptions<T extends z.ZodType> {
    apiKey: string;
    schema: T;
    system: string;
    parts: GeminiPart[];
    temperature?: number;
}

/**
 * Calls Gemini with structured output. The Zod schema is sent as the response
 * JSON schema and also validates the reply, so callers get typed data or an error.
 */
export async function generateJson<T extends z.ZodType>({
    apiKey,
    schema,
    system,
    parts,
    temperature = 0.2,
}: GenerateJsonOptions<T>): Promise<z.output<T>> {
    const { $schema: _dialect, ...responseJsonSchema } = z.toJSONSchema(schema);

    const response = await withFallback((model) =>
        axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
                systemInstruction: { parts: [{ text: system }] },
                contents: [{ role: "user", parts }],
                generationConfig: { responseMimeType: "application/json", responseJsonSchema, temperature },
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey,
                },
                httpsAgent,
                proxy: false,
                timeout: 45_000,
            },
        ),
    );

    const candidate = response.data?.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
        .filter((part: { thought?: boolean }) => !part.thought)
        .map((part: { text?: string }) => part.text ?? "")
        .join("");

    if (!text) {
        throw new Error(`Gemini returned no content (finishReason: ${candidate?.finishReason ?? "unknown"})`);
    }

    return schema.parse(JSON.parse(text));
}

// Rate limits, overloads, and dropped connections are worth another attempt.
// Timeouts are not: the user has already waited the full 45 seconds.
function isRetryable(error: unknown) {
    if (!axios.isAxiosError(error) || error.code === "ECONNABORTED") return false;
    const status = error.response?.status;
    return status === undefined || status === 429 || status >= 500;
}

async function withFallback<T>(request: (model: string) => Promise<T>): Promise<T> {
    const models = [GEMINI_TEXT_MODEL, GEMINI_TEXT_FALLBACK_MODEL, GEMINI_TEXT_MODEL];
    for (let attempt = 0; ; attempt++) {
        try {
            return await request(models[attempt]!);
        } catch (error) {
            const rejected = keyRejection(error);
            if (rejected) throw rejected;
            if (attempt === models.length - 1 || !isRetryable(error)) throw error;
            await Bun.sleep(1_000 * (attempt + 1));
        }
    }
}

/**
 * Google answers a wrong, revoked, or unauthorized key with 400 "API key not
 * valid", 401, or 403. Returns the error to show the user, or null for any
 * other failure.
 */
export function keyRejection(error: unknown): HttpError | null {
    if (!axios.isAxiosError(error)) return null;
    const status = error.response?.status;
    const detail = String(error.response?.data?.error?.message ?? "");
    if (status === 401 || status === 403 || (status === 400 && /api key/i.test(detail))) {
        return new HttpError(401, "Google didn't accept that Gemini API key. Check it in Google AI Studio and try again.");
    }
    return null;
}

/** Makes the cheapest authenticated call there is, to catch a bad key before any real work. */
export async function verifyApiKey(apiKey: string) {
    try {
        await axios.get("https://generativelanguage.googleapis.com/v1beta/models", {
            params: { pageSize: 1 },
            headers: { "x-goog-api-key": apiKey },
            httpsAgent,
            proxy: false,
            timeout: 10_000,
        });
    } catch (error) {
        throw keyRejection(error) ?? new HttpError(502, "Couldn't reach Google to check the key. Try again in a moment.");
    }
}
