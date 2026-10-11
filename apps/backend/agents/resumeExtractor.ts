import { z } from "zod";
import { generateJson, type GeminiPart } from "../lib/gemini";
import { describeError, HttpError } from "../lib/httpError";
import { normalizeText, parseResume, type ResumeData } from "../lib/resumeParser";

export type ResumeSource = { kind: "text"; text: string } | { kind: "pdf"; base64: string };

const ExtractedResumeSchema = z.object({
    name: z.string().nullable().describe("Candidate's full name, or null if absent"),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    college: z.array(z.string()).describe("Education entries, e.g. 'B.Tech Computer Science, IIT Delhi (2018-2022)'"),
    work: z.array(z.string()).describe("One entry per role: 'Title at Company (dates): main responsibility or result'"),
    projects: z.array(z.string()).describe("One entry per project: 'Name: what it does and the technologies used'"),
    skills: z.array(z.string()).describe("Technical skills, languages, frameworks, and tools"),
    experienceYears: z.number().nullable().describe("Total years of professional experience, or null if unclear"),
});

const SYSTEM_PROMPT = `You extract structured data from a candidate's resume for an interview coach.
Copy facts from the resume. Never invent employers, dates, projects, or skills.
Use null or an empty list when something is missing.`;

/** Gemini reads PDFs natively, so uploads are sent as-is rather than converted to text first. */
export function resumeParts(source: ResumeSource): GeminiPart[] {
    return source.kind === "pdf"
        ? [{ inlineData: { mimeType: "application/pdf", data: source.base64 } }]
        : [{ text: source.text }];
}

export async function extractResume(source: ResumeSource, apiKey: string): Promise<ResumeData> {
    try {
        const resume = await generateJson({
            apiKey,
            schema: ExtractedResumeSchema,
            system: SYSTEM_PROMPT,
            parts: resumeParts(source),
        });
        return { ...resume, rawText: source.kind === "text" ? normalizeText(source.text) : "" };
    } catch (error) {
        // A rejected key fails the whole interview, so the fallback would only delay the error.
        if (error instanceof HttpError) throw error;
        if (source.kind === "pdf") {
            console.warn("Resume PDF extraction failed:", describeError(error));
            throw new HttpError(502, "Couldn't read that PDF right now. Try again, or paste your resume as text.");
        }
        console.warn("Resume extraction failed, using the heuristic parser:", describeError(error));
        return parseResume(source.text);
    }
}
