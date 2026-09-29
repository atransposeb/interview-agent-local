import axios from "axios";
import { httpsAgent } from "./proxy";

export async function createEphemeralToken(): Promise<string> {
    const now = new Date();
    const response = await axios.post(
        "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
        {
            uses: 1,
            expireTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
            newSessionExpireTime: new Date(now.getTime() + 60 * 1000).toISOString(),
        },
        {
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": process.env.GEMINI_API_KEY,
            },
            httpsAgent,
            proxy: false,
            timeout: 15_000,
        }
    );
    return response.data.name;
}
