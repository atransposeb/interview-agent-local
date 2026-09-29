import { describe, expect, test } from "bun:test";
import { PreInterviewRequestSchema } from "./types";

const base = { jobDescription: "Backend engineer (Go, Postgres)" };

function firstError(body: unknown) {
    const result = PreInterviewRequestSchema.safeParse(body);
    return result.success ? null : result.error.issues[0]?.message;
}

describe("PreInterviewRequestSchema", () => {
    test("accepts pasted resume text without a GitHub URL", () => {
        expect(firstError({ ...base, resumeText: "Jane Doe, Go developer" })).toBeNull();
    });

    test("accepts a PDF with a GitHub URL", () => {
        expect(firstError({ ...base, resumePdfBase64: "JVBERi0=", githubUrl: "github.com/octocat" })).toBeNull();
    });

    test("requires exactly one resume format", () => {
        expect(firstError(base)).toBe("Provide your resume as a PDF or as pasted text");
        expect(firstError({ ...base, resumeText: "   " })).toBe("Provide your resume as a PDF or as pasted text");
        expect(firstError({ ...base, resumeText: "Jane", resumePdfBase64: "JVBERi0=" })).toBe(
            "Provide your resume as a PDF or as pasted text",
        );
    });

    test("requires a job description", () => {
        expect(firstError({ jobDescription: "  ", resumeText: "Jane" })).toBe(
            "Paste the job description, or at least the role title",
        );
    });

    test("rejects URLs that are not GitHub profiles", () => {
        expect(firstError({ ...base, resumeText: "Jane", githubUrl: "https://gitlab.com/jane" })).toBe(
            "Enter a GitHub profile URL like https://github.com/username",
        );
    });
});
