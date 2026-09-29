import { describe, expect, test } from "bun:test";
import { evaluateInterview, formatTranscript, overallScore } from "./interviewEvaluator";
import type { InterviewContext } from "../lib/interviewContext";

const context: InterviewContext = {
    jobDescription: "Backend engineer",
    candidate: { name: null, experienceYears: null, skills: [], work: [], projects: [], college: [] },
    repos: [],
    jobFit: null,
};

describe("overallScore", () => {
    test("scales the mean dimension score to 0-100", () => {
        expect(
            overallScore({
                relevance: { score: 8, comment: "" },
                clarity: { score: 7, comment: "" },
                depth: { score: 5, comment: "" },
                roleFit: { score: 6, comment: "" },
            }),
        ).toBe(65);
    });
});

describe("formatTranscript", () => {
    test("labels each line with the speaker", () => {
        expect(
            formatTranscript([
                { role: "assistant", text: "Tell me about yourself." },
                { role: "user", text: "I build APIs." },
            ]),
        ).toBe("Interviewer: Tell me about yourself.\nCandidate: I build APIs.");
    });
});

describe("evaluateInterview", () => {
    test("skips the model when the candidate barely spoke", async () => {
        const evaluation = await evaluateInterview(context, [
            { role: "assistant", text: "Hi! Could you introduce yourself?" },
            { role: "user", text: "Uh, hi, sorry, one second." },
        ]);

        expect(evaluation.overallScore).toBe(0);
        expect(evaluation.questions).toEqual([]);
        expect(evaluation.summary).toContain("before you answered");
    });
});
