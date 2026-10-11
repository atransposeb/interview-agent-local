import axios from "axios";
import { httpsAgent } from "./proxy";
import type { LiveSetup } from "./lib/liveSession";

/**
 * Mints a single-use token for one Live session. Sending the setup as
 * bidiGenerateContentSetup (without a field mask) locks every field in it: the
 * browser connects with just the model name, and anything else it sends in its
 * own setup message is ignored.
 */
export async function createEphemeralToken(setup: LiveSetup, apiKey: string): Promise<string> {
    const now = new Date();
    const response = await axios.post(
        "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
        {
            uses: 1,
            expireTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
            newSessionExpireTime: new Date(now.getTime() + 60 * 1000).toISOString(),
            bidiGenerateContentSetup: setup,
        },
        {
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey,
            },
            httpsAgent,
            proxy: false,
            timeout: 15_000,
        }
    );
    return response.data.name;
}
