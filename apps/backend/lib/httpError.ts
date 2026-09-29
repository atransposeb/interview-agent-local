import axios from "axios";

/** An error that maps directly to an HTTP response. */
export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

/**
 * Log-safe summary of a failed outbound call. Logging an axios error directly
 * prints its request config, including API keys in headers.
 */
export function describeError(error: unknown) {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const detail = error.response?.data?.error?.message ?? error.response?.data?.message;
        if (status) return `HTTP ${status}${detail ? `: ${detail}` : ""}`;
        return error.code ?? error.message;
    }
    return error instanceof Error ? error.message : String(error);
}
