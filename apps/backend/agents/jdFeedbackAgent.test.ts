import { describe, expect, test } from "bun:test";
import { keywordJobMatch } from "./jdFeedbackAgent";
import type { ResumeData } from "../lib/resumeParser";

const JOB_DESCRIPTION =
    "Frontend/full-stack engineer role requiring TypeScript, React, Node.js, API integration, PostgreSQL, GitHub project experience, clean communication, and comfort with data structures and algorithms.";

function resume(overrides: Partial<ResumeData> = {}): ResumeData {
    return {
        name: null,
        email: null,
        phone: null,
        college: [],
        work: [],
        skills: [],
        experienceYears: null,
        rawText: "",
        ...overrides,
    };
}

describe("keywordJobMatch", () => {
    test("reports overlap between the job description and the candidate", () => {
        const feedback = keywordJobMatch(JOB_DESCRIPTION, resume({ skills: ["typescript", "react"] }), [
            { name: "pg-dashboard", description: "Node.js API over PostgreSQL" },
        ]);

        expect(feedback.matchedSignals).toEqual(expect.arrayContaining(["typescript", "react", "node.js", "postgresql"]));
        expect(feedback.missingSignals).toContain("github");
        expect(feedback.score).toBeGreaterThan(0);
        expect(feedback.score).toBeLessThan(100);
    });

    test("scores zero when nothing overlaps", () => {
        const feedback = keywordJobMatch(JOB_DESCRIPTION, resume(), []);
        expect(feedback.score).toBe(0);
        expect(feedback.matchedSignals).toEqual([]);
    });
});
