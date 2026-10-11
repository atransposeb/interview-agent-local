const DEFAULT_ORIGIN = "http://localhost:3000";

/**
 * Origins allowed by CORS, from a comma-separated FRONTEND_URL such as
 * "https://app.example.com,https://fitfortherole.pages.dev". Trailing slashes
 * are dropped because a browser's Origin header never has one.
 */
export function parseAllowedOrigins(value: string | undefined) {
    const origins = (value ?? "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean);
    return origins.length ? origins : [DEFAULT_ORIGIN];
}
