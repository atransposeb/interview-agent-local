const DEFAULT_BACKEND_URL = "http://localhost:3001";

// Bun inlines BUN_PUBLIC_* variables into the browser bundle when they are set
// (bunfig.toml for dev, build.ts for production). When one is unset the
// expression is left as-is, and `process` does not exist in the browser, so
// the read has to be guarded.
function readBackendUrl() {
    try {
        return process.env.BUN_PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL;
    } catch {
        return DEFAULT_BACKEND_URL;
    }
}

// A trailing slash would turn "/api/v1/..." into "//api/v1/...".
export const BACKEND_URL = readBackendUrl().replace(/\/+$/, "");
