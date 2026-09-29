import { describe, expect, test } from "bun:test";
import { keywordJobMatch } from "./jdFeedbackAgent";
import type { ResumeData } from "../lib/resumeParser";
import type { GithubRepo } from "../scrapers/github";

// The job description the app used to read from apps/backend/jd.txt.
const JOB_DESCRIPTION =
    "Frontend/full-stack engineer role requiring TypeScript, React, Node.js, API integration, PostgreSQL, GitHub project experience, clean communication, and comfort with data structures and algorithms.";

function resume(overrides: Partial<ResumeData> = {}): ResumeData {
    return {
        name: null,
        email: null,
        phone: null,
        college: [],
        work: [],
        projects: [],
        skills: [],
        experienceYears: null,
        rawText: "",
        ...overrides,
    };
}

function repo(name: string, description: string): GithubRepo {
    return { name, fullName: `jane/${name}`, description, language: null, starCount: 0 };
}

describe("keywordJobMatch", () => {
    test("reports overlap between the job description and the candidate", () => {
        const feedback = keywordJobMatch(JOB_DESCRIPTION, resume({ skills: ["typescript", "react"] }), [
            repo("pg-dashboard", "Node.js API over PostgreSQL"),
        ]);

        expect(feedback.matchedSignals).toEqual(expect.arrayContaining(["typescript", "react", "node.js", "postgresql"]));
        expect(feedback.missingSignals).toEqual(expect.arrayContaining(["github", "communication"]));
        expect(feedback.score).toBeGreaterThan(0);
        expect(feedback.score).toBeLessThan(100);
    });

    test("scores zero when nothing overlaps", () => {
        const feedback = keywordJobMatch(JOB_DESCRIPTION, resume(), []);
        expect(feedback.score).toBe(0);
        expect(feedback.matchedSignals).toEqual([]);
    });

    test("ignores sentence punctuation and filler words", () => {
        const feedback = keywordJobMatch(JOB_DESCRIPTION, resume({ skills: ["algorithms"] }), []);
        expect(feedback.matchedSignals).toContain("algorithms");
        expect(feedback.missingSignals).not.toContain("requiring");
        expect(feedback.missingSignals).not.toContain("experience");
    });

    test("ranks the most repeated requirements first", () => {
        const feedback = keywordJobMatch("Swift. Kotlin, kotlin and more Kotlin. Python or Python.", resume(), []);
        expect(feedback.missingSignals).toEqual(["kotlin", "python", "swift"]);
    });

    test("scores every match, not just the ones listed", () => {
        const skills = Array.from({ length: 12 }, (_, i) => `skill${i}`);
        const feedback = keywordJobMatch(skills.join(" "), resume({ skills }), []);
        expect(feedback.matchedSignals).toHaveLength(10);
        expect(feedback.score).toBe(100);
    });
});
