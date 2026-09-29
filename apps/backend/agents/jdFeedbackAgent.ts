import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResumeData } from "../lib/resumeParser";

interface GithubRepo {
    name?: string;
    description?: string | null;
    fullName?: string;
    starCount?: number;
}

export interface JobMatchFeedback {
    score: number;
    summary: string;
    matchedSignals: string[];
    missingSignals: string[];
}

const STOP_WORDS = new Set([
    "and",
    "the",
    "for",
    "with",
    "from",
    "that",
    "this",
    "you",
    "are",
    "will",
    "our",
    "your",
    "have",
    "has",
    "job",
    "role",
    "work",
    "team",
    "using",
]);

function keywords(text: string) {
    const words = text.toLowerCase().match(/[a-z][a-z0-9.+#-]{2,}/g) ?? [];
    return [...new Set(words.filter((word) => !STOP_WORDS.has(word)))];
}

function userSignalText(resumeData: ResumeData, githubData: GithubRepo[]) {
    return [
        resumeData.skills.join(" "),
        resumeData.work.join(" "),
        resumeData.college.join(" "),
        githubData.map((repo) => `${repo.name ?? ""} ${repo.description ?? ""}`).join(" "),
    ].join(" ");
}

export async function generateJobMatchFeedback(resumeData: ResumeData, githubData: GithubRepo[]): Promise<JobMatchFeedback> {
    const jdPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../jd.txt");
    const jobDescription = await readFile(jdPath, "utf8").catch(() => "");

    if (!jobDescription.trim()) {
        return {
            score: 0,
            summary: "No jd.txt was found for comparison, so job fit feedback could not be generated.",
            matchedSignals: [],
            missingSignals: [],
        };
    }

    return keywordJobMatch(jobDescription, resumeData, githubData);
}

export function keywordJobMatch(jobDescription: string, resumeData: ResumeData, githubData: GithubRepo[]): JobMatchFeedback {
    const jdKeywords = keywords(jobDescription).slice(0, 40);
    const profileText = userSignalText(resumeData, githubData).toLowerCase();
    const matchedSignals = jdKeywords.filter((keyword) => profileText.includes(keyword)).slice(0, 10);
    const missingSignals = jdKeywords.filter((keyword) => !profileText.includes(keyword)).slice(0, 8);
    const score = jdKeywords.length ? Math.round((matchedSignals.length / jdKeywords.length) * 100) : 0;

    const summary = `Short JD fit: ${score}% match. Strongest overlap: ${
        matchedSignals.length ? matchedSignals.join(", ") : "not enough direct overlap"
    }. Main gaps: ${missingSignals.length ? missingSignals.join(", ") : "no obvious keyword gaps"}.`;

    return {
        score,
        summary,
        matchedSignals,
        missingSignals,
    };
}
