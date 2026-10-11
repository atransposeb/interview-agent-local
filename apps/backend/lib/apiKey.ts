import type { Request } from "express";
import { HttpError } from "./httpError";

/** Browsers send the user's own Gemini key in this header. */
export const API_KEY_HEADER = "x-gemini-api-key";

/** True when users must bring their own key because the server has none. */
export function apiKeyRequired() {
    return !process.env.GEMINI_API_KEY;
}

/**
 * The caller's Gemini key, falling back to the server's key when one is set.
 * It is used for this request only: never stored, never logged.
 */
export function geminiApiKey(req: Request) {
    const key = req.get(API_KEY_HEADER)?.trim() || process.env.GEMINI_API_KEY;
    if (!key) {
        throw new HttpError(401, "Add your Gemini API key to continue.");
    }
    if (key.length > 200 || /\s/.test(key)) {
        throw new HttpError(400, "That doesn't look like a Gemini API key.");
    }
    return key;
}
