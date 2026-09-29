export interface ResumeData {
    name: string | null;
    email: string | null;
    phone: string | null;
    college: string[];
    work: string[];
    skills: string[];
    experienceYears: number | null;
    rawText: string;
}

const SECTION_HEADERS = [
    "education",
    "experience",
    "work experience",
    "professional experience",
    "employment",
    "skills",
    "projects",
    "certifications",
];

const SKILL_KEYWORDS = [
    "javascript",
    "typescript",
    "react",
    "next.js",
    "node.js",
    "express",
    "postgresql",
    "mongodb",
    "sql",
    "python",
    "java",
    "c++",
    "aws",
    "docker",
    "kubernetes",
    "prisma",
    "git",
    "machine learning",
    "data structures",
    "algorithms",
];

function normalizeText(text: string) {
    return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

function firstMatch(text: string, pattern: RegExp) {
    return text.match(pattern)?.[1]?.trim() ?? null;
}

function linesMatching(lines: string[], pattern: RegExp) {
    return lines
        .filter((line) => pattern.test(line))
        .map((line) => line.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 8);
}

function extractName(lines: string[]) {
    const candidate = lines.find((line) => {
        if (line.length > 60) return false;
        if (/@|\d|https?:|github|linkedin/i.test(line)) return false;
        if (SECTION_HEADERS.some((header) => header.toLowerCase() === line.toLowerCase())) return false;
        return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/.test(line);
    });

    return candidate ?? null;
}

function extractExperienceYears(text: string) {
    const explicit = text.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/i);
    if (explicit?.[1]) return Number(explicit[1]);

    const ranges = [...text.matchAll(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\.?\s*(20\d{2}|19\d{2})\s*(?:-|to|–)\s*(Present|Current|20\d{2}|19\d{2})/gi)];
    if (!ranges.length) return null;

    const months = ranges.reduce((total, match) => {
        const startYear = Number(match[1]);
        const endYear = /present|current/i.test(match[2] ?? "") ? new Date().getFullYear() : Number(match[2]);
        return total + Math.max(0, endYear - startYear) * 12;
    }, 0);

    return months > 0 ? Math.round((months / 12) * 10) / 10 : null;
}

export function parseResume(resumeText: string): ResumeData {
    const rawText = normalizeText(resumeText);
    const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
    const lower = rawText.toLowerCase();

    const skills = SKILL_KEYWORDS.filter((skill) => lower.includes(skill.toLowerCase()));

    return {
        name: extractName(lines),
        email: firstMatch(rawText, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i),
        phone: firstMatch(rawText, /(\+?\d[\d\s().-]{8,}\d)/),
        college: linesMatching(lines, /\b(university|college|institute|school|b\.?tech|m\.?tech|bachelor|master|degree)\b/i),
        work: linesMatching(lines, /\b(engineer|developer|intern|manager|consultant|analyst|architect|lead|company|technologies|solutions|labs)\b/i),
        skills,
        experienceYears: extractExperienceYears(rawText),
        rawText,
    };
}
