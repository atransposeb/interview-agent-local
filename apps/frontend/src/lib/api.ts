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
