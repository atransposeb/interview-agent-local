import { afterEach, describe, expect, test } from "bun:test";
import { AxiosError, type AxiosResponse } from "axios";
import type { Request } from "express";
import { geminiApiKey } from "./apiKey";
import { keyRejection } from "./gemini";
import { HttpError } from "./httpError";

const serverKey = process.env.GEMINI_API_KEY;

function requestWithKey(key?: string) {
    return { get: (name: string) => (name === "x-gemini-api-key" ? key : undefined) } as unknown as Request;
}

function googleError(status: number, message: string) {
    return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
        status,
        data: { error: { message } },
    } as AxiosResponse);
}

afterEach(() => {
    process.env.GEMINI_API_KEY = serverKey;
});

describe("geminiApiKey", () => {
    test("prefers the user's key over the server's", () => {
        process.env.GEMINI_API_KEY = "server-key";
        expect(geminiApiKey(requestWithKey("  user-key  "))).toBe("user-key");
    });

    test("falls back to the server's key", () => {
        process.env.GEMINI_API_KEY = "server-key";
        expect(geminiApiKey(requestWithKey())).toBe("server-key");
    });

    test("asks for a key when neither is set", () => {
        process.env.GEMINI_API_KEY = "";
        expect(() => geminiApiKey(requestWithKey())).toThrow("Add your Gemini API key");
    });

    test("rejects values that can't be a key", () => {
        expect(() => geminiApiKey(requestWithKey("two words"))).toThrow(HttpError);
    });
});

describe("keyRejection", () => {
    test("recognizes Google's answers to a bad key", () => {
        expect(keyRejection(googleError(400, "API key not valid. Please pass a valid API key."))?.status).toBe(401);
        expect(keyRejection(googleError(403, "Permission denied"))?.status).toBe(401);
    });

    test("leaves other failures alone", () => {
        expect(keyRejection(googleError(400, "Invalid JSON payload"))).toBeNull();
        expect(keyRejection(googleError(429, "Resource exhausted"))).toBeNull();
        expect(keyRejection(new Error("boom"))).toBeNull();
    });
});
