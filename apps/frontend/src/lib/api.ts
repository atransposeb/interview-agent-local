import { BACKEND_URL } from "@/config";

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${BACKEND_URL}${path}`, init);
    } catch {
        throw new ApiError(0, "Can't reach the server. Check that the backend is running.");
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiError(response.status, body?.message ?? `Request failed (${response.status})`);
    }
    return body as T;
}

function postJson<T>(path: string, body: unknown) {
    return request<T>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
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
