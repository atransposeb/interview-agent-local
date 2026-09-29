import axios from "axios";
import { httpsAgent } from "../proxy";
import { describeError, HttpError } from "../lib/httpError";

export interface GithubRepo {
    name: string;
    fullName: string;
    description: string | null;
    language: string | null;
    starCount: number;
}

interface GithubApiRepo {
    name: string;
    full_name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    fork: boolean;
}

// GitHub usernames: alphanumerics and single hyphens, no leading hyphen, max 39 chars.
const GITHUB_USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const MAX_REPOS = 20;

/** Accepts a profile URL (scheme and www optional), a repo URL, or a bare username. */
export function parseGithubUsername(input: string): string | null {
    const value = input.trim().replace(/^@/, "");
    if (GITHUB_USERNAME.test(value)) return value;

    let url: URL;
    try {
        url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
        return null;
    }

    if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null;
    const username = url.pathname.split("/").filter(Boolean)[0];
    return username && GITHUB_USERNAME.test(username) ? username : null;
}

export async function scrapeGithub(username: string): Promise<GithubRepo[]> {
    const response = await axios.request<GithubApiRepo[]>({
        url: `https://api.github.com/users/${username}/repos`,
        params: { type: "owner", sort: "pushed", per_page: 100 },
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "interviewer-app",
            // Unauthenticated requests are limited to 60 per hour per IP.
            ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
        httpsAgent,
        proxy: false,
        timeout: 15_000,
    });

    return response.data
        .filter((repo) => !repo.fork)
        .slice(0, MAX_REPOS)
        .map((repo) => ({
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            language: repo.language,
            starCount: repo.stargazers_count,
        }));
}

export interface GithubLookup {
    repos: GithubRepo[];
    warning: string | null;
}

/**
 * GitHub is optional context. A mistyped username is the user's to fix, but a
 * rate limit or outage shouldn't block the interview.
 */
export async function loadGithubRepos(username: string | null): Promise<GithubLookup> {
    if (!username) return { repos: [], warning: null };

    try {
        return { repos: await scrapeGithub(username), warning: null };
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            throw new HttpError(404, `GitHub user "${username}" was not found`);
        }
        console.warn(`GitHub lookup for ${username} failed:`, describeError(error));
        return { repos: [], warning: "GitHub couldn't be reached, so this interview uses your resume only." };
    }
}
