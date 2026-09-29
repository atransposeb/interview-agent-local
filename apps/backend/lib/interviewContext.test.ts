import { describe, expect, test } from "bun:test";
import { readInterviewContext } from "./interviewContext";

describe("readInterviewContext", () => {
    test("drops contact details and raw text from the candidate profile", () => {
        const context = readInterviewContext({
            jobDescription: "Go developer",
            resumeData: {
                name: "Jane Doe",
                email: "jane@example.com",
                phone: "+1 555 0100",
                rawText: "Jane Doe ...",
                skills: ["Go"],
                work: [],
                projects: [],
                college: [],
                experienceYears: 3,
            },
            githubMetadata: [],
            jdFeedback: null,
        });

        expect(context.candidate).toEqual({
            name: "Jane Doe",
            experienceYears: 3,
            skills: ["Go"],
            work: [],
            projects: [],
            college: [],
        });
    });

    test("fills defaults for rows written before newer fields existed", () => {
        const context = readInterviewContext({
            jobDescription: "",
            resumeData: {},
            githubMetadata: [{ name: "dotfiles", fullName: "jane/dotfiles", starCount: 2, description: null }],
            jdFeedback: { score: 40, summary: "Partial fit" },
        });

        expect(context.candidate.projects).toEqual([]);
        expect(context.candidate.name).toBeNull();
        expect(context.repos).toEqual([{ name: "dotfiles", description: null, language: null, starCount: 2 }]);
        expect(context.jobFit).toEqual({ score: 40, summary: "Partial fit", matchedSignals: [], missingSignals: [] });
    });

    test("tolerates malformed JSON columns", () => {
        const context = readInterviewContext({
            jobDescription: "",
            resumeData: "not an object",
            githubMetadata: { unexpected: true },
            jdFeedback: 42,
        });

        expect(context.candidate.skills).toEqual([]);
        expect(context.repos).toEqual([]);
        expect(context.jobFit).toBeNull();
    });
});
