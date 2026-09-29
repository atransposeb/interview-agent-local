import { HttpsProxyAgent } from "https-proxy-agent";

export const httpsAgent = process.env.PROXY_URL
    ? new HttpsProxyAgent(process.env.PROXY_URL)
    : undefined;
