import { BACKEND_URL } from "@/config";
import { getApiKey } from "@/lib/apiKey";

const API_KEY_HEADER = "X-Gemini-Api-Key";

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    // The user's Gemini key rides along on every call; the server uses it for
    // that request only.
    const headers = new Headers(init?.headers);
    const apiKey = getApiKey();
    if (apiKey && !headers.has(API_KEY_HEADER)) headers.set(API_KEY_HEADER, apiKey);

    let response: Response;
    try {
        response = await fetch(`${BACKEND_URL}${path}`, { ...init, headers });
    } catch {
        throw new ApiError(0, "Can't reach the server. Check that the backend is running.");
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiError(response.status, body?.message ?? `Request failed (${response.status})`);
    }
    return body as T;
}

function postJson<T>(path: string, body: unknown, headers?: Record<string, string>) {
    return request<T>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
}

export interface ServerConfig {
    /** True when the server has no Gemini key of its own, so users must bring one. */
    apiKeyRequired: boolean;
}

export function getConfig() {
    return request<ServerConfig>("/api/v1/config");
}

/** Resolves when Google accepts the key; rejects with a 401 ApiError when it doesn't. */
export function verifyApiKey(apiKey: string) {
    return postJson<null>("/api/v1/api-key/verify", {}, { [API_KEY_HEADER]: apiKey });
}

export interface PreInterviewInput {
    jobDescription: string;
    githubUrl?: string;
    resumeText?: string;
    resumePdfBase64?: string;
}

export function createInterview(input: PreInterviewInput) {
    return postJson<{ interviewId: string; warnings: string[] }>("/api/v1/pre-interview", input);
}

export interface LiveSession {
    token: string;
    model: string;
    durationSeconds: number;
    /** Where this session's transcript numbering starts (non-zero after a reconnect). */
    nextSeq: number;
}

export function createSession(interviewId: string) {
    return postJson<LiveSession>(`/api/v1/interviews/${interviewId}/session`, {});
}

export interface TranscriptMessage {
    seq: number;
    role: "user" | "assistant";
    text: string;
}

export function saveMessages(interviewId: string, messages: TranscriptMessage[]) {
    return postJson<null>(`/api/v1/interviews/${interviewId}/messages`, { messages });
}

export interface DimensionScore {
    score: number;
    comment: string;
}

export interface InterviewEvaluation {
    overallScore: number;
    summary: string;
    dimensions: {
        relevance: DimensionScore;
        clarity: DimensionScore;
        depth: DimensionScore;
        roleFit: DimensionScore;
    };
    strengths: string[];
    improvements: string[];
    questions: { question: string; feedback: string; score: number }[];
}

export interface JobFit {
    score: number;
    summary: string;
    matchedSignals: string[];
    missingSignals: string[];
}

export interface InterviewResult {
    id: string;
    status: "pre" | "InProgress" | "Done";
    score: number | null;
    evaluation: InterviewEvaluation | null;
    jobFit: JobFit | null;
    startedAt: string | null;
    endedAt: string | null;
    messages: TranscriptMessage[];
}

/** Ends the interview if needed and returns the scored report. Safe to call repeatedly. */
export function completeInterview(interviewId: string) {
    return postJson<InterviewResult>(`/api/v1/interviews/${interviewId}/complete`, {});
}
