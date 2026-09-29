import { describe, expect, test } from "bun:test";
import { buildLiveSetup, buildSystemInstruction, END_INTERVIEW_TOOL } from "./liveSession";
import type { InterviewContext } from "./interviewContext";

const context: InterviewContext = {
    jobDescription: "Senior Go engineer building payment APIs",
    candidate: {
        name: "Jane Doe",
        experienceYears: 4,
        skills: ["Go", "PostgreSQL"],
        work: ["Backend Engineer at Acme (2021 - Present): payment APIs"],
        projects: ["ledger: double-entry bookkeeping service"],
        college: [],
    },
    repos: [{ name: "ledger", description: "Double-entry ledger", language: "Go", starCount: 12 }],
    jobFit: { score: 70, summary: "Strong Go background.", matchedSignals: ["Go"], missingSignals: ["Kubernetes"] },
};

describe("buildSystemInstruction", () => {
    test("includes the plan, the role, and the candidate context", () => {
        const prompt = buildSystemInstruction(context);
        expect(prompt).toContain("5-minute mock interview");
        expect(prompt).toContain("by first name (Jane)");
        expect(prompt).toContain("Senior Go engineer building payment APIs");
        expect(prompt).toContain("- ledger (Go, 12 stars): Double-entry ledger");
        expect(prompt).toContain("Gaps to probe: Kubernetes");
        expect(prompt).toContain(`call the ${END_INTERVIEW_TOOL} tool`);
    });

    test("copes with a sparse profile", () => {
        const prompt = buildSystemInstruction({
            jobDescription: "",
            candidate: { name: null, experienceYears: null, skills: [], work: [], projects: [], college: [] },
            repos: [],
            jobFit: null,
        });
        expect(prompt).toContain("Greet the candidate in one sentence");
        expect(prompt).toContain("general software engineering interview");
        expect(prompt).not.toContain("undefined");
    });
});

describe("buildLiveSetup", () => {
    test("declares the end_interview tool and both transcription channels", () => {
        const setup = buildLiveSetup(context);
        expect(setup.tools[0]?.functionDeclarations[0]?.name).toBe(END_INTERVIEW_TOOL);
        expect(setup.inputAudioTranscription).toEqual({});
        expect(setup.outputAudioTranscription).toEqual({});
        expect(setup.generationConfig.responseModalities).toEqual(["AUDIO"]);
    });
});
