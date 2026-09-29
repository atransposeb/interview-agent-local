import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { parseResume } from "./resumeParser";

const RESUME = `Jane Doe
jane.doe@example.com | +1 (555) 123-4567 | github.com/janedoe

Experience
Software Engineer, Acme Labs
Jan 2021 - Present
- Built React and TypeScript dashboards backed by Node.js APIs
Frontend Developer Intern, Beta Solutions
2019 - 2020

Education
B.Tech in Computer Science, Example Institute of Technology

Skills
TypeScript, React, Node.js, PostgreSQL, Docker, Git`;

describe("parseResume", () => {
    // "Present" resolves to the current year, so pin the clock.
    beforeAll(() => setSystemTime(new Date("2026-06-01T00:00:00Z")));
    afterAll(() => setSystemTime());

    test("extracts contact details", () => {
        const resume = parseResume(RESUME);
        expect(resume.name).toBe("Jane Doe");
        expect(resume.email).toBe("jane.doe@example.com");
        expect(resume.phone).toBe("+1 (555) 123-4567");
    });

    test("finds education, work, and known skills", () => {
        const resume = parseResume(RESUME);
        expect(resume.college).toEqual(["B.Tech in Computer Science, Example Institute of Technology"]);
        expect(resume.work).toEqual(["Software Engineer, Acme Labs", "Frontend Developer Intern, Beta Solutions"]);
        expect(resume.skills).toEqual(expect.arrayContaining(["typescript", "react", "node.js", "postgresql", "docker", "git"]));
        expect(resume.skills).not.toContain("python");
    });

    test("sums date ranges into years of experience", () => {
        // Jan 2021 - Present (2026) is 5 years, plus 2019 - 2020 is 1 year.
        expect(parseResume(RESUME).experienceYears).toBe(6);
    });

    test("prefers an explicit years-of-experience statement", () => {
        expect(parseResume("Engineer with 4+ years of experience").experienceYears).toBe(4);
    });

    test("collects the projects section up to the next heading", () => {
        const resume = parseResume(`Projects:
- Interview coach: mock interviews with Gemini Live
- Budget CLI in Go
Skills
Go`);
        expect(resume.projects).toEqual(["Interview coach: mock interviews with Gemini Live", "Budget CLI in Go"]);
    });

    test("normalizes whitespace and line endings", () => {
        expect(parseResume("Jane   Doe\r\nEngineer").rawText).toBe("Jane Doe\nEngineer");
    });
});
